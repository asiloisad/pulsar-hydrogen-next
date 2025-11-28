/** @babel */

import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as zmq from "zeromq";
import { launchSpec, launchSpecFromConnectionInfo } from "spawnteract";
import Config from "./config";
import KernelTransport from "./kernel-transport";
import { log, js_idx_to_char_idx } from "./utils";
import { Message, Socket } from "./jmp";

// Timeout for cleaning up stale entries (5 minutes)
const STALE_ENTRY_TIMEOUT = 5 * 60 * 1000;

// Per-request timeout (2 minutes) - after which callbacks are expired
const REQUEST_TIMEOUT = 2 * 60 * 1000;

// Connection timeout (30 seconds) - time to wait for initial connection
const CONNECTION_TIMEOUT = 30 * 1000;

export default class ZMQKernel extends KernelTransport {
  executionCallbacks = {};
  // Track request timestamps for per-request timeouts
  requestTimestamps = new Map(); // requestId -> timestamp
  deferredExecuteReplies = new Map(); // requestId -> { message, callback, timestamp }
  idleBeforeReply = new Map(); // requestId -> timestamp (changed from Set to Map)
  // Queue for shell messages to prevent "Socket is busy writing" errors
  shellMessageQueue = [];
  shellSocketBusy = false;
  // Queue for stdin messages
  stdinMessageQueue = [];
  stdinSocketBusy = false;
  // Cleanup interval
  _cleanupInterval = null;
  // Connection state
  _connectionTimeout = null;
  _connectionPromise = null;

  constructor(kernelSpec, grammar, options, onStarted) {
    super(kernelSpec, grammar);
    this.options = options || {};
    // Otherwise spawnteract deletes the file and hydrogen's restart kernel fails
    options.cleanupConnectionFile = false;

    // Start cleanup interval for stale entries
    this._startCleanupInterval();

    launchSpec(kernelSpec, options).then(
      ({ config, connectionFile, spawn }) => {
        this.connection = config;
        this.connectionFile = connectionFile;
        this.kernelProcess = spawn;
        this.monitorNotifications(spawn);
        this.connect(() => {
          this._executeStartupCode();
          if (onStarted) {
            onStarted(this);
          }
        });
      }
    );
  }

  _startCleanupInterval() {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(
      () => this._cleanupStaleEntries(),
      STALE_ENTRY_TIMEOUT
    );
  }

  _stopCleanupInterval() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  _cleanupStaleEntries() {
    const now = Date.now();

    // Clean up stale deferredExecuteReplies
    for (const [requestId, entry] of this.deferredExecuteReplies) {
      if (now - entry.timestamp > STALE_ENTRY_TIMEOUT) {
        log("ZMQKernel: Cleaning up stale deferred reply:", requestId);
        this.deferredExecuteReplies.delete(requestId);
      }
    }

    // Clean up stale idleBeforeReply
    for (const [requestId, timestamp] of this.idleBeforeReply) {
      if (now - timestamp > STALE_ENTRY_TIMEOUT) {
        log("ZMQKernel: Cleaning up stale idle marker:", requestId);
        this.idleBeforeReply.delete(requestId);
      }
    }

    // Clean up timed-out requests and notify their callbacks
    for (const [requestId, timestamp] of this.requestTimestamps) {
      if (now - timestamp > REQUEST_TIMEOUT) {
        log("ZMQKernel: Request timed out:", requestId);
        this._expireRequest(requestId, "Request timed out after 2 minutes");
      }
    }

    // Log warning if callbacks are accumulating
    const callbackCount = Object.keys(this.executionCallbacks).length;
    if (callbackCount > 100) {
      log(
        "ZMQKernel: Warning - large number of pending callbacks:",
        callbackCount
      );
    }
  }

  /**
   * Expire a request that has timed out, notifying its callback with an error
   */
  _expireRequest(requestId, reason) {
    const callback = this.executionCallbacks[requestId];
    if (callback) {
      delete this.executionCallbacks[requestId];
      this.requestTimestamps.delete(requestId);
      this.deferredExecuteReplies.delete(requestId);
      this.idleBeforeReply.delete(requestId);

      // Send timeout error to callback
      const errorMessage = {
        header: { msg_type: "error", msg_id: requestId + "_timeout" },
        parent_header: { msg_id: requestId, msg_type: "execute_request" },
        content: {
          status: "error",
          ename: "TimeoutError",
          evalue: reason,
          traceback: [],
        },
      };
      callback(errorMessage, "iopub");

      // Also send shell reply so createResultAsync can resolve
      const shellReply = {
        header: { msg_type: "execute_reply", msg_id: requestId + "_timeout_reply" },
        parent_header: { msg_id: requestId, msg_type: "execute_request" },
        content: { status: "error" },
      };
      callback(shellReply, "shell");
    }
  }

  connect(done) {
    const scheme = this.connection.signature_scheme.slice("hmac-".length);
    const { key } = this.connection;
    this.shellSocket = new Socket("dealer", scheme, key);
    this.stdinSocket = new Socket("dealer", scheme, key);
    this.ioSocket = new Socket("sub", scheme, key);
    const id = uuidv4();
    this.shellSocket.identity = `dealer${id}`;
    this.stdinSocket.identity = `dealer${id}`;
    // this.ioSocket.identity = `sub${id}`
    const address = `${this.connection.transport}://${this.connection.ip}:`;
    this.shellSocket.connect(address + this.connection.shell_port);
    this.ioSocket.connect(address + this.connection.iopub_port);
    this.ioSocket.subscribe("");
    this.stdinSocket.connect(address + this.connection.stdin_port);
    this.shellSocket.on("message", this.onShellMessage.bind(this));
    this.ioSocket.on("message", this.onIOMessage.bind(this));
    this.stdinSocket.on("message", this.onStdinMessage.bind(this));

    this.monitor(done);
  }

  monitorNotifications(childProcess) {
    childProcess.stdout.on("data", (data) => {
      data = data.toString();

      if (atom.config.get("hydrogen-next.kernelNotifications")) {
        atom.notifications.addInfo(this.kernelSpec.display_name, {
          description: data,
          dismissable: true,
        });
      } else {
        log("ZMQKernel: stdout:", data);
      }
    });
    childProcess.stderr.on("data", (data) => {
      atom.notifications.addError(this.kernelSpec.display_name, {
        description: data.toString(),
        dismissable: true,
      });
    });
  }

  monitor(done, prev) {
    try {
      const socketNames = ["shellSocket", "ioSocket"];
      let waitGroup = socketNames.length;
      let connectionComplete = false;

      // Set up connection timeout
      this._connectionTimeout = setTimeout(() => {
        if (!connectionComplete && !this._destroyed) {
          log("ZMQKernel: Connection timeout - sockets did not connect in time");
          this._clearConnectionTimeout();

          atom.notifications.addError(
            `Kernel "${this.kernelSpec.display_name}" failed to connect`,
            {
              detail: `Connection timed out after ${CONNECTION_TIMEOUT / 1000} seconds. The kernel process may have failed to start.`,
              dismissable: true,
            }
          );

          // Still call done to avoid hanging, but with error state
          this.setExecutionState("error");
          if (done) {
            done();
          }
        }
      }, CONNECTION_TIMEOUT);

      const onConnect = ({ socketName, socket }) => {
        log(`ZMQKernel: ${socketName} connected`);
        waitGroup--;

        if (waitGroup === 0) {
          connectionComplete = true;
          this._clearConnectionTimeout();
          log("ZMQKernel: all main sockets connected");
          this.setExecutionState("idle");
          if (done) {
            done();
          }
        }
      };

      const monitor = (socketName, socket) => {
        log(`ZMQKernel: monitor ${socketName}`);
        socket.on(
          "connect",
          onConnect.bind(this, {
            socketName,
            socket,
          })
        );
      };

      monitor("shellSocket", this.shellSocket);
      monitor("ioSocket", this.ioSocket);
    } catch (err) {
      log("ZMQKernel:", err);
      this._clearConnectionTimeout();
    }
  }

  /**
   * Clear connection timeout
   */
  _clearConnectionTimeout() {
    if (this._connectionTimeout) {
      clearTimeout(this._connectionTimeout);
      this._connectionTimeout = null;
    }
  }

  interrupt() {
    if (process.platform === "win32") {
      atom.notifications.addWarning("Cannot interrupt this kernel", {
        detail: "Kernel interruption is currently not supported in Windows.",
      });
    } else {
      log("ZMQKernel: sending SIGINT");
      this.kernelProcess.kill("SIGINT");
    }
  }

  _kill() {
    log("ZMQKernel: sending SIGKILL");
    this.kernelProcess.kill("SIGKILL");
  }

  _executeStartupCode() {
    const displayName = this.kernelSpec.display_name;
    let startupCode = Config.getJson("startupCode")[displayName];

    if (startupCode) {
      log("KernelManager: Executing startup code:", startupCode);
      startupCode += "\n";
      this.execute(startupCode, (message, channel) => {});
    }
  }

  shutdown() {
    this._socketShutdown();
  }

  restart(onRestarted) {
    this._socketRestart(onRestarted);
  }

  _socketShutdown(restart = false) {
    const requestId = `shutdown_${uuidv4()}`;

    const message = _createMessage("shutdown_request", requestId);

    message.content = {
      restart,
    };
    // Use queue to prevent "Socket is busy writing" errors
    this._queueShellMessage(message, requestId, () => {});
  }

  _socketRestart(onRestarted) {
    if (this.executionState === "restarting") {
      return;
    }

    this.setExecutionState("restarting");

    // Clear pending state before restart
    this.executionCallbacks = {};
    this.shellMessageQueue = [];
    this.stdinMessageQueue = [];
    this.deferredExecuteReplies.clear();
    this.idleBeforeReply.clear();

    // Kill the old process (shutdown message is often not received anyway during restart)
    this._kill();

    const { spawn } = launchSpecFromConnectionInfo(
      this.kernelSpec,
      this.connection,
      this.connectionFile,
      this.options
    );
    this.kernelProcess = spawn;
    this.monitorNotifications(spawn);
    this.monitor(() => {
      this._executeStartupCode();

      if (onRestarted) {
        onRestarted();
      }
    }, true);
  }

  // Queue a message to be sent on the shell socket
  // This prevents "Socket is busy writing" errors
  _queueShellMessage(message, requestId, onResults) {
    this.executionCallbacks[requestId] = onResults;
    this.requestTimestamps.set(requestId, Date.now()); // Track for timeout
    this.shellMessageQueue.push({ message, requestId });
    this._processShellQueue();
  }

  // Process the shell message queue
  async _processShellQueue() {
    if (this.shellSocketBusy || this.shellMessageQueue.length === 0) {
      return;
    }

    this.shellSocketBusy = true;
    const { message, requestId } = this.shellMessageQueue.shift();

    try {
      await this.shellSocket.send(new Message(message));
    } catch (error) {
      log("ZMQKernel: Error sending shell message:", error);
      // Re-queue the message for retry if it's a transient error
      if (error.message && error.message.includes("busy")) {
        this.shellMessageQueue.unshift({ message, requestId });
      } else {
        // Non-transient error: notify callback about the failure
        const callback = this.executionCallbacks[requestId];
        if (callback) {
          delete this.executionCallbacks[requestId];
          // Create an error response in Jupyter message format
          const errorMessage = {
            header: { msg_type: "error", msg_id: requestId + "_error" },
            parent_header: {
              msg_id: requestId,
              msg_type: message.header?.msg_type || "execute_request",
            },
            content: {
              status: "error",
              ename: "SendError",
              evalue: error.message || "Failed to send message to kernel",
              traceback: [],
            },
          };
          callback(errorMessage, "iopub");
          // Also send shell reply so createResultAsync can resolve
          const shellReply = {
            header: { msg_type: "execute_reply", msg_id: requestId + "_reply" },
            parent_header: {
              msg_id: requestId,
              msg_type: message.header?.msg_type || "execute_request",
            },
            content: {
              status: "error",
            },
          };
          callback(shellReply, "shell");
        }
      }
    }

    this.shellSocketBusy = false;

    // Process next message if any
    if (this.shellMessageQueue.length > 0) {
      // Use setImmediate for better async behavior than setTimeout(fn, 1)
      setImmediate(() => this._processShellQueue());
    }
  }

  // onResults is a callback that may be called multiple times
  // as results come in from the kernel
  execute(code, onResults) {
    log("ZMQKernel.execute:", code);
    const requestId = `execute_${uuidv4()}`;

    const message = _createMessage("execute_request", requestId);

    message.content = {
      code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: true,
    };
    this._queueShellMessage(message, requestId, onResults);
  }

  /**
   * Execute code silently without affecting status bar timer or execution count.
   * Used for internal operations like variable explorer refresh.
   * NOTE: silent:true means NO output is published on IOPub - use executeWatch for watches.
   */
  executeSilent(code, onResults) {
    log("ZMQKernel.executeSilent:", code);
    const requestId = `silent_${uuidv4()}`;

    const message = _createMessage("execute_request", requestId);

    message.content = {
      code,
      silent: true,
      store_history: false,
      user_expressions: {},
      allow_stdin: false,
    };
    // Mark this request as silent so we can suppress state changes
    this._silentRequests = this._silentRequests || new Set();
    this._silentRequests.add(requestId);
    this._queueShellMessage(message, requestId, onResults);
  }

  /**
   * Execute code for watch pane - gets output but doesn't affect status bar or history.
   * Unlike executeSilent, this allows IOPub output (execute_result, stream, etc.)
   */
  executeWatch(code, onResults) {
    log("ZMQKernel.executeWatch:", code);
    const requestId = `watch_${uuidv4()}`;

    const message = _createMessage("execute_request", requestId);

    message.content = {
      code,
      silent: false, // Allow output on IOPub
      store_history: false, // Don't increment execution count
      user_expressions: {},
      allow_stdin: false,
    };
    // Mark this request as silent so we can suppress status bar state changes
    this._silentRequests = this._silentRequests || new Set();
    this._silentRequests.add(requestId);
    this._queueShellMessage(message, requestId, onResults);
  }

  complete(code, onResults) {
    log("ZMQKernel.complete:", code);
    const requestId = `complete_${uuidv4()}`;

    const message = _createMessage("complete_request", requestId);

    message.content = {
      code,
      text: code,
      line: code,
      cursor_pos: js_idx_to_char_idx(code.length, code),
    };
    this._queueShellMessage(message, requestId, onResults);
  }

  inspect(code, cursorPos, onResults) {
    log("ZMQKernel.inspect:", code, cursorPos);
    const requestId = `inspect_${uuidv4()}`;

    const message = _createMessage("inspect_request", requestId);

    message.content = {
      code,
      cursor_pos: cursorPos,
      detail_level: 0,
    };
    this._queueShellMessage(message, requestId, onResults);
  }

  inputReply(input) {
    const requestId = `input_reply_${uuidv4()}`;

    const message = _createMessage("input_reply", requestId);

    message.content = {
      value: input,
    };
    this._queueStdinMessage(message);
  }

  // Queue a message to be sent on the stdin socket
  _queueStdinMessage(message) {
    this.stdinMessageQueue.push(message);
    this._processStdinQueue();
  }

  // Process the stdin message queue
  async _processStdinQueue() {
    if (this.stdinSocketBusy || this.stdinMessageQueue.length === 0) {
      return;
    }

    this.stdinSocketBusy = true;
    const message = this.stdinMessageQueue.shift();

    try {
      await this.stdinSocket.send(new Message(message));
    } catch (error) {
      log("ZMQKernel: Error sending stdin message:", error);
      if (error.message && error.message.includes("busy")) {
        this.stdinMessageQueue.unshift(message);
      }
    }

    this.stdinSocketBusy = false;

    if (this.stdinMessageQueue.length > 0) {
      setImmediate(() => this._processStdinQueue());
    }
  }

  onShellMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed) return;

    log("shell message:", message);

    if (!_isValidMessage(message)) {
      return;
    }

    const { msg_id } = message.parent_header;
    let callback;

    if (msg_id) {
      callback = this.executionCallbacks[msg_id];
    }

    if (callback) {
      const { msg_type } = message.header;
      if (msg_type === "execute_reply") {
        this._queueExecuteReply(message, callback);
      } else {
        callback(message, "shell");
      }
    }
  }

  onStdinMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed) return;

    log("stdin message:", message);

    if (!_isValidMessage(message)) {
      return;
    }

    // input_request messages are attributable to particular execution requests,
    // and should pass through the middleware stack to allow plugins to see them
    const { msg_id } = message.parent_header;
    let callback;

    if (msg_id) {
      callback = this.executionCallbacks[msg_id];
    }

    if (callback) {
      callback(message, "stdin");
    }
  }

  onIOMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed) return;

    log("IO message:", message);

    if (!_isValidMessage(message)) {
      return;
    }

    const { msg_type } = message.header;
    const { msg_id } = message.parent_header;

    // Check if this is a silent request (shouldn't affect status bar)
    const isSilentRequest = this._silentRequests?.has(msg_id);

    // Forward the iopub message to the callback FIRST, before any cleanup
    let callback;
    if (msg_id) {
      callback = this.executionCallbacks[msg_id];
    }
    if (callback) {
      callback(message, "iopub");
    }

    // Handle status messages after forwarding
    if (msg_type === "status") {
      const status = message.content.execution_state;
      // Only update state if not destroyed and not a silent request
      if (!this._destroyed && !isSilentRequest) {
        this.setExecutionState(status);
      }
      // Flush deferred shell reply (which may delete callback) AFTER forwarding the idle message
      if (status === "idle") {
        this._flushExecuteReply(msg_id);
      }
    }
  }

  destroy() {
    log("ZMQKernel: destroy:", this);

    // Mark as destroyed to prevent any further state updates
    this._destroyed = true;

    // Stop cleanup interval
    this._stopCleanupInterval();

    // Clear connection timeout
    this._clearConnectionTimeout();

    // Clear pending callbacks first to prevent errors during shutdown
    this.executionCallbacks = {};
    this.requestTimestamps.clear();
    this.shellMessageQueue = [];
    this.stdinMessageQueue = [];
    this.deferredExecuteReplies.clear();
    this.idleBeforeReply.clear();

    // Remove all socket event listeners before closing to prevent callbacks during close
    if (this.shellSocket) {
      try {
        this.shellSocket.removeAllListeners();
      } catch (e) {
        log("ZMQKernel: Error removing shellSocket listeners:", e.message);
      }
    }
    if (this.ioSocket) {
      try {
        this.ioSocket.removeAllListeners();
      } catch (e) {
        log("ZMQKernel: Error removing ioSocket listeners:", e.message);
      }
    }
    if (this.stdinSocket) {
      try {
        this.stdinSocket.removeAllListeners();
      } catch (e) {
        log("ZMQKernel: Error removing stdinSocket listeners:", e.message);
      }
    }

    // Kill the process
    try {
      this._kill();
    } catch (e) {
      log("ZMQKernel: Error killing process:", e.message);
    }

    // Close sockets with error handling
    if (this.shellSocket) {
      try {
        this.shellSocket.close();
      } catch (e) {
        log("ZMQKernel: Error closing shellSocket:", e.message);
      }
    }
    if (this.ioSocket) {
      try {
        this.ioSocket.close();
      } catch (e) {
        log("ZMQKernel: Error closing ioSocket:", e.message);
      }
    }
    if (this.stdinSocket) {
      try {
        this.stdinSocket.close();
      } catch (e) {
        log("ZMQKernel: Error closing stdinSocket:", e.message);
      }
    }

    // Clean up connection file (non-fatal if it fails)
    try {
      fs.unlinkSync(this.connectionFile);
    } catch (err) {
      log("ZMQKernel: Failed to delete connection file:", err.message);
    }

    super.destroy();
  }
  _queueExecuteReply(message, callback) {
    const requestId = message.parent_header.msg_id;
    if (!requestId) {
      callback(message, "shell");
      return;
    }

    if (this.idleBeforeReply.has(requestId)) {
      this.idleBeforeReply.delete(requestId);
      // Clean up the callback and timestamp after shell reply is sent
      delete this.executionCallbacks[requestId];
      this.requestTimestamps.delete(requestId);
      callback(message, "shell");
      return;
    }

    this.deferredExecuteReplies.set(requestId, {
      message,
      callback,
      timestamp: Date.now(),
    });
  }

  _flushExecuteReply(requestId) {
    if (!requestId) {
      return;
    }

    // Clean up silent request tracking
    this._silentRequests?.delete(requestId);

    const pending = this.deferredExecuteReplies.get(requestId);
    if (pending) {
      this.deferredExecuteReplies.delete(requestId);
      // Clean up the callback and timestamp after shell reply is sent
      delete this.executionCallbacks[requestId];
      this.requestTimestamps.delete(requestId);
      pending.callback(pending.message, "shell");
      return;
    }

    // Use Map with timestamp instead of Set
    this.idleBeforeReply.set(requestId, Date.now());
  }
}

function _isValidMessage(message) {
  if (!message) {
    log("Invalid message: null");
    return false;
  }

  if (!message.content) {
    log("Invalid message: Missing content");
    return false;
  }

  if (message.content.execution_state === "starting") {
    // Kernels send a starting status message with an empty parent_header
    log("Dropped starting status IO message");
    return false;
  }

  if (!message.parent_header) {
    log("Invalid message: Missing parent_header");
    return false;
  }

  if (!message.parent_header.msg_id) {
    log("Invalid message: Missing parent_header.msg_id");
    return false;
  }

  if (!message.parent_header.msg_type) {
    log("Invalid message: Missing parent_header.msg_type");
    return false;
  }

  if (!message.header) {
    log("Invalid message: Missing header");
    return false;
  }

  if (!message.header.msg_id) {
    log("Invalid message: Missing header.msg_id");
    return false;
  }

  if (!message.header.msg_type) {
    log("Invalid message: Missing header.msg_type");
    return false;
  }

  return true;
}

function _getUsername() {
  return (
    process.env.LOGNAME ||
    process.env.USER ||
    process.env.LNAME ||
    process.env.USERNAME
  );
}

function _createMessage(msgType, msgId = uuidv4()) {
  const message = {
    header: {
      username: _getUsername(),
      session: "00000000-0000-0000-0000-000000000000",
      msg_type: msgType,
      msg_id: msgId,
      date: new Date(),
      version: "5.0",
    },
    metadata: {},
    parent_header: {},
    content: {},
  };
  return message;
}

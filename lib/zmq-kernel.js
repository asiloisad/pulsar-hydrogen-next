/** @babel */

import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as zmq from "zeromq";
import { launchSpec, launchSpecFromConnectionInfo } from "spawnteract";
import Config from "./config";
import KernelTransport from "./kernel-transport";
import { log, js_idx_to_char_idx } from "./utils";
import { Message, Socket } from "./jmp";

export default class ZMQKernel extends KernelTransport {
  executionCallbacks = {};
  deferredExecuteReplies = new Map(); // requestId -> { message, callbackInfo }
  idleBeforeReply = new Map(); // requestId -> true (marker that idle arrived first)
  deferredIdleState = new Map(); // requestId -> { suppressStatus } - defer idle state until execute_reply
  // Queue for shell messages to prevent "Socket is busy writing" errors
  shellMessageQueue = [];
  shellSocketBusy = false;
  // Queue for stdin messages
  stdinMessageQueue = [];
  stdinSocketBusy = false;
  _connectionPromise = null;
  // Execution serialization - ensures only one execute request in flight at a time
  executionQueue = [];
  currentExecutionRequest = null;

  constructor(kernelSpec, grammar, options, onStarted) {
    super(kernelSpec, grammar);
    this.options = options || {};
    // Otherwise spawnteract deletes the file and hydrogen's restart kernel fails
    options.cleanupConnectionFile = false;

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
    ).catch((error) => {
      log("ZMQKernel: Failed to launch kernel:", error);
      atom.notifications.addError(`Failed to start kernel: ${this.kernelSpec.display_name}`, {
        detail: error.message,
        dismissable: true,
      });
    });
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

      const onConnect = ({ socketName, socket }) => {
        log(`ZMQKernel: ${socketName} connected`);
        waitGroup--;

        if (waitGroup === 0) {
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
    // Execute language-specific startup code first
    const languageCode = Config.getJson("startupCodePerLanguage")[this.language];
    if (languageCode) {
      log("KernelManager: Executing startup code for language:", this.language);
      this.execute(languageCode + "\n", (message, channel) => {});
    }

    // Then execute kernel-specific startup code (with fallback to legacy "startupCode")
    const kernelCode = Config.getJson("startupCodePerKernel")[this.displayName]
      || Config.getJson("startupCode")[this.displayName];
    if (kernelCode) {
      log("KernelManager: Executing startup code for kernel:", this.displayName);
      this.execute(kernelCode + "\n", (message, channel) => {});
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

  // Clear all pending state (used in restart and destroy)
  _clearState() {
    this.executionCallbacks = {};
    this.shellMessageQueue = [];
    this.stdinMessageQueue = [];
    this.deferredExecuteReplies.clear();
    this.idleBeforeReply.clear();
    this.deferredIdleState.clear();
    this.executionQueue = [];
    this.currentExecutionRequest = null;
  }

  _socketRestart(onRestarted) {
    if (this.executionState === "restarting") {
      return;
    }

    this.setExecutionState("restarting");
    this._clearState();

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
  _queueShellMessage(message, requestId, onResults, suppressStatus = false) {
    this.executionCallbacks[requestId] = { callback: onResults, suppressStatus };
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
        const callbackInfo = this.executionCallbacks[requestId];
        if (callbackInfo) {
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
          callbackInfo.callback(errorMessage, "iopub");
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
          callbackInfo.callback(shellReply, "shell");
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

  // Enqueue an execution request for serialized processing
  // Only one execute request will be in flight at a time
  _enqueueExecution(code, onResults, options = {}) {
    const requestId = `execute_${uuidv4()}`;

    this.executionQueue.push({
      requestId,
      code,
      onResults,
      options,
    });

    this._processExecutionQueue();
    return requestId;
  }

  // Process the execution queue - sends the next request if none in flight
  _processExecutionQueue() {
    // If a request is in flight or queue empty, do nothing
    if (this.currentExecutionRequest !== null || this.executionQueue.length === 0) {
      return;
    }

    const request = this.executionQueue.shift();
    this.currentExecutionRequest = request.requestId;

    const message = _createMessage("execute_request", request.requestId);
    message.content = {
      code: request.code,
      silent: request.options.silent || false,
      store_history: request.options.store_history !== false,
      user_expressions: {},
      allow_stdin: request.options.allow_stdin !== false,
    };

    this._queueShellMessage(message, request.requestId, request.onResults, request.options.suppressStatus);
  }

  // onResults is a callback that may be called multiple times
  // as results come in from the kernel
  execute(code, onResults, options = {}) {
    log("ZMQKernel.execute:", code);
    this._enqueueExecution(code, onResults, {
      silent: options.silent ?? false,
      store_history: options.store_history ?? true,
      allow_stdin: options.allow_stdin ?? true,
      suppressStatus: options.suppressStatus ?? false,
    });
  }

  /**
   * Execute code silently without affecting status bar timer or execution count.
   * Used for internal operations like variable explorer refresh.
   * NOTE: silent:true means NO output is published on IOPub - use executeWatch for watches.
   */
  executeSilent(code, onResults) {
    this.execute(code, onResults, { silent: true, store_history: false, allow_stdin: false, suppressStatus: true });
  }

  /**
   * Execute code for watch pane - gets output but doesn't affect status bar or history.
   * Unlike executeSilent, this allows IOPub output (execute_result, stream, etc.)
   */
  executeWatch(code, onResults) {
    this.execute(code, onResults, { silent: false, store_history: false, allow_stdin: false, suppressStatus: true });
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
    // Suppress status to avoid "busy" flash during autocomplete
    this._queueShellMessage(message, requestId, onResults, true);
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
    // Suppress status to avoid "busy" flash during inspection
    this._queueShellMessage(message, requestId, onResults, true);
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
    let callbackInfo;

    if (msg_id) {
      callbackInfo = this.executionCallbacks[msg_id];
    }

    if (callbackInfo) {
      const { msg_type } = message.header;
      if (msg_type === "execute_reply") {
        this._queueExecuteReply(message, callbackInfo);
      } else {
        // Clean up callback for complete_reply, inspect_reply, etc.
        // These are one-shot requests that don't need to persist
        delete this.executionCallbacks[msg_id];
        callbackInfo.callback(message, "shell");
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
    let callbackInfo;

    if (msg_id) {
      callbackInfo = this.executionCallbacks[msg_id];
    }

    if (callbackInfo) {
      callbackInfo.callback(message, "stdin");
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

    // Get callback info for this request
    let callbackInfo;
    if (msg_id) {
      callbackInfo = this.executionCallbacks[msg_id];
    }

    // Check if this request should suppress status bar updates
    const suppressStatus = callbackInfo?.suppressStatus ?? false;

    // Forward the iopub message to the callback FIRST, before any cleanup
    if (callbackInfo) {
      callbackInfo.callback(message, "iopub");
    }

    // Handle status messages after forwarding
    if (msg_type === "status") {
      const status = message.content.execution_state;
      if (status === "idle") {
        // Try to flush the deferred shell reply first
        const flushed = this._flushExecuteReply(msg_id);
        if (flushed) {
          // Execute reply was waiting, shell callback ran, now safe to update state
          if (!this._destroyed && !suppressStatus) {
            this.setExecutionState(status);
          }
        } else if (msg_id && msg_id.startsWith("execute_")) {
          // Only defer idle for execute requests - they need to wait for execute_reply
          // This avoids the race condition where ResultView sees idle + running = error
          this.deferredIdleState.set(msg_id, { suppressStatus });
        } else {
          // For complete/inspect/other requests, set idle immediately
          // These don't have execute_reply, so deferring would block forever
          if (!this._destroyed && !suppressStatus) {
            this.setExecutionState(status);
          }
        }
      } else {
        // For non-idle states (busy, starting), update immediately
        if (!this._destroyed && !suppressStatus) {
          this.setExecutionState(status);
        }
      }
    }
  }

  destroy() {
    log("ZMQKernel: destroy:", this);

    // Mark as destroyed to prevent any further state updates
    this._destroyed = true;

    // Clear pending state first to prevent errors during shutdown
    this._clearState();

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
  _queueExecuteReply(message, callbackInfo) {
    const requestId = message.parent_header.msg_id;
    if (!requestId) {
      callbackInfo.callback(message, "shell");
      return;
    }

    // Release current execution request when shell reply arrives
    if (this.currentExecutionRequest === requestId) {
      this.currentExecutionRequest = null;
      setImmediate(() => this._processExecutionQueue());
    }

    if (this.idleBeforeReply.has(requestId)) {
      this.idleBeforeReply.delete(requestId);
      // Clean up the callback after shell reply is sent
      delete this.executionCallbacks[requestId];
      callbackInfo.callback(message, "shell");

      // Now set the deferred idle state (idle arrived before execute_reply)
      const deferred = this.deferredIdleState.get(requestId);
      if (deferred) {
        this.deferredIdleState.delete(requestId);
        if (!this._destroyed && !deferred.suppressStatus) {
          this.setExecutionState("idle");
        }
      }
      return;
    }

    this.deferredExecuteReplies.set(requestId, {
      message,
      callbackInfo,
    });
  }

  /**
   * Attempts to flush a deferred execute reply.
   * @returns {boolean} true if execute_reply was pending and flushed, false if not yet received
   */
  _flushExecuteReply(requestId) {
    if (!requestId) {
      return false;
    }

    const pending = this.deferredExecuteReplies.get(requestId);
    if (pending) {
      this.deferredExecuteReplies.delete(requestId);
      // Clean up the callback after shell reply is sent
      delete this.executionCallbacks[requestId];
      // Release current execution request
      if (this.currentExecutionRequest === requestId) {
        this.currentExecutionRequest = null;
        setImmediate(() => this._processExecutionQueue());
      }
      pending.callbackInfo.callback(pending.message, "shell");
      return true; // Flushed successfully
    }

    // Execute reply hasn't arrived yet - mark that idle arrived first
    this.idleBeforeReply.set(requestId, true);
    return false;
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

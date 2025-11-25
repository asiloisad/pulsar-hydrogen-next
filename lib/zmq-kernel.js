/** @babel */

import fs from "fs"
import { v5 } from "uuid"
import { launchSpec, launchSpecFromConnectionInfo } from "spawnteract"
import Config from "./config"
import KernelTransport from "./kernel-transport"
import { log, js_idx_to_char_idx } from "./utils"
import { Message, Socket } from "./jmp"
const NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341"

export default class ZMQKernel extends KernelTransport {
  executionCallbacks = {}
  deferredExecuteReplies = new Map()
  idleBeforeReply = new Set()
  // Queue for shell messages to prevent "Socket is busy writing" errors
  shellMessageQueue = []
  shellSocketBusy = false
  // Queue for stdin messages
  stdinMessageQueue = []
  stdinSocketBusy = false

  constructor(kernelSpec, grammar, options, onStarted) {
    super(kernelSpec, grammar)
    this.options = options || {}
    // Otherwise spawnteract deletes the file and hydrogen's restart kernel fails
    options.cleanupConnectionFile = false
    launchSpec(kernelSpec, options).then(
      ({ config, connectionFile, spawn }) => {
        this.connection = config
        this.connectionFile = connectionFile
        this.kernelProcess = spawn
        this.monitorNotifications(spawn)
        this.connect(() => {
          this._executeStartupCode()
          if (onStarted) {
            onStarted(this)
          }
        })
      }
    )
  }

  connect(done) {
    const scheme = this.connection.signature_scheme.slice("hmac-".length)
    const { key } = this.connection
    this.shellSocket = new Socket("dealer", scheme, key)
    this.stdinSocket = new Socket("dealer", scheme, key)
    this.ioSocket = new Socket("sub", scheme, key)
    const id = v5(Date.now().toString() + Math.random().toString(), NAMESPACE)
    this.shellSocket.identity = `dealer${id}`
    this.stdinSocket.identity = `dealer${id}`
    // this.ioSocket.identity = `sub${id}`
    const address = `${this.connection.transport}://${this.connection.ip}:`
    this.shellSocket.connect(address + this.connection.shell_port)
    this.ioSocket.connect(address + this.connection.iopub_port)
    this.ioSocket.subscribe("")
    this.stdinSocket.connect(address + this.connection.stdin_port)
    this.shellSocket.on("message", this.onShellMessage.bind(this))
    this.ioSocket.on("message", this.onIOMessage.bind(this))
    this.stdinSocket.on("message", this.onStdinMessage.bind(this))
    this.monitor(done)
  }

  monitorNotifications(childProcess) {
    childProcess.stdout.on("data", data => {
      data = data.toString()

      if (atom.config.get("hydrogen-next.kernelNotifications")) {
        atom.notifications.addInfo(this.kernelSpec.display_name, {
          description: data,
          dismissable: true
        })
      } else {
        log("ZMQKernel: stdout:", data)
      }
    })
    childProcess.stderr.on("data", data => {
      atom.notifications.addError(this.kernelSpec.display_name, {
        description: data.toString(),
        dismissable: true
      })
    })
  }

  monitor(done, prev) {
    try {
      const socketNames = ["shellSocket", "ioSocket"]
      let waitGroup = socketNames.length

      const onConnect = ({ socketName, socket }) => {
        log(`ZMQKernel: ${socketName} connected`)
        waitGroup--

        if (waitGroup === 0) {
          log("ZMQKernel: all main sockets connected")
          this.setExecutionState("idle")
          if (done) {
            done()
          }
        }
      }

      const monitor = (socketName, socket) => {
        log(`ZMQKernel: monitor ${socketName}`)
        socket.on(
          "connect",
          onConnect.bind(this, {
            socketName,
            socket
          })
        )
        if (!prev) { socket.monitor() }
      }

      monitor("shellSocket", this.shellSocket)
      monitor("ioSocket", this.ioSocket)
    } catch (err) {
      log("ZMQKernel:", err)
    }
  }

  interrupt() {
    if (process.platform === "win32") {
      atom.notifications.addWarning("Cannot interrupt this kernel", {
        detail: "Kernel interruption is currently not supported in Windows."
      })
    } else {
      log("ZMQKernel: sending SIGINT")
      this.kernelProcess.kill("SIGINT")
    }
  }

  _kill() {
    log("ZMQKernel: sending SIGKILL")
    this.kernelProcess.kill("SIGKILL")
  }

  _executeStartupCode() {
    const displayName = this.kernelSpec.display_name
    let startupCode = Config.getJson("startupCode")[displayName]

    if (startupCode) {
      log("KernelManager: Executing startup code:", startupCode)
      startupCode += "\n"
      this.execute(startupCode, (message, channel) => { })
    }
  }

  shutdown() {
    this._socketShutdown()
  }

  restart(onRestarted) {
    this._socketRestart(onRestarted)
  }

  _socketShutdown(restart = false) {
    const requestId = `shutdown_${v5(Date.now().toString() + Math.random().toString(), NAMESPACE)}`

    const message = _createMessage("shutdown_request", requestId)

    message.content = {
      restart
    }
    // Use queue to prevent "Socket is busy writing" errors
    this._queueShellMessage(message, requestId, () => {})
  }

  _socketRestart(onRestarted) {
    if (this.executionState === "restarting") {
      return
    }

    this.setExecutionState("restarting")

    this._socketShutdown(true)

    this._kill()

    const { spawn } = launchSpecFromConnectionInfo(
      this.kernelSpec,
      this.connection,
      this.connectionFile,
      this.options
    )
    this.kernelProcess = spawn
    this.monitor(() => {
      this._executeStartupCode()

      if (onRestarted) {
        onRestarted()
      }
    }, true)
  }

  // Queue a message to be sent on the shell socket
  // This prevents "Socket is busy writing" errors
  _queueShellMessage(message, requestId, onResults) {
    this.executionCallbacks[requestId] = onResults
    this.shellMessageQueue.push(message)
    this._processShellQueue()
  }

  // Process the shell message queue
  async _processShellQueue() {
    if (this.shellSocketBusy || this.shellMessageQueue.length === 0) {
      return
    }

    this.shellSocketBusy = true
    const message = this.shellMessageQueue.shift()

    try {
      await this.shellSocket.send(new Message(message))
    } catch (error) {
      log("ZMQKernel: Error sending shell message:", error)
      // Re-queue the message for retry if it's a transient error
      if (error.message && error.message.includes("busy")) {
        this.shellMessageQueue.unshift(message)
      }
    }

    this.shellSocketBusy = false

    // Process next message if any
    if (this.shellMessageQueue.length > 0) {
      // Use setImmediate for better async behavior than setTimeout(fn, 1)
      setImmediate(() => this._processShellQueue())
    }
  }

  // onResults is a callback that may be called multiple times
  // as results come in from the kernel
  execute(code, onResults) {
    log("ZMQKernel.execute:", code)
    const requestId = `execute_${v5(Date.now().toString() + Math.random().toString(), NAMESPACE)}`

    const message = _createMessage("execute_request", requestId)

    message.content = {
      code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: true
    }
    this._queueShellMessage(message, requestId, onResults)
  }

  complete(code, onResults) {
    log("ZMQKernel.complete:", code)
    const requestId = `complete_${v5(Date.now().toString() + Math.random().toString(), NAMESPACE)}`

    const message = _createMessage("complete_request", requestId)

    message.content = {
      code,
      text: code,
      line: code,
      cursor_pos: js_idx_to_char_idx(code.length, code)
    }
    this._queueShellMessage(message, requestId, onResults)
  }

  inspect(code, cursorPos, onResults) {
    log("ZMQKernel.inspect:", code, cursorPos)
    const requestId = `inspect_${v5(Date.now().toString() + Math.random().toString(), NAMESPACE)}`

    const message = _createMessage("inspect_request", requestId)

    message.content = {
      code,
      cursor_pos: cursorPos,
      detail_level: 0
    }
    this._queueShellMessage(message, requestId, onResults)
  }

  inputReply(input) {
    const requestId = `input_reply_${v5(Date.now().toString() + Math.random().toString(), NAMESPACE)}`

    const message = _createMessage("input_reply", requestId)

    message.content = {
      value: input
    }
    this._queueStdinMessage(message)
  }

  // Queue a message to be sent on the stdin socket
  _queueStdinMessage(message) {
    this.stdinMessageQueue.push(message)
    this._processStdinQueue()
  }

  // Process the stdin message queue
  async _processStdinQueue() {
    if (this.stdinSocketBusy || this.stdinMessageQueue.length === 0) {
      return
    }

    this.stdinSocketBusy = true
    const message = this.stdinMessageQueue.shift()

    try {
      await this.stdinSocket.send(new Message(message))
    } catch (error) {
      log("ZMQKernel: Error sending stdin message:", error)
      if (error.message && error.message.includes("busy")) {
        this.stdinMessageQueue.unshift(message)
      }
    }

    this.stdinSocketBusy = false

    if (this.stdinMessageQueue.length > 0) {
      setImmediate(() => this._processStdinQueue())
    }
  }

  onShellMessage(message) {
    log("shell message:", message)

    if (!_isValidMessage(message)) {
      return
    }

    const { msg_id } = message.parent_header
    let callback

    if (msg_id) {
      callback = this.executionCallbacks[msg_id]
    }

    if (callback) {
      const { msg_type } = message.header
      if (msg_type === "execute_reply") {
        this._queueExecuteReply(message, callback)
      } else {
        callback(message, "shell")
      }
    }
  }

  onStdinMessage(message) {
    log("stdin message:", message)

    if (!_isValidMessage(message)) {
      return
    }

    // input_request messages are attributable to particular execution requests,
    // and should pass through the middleware stack to allow plugins to see them
    const { msg_id } = message.parent_header
    let callback

    if (msg_id) {
      callback = this.executionCallbacks[msg_id]
    }

    if (callback) {
      callback(message, "stdin")
    }
  }

  onIOMessage(message) {
    log("IO message:", message)

    if (!_isValidMessage(message)) {
      return
    }

    const { msg_type } = message.header

    if (msg_type === "status") {
      const status = message.content.execution_state
      this.setExecutionState(status)
      if (status === "idle") {
        this._flushExecuteReply(message.parent_header.msg_id)
      }
    }

    const { msg_id } = message.parent_header
    let callback

    if (msg_id) {
      callback = this.executionCallbacks[msg_id]
    }

    if (callback) {
      callback(message, "iopub")
    }
  }

  destroy() {
    log("ZMQKernel: destroy:", this)
    this.shutdown()

    this._kill()

    // Clear pending callbacks to prevent errors after close
    this.executionCallbacks = {}
    this.shellMessageQueue = []
    this.stdinMessageQueue = []
    this.deferredExecuteReplies.clear()
    this.idleBeforeReply.clear()

    fs.unlinkSync(this.connectionFile)
    this.shellSocket.close()
    this.ioSocket.close()
    this.stdinSocket.close()
    super.destroy()
  }
  _queueExecuteReply(message, callback) {
    const requestId = message.parent_header.msg_id
    if (!requestId) {
      callback(message, "shell")
      return
    }

    if (this.idleBeforeReply.has(requestId)) {
      this.idleBeforeReply.delete(requestId)
      callback(message, "shell")
      return
    }

    this.deferredExecuteReplies.set(requestId, { message, callback })
  }

  _flushExecuteReply(requestId) {
    if (!requestId) {
      return
    }

    const pending = this.deferredExecuteReplies.get(requestId)
    if (pending) {
      this.deferredExecuteReplies.delete(requestId)
      pending.callback(pending.message, "shell")
      return
    }

    this.idleBeforeReply.add(requestId)
  }
}

function _isValidMessage(message) {
  if (!message) {
    log("Invalid message: null")
    return false
  }

  if (!message.content) {
    log("Invalid message: Missing content")
    return false
  }

  if (message.content.execution_state === "starting") {
    // Kernels send a starting status message with an empty parent_header
    log("Dropped starting status IO message")
    return false
  }

  if (!message.parent_header) {
    log("Invalid message: Missing parent_header")
    return false
  }

  if (!message.parent_header.msg_id) {
    log("Invalid message: Missing parent_header.msg_id")
    return false
  }

  if (!message.parent_header.msg_type) {
    log("Invalid message: Missing parent_header.msg_type")
    return false
  }

  if (!message.header) {
    log("Invalid message: Missing header")
    return false
  }

  if (!message.header.msg_id) {
    log("Invalid message: Missing header.msg_id")
    return false
  }

  if (!message.header.msg_type) {
    log("Invalid message: Missing header.msg_type")
    return false
  }

  return true
}

function _getUsername() {
  return (
    process.env.LOGNAME ||
    process.env.USER ||
    process.env.LNAME ||
    process.env.USERNAME
  )
}

function _createMessage(msgType, msgId = v5(Date.now().toString() + Math.random().toString(), NAMESPACE)) {
  const message = {
    header: {
      username: _getUsername(),
      session: "00000000-0000-0000-0000-000000000000",
      msg_type: msgType,
      msg_id: msgId,
      date: new Date(),
      version: "5.0"
    },
    metadata: {},
    parent_header: {},
    content: {}
  }
  return message
}

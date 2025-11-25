/** @babel */
/**
 * Jupyter Messaging Protocol (JMP) implementation
 * Based on jmp package by Nicolas Riesco
 * BSD 3-Clause License
 */

import crypto from "crypto"
import { v4 as uuidv4 } from "uuid"

const DEBUG = global.DEBUG || false
const DELIMITER = "<IDS|MSG>"

let log
if (DEBUG) {
  log = (...args) => {
    process.stderr.write("JMP: ")
    console.error(...args)
  }
} else {
  log = () => {}
}

/**
 * Jupyter message
 */
export class Message {
  constructor(properties) {
    this.idents = (properties && properties.idents) || []
    this.header = (properties && properties.header) || {}
    this.parent_header = (properties && properties.parent_header) || {}
    this.metadata = (properties && properties.metadata) || {}
    this.content = (properties && properties.content) || {}
    this.buffers = (properties && properties.buffers) || []
  }

  /**
   * Send a response over a given socket
   */
  respond(socket, messageType, content, metadata, protocolVersion) {
    const response = new Message()

    response.idents = this.idents
    response.header = {
      msg_id: uuidv4(),
      username: this.header.username,
      session: this.header.session,
      msg_type: messageType,
    }

    if (this.header && this.header.version) {
      response.header.version = this.header.version
    }
    if (protocolVersion) {
      response.header.version = protocolVersion
    }

    response.parent_header = this.header
    response.content = content || {}
    response.metadata = metadata || {}

    socket.send(response)

    return response
  }

  /**
   * Decode message received over a ZMQ socket
   */
  static _decode(messageFrames, scheme, key) {
    try {
      return _decode(messageFrames, scheme, key)
    } catch (err) {
      log("MESSAGE: DECODE: Error:", err)
    }
    return null
  }

  /**
   * Encode message for transfer over a ZMQ socket
   */
  _encode(scheme, key) {
    scheme = scheme || "sha256"
    key = key || ""

    const idents = this.idents
    const header = JSON.stringify(this.header)
    const parent_header = JSON.stringify(this.parent_header)
    const metadata = JSON.stringify(this.metadata)
    const content = JSON.stringify(this.content)

    let signature = ""
    if (key) {
      const hmac = crypto.createHmac(scheme, key)
      const encoding = "utf8"
      hmac.update(Buffer.from(header, encoding))
      hmac.update(Buffer.from(parent_header, encoding))
      hmac.update(Buffer.from(metadata, encoding))
      hmac.update(Buffer.from(content, encoding))
      signature = hmac.digest("hex")
    }

    const response = idents.concat([
      DELIMITER,
      signature,
      header,
      parent_header,
      metadata,
      content,
    ]).concat(this.buffers)

    return response
  }
}

function _decode(messageFrames, scheme, key) {
  scheme = scheme || "sha256"
  key = key || ""

  let i = 0
  const idents = []
  for (i = 0; i < messageFrames.length; i++) {
    const frame = messageFrames[i]
    if (frame.toString() === DELIMITER) {
      break
    }
    idents.push(frame)
  }

  if (messageFrames.length - i < 5) {
    log("MESSAGE: DECODE: Not enough message frames", messageFrames)
    return null
  }

  if (messageFrames[i].toString() !== DELIMITER) {
    log("MESSAGE: DECODE: Missing delimiter", messageFrames)
    return null
  }

  if (key) {
    const obtainedSignature = messageFrames[i + 1].toString()
    const hmac = crypto.createHmac(scheme, key)
    hmac.update(messageFrames[i + 2])
    hmac.update(messageFrames[i + 3])
    hmac.update(messageFrames[i + 4])
    hmac.update(messageFrames[i + 5])
    const expectedSignature = hmac.digest("hex")

    if (expectedSignature !== obtainedSignature) {
      log(
        "MESSAGE: DECODE: Incorrect message signature:",
        "Obtained = " + obtainedSignature,
        "Expected = " + expectedSignature
      )
      return null
    }
  }

  const message = new Message({
    idents: idents,
    header: toJSON(messageFrames[i + 2]),
    parent_header: toJSON(messageFrames[i + 3]),
    content: toJSON(messageFrames[i + 5]),
    metadata: toJSON(messageFrames[i + 4]),
    buffers: Array.prototype.slice.call(messageFrames, i + 6),
  })

  return message

  function toJSON(value) {
    return JSON.parse(value.toString())
  }
}

/**
 * ZMQ socket that parses the Jupyter Messaging Protocol
 */
export class Socket {
  constructor(socketType, scheme, key) {
    this._jmp = {
      scheme: scheme,
      key: key,
      _listeners: [],
    }
    this._socketType = socketType
    this._socket = null
    this._identity = null
  }

  get identity() {
    return this._identity
  }

  set identity(value) {
    this._identity = value
    if (this._socket) {
      this._socket.identity = value
    }
  }

  async _ensureSocket() {
    if (!this._socket) {
      const zmqModule = await import("zeromq/v5-compat")
      // Handle both CommonJS and ESM module formats
      const zmq = zmqModule.default || zmqModule
      this._socket = zmq.socket(this._socketType)
      if (this._identity) {
        this._socket.identity = this._identity
      }
    }
    return this._socket
  }

  async connect(address) {
    const socket = await this._ensureSocket()
    socket.connect(address)
  }

  async subscribe(filter) {
    const socket = await this._ensureSocket()
    socket.subscribe(filter)
  }

  send(message, flags) {
    if (message instanceof Message) {
      log("SOCKET: SEND:", message)
      this._socket.send(message._encode(this._jmp.scheme, this._jmp.key), flags)
    } else {
      this._socket.send(message, flags)
    }
  }

  on(event, listener) {
    if (!this._socket) {
      // Queue the listener to be added when socket is created
      this._ensureSocket().then(() => this.on(event, listener))
      return this
    }

    if (event !== "message") {
      this._socket.on(event, listener)
      return this
    }

    const _listener = {
      unwrapped: listener,
      wrapped: (...args) => {
        const message = Message._decode(args, this._jmp.scheme, this._jmp.key)
        if (message) {
          listener(message)
        }
      },
    }
    this._jmp._listeners.push(_listener)
    this._socket.on(event, _listener.wrapped)
    return this
  }

  addListener(event, listener) {
    return this.on(event, listener)
  }

  once(event, listener) {
    if (!this._socket) {
      this._ensureSocket().then(() => this.once(event, listener))
      return this
    }

    if (event !== "message") {
      this._socket.once(event, listener)
      return this
    }

    const _listener = {
      unwrapped: listener,
      wrapped: (...args) => {
        const message = Message._decode(args, this._jmp.scheme, this._jmp.key)
        if (message) {
          try {
            listener(message)
          } catch (error) {
            this.removeListener(event, listener)
            throw error
          }
        }
        this.removeListener(event, listener)
      },
    }

    this._jmp._listeners.push(_listener)
    this._socket.on(event, _listener.wrapped)
    return this
  }

  removeListener(event, listener) {
    if (!this._socket) {
      return this
    }

    if (event !== "message") {
      this._socket.removeListener(event, listener)
      return this
    }

    const length = this._jmp._listeners.length
    for (let i = 0; i < length; i++) {
      const _listener = this._jmp._listeners[i]
      if (_listener.unwrapped === listener) {
        this._jmp._listeners.splice(i, 1)
        this._socket.removeListener(event, _listener.wrapped)
        return this
      }
    }

    this._socket.removeListener(event, listener)
    return this
  }

  removeAllListeners(event) {
    if (!this._socket) {
      return this
    }

    if (arguments.length === 0 || event === "message") {
      this._jmp._listeners.length = 0
    }

    this._socket.removeAllListeners(event)
    return this
  }

  monitor() {
    if (this._socket) {
      this._socket.monitor()
    }
  }

  close() {
    if (this._socket) {
      this._socket.close()
    }
  }
}

export default { Message, Socket }

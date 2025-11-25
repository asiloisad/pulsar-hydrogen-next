/** @babel */
/**
 * Jupyter Messaging Protocol (JMP) implementation
 * Based on jmp package by Nicolas Riesco
 * BSD 3-Clause License
 *
 * Uses ZeroMQ v6 native API
 */

import crypto from "crypto"
import { v4 as uuidv4 } from "uuid"
import * as zmq from "zeromq"

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
 * Create appropriate ZMQ v6 socket based on type
 */
function createZmqSocket(socketType) {
  switch (socketType) {
    case "dealer":
      return new zmq.Dealer()
    case "sub":
      return new zmq.Subscriber()
    case "req":
      return new zmq.Request()
    case "rep":
      return new zmq.Reply()
    case "pub":
      return new zmq.Publisher()
    case "push":
      return new zmq.Push()
    case "pull":
      return new zmq.Pull()
    case "router":
      return new zmq.Router()
    default:
      throw new Error(`Unknown socket type: ${socketType}`)
  }
}

/**
 * ZMQ socket that parses the Jupyter Messaging Protocol
 * Uses ZeroMQ v6 native API
 */
export class Socket {
  constructor(socketType, scheme, key) {
    this._jmp = {
      scheme: scheme,
      key: key,
      _listeners: new Map(), // event -> [{unwrapped, wrapped}]
    }
    this._socketType = socketType
    this._socket = createZmqSocket(socketType)
    this._receiveLoop = null
    this._closed = false
  }

  get identity() {
    return this._socket.routingId
  }

  set identity(value) {
    this._socket.routingId = value
  }

  connect(address) {
    this._socket.connect(address)
  }

  subscribe(filter) {
    if (this._socketType === "sub") {
      this._socket.subscribe(filter)
    }
  }

  async send(message, flags) {
    if (message instanceof Message) {
      log("SOCKET: SEND:", message)
      const encoded = message._encode(this._jmp.scheme, this._jmp.key)
      await this._socket.send(encoded)
    } else {
      await this._socket.send(message)
    }
  }

  /**
   * Start the async receive loop for message events
   */
  _startReceiveLoop() {
    if (this._receiveLoop) return

    this._receiveLoop = (async () => {
      try {
        for await (const frames of this._socket) {
          if (this._closed) break

          const listeners = this._jmp._listeners.get("message")
          if (listeners && listeners.length > 0) {
            const message = Message._decode(frames, this._jmp.scheme, this._jmp.key)
            if (message) {
              // Copy array to avoid issues if listeners are removed during iteration
              const listenersCopy = [...listeners]
              for (const listener of listenersCopy) {
                try {
                  listener.unwrapped(message)
                } catch (err) {
                  log("SOCKET: MESSAGE HANDLER ERROR:", err)
                }
              }
            }
          }
        }
      } catch (err) {
        if (!this._closed) {
          log("SOCKET: RECEIVE LOOP ERROR:", err)
        }
      }
    })()
  }

  on(event, listener) {
    if (event === "message") {
      if (!this._jmp._listeners.has("message")) {
        this._jmp._listeners.set("message", [])
      }
      this._jmp._listeners.get("message").push({
        unwrapped: listener,
        wrapped: listener,
      })
      // Start the receive loop when first message listener is added
      this._startReceiveLoop()
    } else if (this._socket.events) {
      // Use ZMQ v6 events observer for non-message events
      this._socket.events.on(event, listener)
    }
    return this
  }

  addListener(event, listener) {
    return this.on(event, listener)
  }

  once(event, listener) {
    if (event === "message") {
      const onceWrapper = (message) => {
        this.removeListener(event, onceWrapper)
        listener(message)
      }
      return this.on(event, onceWrapper)
    } else if (this._socket.events) {
      // For non-message events, create a one-time wrapper
      const onceWrapper = (...args) => {
        this._socket.events.off(event, onceWrapper)
        listener(...args)
      }
      this._socket.events.on(event, onceWrapper)
    }
    return this
  }

  removeListener(event, listener) {
    if (event === "message") {
      const listeners = this._jmp._listeners.get("message")
      if (listeners) {
        const index = listeners.findIndex(l => l.unwrapped === listener)
        if (index !== -1) {
          listeners.splice(index, 1)
        }
      }
    } else if (this._socket.events) {
      this._socket.events.off(event, listener)
    }
    return this
  }

  removeAllListeners(event) {
    if (event === undefined) {
      // Remove all listeners for all events
      this._jmp._listeners.clear()
      if (this._socket.events) {
        this._socket.events.removeAllListeners()
      }
    } else if (event === "message") {
      this._jmp._listeners.set("message", [])
    } else {
      // Remove listeners for specific non-message event
      if (this._socket.events) {
        this._socket.events.removeAllListeners(event)
      }
    }
    return this
  }

  monitor() {
    // ZMQ v6 automatically starts monitoring when accessing events
    // This is a no-op for compatibility
  }

  close() {
    this._closed = true
    this._jmp._listeners.clear()
    this._socket.close()
  }
}

export default { Message, Socket }

/** @babel */

import { observable, action } from "mobx"
import { log } from "./utils"

export default class KernelTransport {
  @observable
  executionState = "loading"
  @observable
  executionCount = 0
  @observable
  lastExecutionTime = "No execution"
  @observable
  inspector = {
    bundle: {}
  }

  constructor(kernelSpec, grammar) {
    this.kernelSpec = kernelSpec
    this.grammar = grammar
    this.language = kernelSpec.language.toLowerCase()
    this.displayName = kernelSpec.display_name
  }

  @action
  setExecutionState(state) {
    this.executionState = state
  }

  @action
  setExecutionCount(count) {
    this.executionCount = count
  }

  @action
  setLastExecutionTime(timeString) {
    this.lastExecutionTime = timeString
  }

  interrupt() {
    throw new Error("KernelTransport: interrupt method not implemented")
  }

  shutdown() {
    throw new Error("KernelTransport: shutdown method not implemented")
  }

  restart(onRestarted) {
    throw new Error("KernelTransport: restart method not implemented")
  }

  execute(code, onResults) {
    throw new Error("KernelTransport: execute method not implemented")
  }

  complete(code, onResults) {
    throw new Error("KernelTransport: complete method not implemented")
  }

  inspect(code, cursorPos, onResults) {
    throw new Error("KernelTransport: inspect method not implemented")
  }

  inputReply(input) {
    throw new Error("KernelTransport: inputReply method not implemented")
  }

  destroy() {
    log("KernelTransport: Destroying base kernel")
  }
}

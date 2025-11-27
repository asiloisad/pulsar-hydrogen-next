/** @babel */

import { Emitter } from "atom";
import { observable, action } from "mobx";
import { log } from "./utils";

export default class KernelTransport {
  @observable
  executionState = "loading";
  @observable
  executionCount = 0;
  @observable
  lastExecutionTime = "No execution";
  @observable
  inspector = {
    bundle: {},
  };

  constructor(kernelSpec, grammar) {
    this.kernelSpec = kernelSpec;
    this.grammar = grammar;
    this.language = kernelSpec.language.toLowerCase();
    this.displayName = kernelSpec.display_name;
    this._emitter = new Emitter();
  }

  @action
  setExecutionState(state) {
    const oldState = this.executionState;
    this.executionState = state;
    if (oldState !== state) {
      this._emitter.emit("did-change-execution-state", state);
    }
  }

  /**
   * Subscribe to execution state changes.
   * This is the preferred way to monitor kernel status from external packages.
   * @param {Function} callback - Called with the new state ('idle', 'busy', 'loading', etc.)
   * @returns {Disposable} Subscription that can be disposed to unsubscribe
   */
  onDidChangeExecutionState(callback) {
    return this._emitter.on("did-change-execution-state", callback);
  }

  @action
  setExecutionCount(count) {
    this.executionCount = count;
  }

  @action
  setLastExecutionTime(timeString) {
    this.lastExecutionTime = timeString;
  }

  interrupt() {
    throw new Error("KernelTransport: interrupt method not implemented");
  }

  shutdown() {
    throw new Error("KernelTransport: shutdown method not implemented");
  }

  restart(onRestarted) {
    throw new Error("KernelTransport: restart method not implemented");
  }

  execute(code, onResults) {
    throw new Error("KernelTransport: execute method not implemented");
  }

  complete(code, onResults) {
    throw new Error("KernelTransport: complete method not implemented");
  }

  inspect(code, cursorPos, onResults) {
    throw new Error("KernelTransport: inspect method not implemented");
  }

  inputReply(input) {
    throw new Error("KernelTransport: inputReply method not implemented");
  }

  destroy() {
    log("KernelTransport: Destroying base kernel");
    if (this._emitter) {
      this._emitter.dispose();
      this._emitter = null;
    }
  }
}

/** @babel */

import { Emitter } from "atom";
import { observable, action, makeObservable } from "mobx";
import { log } from "./utils";
import store from "./store";

export default class KernelTransport {
  executionState = "loading";
  executionCount = 0;
  lastExecutionTime = "No execution";
  inspector = {
    bundle: {},
  };
  // Batch execution counter - when > 0, idle state is suppressed
  _batchExecutionDepth = 0;

  constructor(kernelSpec, grammar) {
    makeObservable(this, {
      executionState: observable,
      executionCount: observable,
      lastExecutionTime: observable,
      inspector: observable,
      setExecutionState: action,
      setExecutionCount: action,
      setLastExecutionTime: action,
    });

    this.kernelSpec = kernelSpec;
    this.grammar = grammar;
    this.language = kernelSpec.language.toLowerCase();
    this.displayName = kernelSpec.display_name;
    this._emitter = new Emitter();
  }

  /**
   * Start a batch execution. While in batch mode, the kernel will stay
   * in "busy" state even when individual cells complete.
   */
  startBatchExecution() {
    this._batchExecutionDepth++;
    if (this._batchExecutionDepth === 1) {
      this.setExecutionState("busy");
    }
  }

  /**
   * End a batch execution. When all batches complete, the kernel
   * will return to "idle" state.
   */
  endBatchExecution() {
    if (this._batchExecutionDepth > 0) {
      this._batchExecutionDepth--;
      if (this._batchExecutionDepth === 0) {
        this.setExecutionState("idle");
      }
    }
  }

  setExecutionState(state) {
    // Suppress idle state while batch execution is in progress
    if (state === "idle" && this._batchExecutionDepth > 0) {
      return;
    }
    const oldState = this.executionState;
    this.executionState = state;
    if (oldState !== state) {
      this._emitter.emit("did-change-execution-state", state);
      // Emit "hydrogen-done" on the editor when execution completes
      if (state === "idle" && oldState === "busy") {
        const editor = store.editor;
        if (editor && editor.emitter) {
          editor.emitter.emit("hydrogen-done");
        }
      }
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

  setExecutionCount(count) {
    this.executionCount = count;
  }

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

  executeSilent(code, onResults) {
    throw new Error("KernelTransport: executeSilent method not implemented");
  }

  executeWatch(code, onResults) {
    throw new Error("KernelTransport: executeWatch method not implemented");
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

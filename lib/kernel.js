/** @babel */

import { Emitter } from "atom";
import { observable, action, computed, makeObservable } from "mobx";
import isEqual from "lodash/isEqual";
import { log, focus, msgSpecToNotebookFormat, executionTime } from "./utils";
import store from "./store";
import WatchesStore from "./store/watches";
import VariableExplorerStore from "./store/variable-explorer-store";
import OutputStore from "./store/output";
import HydrogenKernel from "./plugin-api/hydrogen-kernel";
import InputView from "./input-view";
import KernelTransport from "./kernel-transport";

function protectFromInvalidMessages(onResults) {
  const wrappedOnResults = (message, channel) => {
    if (!message) {
      log("Invalid message: null");
      return;
    }

    if (!message.content) {
      log("Invalid message: Missing content");
      return;
    }

    if (message.content.execution_state === "starting") {
      // Kernels send a starting status message with an empty parent_header
      log("Dropped starting status IO message");
      return;
    }

    if (!message.parent_header) {
      log("Invalid message: Missing parent_header");
      return;
    }

    if (!message.parent_header.msg_id) {
      log("Invalid message: Missing parent_header.msg_id");
      return;
    }

    if (!message.parent_header.msg_type) {
      log("Invalid message: Missing parent_header.msg_type");
      return;
    }

    if (!message.header) {
      log("Invalid message: Missing header");
      return;
    }

    if (!message.header.msg_id) {
      log("Invalid message: Missing header.msg_id");
      return;
    }

    if (!message.header.msg_type) {
      log("Invalid message: Missing header.msg_type");
      return;
    }

    onResults(message, channel);
  };

  return wrappedOnResults;
} // Adapts middleware objects provided by plugins to an internal interface. In
// particular, this implements fallthrough logic for when a plugin defines some
// methods (e.g. execute) but doesn't implement others (e.g. interrupt). Note
// that HydrogenKernelMiddleware objects are mutable: they may lose/gain methods
// at any time, including in the middle of processing a request. This class also
// adds basic checks that messages passed via the `onResults` callbacks are not
// missing key mandatory fields specified in the Jupyter messaging spec.

class MiddlewareAdapter {
  constructor(middleware, next) {
    this._middleware = middleware;
    this._next = next;
  }

  // The return value of this method gets passed to plugins! For now we just
  // return the MiddlewareAdapter object itself, which is why all private
  // functionality is prefixed with _, and why MiddlewareAdapter is marked as
  // implementing HydrogenKernelMiddlewareThunk. Once multiple plugin API
  // versions exist, we may want to generate a HydrogenKernelMiddlewareThunk
  // specialized for a particular plugin API version.
  get _nextAsPluginType() {
    if (this._next instanceof KernelTransport) {
      throw new Error(
        "MiddlewareAdapter: _nextAsPluginType must never be called when _next is KernelTransport"
      );
    }

    return this._next;
  }

  interrupt() {
    if (this._middleware.interrupt) {
      this._middleware.interrupt(this._nextAsPluginType);
    } else {
      this._next.interrupt();
    }
  }

  shutdown() {
    if (this._middleware.shutdown) {
      this._middleware.shutdown(this._nextAsPluginType);
    } else {
      this._next.shutdown();
    }
  }

  restart(onRestarted) {
    if (this._middleware.restart) {
      this._middleware.restart(this._nextAsPluginType, onRestarted);
    } else {
      this._next.restart(onRestarted);
    }
  }

  execute(code, onResults) {
    // We don't want to repeatedly wrap the onResults callback every time we
    // fall through, but we need to do it at least once before delegating to
    // the KernelTransport.
    const safeOnResults =
      this._middleware.execute || this._next instanceof KernelTransport
        ? protectFromInvalidMessages(onResults)
        : onResults;

    if (this._middleware.execute) {
      this._middleware.execute(this._nextAsPluginType, code, safeOnResults);
    } else {
      this._next.execute(code, safeOnResults);
    }
  }

  complete(code, onResults) {
    const safeOnResults =
      this._middleware.complete || this._next instanceof KernelTransport
        ? protectFromInvalidMessages(onResults)
        : onResults;

    if (this._middleware.complete) {
      this._middleware.complete(this._nextAsPluginType, code, safeOnResults);
    } else {
      this._next.complete(code, safeOnResults);
    }
  }

  inspect(code, cursorPos, onResults) {
    const safeOnResults =
      this._middleware.inspect || this._next instanceof KernelTransport
        ? protectFromInvalidMessages(onResults)
        : onResults;

    if (this._middleware.inspect) {
      this._middleware.inspect(
        this._nextAsPluginType,
        code,
        cursorPos,
        safeOnResults
      );
    } else {
      this._next.inspect(code, cursorPos, safeOnResults);
    }
  }

  /**
   * Send input reply to kernel in response to input_request message.
   * This method follows the middleware pattern for consistency with other kernel operations.
   *
   * @param {String} input - The user input to send to the kernel
   */
  inputReply(input) {
    if (this._middleware.inputReply) {
      this._middleware.inputReply(this._nextAsPluginType, input);
    } else {
      this._next.inputReply(input);
    }
  }
}

export default class Kernel {
  inspector = {
    bundle: {},
  };
  outputStore = new OutputStore();
  watchCallbacks = [];
  emitter = new Emitter();
  pluginWrapper = null;

  constructor(kernel) {
    makeObservable(this, {
      inspector: observable,
      executionState: computed,
      executionCount: computed,
      lastExecutionTime: computed,
      setInspectorResult: action,
    });

    this.transport = kernel;
    this.watchesStore = new WatchesStore(this);
    this.variableExplorerStore = new VariableExplorerStore(this);
    // A MiddlewareAdapter that forwards all requests to `this.transport`.
    // Needed to terminate the middleware chain in a way such that the `next`
    // object passed to the last middleware is not the KernelTransport instance
    // itself (which would be violate isolation of internals from plugins).
    const delegateToTransport = new MiddlewareAdapter({}, this.transport);
    this.middleware = [delegateToTransport];
  }

  get kernelSpec() {
    return this.transport.kernelSpec;
  }

  get grammar() {
    return this.transport.grammar;
  }

  get language() {
    return this.transport.language;
  }

  get displayName() {
    return this.transport.displayName;
  }

  get firstMiddlewareAdapter() {
    return this.middleware[0];
  }

  addMiddleware(middleware) {
    this.middleware.unshift(
      new MiddlewareAdapter(middleware, this.middleware[0])
    );
  }

  get executionState() {
    return this.transport.executionState;
  }

  setExecutionState(state) {
    this.transport.setExecutionState(state);
  }

  /**
   * Subscribe to execution state changes.
   * This is the preferred way to monitor kernel status from external packages.
   * @param {Function} callback - Called with the new state ('idle', 'busy', 'loading', etc.)
   * @returns {Disposable} Subscription that can be disposed to unsubscribe
   */
  onDidChangeExecutionState(callback) {
    return this.transport.onDidChangeExecutionState(callback);
  }

  get executionCount() {
    return this.transport.executionCount;
  }

  setExecutionCount(count) {
    this.transport.setExecutionCount(count);
  }

  get lastExecutionTime() {
    return this.transport.lastExecutionTime;
  }

  setLastExecutionTime(timeString) {
    this.transport.setLastExecutionTime(timeString);
  }

  startBatchExecution() {
    this.transport.startBatchExecution();
  }

  endBatchExecution() {
    this.transport.endBatchExecution();
  }

  async setInspectorResult(bundle, editor) {
    if (bundle.size !== 0) {
      this.inspector.bundle = bundle;
    }
    focus(editor);
  }

  getPluginWrapper() {
    if (!this.pluginWrapper) {
      this.pluginWrapper = new HydrogenKernel(this);
    }

    return this.pluginWrapper;
  }

  addWatchCallback(watchCallback) {
    this.watchCallbacks.push(watchCallback);
  }

  interrupt() {
    this.firstMiddlewareAdapter.interrupt();
  }

  shutdown() {
    this.firstMiddlewareAdapter.shutdown();
  }

  restart(onRestarted) {
    this.firstMiddlewareAdapter.restart(() => {
      this.setExecutionCount(0);
      this.setLastExecutionTime("No execution");
      if (onRestarted) {
        onRestarted();
      }
    });
  }

  execute(code, onResults) {
    const wrappedOnResults = this._wrapExecutionResultsCallback(onResults);

    this.firstMiddlewareAdapter.execute(code, (message, channel) => {
      wrappedOnResults(message, channel);
      const { msg_type } = message.header;

      if (msg_type === "execute_input") {
        this.setLastExecutionTime("Running ...");
      }

      if (msg_type === "execute_reply") {
        const count = message.content.execution_count;
        this.setExecutionCount(count);
        const timeString = executionTime(message);
        this.setLastExecutionTime(timeString);
      }

      const { execution_state } = message.content;

      if (
        channel == "iopub" &&
        msg_type === "status" &&
        execution_state === "idle"
      ) {
        this._callWatchCallbacks();
      }
    });
  }

  executeWatch(code, onResults) {
    // Use executeSilent so watch callbacks don't affect status bar timer
    this.transport.executeSilent(
      code,
      this._wrapExecutionResultsCallback(onResults)
    );
  }

  _callWatchCallbacks() {
    this.watchCallbacks.forEach((watchCallback) => watchCallback());
  }

  /*
   * Takes a callback that accepts execution results in a hydrogen-internal
   * format and wraps it to accept Jupyter message/channel pairs instead.
   * Kernels and plugins all operate on types specified by the Jupyter messaging
   * protocol in order to maximize compatibility, but hydrogen internally uses
   * its own types.
   */
  _wrapExecutionResultsCallback(onResults) {
    return (message, channel) => {
      if (channel === "shell") {
        const { status } = message.content;

        if (status === "error" || status === "ok") {
          onResults({
            data: status,
            stream: "status",
          });
        } else {
          log("Kernel: unexpected value for message.content.status:", status);
          // Still send a status to avoid hanging - treat unknown status as error
          onResults({
            data: "error",
            stream: "status",
          });
        }
      } else if (channel === "iopub") {
        if (message.header.msg_type === "execute_input") {
          onResults({
            data: message.content.execution_count,
            stream: "execution_count",
          });
        }

        const result = msgSpecToNotebookFormat(message);
        onResults(result);
      } else if (channel === "stdin") {
        if (message.header.msg_type !== "input_request") {
          return;
        }

        const { prompt, password } = message.content;

        // Input replies now go through middleware, allowing plugins to intercept
        // or modify input handling (e.g., for automated testing, logging, or custom UI)
        const inputView = new InputView(
          {
            prompt,
            password,
          },
          (input) => this.firstMiddlewareAdapter.inputReply(input)
        );
        inputView.attach();
      }
    };
  }

  complete(code, onResults) {
    this.firstMiddlewareAdapter.complete(code, (message, channel) => {
      if (channel !== "shell") {
        log("Invalid reply: wrong channel");
        return;
      }

      onResults(message.content);
    });
  }

  inspect(code, cursorPos, onResults) {
    this.firstMiddlewareAdapter.inspect(code, cursorPos, (message, channel) => {
      if (channel !== "shell") {
        log("Invalid reply: wrong channel");
        return;
      }

      onResults({
        data: message.content.data,
        found: message.content.found,
      });
    });
  }

  destroy() {
    log("Kernel: Destroying");

    // Prevent double destruction
    if (this._destroyed) return;
    this._destroyed = true;

    // This is for cleanup to improve performance
    try {
      this.watchesStore.destroy();
    } catch (e) {
      log("Kernel: Error destroying watchesStore:", e);
    }

    try {
      this.variableExplorerStore.destroy();
    } catch (e) {
      log("Kernel: Error destroying variableExplorerStore:", e);
    }

    try {
      store.deleteKernel(this);
    } catch (e) {
      log("Kernel: Error deleting kernel from store:", e);
    }

    try {
      this.transport.destroy();
    } catch (e) {
      log("Kernel: Error destroying transport:", e);
    }

    if (this.pluginWrapper) {
      this.pluginWrapper.destroyed = true;
    }

    try {
      this.emitter.emit("did-destroy");
      this.emitter.dispose();
    } catch (e) {
      log("Kernel: Error disposing emitter:", e);
    }
  }
}

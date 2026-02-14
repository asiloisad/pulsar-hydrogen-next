/** @babel */

/*
 * The `hydrogenKernel` class wraps Hydrogen's internal representation of kernels
 * and exposes a small set of methods that should be usable by plugins.
 * @class HydrogenKernel
 */

export default class HydrogenKernel {
  constructor(_kernel) {
    this._kernel = _kernel;
    this.destroyed = false;
  }

  /*
   * Execute code in the kernel and return a Promise with the result.
   * This is the recommended way to execute code from plugins.
   *
   * @param {String} code - The code to execute
   * @return {Promise<Object>} Promise that resolves with { status, data } or rejects on error
   *   - status: 'ok' or 'error'
   *   - data: output data (for successful execution) or error details (for failed execution)
   *   - error: { ename, evalue, traceback } (only present when status is 'error')
   */
  execute(code) {
    this._assertNotDestroyed();

    return new Promise((resolve) => {
      const outputs = [];
      let errorInfo = null;

      this._kernel.execute(code, (result) => {
        if (result.stream === "status") {
          // Execution complete
          if (result.data === "ok") {
            resolve({ status: "ok", outputs });
          } else {
            resolve({
              status: "error",
              outputs,
              error: errorInfo || { ename: "Error", evalue: "Unknown error", traceback: [] },
            });
          }
        } else if (result.stream === "error") {
          errorInfo = {
            ename: result.data.ename || "Error",
            evalue: result.data.evalue || "Unknown error",
            traceback: result.data.traceback || [],
          };
        } else if (result.data) {
          outputs.push(result);
        }
      });
    });
  }

  /*
   * Execute code in the kernel with a callback for each result.
   * This gives access to raw Hydrogen-internal result format.
   *
   * @param {String} code - The code to execute
   * @param {Function} onResults - Callback called with each result
   *   Result format: { data, stream } where stream is 'status', 'error', 'execution_count', etc.
   */
  executeWithCallback(code, onResults) {
    this._assertNotDestroyed();

    this._kernel.execute(code, onResults);
  }

  // ========== Kernel State & Control ==========

  /*
   * Get the current execution state of the kernel.
   * @return {String} 'idle', 'busy', 'starting', or other states
   */
  get executionState() {
    this._assertNotDestroyed();
    return this._kernel.executionState;
  }

  /*
   * Get the current execution count.
   * @return {Number} The execution count
   */
  get executionCount() {
    this._assertNotDestroyed();
    return this._kernel.executionCount;
  }

  /*
   * Get the last execution time as a formatted string.
   * @return {String} e.g., "1.23s" or "Running ..."
   */
  get lastExecutionTime() {
    this._assertNotDestroyed();
    return this._kernel.lastExecutionTime;
  }

  /*
   * Subscribe to execution state changes.
   * @param {Function} callback - Called with the new state ('idle', 'busy', etc.)
   * @return {Disposable} Subscription that can be disposed to unsubscribe
   */
  onDidChangeExecutionState(callback) {
    this._assertNotDestroyed();
    return this._kernel.onDidChangeExecutionState(callback);
  }

  /*
   * Interrupt the currently running execution.
   */
  interrupt() {
    this._assertNotDestroyed();
    this._kernel.interrupt();
  }

  /*
   * Restart the kernel.
   * @param {Function} [onRestarted] - Optional callback when restart completes
   */
  restart(onRestarted) {
    this._assertNotDestroyed();
    this._kernel.restart(onRestarted);
  }

  /*
   * Shutdown the kernel.
   */
  shutdown() {
    this._assertNotDestroyed();
    this._kernel.shutdown();
  }

  // ========== Introspection ==========

  /*
   * Get code completions at a position.
   * @param {String} code - The code to complete
   * @return {Promise<Object>} Promise resolving to completion results
   */
  complete(code) {
    this._assertNotDestroyed();

    return new Promise((resolve) => {
      this._kernel.complete(code, (results) => {
        resolve(results);
      });
    });
  }

  /*
   * Inspect code at a position (get documentation/signature).
   * @param {String} code - The code to inspect
   * @param {Number} cursorPos - Cursor position in the code
   * @return {Promise<Object>} Promise resolving to { data, found }
   */
  inspect(code, cursorPos) {
    this._assertNotDestroyed();

    return new Promise((resolve) => {
      this._kernel.inspect(code, cursorPos, (results) => {
        resolve(results);
      });
    });
  }

  // ========== Kernel Info ==========

  /*
   * Get the full kernel spec object.
   * @return {Object} The kernel spec
   */
  get kernelSpec() {
    this._assertNotDestroyed();
    return this._kernel.kernelSpec;
  }

  _assertNotDestroyed() {
    // Internal: plugins might hold references to long-destroyed kernels, so
    // all API calls should guard against this case
    if (this.destroyed) {
      throw new Error(
        "hydrogenKernel: operation not allowed because the kernel has been destroyed",
      );
    }
  }

  /*
   * The language of the kernel, as specified in its kernelspec
   */
  get language() {
    this._assertNotDestroyed();

    return this._kernel.language;
  }

  /*
   * The display name of the kernel, as specified in its kernelspec
   */
  get displayName() {
    this._assertNotDestroyed();

    return this._kernel.displayName;
  }

  /*
   * Add a kernel middleware, which allows intercepting and issuing commands to
   * the kernel.
   *
   * If the methods of a `middleware` object are added/modified/deleted after
   * `addMiddleware` has been called, the changes will take effect immediately.
   *
   * @param {HydrogenKernelMiddleware} middleware
   */
  addMiddleware(middleware) {
    this._assertNotDestroyed();

    this._kernel.addMiddleware(middleware);
  }

  /*
   * Calls your callback when the kernel has been destroyed.
   * @param {Function} Callback
   */
  onDidDestroy(callback) {
    this._assertNotDestroyed();

    this._kernel.emitter.on("did-destroy", callback);
  }

  /*
   * Get the [connection file](http://jupyter-notebook.readthedocs.io/en/latest/examples/Notebook/Connecting%20with%20the%20Qt%20Console.html) of the kernel.
   * @return {String} Path to connection file.
   */
  getConnectionFile() {
    this._assertNotDestroyed();

    // $FlowFixMe
    const connectionFile = this._kernel.transport.connectionFile
      ? this._kernel.transport.connectionFile
      : null;

    if (!connectionFile) {
      throw new Error(
        `No connection file for ${this._kernel.kernelSpec.display_name} kernel found`,
      );
    }

    return connectionFile;
  }
}

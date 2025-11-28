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

    return new Promise((resolve, reject) => {
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

  _assertNotDestroyed() {
    // Internal: plugins might hold references to long-destroyed kernels, so
    // all API calls should guard against this case
    if (this.destroyed) {
      throw new Error(
        "hydrogenKernel: operation not allowed because the kernel has been destroyed"
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
        `No connection file for ${this._kernel.kernelSpec.display_name} kernel found`
      );
    }

    return connectionFile;
  }
}

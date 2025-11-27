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

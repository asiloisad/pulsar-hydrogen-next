/** @babel */

/**
 * InputView is now a thin wrapper around ExecPanel's input mode.
 * This provides backwards compatibility while sharing the same UI and history.
 */
export default class InputView {
  constructor({ prompt, defaultText, allowCancel, password }, onConfirmed) {
    this.options = { prompt, defaultText, allowCancel, password };
    this.onConfirmed = onConfirmed;
  }

  attach() {
    // Lazy require to avoid circular dependency
    const { getExecPanel } = require("./main");
    const execPanel = getExecPanel();
    execPanel.showInput(this.options, this.onConfirmed);
  }

  close() {
    const { getExecPanel } = require("./main");
    const execPanel = getExecPanel();
    execPanel.hide();
  }
}

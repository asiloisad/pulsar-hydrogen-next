/** @babel */

import { action, observable, makeObservable } from "mobx";
import OutputStore from "./output";
import { log } from "../utils";

export default class WatchStore {
  outputStore = new OutputStore();
  isWatching = false;
  _blurHandler = null;

  constructor(kernel) {
    makeObservable(this, {
      isWatching: observable,
      run: action,
      setCode: action,
      toggleWatching: action,
    });

    this.kernel = kernel;
    this.editor = atom.workspace.buildTextEditor({
      softWrapped: true,
      lineNumberGutterVisible: false,
    });
    const grammar = this.kernel.grammar;
    if (grammar) {
      atom.grammars.assignLanguageMode(
        this.editor.getBuffer(),
        grammar.scopeName
      );
    }
    this.editor.moveToTop();
    this.editor.element.classList.add("watch-input");

    // Re-run watch when editor loses focus (if watching is active)
    this._blurHandler = () => {
      if (this.isWatching) {
        this.run();
      }
    };
    this.editor.element.addEventListener("blur", this._blurHandler);
  }

  toggleWatching = () => {
    this.isWatching = !this.isWatching;
    if (this.isWatching) {
      this.run();
    }
  };

  run = () => {
    if (!this.isWatching) return;

    const code = this.getCode();
    log("watchview running:", code);

    if (code && code.length > 0) {
      // Clear previous output before running new code
      this.outputStore.clear();
      this.kernel.executeWatch(code, (result) => {
        this.outputStore.appendOutput(result);
      });
    }
  };

  setCode = (code) => {
    this.editor.setText(code);
  };
  getCode = () => {
    return this.editor.getText();
  };
  focus = () => {
    this.editor.element.focus();
  };

  destroy() {
    // Remove blur event listener
    if (this._blurHandler && this.editor) {
      this.editor.element.removeEventListener("blur", this._blurHandler);
      this._blurHandler = null;
    }

    // Dispose of the text editor to free resources
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  }
}

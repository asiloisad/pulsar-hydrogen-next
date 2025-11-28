/** @babel */

import { CompositeDisposable, TextEditor } from "atom";
import { setPreviouslyFocusedElement } from "./utils";

/**
 * A modal panel that can operate in two modes:
 * - "exec" mode: executes code in kernel with history tracking
 * - "input" mode: simple input prompt (like InputView) with optional history
 */
export default class ExecPanel {
  constructor(store) {
    this.store = store;
    this.history = [];
    this.historyIndex = -1;
    this.panel = null;
    this.disposables = new CompositeDisposable();
    this.previouslyFocusedElement = null;
    this.element = null;
    this.editor = null;
    this.historyList = null;
    this.labelEl = null;

    // Input mode state
    this.mode = "exec"; // "exec" or "input"
    this.onConfirmed = null;
    this.allowCancel = true;
    this.password = false;
  }

  toggle() {
    if (this.panel && this.panel.isVisible()) {
      this.hide();
    } else {
      this.showExec();
    }
  }

  /**
   * Show in exec mode (execute code in kernel)
   */
  showExec() {
    this.mode = "exec";
    this.onConfirmed = null;
    this.allowCancel = true;
    this.password = false;
    this._show({
      placeholder: "Enter code to execute...",
      showHistory: true,
    });
  }

  /**
   * Show in input mode (like InputView)
   * @param {Object} options - { prompt, defaultText, allowCancel, password }
   * @param {Function} onConfirmed - callback with input text
   */
  showInput({ prompt, defaultText, allowCancel = true, password = false }, onConfirmed) {
    this.mode = "input";
    this.onConfirmed = onConfirmed;
    this.allowCancel = allowCancel;
    this.password = password;
    this._show({
      prompt,
      defaultText,
      placeholder: prompt || "Enter input...",
      showHistory: true,
    });
  }

  _show({ prompt, defaultText, placeholder, showHistory }) {
    setPreviouslyFocusedElement(this);

    if (!this.element) {
      this.element = this.createElement();
    }

    // Update label
    if (prompt) {
      this.labelEl.textContent = prompt;
      this.labelEl.style.display = "";
    } else {
      this.labelEl.style.display = "none";
    }

    // Update password mode
    if (this.password) {
      this.element.classList.add("password");
    } else {
      this.element.classList.remove("password");
    }

    // Update placeholder
    this.editor.setPlaceholderText(placeholder || "");

    // Set default text
    if (defaultText) {
      this.editor.setText(defaultText);
    } else {
      this.editor.setText("");
    }

    // Show/hide history
    this.historyList.style.display = showHistory ? "" : "none";

    if (!this.panel) {
      this.panel = atom.workspace.addModalPanel({ item: this.element, visible: false });
    }

    this.historyIndex = -1;
    this.renderHistory();
    this.panel.show();
    this.editor.element.focus();
    this.editor.scrollToCursorPosition();
  }

  hide() {
    if (this.panel) {
      this.panel.hide();
    }
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
    // Reset input mode state
    this.onConfirmed = null;
  }

  createElement() {
    const container = document.createElement("div");
    container.classList.add("hydrogen-next", "exec-panel", "select-list", "command-palette");

    // Label (for input mode prompts)
    this.labelEl = document.createElement("div");
    this.labelEl.classList.add("label", "icon", "icon-arrow-right");
    this.labelEl.style.display = "none";

    // Editor section
    this.editor = new TextEditor({ mini: true });
    this.editor.element.classList.add("exec-editor");

    // History list
    this.historyList = document.createElement("ol");
    this.historyList.classList.add("list-group");

    container.appendChild(this.labelEl);
    container.appendChild(this.editor.element);
    container.appendChild(this.historyList);

    // Key bindings
    this.disposables.add(
      atom.commands.add(this.editor.element, {
        "core:confirm": () => this.confirm(),
        "core:cancel": () => {
          if (this.allowCancel) {
            this.hide();
          }
        },
        "core:move-up": (e) => {
          this.navigateHistory(-1);
          e.stopImmediatePropagation();
        },
        "core:move-down": (e) => {
          this.navigateHistory(1);
          e.stopImmediatePropagation();
        },
      })
    );

    // Hide on blur (like atom-select-list)
    this.editor.element.addEventListener("blur", (e) => {
      if (this.allowCancel && document.hasFocus() && !this.element.contains(e.relatedTarget)) {
        this.hide();
      }
    });

    return container;
  }

  async confirm() {
    const text = this.editor.getText();

    if (this.mode === "input") {
      // Input mode: add to history and call callback
      if (text) {
        this.addToHistory(text, "ok");
      }
      const callback = this.onConfirmed;
      this.hide();
      if (callback) {
        callback(text);
      }
    } else {
      // Exec mode: execute in kernel
      await this.execute();
    }
  }

  async execute() {
    const code = this.editor.getText().trim();
    if (!code) return;

    const kernel = this.store.kernel;
    if (!kernel) {
      atom.notifications.addError("No kernel running");
      return;
    }

    // Add to history as running
    const entry = this.addToHistory(code, "running");

    // Execute using plugin API
    const hydrogenKernel = kernel.getPluginWrapper();
    const result = await hydrogenKernel.execute(code);
    entry.status = result.status;
    if (result.status === "error") {
      entry.error = result.error;
    }

    // Clear editor and refresh
    this.editor.setText("");
    this.renderHistory();
  }

  addToHistory(text, status = "ok") {
    const entry = {
      code: text,
      timestamp: new Date(),
      status,
      error: null,
    };

    // Remove duplicate if exists
    const existingIndex = this.history.findIndex((h) => h.code === text);
    if (existingIndex !== -1) {
      this.history.splice(existingIndex, 1);
    }

    this.history.unshift(entry);
    this.historyIndex = -1;
    this.renderHistory();

    return entry;
  }

  renderHistory() {
    this.historyList.innerHTML = "";

    for (let i = 0; i < this.history.length; i++) {
      const entry = this.history[i];
      const item = document.createElement("li");
      item.classList.add("exec-history-item");
      if (i === this.historyIndex) {
        item.classList.add("selected");
      }

      const codeEl = document.createElement("div");
      codeEl.classList.add("primary-line");
      codeEl.textContent = entry.code;

      const metaEl = document.createElement("div");
      metaEl.classList.add("secondary-line");

      const statusIcon = document.createElement("span");
      statusIcon.classList.add("exec-status");
      if (entry.status === "ok") {
        statusIcon.classList.add("icon", "icon-check", "text-success");
      } else if (entry.status === "error") {
        statusIcon.classList.add("icon", "icon-x", "text-error");
        if (entry.error) {
          statusIcon.title = `${entry.error.ename}: ${entry.error.evalue}`;
        }
      } else {
        statusIcon.classList.add("icon", "icon-sync", "text-info");
      }

      const timeEl = document.createElement("span");
      timeEl.classList.add("exec-time");
      timeEl.textContent = entry.timestamp.toLocaleTimeString();

      metaEl.appendChild(statusIcon);
      metaEl.appendChild(timeEl);

      item.appendChild(codeEl);
      item.appendChild(metaEl);

      item.addEventListener("click", () => {
        this.editor.setText(entry.code);
        this.editor.element.focus();
      });

      this.historyList.appendChild(item);
    }
  }

  navigateHistory(direction) {
    if (this.history.length === 0) return;

    const newIndex = this.historyIndex + direction;
    if (newIndex < -1 || newIndex >= this.history.length) return;

    this.historyIndex = newIndex;
    if (this.historyIndex === -1) {
      this.editor.setText("");
    } else {
      this.editor.setText(this.history[this.historyIndex].code);
    }
    this.renderHistory();
  }

  destroy() {
    this.disposables.dispose();
    if (this.editor) {
      this.editor.destroy();
    }
    if (this.panel) {
      this.panel.destroy();
    }
    if (this.element) {
      this.element.remove();
    }
  }
}

/** @babel */

import { SelectListView, highlightMatches, createTwoLineItem } from "pulsar-select-list";

/**
 * A modal panel for executing code in kernel with history tracking
 */
export default class ExecPanel {
  constructor(store) {
    this.store = store;
    this.history = [];

    this.selectList = new SelectListView({
      items: [],

      className: "hydrogen-next exec-panel",

      emptyMessage: "No history yet. Enter code above to execute.",

      placeholderText: "Enter code to execute...",

      // Start with no selection so Enter executes instead of selecting
      initialSelectionIndex: undefined,

      willShow: () => {
        this._currentQuery = "";
        this.selectList.update({ items: this.history });
      },

      // Don't filter - show all history, but highlight matches
      filter: (items, query) => {
        this._currentQuery = query || "";
        return items;
      },

      filterKeyForItem: (entry) => entry.code,

      elementForItem: (entry) => {
        // Primary: code text with optional highlighting
        const matches = this._currentQuery ? this.selectList.getMatchIndices(entry) : null;
        const primary = matches
          ? highlightMatches(entry.code, matches)
          : entry.code;

        // Secondary: status icon + timestamp
        const secondary = document.createDocumentFragment();

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

        secondary.appendChild(statusIcon);
        secondary.appendChild(timeEl);

        const li = createTwoLineItem({ primary, secondary });
        li.classList.add("exec-history-item");
        return li;
      },

      didConfirmSelection: (entry) => {
        // Clicking/selecting a history item populates the editor
        this.selectList.refs.queryEditor.setText(entry.code);
        this.selectList.selectNone();
      },

      didConfirmEmptySelection: () => {
        this.execute();
      },

      didCancelSelection: () => {
        this.selectList.hide();
      },
    });

    this._currentQuery = "";
  }

  toggle() {
    this.selectList.toggle();
  }

  async execute() {
    const code = this.selectList.getQuery().trim();
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
    this.selectList.reset();
    this.selectList.update({ items: this.history });
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
    this.selectList.update({ items: this.history });

    return entry;
  }

  destroy() {
    this.selectList.destroy();
  }
}

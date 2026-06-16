/** @babel */
/** @jsx React.createElement */

import React from "react";
import { Disposable } from "atom";
import { DATA_EXPLORER_URI } from "../utils";
import DataExplorer from "../components/data-explorer";
import dataExplorerStore from "../store/data-explorer-store";
import BasePane from "./base-pane";

export default class DataExplorerPane extends BasePane {
  constructor() {
    super({
      title: "Data Explorer",
      iconName: "graph",
      uri: DATA_EXPLORER_URI,
      defaultLocation: "center",
      allowedLocations: ["center"],
      reactElement: <DataExplorer des={dataExplorerStore} />,
    });

    this.element.tabIndex = -1;
    this.element.addEventListener("focus", this.redirectFocus);
    // Remember the last element focused inside the pane so that re-focusing the
    // pane (e.g. window:focus-pane-on-right) restores it instead of always
    // jumping back to the expression editor.
    this.element.addEventListener("focusin", this.rememberFocus);
    this.disposer.add(
      new Disposable(() => {
        this.element.removeEventListener("focus", this.redirectFocus);
        this.element.removeEventListener("focusin", this.rememberFocus);
      }),
    );
  }

  rememberFocus = (event) => {
    const target = event.target;
    if (target && target !== this.element && this.element.contains(target)) {
      this._lastFocused = target;
    }
  };

  // The element to focus on the first focus, before the user has interacted.
  getDefaultFocusTarget() {
    return (
      this.element.querySelector("atom-text-editor.data-explorer-expression") ||
      this.element.querySelector(
        ".data-explorer-grid-view:not(.is-hidden) .data-explorer-canvas-wrap",
      ) ||
      this.element.querySelector(".data-explorer-grid-view:not(.is-hidden) .data-explorer-scalar") ||
      this.element.querySelector(".data-explorer-table-wrapper") ||
      this.element.querySelector(".data-explorer-plot") ||
      this.element.querySelector(".data-explorer-body") ||
      this.element
    );
  }

  // Prefer the last focused inner element (if still present and visible) so the
  // pane restores where the user was; otherwise fall back to the default.
  getFocusTarget() {
    const last = this._lastFocused;
    if (last && this.element.contains(last) && last.offsetParent !== null) {
      return last;
    }
    return this.getDefaultFocusTarget();
  }

  redirectFocus = (event) => {
    if (event.target !== this.element) {
      return;
    }
    const target = this.getFocusTarget();
    if (target !== this.element) {
      requestAnimationFrame(() => target.focus?.({ preventScroll: true }));
    }
  };

  focus = () => {
    this.getFocusTarget().focus?.({ preventScroll: true });
  };

  // Explicitly focus the expression editor. Used by the open-data-explorer
  // command so running it always lands ready to type a new expression, even if
  // the grid was the last focused element.
  focusExpression = () => {
    const editor = this.element.querySelector("atom-text-editor.data-explorer-expression");
    (editor || this.getDefaultFocusTarget())?.focus?.({ preventScroll: true });
  };
}

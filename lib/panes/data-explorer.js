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
    this.disposer.add(
      new Disposable(() => this.element.removeEventListener("focus", this.redirectFocus)),
    );
  }

  getFocusTarget() {
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
}

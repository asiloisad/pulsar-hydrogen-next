/** @babel */
/** @jsx React.createElement */

import React from "react";
import { Disposable } from "atom";
import { KERNEL_MONITOR_URI } from "../utils";
import KernelMonitor from "../components/kernel-monitor";
import BasePane from "./base-pane";

export default class KernelMonitorPane extends BasePane {
  constructor(store) {
    super({
      title: "Kernel Monitor",
      iconName: "pulse",
      uri: KERNEL_MONITOR_URI,
      defaultLocation: "bottom",
      allowedLocations: ["bottom", "left", "right"],
      classNames: ["kernel-monitor"],
      reactElement: <KernelMonitor store={store} />,
    });

    this.element.tabIndex = -1;
    this.element.addEventListener("focus", this.redirectFocus);
    this.disposer.add(
      new Disposable(() => this.element.removeEventListener("focus", this.redirectFocus)),
    );
  }

  getFocusTarget() {
    return this.element.querySelector(".kernel-monitor-wrapper") || this.element;
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

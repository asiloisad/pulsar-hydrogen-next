/** @babel */
/** @jsx React.createElement */

import React from "react";
import { KERNEL_MONITOR_URI } from "../utils";
import KernelMonitor from "../components/kernel-monitor";
import BasePane from "./base-pane";

export default class KernelMonitorPane extends BasePane {
  constructor(store) {
    super({
      title: "Kernel Monitor",
      uri: KERNEL_MONITOR_URI,
      defaultLocation: "bottom",
      allowedLocations: ["bottom", "left", "right"],
      reactElement: <KernelMonitor store={store} />,
    });
  }
}

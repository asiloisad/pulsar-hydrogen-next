/** @babel */
/** @jsx React.createElement */

import React from "react";
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
  }
}

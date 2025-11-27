/** @babel */
/** @jsx React.createElement */

import React from "react";
import { VARIABLE_EXPLORER_URI } from "../utils";
import VariableExplorer from "../components/variable-explorer";
import BasePane from "./base-pane";

export default class VariableExplorerPane extends BasePane {
  constructor(store) {
    super({
      title: "Variable Explorer",
      uri: VARIABLE_EXPLORER_URI,
      defaultLocation: "right",
      allowedLocations: ["left", "right"],
      reactElement: <VariableExplorer store={store} />,
    });
  }
}

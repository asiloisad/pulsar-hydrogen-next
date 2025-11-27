/** @babel */
/** @jsx React.createElement */

import React from "react";
import { INSPECTOR_URI } from "../utils";
import Inspector from "../components/inspector";
import BasePane from "./base-pane";

export default class InspectorPane extends BasePane {
  constructor(store) {
    super({
      title: "Inspector",
      uri: INSPECTOR_URI,
      defaultLocation: "bottom",
      allowedLocations: ["bottom", "left", "right"],
      classNames: ["inspector"],
      reactElement: <Inspector store={store} />,
    });
  }
}

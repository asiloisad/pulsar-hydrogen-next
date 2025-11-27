/** @babel */
/** @jsx React.createElement */

import React from "react";
import { WATCHES_URI } from "../utils";
import Watches from "../components/watch-sidebar";
import BasePane from "./base-pane";

export default class WatchesPane extends BasePane {
  constructor(store) {
    super({
      title: "Watches",
      uri: WATCHES_URI,
      defaultLocation: "right",
      allowedLocations: ["left", "right"],
      reactElement: <Watches store={store} />,
    });
  }
}

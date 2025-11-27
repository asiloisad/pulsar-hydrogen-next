/** @babel */
/** @jsx React.createElement */

import React from "react";
import { OUTPUT_AREA_URI } from "../utils";
import OutputArea from "../components/output-area";
import BasePane from "./base-pane";

export default class OutputPane extends BasePane {
  constructor(store) {
    super({
      title: "Output Area",
      uri: OUTPUT_AREA_URI,
      defaultLocation: "right",
      allowedLocations: ["left", "right", "bottom"],
      reactElement: <OutputArea store={store} />,
      onDispose: () => {
        if (store.kernel) {
          store.kernel.outputStore.clear();
        }
      },
    });
  }

  destroy() {
    super.destroy();
    // When a user manually clicks the close icon, the pane holding the OutputArea
    // is destroyed along with the OutputArea item. We mimic this here so that we can call
    // outputArea.destroy() and fully clean up the OutputArea without user clicking
    const pane = atom.workspace.paneForURI(OUTPUT_AREA_URI);
    if (pane) {
      pane.destroyItem(this);
    }
  }
}

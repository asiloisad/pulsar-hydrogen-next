'use babel'
/** @jsx React.createElement */

import { CompositeDisposable } from "atom"
import React from "react"
import { reactFactory, INSPECTOR_URI } from "../utils"
import Inspector from "../components/inspector"
export default class InspectorPane {
  element = document.createElement("div")
  disposer = new CompositeDisposable()

  constructor(store) {
    this.element.classList.add("hydrogen", "inspector")
    reactFactory(<Inspector store={store} />, this.element, null, this.disposer)
  }

  getTitle = () => "Inspector"
  getURI = () => INSPECTOR_URI
  getDefaultLocation = () => "bottom"
  getAllowedLocations = () => ["bottom", "left", "right"]

  destroy() {
    this.disposer.dispose()
    this.element.remove()
  }
}

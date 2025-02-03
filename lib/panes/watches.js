'use babel'
/** @jsx React.createElement */

import { CompositeDisposable } from "atom"
import React from "react"
import { reactFactory, WATCHES_URI } from "../utils"
import Watches from "../components/watch-sidebar"
export default class WatchesPane {
  element = document.createElement("div")
  disposer = new CompositeDisposable()

  constructor(store) {
    this.element.classList.add("hydrogen-next")
    reactFactory(<Watches store={store} />, this.element, null, this.disposer)
  }

  getTitle = () => "Watches"
  getURI = () => WATCHES_URI
  getDefaultLocation = () => "right"
  getAllowedLocations = () => ["left", "right"]

  destroy() {
    this.disposer.dispose()
    this.element.remove()
  }
}

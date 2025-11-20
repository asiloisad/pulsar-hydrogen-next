/** @babel */
/** @jsx React.createElement */

import { CompositeDisposable } from "atom"
import React from "react"
import { reactFactory, VARIABLE_EXPLORER_URI } from "../utils"
import VariableExplorer from "../components/variable-explorer"

export default class VariableExplorerPane {
    element = document.createElement("div")
    disposer = new CompositeDisposable()

    constructor(store) {
        this.element.classList.add("hydrogen-next")
        reactFactory(
            <VariableExplorer store={store} />,
            this.element,
            null,
            this.disposer
        )
    }

    getTitle = () => "Variable Explorer"
    getURI = () => VARIABLE_EXPLORER_URI
    getDefaultLocation = () => "right"
    getAllowedLocations = () => ["left", "right"]

    destroy() {
        this.disposer.dispose()
        this.element.remove()
    }
}

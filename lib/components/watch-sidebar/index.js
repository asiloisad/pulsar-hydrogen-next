/** @babel */
/** @jsx React.createElement */

import React from "react"
import { observer } from "mobx-react"
import Watch from "./watch"
import { WATCHES_URI, EmptyMessage } from "../../utils"
const Watches = observer(({ store: { kernel } }) => {
  if (!kernel) {
    if (atom.config.get("hydrogen-next.outputAreaDock")) {
      return <EmptyMessage />
    }

    atom.workspace.hide(WATCHES_URI)
    return null
  }

  return (
    <div className="sidebar watch-sidebar">
      {kernel.watchesStore.watches.map(watch => (
        <Watch key={watch.editor.id} store={watch} />
      ))}
      <div className="btn-group">
        <button
          className="btn btn-primary icon icon-plus"
          onClick={kernel.watchesStore.addWatch}
        >
          Add watch
        </button>
        <button
          className="btn btn-error icon icon-trashcan"
          onClick={kernel.watchesStore.removeWatch}
        >
          Remove watch
        </button>
      </div>
    </div>
  )
})
export default Watches

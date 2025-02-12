'use babel'
/** @jsx React.createElement */

import React from "react"
import { observer } from "mobx-react"
import { RichMedia, Media } from "@nteract/outputs"
import { INSPECTOR_URI } from "../utils"
import Markdown from "./result-view/markdown"

const Inspector = observer(({ store: { insBundle } }) => {
  if (!insBundle) {
    return <div />
  }

  if (typeof insBundle === 'string') {
    return <div>
        <background-tips>
          <ul class='centered background-message'>
            <li>{insBundle}</li>
          </ul>
        </background-tips>
      </div>
  }

  if (!insBundle["text/html"] && !insBundle["text/markdown"] && !insBundle["text/plain"]) {
    return <div>
        <background-tips>
          <ul class='centered background-message'>
            <li>No insBundle</li>
          </ul>
        </background-tips>
      </div>
  }

  return (
    <div
      className="native-key-bindings"
      tabIndex={-1}
      style={{
        fontSize: atom.config.get(`hydrogen-next.outputAreaFontSize`) || "inherit"
      }}
    >
      <RichMedia data={insBundle}>
        <Media.HTML />
        <Markdown />
        <Media.Plain />
      </RichMedia>
    </div>
  )
})
export default Inspector

'use babel'

import { action } from "mobx"
import OutputStore from "./output"
import { log } from "../utils"

export default class WatchStore {
  outputStore = new OutputStore()

  constructor(kernel) {
    this.kernel = kernel
    this.editor = atom.workspace.buildTextEditor({
      softWrapped: true,
      lineNumberGutterVisible: false
    })
    const grammar = this.kernel.grammar
    if (grammar) {
      atom.grammars.assignLanguageMode(
        this.editor.getBuffer(),
        grammar.scopeName
      )
    }
    this.editor.moveToTop()
    this.editor.element.classList.add("watch-input")
  }

  @action
  run = () => {
    const code = this.getCode()
    log("watchview running:", code)

    if (code && code.length > 0) {
      this.kernel.executeWatch(code, result => {
        this.outputStore.appendOutput(result)
      })
    }
  }
  @action
  setCode = code => {
    this.editor.setText(code)
  }
  getCode = () => {
    return this.editor.getText()
  }
  focus = () => {
    this.editor.element.focus()
  }
}

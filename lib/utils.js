/** @babel */
/** @jsx React.createElement */

import { Disposable, Point } from "atom"
import React from "react"
import ReactDOM from "react-dom"
import findKey from "lodash/findKey"
import os from "os"
import path from "path"
import Config from "./config"
import store from "./store"

export const INSPECTOR_URI = "atom://hydrogen/inspector"

export const WATCHES_URI = "atom://hydrogen/watch-sidebar"

export const OUTPUT_AREA_URI = "atom://hydrogen/output-area"

export const KERNEL_MONITOR_URI = "atom://hydrogen/kernel-monitor"

export const VARIABLE_EXPLORER_URI = "atom://hydrogen/variable-explorer"

export const NO_EXECTIME_STRING = "Not available"

export function reactFactory(
  reactElement,
  domElement,
  additionalTeardown,
  disposer = store.subscriptions
) {
  ReactDOM.render(reactElement, domElement)
  const disposable = new Disposable(() => {
    ReactDOM.unmountComponentAtNode(domElement)
    if (typeof additionalTeardown === "function") {
      additionalTeardown()
    }
  })
  disposer.add(disposable)
}

export function focus(item) {
  if (item && typeof item === "object") {
    const editorPane = atom.workspace.paneForItem(item)
    if (editorPane) {
      editorPane.activate()
    }
  }
}

export async function openOrShowDock(URI) {
  // atom.workspace.open(URI) will activate/focus the dock by default
  // dock.toggle() or dock.show() will leave focus wherever it was
  // this function is basically workspace.open, except it
  // will not focus the newly opened pane
  let dock = atom.workspace.paneContainerForURI(URI)

  if (dock && typeof dock.show === "function") {
    // If the target item already exist, activate it and show dock
    const pane = atom.workspace.paneForURI(URI)
    if (pane) {
      pane.activateItemForURI(URI)
    }
    return dock.show()
  }

  await atom.workspace.open(URI, {
    searchAllPanes: true,
    activatePane: false
  })
  dock = atom.workspace.paneContainerForURI(URI)
  return dock && typeof dock.show === "function" ? dock.show() : null
}

export function grammarToLanguage(grammar) {
  if (!grammar) {
    return null
  }
  const grammarLanguage = grammar.name.toLowerCase()
  const mappings = Config.getJson("languageMappings")

  const kernelLanguage = findKey(
    mappings,
    l => l.toLowerCase() === grammarLanguage
  )

  return kernelLanguage ? kernelLanguage.toLowerCase() : grammarLanguage
}

/**
 * Copied from
 * https://github.com/nteract/nteract/blob/master/src/notebook/epics/execute.js#L37
 * Create an object that adheres to the jupyter notebook specification.
 * http://jupyter-client.readthedocs.io/en/latest/messaging.html
 *
 * @param {Object} msg - Message that has content which can be converted to nbformat
 * @returns {Object} FormattedMsg - Message with the associated output type
 */
export function msgSpecToNotebookFormat(message) {
  return Object.assign({}, message.content, {
    output_type: message.header.msg_type
  })
}


const markupGrammars = new Set([
  "source.gfm",
  "source.asciidoc",
  "text.restructuredtext",
  "text.tex.latex.knitr",
  "text.md",
  "source.weave.noweb",
  "source.weave.md",
  "source.weave.latex",
  "source.weave.restructuredtext",
  "source.pweave.noweb",
  "source.pweave.md",
  "source.pweave.latex",
  "source.pweave.restructuredtext",
  "source.dyndoc.md.stata",
  "source.dyndoc.latex.stata"
])

export function isMultilanguageGrammar(grammar) {
  return markupGrammars.has(grammar.scopeName)
}

export const isUnsavedFilePath = filePath => {
  return filePath.match(/Unsaved\sEditor\s\d+/) ? true : false
}

export function kernelSpecProvidesGrammar(kernelSpec, grammar) {
  if (!grammar || !grammar.name || !kernelSpec || !kernelSpec.language) {
    return false
  }

  const grammarLanguage = grammar.name.toLowerCase()
  const kernelLanguage = kernelSpec.language.toLowerCase()

  if (kernelLanguage === grammarLanguage) {
    return true
  }

  const mappedLanguage = Config.getJson("languageMappings")[kernelLanguage]

  if (!mappedLanguage) {
    return false
  }

  return mappedLanguage.toLowerCase() === grammarLanguage
}

export function getEmbeddedScope(editor, position) {
  const scopes = editor
    .scopeDescriptorForBufferPosition(position)
    .getScopesArray()
  return scopes.find((s, i) => { return i > 0 ? s.indexOf('source.') === 0 : false })
}

export function getEditorDirectory(editor) {
  if (!editor) {
    return os.homedir()
  }
  const editorPath = editor.getPath()
  return editorPath ? path.dirname(editorPath) : os.homedir()
}

export function log(...message) {
  if (atom.config.get("hydrogen-next.debug")) {
    console.log("hydrogen-next:", ...message)
  }
}

export function hotReloadPackage() {
  const packName = "hydrogen-next"
  const packPath = atom.packages.resolvePackagePath(packName)
  if (!packPath) {
    return
  }
  const packPathPrefix = packPath + path.sep
  const zeromqPathPrefix =
    path.join(packPath, "node_modules", "zeromq") + path.sep
  log(`deactivating ${packName}`)
  atom.packages.deactivatePackage(packName)
  atom.packages.unloadPackage(packName)

  // Delete require cache to re-require on activation.
  // But except zeromq native module which is not re-requireable.
  const packageLibsExceptZeromq = filePath =>
    filePath.startsWith(packPathPrefix) &&
    !filePath.startsWith(zeromqPathPrefix)

  Object.keys(require.cache)
    .filter(packageLibsExceptZeromq)
    .forEach(filePath => delete require.cache[filePath])
  atom.packages.loadPackage(packName)
  atom.packages.activatePackage(packName)
  log(`activated ${packName}`)
}

export function rowRangeForCodeFoldAtBufferRow(editor, row) {
  // $FlowFixMe
  const range = editor.tokenizedBuffer.getFoldableRangeContainingPoint(
    new Point(row, Infinity),
    editor.getTabLength()
  )
  return range ? [range.start.row, range.end.row] : null
}

export const EmptyMessage = () => {
  return (
    <ul className="background-message centered">
      <li>No output to display</li>
    </ul>
  )
}

/**
 * Given a message whose type if `execute_reply`, calculates exection time and
 * returns its string representation.
 *
 * @param {Message} message - A Message object whose type is `execute_reply`
 * @returns {String} - A string representation of the execution time. Returns
 *   `NO_EXECTIME_STRING` if execution time is unavailable.
 */
export function executionTime(message) {
  if (!message.parent_header.date || !message.header.date) {
    return NO_EXECTIME_STRING
  }

  const start = Date.parse(message.parent_header.date)
  const end = Date.parse(message.header.date)
  const time = end - start // milliseconds

  let sec = time / 1000 // seconds

  if (sec < 60) {
    return `${sec.toFixed(3)} sec`
  }

  let min = (sec - (sec % 60)) / 60
  sec = Math.round(sec % 60)

  if (min < 60) {
    return `${min} min ${sec} sec`
  }

  const hour = (min - (min % 60)) / 60
  min %= 60
  return `${hour} h ${min} m ${sec} s`
}

/**
 * Convert JavaScript string index to character index, handling Unicode properly.
 * This function accounts for:
 * - Surrogate pairs (emoji and characters beyond U+FFFF)
 * - Combining characters
 * - Grapheme clusters (multi-codepoint characters)
 *
 * @param {Number} js_idx - JavaScript string index (UTF-16 code units)
 * @param {String} text - The text string
 * @returns {Number} - Character index (grapheme clusters)
 */
export function js_idx_to_char_idx(js_idx, text) {
  if (text === null || js_idx < 0) {
    return -1
  }
  
  // Use Intl.Segmenter if available for proper grapheme cluster handling
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
      const segments = [...segmenter.segment(text)]
      
      // Find which grapheme the js_idx falls into
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        const nextSegment = segments[i + 1]
        const endIndex = nextSegment?.index ?? text.length
        
        if (js_idx >= segment.index && js_idx < endIndex) {
          return i
        }
      }
      
      return segments.length
    } catch (e) {
      // Fall through to legacy implementation if Intl.Segmenter fails
      log('Intl.Segmenter failed, using fallback:', e)
    }
  }
  
  // Fallback implementation: only handles surrogate pairs
  let char_idx = js_idx

  for (let i = 0; i < text.length && i < js_idx; i++) {
    const char_code = text.charCodeAt(i)

    // check for the first half of a surrogate pair
    if (char_code >= 0xd800 && char_code < 0xdc00) {
      char_idx -= 1
    }
  }

  return char_idx
}

/**
 * Convert character index to JavaScript string index, handling Unicode properly.
 * This function accounts for:
 * - Surrogate pairs (emoji and characters beyond U+FFFF)
 * - Combining characters
 * - Grapheme clusters (multi-codepoint characters)
 *
 * @param {Number} char_idx - Character index (grapheme clusters)
 * @param {String} text - The text string
 * @returns {Number} - JavaScript string index (UTF-16 code units)
 */
export function char_idx_to_js_idx(char_idx, text) {
  if (text === null || char_idx < 0) {
    return -1
  }
  
  // Use Intl.Segmenter if available for proper grapheme cluster handling
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
      const segments = [...segmenter.segment(text)]
      
      // If char_idx exceeds the number of graphemes, return text length
      if (char_idx >= segments.length) {
        return text.length
      }
      
      // Find the JS string index at the char_idx-th grapheme
      return segments[char_idx]?.index ?? text.length
    } catch (e) {
      // Fall through to legacy implementation if Intl.Segmenter fails
      log('Intl.Segmenter failed, using fallback:', e)
    }
  }
  
  // Fallback implementation: only handles surrogate pairs
  let js_idx = char_idx

  for (let i = 0; i < text.length && i < js_idx; i++) {
    const char_code = text.charCodeAt(i)

    // check for the first half of a surrogate pair
    if (char_code >= 0xd800 && char_code < 0xdc00) {
      js_idx += 1
    }
  }

  return js_idx
}

/**
 * Sets the `previouslyFocusedElement` property of the given object to
 * activeElement if it is an HTMLElement
 */
export function setPreviouslyFocusedElement(obj) {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) {
    obj.previouslyFocusedElement = activeElement
  }
}

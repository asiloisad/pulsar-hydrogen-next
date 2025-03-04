/** @babel */

import head from "lodash/head"
import Anser from "anser"
import { log, char_idx_to_js_idx } from "../../utils"
const iconHTML = `<img src='${__dirname}/../../../assets/logo.svg' style='width: 100%;'>`
const regexes = {
  // pretty dodgy, adapted from http://stackoverflow.com/a/8396658
  r: /([^\W\d]|\.)[\w$.]*$/,
  // adapted from http://stackoverflow.com/q/5474008
  python: /([^\W\d]|[\u00A0-\uFFFF])[\w.\u00A0-\uFFFF]*$/,
  // adapted from http://php.net/manual/en/language.variables.basics.php
  php: /[$A-Z_a-z\x7f-\xff][\w\x7f-\xff]*$/
}

function parseCompletions(results, prefix) {
  const { matches, metadata } = results
  // @NOTE: This can make invalid `replacedPrefix` and `replacedText` when a line includes unicode characters
  // @TODO (@aviatesk): Use `Regex` to detect them regardless of the `results.cursor_*` feedbacks from kernels
  const cursor_start = char_idx_to_js_idx(results.cursor_start, prefix)
  const cursor_end = char_idx_to_js_idx(results.cursor_end, prefix)

  if (metadata && metadata._jupyter_types_experimental) {
    const comps = metadata._jupyter_types_experimental

    if (comps.length > 0 && comps[0].text) {
      return comps.map(match => {
        const text = match.text
        const start = match.start && match.end ? match.start : cursor_start
        const end = match.start && match.end ? match.end : cursor_end
        const replacementPrefix = prefix.slice(start, end)
        const replacedText = prefix.slice(0, start) + text
        const type = match.type
        return {
          text,
          replacementPrefix,
          replacedText,
          iconHTML: !type || type === "<unknown>" ? iconHTML : undefined,
          type
        }
      })
    }
  }

  const replacementPrefix = prefix.slice(cursor_start, cursor_end)
  return matches.map(match => {
    const text = match
    const replacedText = prefix.slice(0, cursor_start) + text
    return {
      text,
      replacementPrefix,
      replacedText,
      iconHTML
    }
  })
}

export function provideAutocompleteResults(store) {
  const autocompleteProvider = {
    enabled: atom.config.get("hydrogen-next.autocomplete"),
    selector: ".source",
    disableForSelector: ".comment",
    // The default provider has an inclusion priority of 0.
    inclusionPriority: 1,
    // The default provider has a suggestion priority of 1.
    suggestionPriority: atom.config.get(
      "hydrogen-next.autocompleteSuggestionPriority"
    ),
    // It won't suppress providers with lower priority.
    excludeLowerPriority: false,
    suggestionDetailsEnabled: atom.config.get(
      "hydrogen-next.showInspectorResultsInAutocomplete"
    ),

    // Required: Return a promise, an array of suggestions, or null.
    getSuggestions({ editor, bufferPosition, prefix }) {
      if (!this.enabled) {
        return null
      }
      const kernel = store.kernel
      if (!kernel || kernel.executionState !== "idle") {
        return null
      }
      const line = editor.getTextInBufferRange([
        [bufferPosition.row, 0],
        bufferPosition
      ])
      const regex = regexes[kernel.language]

      if (regex) {
        prefix = head(line.match(regex)) || ""
      } else {
        prefix = line
      }

      // return if cursor is at whitespace
      if (prefix.trimRight().length < prefix.length) {
        return null
      }
      let minimumWordLength = atom.config.get(
        "autocomplete-plus.minimumWordLength"
      )

      if (typeof minimumWordLength !== "number") {
        minimumWordLength = 3
      }

      if (prefix.trim().length < minimumWordLength) {
        return null
      }
      log("autocompleteProvider: request:", line, bufferPosition, prefix)
      const promise = new Promise(resolve => {
        kernel.complete(prefix, results => {
          return resolve(parseCompletions(results, prefix))
        })
      })
      return Promise.race([promise, this.timeout()])
    },

    getSuggestionDetailsOnSelect({
      text,
      replacementPrefix,
      replacedText,
      iconHTML,
      type
    }) {
      if (!this.suggestionDetailsEnabled) {
        return null
      }
      const kernel = store.kernel
      if (!kernel || kernel.executionState !== "idle") {
        return null
      }
      const promise = new Promise(resolve => {
        kernel.inspect(replacedText, replacedText.length, ({ found, data }) => {
          if (!found || !data["text/plain"]) {
            resolve(null)
            return
          }

          const description = Anser.ansiToText(data["text/plain"])
          resolve({
            text,
            replacementPrefix,
            replacedText,
            iconHTML,
            type,
            description
          })
        })
      })
      return Promise.race([promise, this.timeout()])
    },

    timeout() {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(null)
        }, 1000)
      })
    }
  }
  store.subscriptions.add(
    atom.config.observe("hydrogen-next.autocomplete", v => {
      autocompleteProvider.enabled = v
    }),
    atom.config.observe("hydrogen-next.autocompleteSuggestionPriority", v => {
      autocompleteProvider.suggestionPriority = v
    }),
    atom.config.observe("hydrogen-next.showInspectorResultsInAutocomplete", v => {
      autocompleteProvider.suggestionDetailsEnabled = v
    })
  )
  return autocompleteProvider
}

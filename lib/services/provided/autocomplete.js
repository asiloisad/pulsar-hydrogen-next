/** @babel */

import head from "lodash/head";
import Anser from "anser";
import { log, char_idx_to_js_idx } from "../../utils";
const iconHTML = `<img src='${__dirname}/../../../assets/logo.svg' style='width: 100%;'>`;
const regexes = {
  // pretty dodgy, adapted from http://stackoverflow.com/a/8396658
  r: /([^\W\d]|\.)[\w$.]*$/,
  // adapted from http://stackoverflow.com/q/5474008
  python: /([^\W\d]|[\u00A0-\uFFFF])[\w.\u00A0-\uFFFF]*$/,
  // adapted from http://php.net/manual/en/language.variables.basics.php
  php: /[$A-Z_a-z\x7f-\xff][\w\x7f-\xff]*$/,
};

/**
 * Find where a completion text should be inserted using pattern matching.
 * This is a fallback when cursor positions are unreliable or unavailable.
 *
 * @param {String} prefix - The text before the cursor
 * @param {String} completionText - The completion text to insert
 * @returns {Object|null} - Object with {start, end} positions, or null if not found
 */
function findCompletionPosition(prefix, completionText) {
  if (!prefix || !completionText) {
    return null;
  }

  // Try to find a common suffix between the prefix and completion text
  // This handles cases where the kernel returns the full identifier
  let commonSuffixLen = 0;
  const minLen = Math.min(prefix.length, completionText.length);

  for (let i = 1; i <= minLen; i++) {
    if (
      prefix[prefix.length - i] === completionText[completionText.length - i]
    ) {
      commonSuffixLen = i;
    } else {
      break;
    }
  }

  if (commonSuffixLen > 0) {
    return {
      start: prefix.length - commonSuffixLen,
      end: prefix.length,
    };
  }

  // If no common suffix, try to find word boundary using identifier pattern
  // Match characters that are typically part of identifiers: letters, digits, underscore, dot
  const wordBoundaryMatch = prefix.match(/[\w.]+$/);
  if (wordBoundaryMatch && wordBoundaryMatch.index !== undefined) {
    return {
      start: wordBoundaryMatch.index,
      end: prefix.length,
    };
  }

  // Default: insert at end (no replacement)
  return {
    start: prefix.length,
    end: prefix.length,
  };
}

function parseCompletions(results, prefix) {
  const { matches, metadata } = results;

  // Convert cursor positions from character indices to JS string indices
  // This now properly handles Unicode characters including emoji and combining chars
  let cursor_start = results.cursor_start;
  let cursor_end = results.cursor_end;

  if (cursor_start !== undefined && cursor_end !== undefined) {
    cursor_start = char_idx_to_js_idx(cursor_start, prefix);
    cursor_end = char_idx_to_js_idx(cursor_end, prefix);

    // Validate the converted indices
    if (
      cursor_start < 0 ||
      cursor_end < 0 ||
      cursor_start > prefix.length ||
      cursor_end > prefix.length ||
      cursor_start > cursor_end
    ) {
      log("autocompleteProvider: invalid cursor positions after conversion:", {
        original: { start: results.cursor_start, end: results.cursor_end },
        converted: { start: cursor_start, end: cursor_end },
        prefix_length: prefix.length,
      });
      // Reset to undefined to trigger fallback
      cursor_start = undefined;
      cursor_end = undefined;
    }
  }

  if (metadata && metadata._jupyter_types_experimental) {
    const comps = metadata._jupyter_types_experimental;

    if (comps.length > 0 && comps[0].text) {
      return comps.map((match) => {
        const text = match.text;
        let start = cursor_start;
        let end = cursor_end;

        // If we have explicit start/end from the match, use and convert those
        if (match.start !== undefined && match.end !== undefined) {
          start = char_idx_to_js_idx(match.start, prefix);
          end = char_idx_to_js_idx(match.end, prefix);

          // Validate match-specific positions
          if (
            start < 0 ||
            end < 0 ||
            start > prefix.length ||
            end > prefix.length ||
            start > end
          ) {
            log(
              "autocompleteProvider: invalid match positions, using fallback"
            );
            start = undefined;
            end = undefined;
          }
        }

        // If cursor positions are unavailable or invalid, use regex fallback
        if (start === undefined || end === undefined) {
          const fallbackPos = findCompletionPosition(prefix, text);
          if (fallbackPos) {
            start = fallbackPos.start;
            end = fallbackPos.end;
            log(
              "autocompleteProvider: using regex fallback positions:",
              fallbackPos
            );
          } else {
            // Ultimate fallback: insert at end
            start = prefix.length;
            end = prefix.length;
          }
        }

        const replacementPrefix = prefix.slice(start, end);
        const replacedText = prefix.slice(0, start) + text;
        const type = match.type;

        return {
          text,
          replacementPrefix,
          replacedText,
          iconHTML: !type || type === "<unknown>" ? iconHTML : undefined,
          type,
        };
      });
    }
  }

  // Fallback for simple matches without metadata
  // Use regex fallback if cursor positions are unavailable
  if (cursor_start === undefined || cursor_end === undefined) {
    return matches.map((match) => {
      const text = match;
      const fallbackPos = findCompletionPosition(prefix, text);
      const start = fallbackPos?.start ?? prefix.length;
      const end = fallbackPos?.end ?? prefix.length;

      const replacementPrefix = prefix.slice(start, end);
      const replacedText = prefix.slice(0, start) + text;

      return {
        text,
        replacementPrefix,
        replacedText,
        iconHTML,
      };
    });
  }

  const replacementPrefix = prefix.slice(cursor_start, cursor_end);
  return matches.map((match) => {
    const text = match;
    const replacedText = prefix.slice(0, cursor_start) + text;
    return {
      text,
      replacementPrefix,
      replacedText,
      iconHTML,
    };
  });
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
        return null;
      }
      const kernel = store.kernel;
      if (!kernel || kernel.executionState !== "idle") {
        return null;
      }
      const line = editor.getTextInBufferRange([
        [bufferPosition.row, 0],
        bufferPosition,
      ]);
      const regex = regexes[kernel.language];

      if (regex) {
        prefix = head(line.match(regex)) || "";
      } else {
        prefix = line;
      }

      // return if cursor is at whitespace
      if (prefix.trimRight().length < prefix.length) {
        return null;
      }
      let minimumWordLength = atom.config.get(
        "autocomplete-plus.minimumWordLength"
      );

      if (typeof minimumWordLength !== "number") {
        minimumWordLength = 3;
      }

      if (prefix.trim().length < minimumWordLength) {
        return null;
      }
      log("autocompleteProvider: request:", line, bufferPosition, prefix);
      const promise = new Promise((resolve) => {
        kernel.complete(prefix, (results) => {
          return resolve(parseCompletions(results, prefix));
        });
      });
      return Promise.race([promise, this.timeout()]);
    },

    getSuggestionDetailsOnSelect({
      text,
      replacementPrefix,
      replacedText,
      iconHTML,
      type,
    }) {
      if (!this.suggestionDetailsEnabled) {
        return null;
      }
      const kernel = store.kernel;
      if (!kernel || kernel.executionState !== "idle") {
        return null;
      }
      const promise = new Promise((resolve) => {
        kernel.inspect(replacedText, replacedText.length, ({ found, data }) => {
          if (!found || !data["text/plain"]) {
            resolve(null);
            return;
          }

          const description = Anser.ansiToText(data["text/plain"]);
          resolve({
            text,
            replacementPrefix,
            replacedText,
            iconHTML,
            type,
            description,
          });
        });
      });
      return Promise.race([promise, this.timeout()]);
    },

    timeout() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 1000);
      });
    },
  };
  store.subscriptions.add(
    atom.config.observe("hydrogen-next.autocomplete", (v) => {
      autocompleteProvider.enabled = v;
    }),
    atom.config.observe("hydrogen-next.autocompleteSuggestionPriority", (v) => {
      autocompleteProvider.suggestionPriority = v;
    }),
    atom.config.observe(
      "hydrogen-next.showInspectorResultsInAutocomplete",
      (v) => {
        autocompleteProvider.suggestionDetailsEnabled = v;
      }
    )
  );
  return autocompleteProvider;
}

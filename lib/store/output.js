/** @babel */

import { action, computed, observable } from "mobx"
import { isTextOutputOnly } from "../components/result-view/display"

/**
 * Escape carriage return characters by simulating terminal behavior.
 * When \r is encountered, it overwrites the current line from the beginning.
 * Replacement for escape-carriage package.
 *
 * @param {string} text - Text with possible carriage returns
 * @returns {string} - Processed text with carriage returns applied
 */
function escapeCarriageReturn(text) {
  if (!text || typeof text !== 'string') {
    return text
  }

  const lines = text.split('\n')
  const result = []

  for (let line of lines) {
    if (line.includes('\r')) {
      // Split by \r and process each segment
      const segments = line.split('\r')
      let currentLine = ''

      for (const segment of segments) {
        if (segment === '') {
          // Empty segment means \r at start or consecutive \r
          currentLine = ''
        } else {
          // Overwrite from the beginning with the new segment
          currentLine = segment + currentLine.slice(segment.length)
        }
      }
      result.push(currentLine)
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Safe version of escapeCarriageReturn that handles edge cases.
 * Used when appending text incrementally.
 *
 * @param {string} text - Text with possible carriage returns
 * @returns {string} - Processed text
 */
function escapeCarriageReturnSafe(text) {
  if (!text || typeof text !== 'string') {
    return text
  }
  return escapeCarriageReturn(text)
}

const outputTypes = ["execute_result", "display_data", "stream", "error"]

/**
 * https://github.com/nteract/hydrogen/issues/466#issuecomment-274822937 An
 * output can be a stream of data that does not arrive at a single time. This
 * function handles the different types of outputs and accumulates the data into
 * a reduced output.
 *
 * @param {Object[]} outputs - Kernel output messages
 * @param {Object} output - Outputted to be reduced into list of outputs
 * @returns {Object[]} Updated-outputs - Outputs + Output
 */
export function reduceOutputs(outputs, output) {
  const last = outputs.length - 1

  if (
    outputs.length > 0 &&
    output.output_type === "stream" &&
    outputs[last].output_type === "stream"
  ) {
    function appendText(previous, next) {
      previous.text = escapeCarriageReturnSafe(previous.text + next.text)
    }

    if (outputs[last].name === output.name) {
      appendText(outputs[last], output)
      return outputs
    }

    if (outputs.length > 1 && outputs[last - 1].name === output.name) {
      appendText(outputs[last - 1], output)
      return outputs
    }
  }

  outputs.push(output)
  return outputs
}

export function isSingleLine(text, availableSpace) {
  // If it turns out escapeCarriageReturn is a bottleneck, we should remove it.
  return (
    (!text || !text.includes("\n") || text.indexOf("\n") === text.length - 1) &&
    availableSpace > escapeCarriageReturn(text).length
  )
}

export default class OutputStore {
  @observable
  outputs = []
  @observable
  status = "running"
  @observable
  executionCount = null
  @observable
  index = -1
  @observable
  position = {
    lineHeight: 0,
    lineLength: 0,
    editorWidth: 0,
    charWidth: 0
  }

  @computed
  get isPlain() {
    if (this.outputs.length !== 1) {
      return false
    }
    const availableSpace = Math.floor(
      (this.position.editorWidth - this.position.lineLength) /
        this.position.charWidth
    )
    if (availableSpace <= 0) {
      return false
    }
    const output = this.outputs[0]

    switch (output.output_type) {
      case "execute_result":
      case "display_data": {
        const bundle = output.data
        return isTextOutputOnly(bundle)
          ? isSingleLine(bundle["text/plain"], availableSpace)
          : false
      }

      case "stream": {
        return isSingleLine(output.text, availableSpace)
      }

      default: {
        return false
      }
    }
  }

  @action
  appendOutput(message) {
    if (message.stream === "execution_count") {
      this.executionCount = message.data
    } else if (message.stream === "status") {
      this.status = message.data
    } else if (outputTypes.includes(message.output_type)) {
      reduceOutputs(this.outputs, message)
      this.setIndex(this.outputs.length - 1)
    }
  }

  @action
  updatePosition(position) {
    Object.assign(this.position, position)
  }

  @action
  setIndex = index => {
    if (index < 0) {
      this.index = 0
    } else if (index < this.outputs.length) {
      this.index = index
    } else {
      this.index = this.outputs.length - 1
    }
  }
  @action
  incrementIndex = () => {
    this.index =
      this.index < this.outputs.length - 1
        ? this.index + 1
        : this.outputs.length - 1
  }
  @action
  decrementIndex = () => {
    this.index = this.index > 0 ? this.index - 1 : 0
  }
  @action
  clear = () => {
    this.outputs = []
    this.index = -1
  }
}

/** @babel */

import { action, computed, observable, makeObservable } from "mobx";
import { isTextOutputOnly } from "../components/result-view/display";
import {
  reduceOutputs,
  isSingleLine,
  OUTPUT_TYPES,
} from "../shared/output-utils";

export default class OutputStore {
  outputs = [];
  status = "running";
  executionCount = null;
  index = -1;
  position = {
    lineHeight: 0,
    lineLength: 0,
    editorWidth: 0,
    charWidth: 0,
  };
  truncated = false;
  totalOutputCount = 0;
  _outputIdCounter = 0;

  constructor() {
    makeObservable(this, {
      outputs: observable,
      status: observable,
      executionCount: observable,
      index: observable,
      position: observable,
      truncated: observable,
      totalOutputCount: observable,
      isPlain: computed,
      estimatedMemoryUsage: computed,
      appendOutput: action,
      updatePosition: action,
      setIndex: action,
      incrementIndex: action,
      decrementIndex: action,
      clear: action,
    });
  }

  get isPlain() {
    if (this.outputs.length !== 1) {
      return false;
    }
    const availableSpace = Math.floor(
      (this.position.editorWidth - this.position.lineLength) /
        this.position.charWidth
    );
    if (availableSpace <= 0) {
      return false;
    }
    const output = this.outputs[0];

    switch (output.output_type) {
      case "execute_result":
      case "display_data": {
        const bundle = output.data;
        return isTextOutputOnly(bundle)
          ? isSingleLine(bundle["text/plain"], availableSpace)
          : false;
      }

      case "stream": {
        return isSingleLine(output.text, availableSpace);
      }

      default: {
        return false;
      }
    }
  }

  /**
   * Get total memory usage estimate for outputs (in bytes)
   */
  get estimatedMemoryUsage() {
    let total = 0;
    for (const output of this.outputs) {
      if (output.output_type === "stream" && output.text) {
        total += output.text.length * 2; // UTF-16 chars
      } else if (output.data) {
        for (const value of Object.values(output.data)) {
          if (typeof value === "string") {
            total += value.length * 2;
          }
        }
      }
    }
    return total;
  }

  appendOutput(message) {
    if (message.stream === "execution_count") {
      this.executionCount = message.data;
    } else if (message.stream === "status") {
      this.status = message.data;
    } else if (OUTPUT_TYPES.includes(message.output_type)) {
      this.totalOutputCount++;

      // Assign unique ID for React key stability
      message._id = ++this._outputIdCounter;

      reduceOutputs(this.outputs, message);
      this.setIndex(this.outputs.length - 1);
    }
  }

  updatePosition(position) {
    Object.assign(this.position, position);
  }

  setIndex = (index) => {
    if (index < 0) {
      this.index = 0;
    } else if (index < this.outputs.length) {
      this.index = index;
    } else {
      this.index = this.outputs.length - 1;
    }
  };

  incrementIndex = () => {
    this.index =
      this.index < this.outputs.length - 1
        ? this.index + 1
        : this.outputs.length - 1;
  };

  decrementIndex = () => {
    this.index = this.index > 0 ? this.index - 1 : 0;
  };

  clear = () => {
    this.outputs = [];
    this.index = -1;
    this.truncated = false;
    this.totalOutputCount = 0;
  };
}

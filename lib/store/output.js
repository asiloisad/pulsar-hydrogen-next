/** @babel */

import { action, computed, observable, makeObservable } from "mobx";
import { isTextOutputOnly } from "../components/result-view/display";
import { reduceOutputs, isSingleLine, OUTPUT_TYPES } from "../output-utils";

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
  lastCode = null;
  _clearOnNextOutput = false;
  // When set, the next output begins a fresh history entry instead of merging
  // into the previous one (used so watch re-runs accumulate a scrubbable history).
  _startNewGroup = false;
  // Index in `outputs` where the current run's outputs begin. clear_output
  // clears from here, so accumulated histories (watches) keep earlier runs.
  // Stays 0 for inline/cell results that never start a new run.
  _currentRunStart = 0;
  // Upper bound on retained history entries; oldest are dropped past this.
  // Defaults to Infinity so cell results keep every output.
  maxOutputs = Infinity;

  constructor(maxOutputs = Infinity) {
    this.maxOutputs = maxOutputs;
    makeObservable(this, {
      outputs: observable,
      status: observable,
      executionCount: observable,
      index: observable,
      position: observable,
      truncated: observable,
      totalOutputCount: observable,
      lastCode: observable,
      isPlain: computed,
      estimatedMemoryUsage: computed,
      appendOutput: action,
      updatePosition: action,
      setIndex: action,
      incrementIndex: action,
      decrementIndex: action,
      clear: action,
      startNewRun: action,
      setLastCode: action,
    });
  }

  setLastCode(code) {
    this.lastCode = code;
  }

  get isPlain() {
    if (this.outputs.length !== 1) {
      return false;
    }
    const availableSpace = Math.floor(
      (this.position.editorWidth - this.position.lineLength) / this.position.charWidth,
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
    if (message.output_type === "clear_output") {
      // IPython.display.clear_output: with wait=true the clear is deferred
      // until the next output arrives, so live-updating loops don't flicker.
      if (message.wait) {
        this._clearOnNextOutput = true;
      } else {
        this._clearCurrentRun();
      }
    } else if (message.stream === "execution_count") {
      this.executionCount = message.data;
    } else if (message.stream === "status") {
      this.status = message.data;
    } else if (OUTPUT_TYPES.includes(message.output_type)) {
      if (this._clearOnNextOutput) {
        this._clearOnNextOutput = false;
        this._clearCurrentRun();
      }
      this.totalOutputCount++;

      // Assign unique ID for React key stability
      message._id = ++this._outputIdCounter;

      if (this._startNewGroup) {
        // First output of a new run: push as its own entry so it never merges
        // with the previous run's output, and mark where this run begins.
        this._startNewGroup = false;
        this._currentRunStart = this.outputs.length;
        this.outputs.push(message);
      } else {
        reduceOutputs(this.outputs, message);
      }

      this._trimHistory();
      this.setIndex(this.outputs.length - 1);
    }
  }

  _trimHistory() {
    const excess = this.outputs.length - this.maxOutputs;
    if (excess > 0) {
      this.outputs.splice(0, excess);
      this._currentRunStart = Math.max(0, this._currentRunStart - excess);
    }
  }

  // clear_output targets the current output area. For an accumulated history
  // (watch runs) that means only the current run's outputs; earlier runs are
  // kept. Without a run boundary (inline/cell results) this clears everything.
  _clearCurrentRun() {
    if (this._currentRunStart <= 0) {
      this.clear();
    } else {
      this.outputs.splice(this._currentRunStart);
      this.setIndex(this.outputs.length - 1);
    }
    // The next output begins the current run again, so force it into a fresh
    // entry instead of merging into the previous run's last output.
    this._startNewGroup = true;
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
    this.index = this.index < this.outputs.length - 1 ? this.index + 1 : this.outputs.length - 1;
  };

  decrementIndex = () => {
    this.index = this.index > 0 ? this.index - 1 : 0;
  };

  clear = () => {
    this.outputs = [];
    this.index = -1;
    this.truncated = false;
    this.totalOutputCount = 0;
    this._clearOnNextOutput = false;
    this._startNewGroup = false;
    this._currentRunStart = 0;
  };

  // Begin a new history entry on the next output, so a re-run accumulates
  // alongside previous values instead of replacing or merging into them.
  // Mark the run boundary now so a clear_output arriving before the first
  // output still only clears this run, not earlier history.
  startNewRun() {
    this._startNewGroup = true;
    this._currentRunStart = this.outputs.length;
    // A deferred clear_output(wait=True) from a previous run must not carry
    // over and clobber this run's first output.
    this._clearOnNextOutput = false;
  }
}

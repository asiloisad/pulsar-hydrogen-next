/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import { NO_EXECTIME_STRING, formatElapsedTime } from "../../../utils";

@observer
class StatusBar extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      elapsedMs: 0,
    };
    this.timerId = null;
    this.previousKernel = null;
    this.previousExecutionState = null;
  }

  componentDidMount() {
    this.updateTimerState();
  }

  componentDidUpdate() {
    this.updateTimerState();
  }

  componentWillUnmount() {
    this.stopTimer();
  }

  updateTimerState() {
    const kernel = this.props.store.kernel;
    const currentState = kernel ? kernel.executionState : null;

    if (!kernel || currentState !== "busy") {
      if (this.timerId) {
        this.stopTimer();
      }
    } else if (!this.timerId) {
      // Start timer only if not already running - kernel tracks its own start time
      this.startTimer(kernel);
    }

    this.previousKernel = kernel;
    this.previousExecutionState = currentState;
  }

  startTimer(kernel) {
    this.stopTimer();
    // Read executionStartTime from kernel - it persists across editor focus changes
    const startTime = kernel ? kernel.executionStartTime : null;
    this.setState({ elapsedMs: startTime ? Date.now() - startTime : 0 });
    this.timerId = setInterval(() => {
      const currentKernel = this.props.store.kernel;
      const execStartTime = currentKernel ? currentKernel.executionStartTime : null;
      if (execStartTime) {
        this.setState({
          elapsedMs: Date.now() - execStartTime,
        });
      }
    }, 50);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  setParentDisplay(value) {
    const el = this.props.container;
    if (el) el.style.display = value;
  }

  formatElapsed() {
    return formatElapsedTime(this.state.elapsedMs);
  }

  render() {
    const { kernel, markers, configMapping } = this.props.store;
    if (!kernel || configMapping.get("hydrogen-next.statusBarDisable")) {
      this.setParentDisplay("none");
      return null;
    }

    const showKernelInfo = configMapping.get("hydrogen-next.statusBarKernelInfo");
    const isBusy = kernel.executionState === "busy";
    const displaySegments = [kernel.displayName, kernel.executionState];

    if (showKernelInfo) {
      displaySegments.push(kernel.executionCount);

      if (isBusy) {
        displaySegments.push(this.formatElapsed());
      } else if (kernel.executionCount !== 0 && kernel.lastExecutionTime !== NO_EXECTIME_STRING) {
        displaySegments.push(kernel.lastExecutionTime);
      }
    } else if (isBusy) {
      displaySegments.push(this.formatElapsed());
    }

    const infoText = displaySegments.join(" | ");
    this.setParentDisplay("");

    return (
      <a
        onClick={() =>
          this.props.onClick({
            kernel,
            markers,
          })
        }
      >
        {infoText}
      </a>
    );
  }
}
export default StatusBar;

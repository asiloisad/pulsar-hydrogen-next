/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import { NO_EXECTIME_STRING } from "../../../utils";

@observer
class StatusBar extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      elapsedMs: 0,
    };
    this.timerId = null;
    this.executionStartTime = null;
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
    const kernelChanged = this.previousKernel && this.previousKernel !== kernel;

    if (!kernel || currentState !== "busy") {
      if (this.timerId) {
        this.stopTimer();
      }
    } else if (
      kernelChanged ||
      this.previousExecutionState !== "busy" ||
      !this.timerId
    ) {
      this.startTimer();
    }

    this.previousKernel = kernel;
    this.previousExecutionState = currentState;
  }

  startTimer() {
    this.stopTimer();
    this.executionStartTime = Date.now();
    this.setState({ elapsedMs: 0 });
    this.timerId = setInterval(() => {
      if (this.executionStartTime) {
        this.setState({
          elapsedMs: Date.now() - this.executionStartTime,
        });
      }
    }, 50);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.executionStartTime = null;
  }

  formatElapsed() {
    const elapsedMs = this.state.elapsedMs;
    if (!elapsedMs || elapsedMs < 0) {
      return "0.000 sec";
    }

    const elapsedSeconds = elapsedMs / 1000;
    if (elapsedSeconds < 60) {
      return `${elapsedSeconds.toFixed(3)} sec`;
    }

    let minutes = Math.floor(elapsedSeconds / 60);
    const seconds = Math.round(elapsedSeconds % 60);

    if (minutes < 60) {
      return `${minutes} min ${seconds} sec`;
    }

    const hours = Math.floor(minutes / 60);
    minutes %= 60;
    return `${hours} h ${minutes} m ${seconds} s`;
  }

  render() {
    const { kernel, markers, configMapping } = this.props.store;
    if (!kernel || configMapping.get("hydrogen-next.statusBarDisable")) {
      return null;
    }

    const showKernelInfo = configMapping.get(
      "hydrogen-next.statusBarKernelInfo"
    );
    const isBusy = kernel.executionState === "busy";
    const displaySegments = [kernel.displayName, kernel.executionState];

    if (showKernelInfo) {
      displaySegments.push(kernel.executionCount);

      if (isBusy) {
        displaySegments.push(this.formatElapsed());
      } else if (
        kernel.executionCount !== 0 &&
        kernel.lastExecutionTime !== NO_EXECTIME_STRING
      ) {
        displaySegments.push(kernel.lastExecutionTime);
      }
    } else if (isBusy) {
      displaySegments.push(this.formatElapsed());
    }

    const infoText = displaySegments.join(" | ");

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

/** @babel */
/** @jsx React.createElement */

import React from "react"
import { observer } from "mobx-react"
import { NO_EXECTIME_STRING } from "../../../utils"

@observer
class StatusBar extends React.Component {
  render() {
    const { kernel, markers, configMapping } = this.props.store
    if (!kernel || configMapping.get("hydrogen-next.statusBarDisable")) {
      return null
    }
    const view = configMapping.get("hydrogen-next.statusBarKernelInfo") ? ( // branch on if exec time is not available or no execution has happened
      kernel.executionCount === 0 ||
      kernel.lastExecutionTime === NO_EXECTIME_STRING ? (
        <a
          onClick={() =>
            this.props.onClick({
              kernel,
              markers
            })
          }
        >
          {kernel.displayName} | {kernel.executionState} |{" "}
          {kernel.executionCount}
        </a>
      ) : (
        <a
          onClick={() =>
            this.props.onClick({
              kernel,
              markers
            })
          }
        >
          {kernel.displayName} | {kernel.executionState} |{" "}
          {kernel.executionCount} | {kernel.lastExecutionTime}
        </a>
      )
    ) : (
      <a
        onClick={() =>
          this.props.onClick({
            kernel,
            markers
          })
        }
      >
        {kernel.displayName} | {kernel.executionState}
      </a>
    )
    return view
  }
}
export default StatusBar

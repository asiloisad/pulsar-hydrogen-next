/** @babel */
/** @jsx React.createElement */

import React from "react";
import { ExecuteResult } from "./handlers/execute-result";
import { DisplayData } from "./handlers/display-data";
import { StreamText } from "./handlers/stream-text";
import { KernelOutputError } from "./handlers/error";

/**
 * Output component - routes to the appropriate handler based on output_type
 *
 * Usage:
 * <Output output={jupyterOutput}>
 *   <ExecuteResult expanded>{supportedMediaTypes}</ExecuteResult>
 *   <DisplayData expanded>{supportedMediaTypes}</DisplayData>
 *   <StreamText expanded />
 *   <KernelOutputError expanded />
 * </Output>
 */
export function Output({ output, children }) {
  if (!output || !output.output_type) {
    return null;
  }

  const outputType = output.output_type;
  const childArray = React.Children.toArray(children);

  // Find the appropriate handler child based on output_type
  for (const child of childArray) {
    if (!React.isValidElement(child)) continue;

    const childType = child.type;

    // Match by component type
    if (outputType === "execute_result" && childType === ExecuteResult) {
      return React.cloneElement(child, { output });
    }
    if (outputType === "display_data" && childType === DisplayData) {
      return React.cloneElement(child, { output });
    }
    if (outputType === "stream" && childType === StreamText) {
      return React.cloneElement(child, { output });
    }
    if (outputType === "error" && childType === KernelOutputError) {
      return React.cloneElement(child, { output });
    }

    // Also check displayName for compatibility
    const displayName = childType.displayName || childType.name;
    if (outputType === "execute_result" && displayName === "ExecuteResult") {
      return React.cloneElement(child, { output });
    }
    if (outputType === "display_data" && displayName === "DisplayData") {
      return React.cloneElement(child, { output });
    }
    if (outputType === "stream" && displayName === "StreamText") {
      return React.cloneElement(child, { output });
    }
    if (outputType === "error" && displayName === "KernelOutputError") {
      return React.cloneElement(child, { output });
    }
  }

  return null;
}

Output.displayName = "Output";

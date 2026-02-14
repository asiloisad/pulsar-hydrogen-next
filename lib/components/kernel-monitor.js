/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import { isUnsavedFilePath, tildify } from "../utils";

const showKernelSpec = (kernelSpec) => {
  atom.notifications.addInfo("hydrogen-next: Kernel Spec", {
    detail: JSON.stringify(kernelSpec, null, 2),
    dismissable: true,
  });
};

const interrupt = (kernel) => {
  kernel.interrupt();
};

const shutdown = (kernel) => {
  kernel.shutdown();
  kernel.destroy();
};

const restart = (kernel) => {
  kernel.restart(undefined);
};

const rename = (kernel) => {
  if (kernel.transport?.promptRename) {
    kernel.transport.promptRename();
  }
};

const disconnect = (kernel) => {
  kernel.destroy();
};

const openUnsavedEditor = (filePath) => {
  const editor = atom.workspace.getTextEditors().find((editor) => {
    const match = filePath.match(/\d+/);
    if (!match) {
      return false;
    }
    return String(editor.id) === match[0];
  });
  if (!editor) {
    return;
  }
  atom.workspace.open(editor, {
    searchAllPanes: true,
  });
};

const openEditor = (filePath) => {
  atom.workspace
    .open(filePath, {
      searchAllPanes: true,
    })
    .catch((err) => {
      atom.notifications.addError("hydrogen-next", {
        description: err,
      });
    });
};

const KernelMonitor = observer(({ store }) => {
  const head = (
    <tr className="kernel-monitor-header">
      <th>Gateway</th>
      <th>Kernel</th>
      <th>Status</th>
      <th>Count</th>
      <th>Last Exec Time</th>
      <th>Managements</th>
      <th>Files</th>
    </tr>
  );

  const data = [];
  for (let kernel of store.runningKernels) {
    const gateway = kernel.transport?.gatewayName || "Local";
    const displayName = kernel.displayName || "Unknown";
    const kernelSpec = kernel.kernelSpec;
    const status = kernel.executionState || "unknown";
    const executionCount = kernel.executionCount ?? 0;
    const lastExecutionTime = kernel.lastExecutionTime || "N/A";
    const files = store.getFilesForKernel(kernel) || [];

    const isRemote = Boolean(kernel.transport?.gatewayName);
    const showSpec = () => showKernelSpec(kernelSpec);
    const doInterrupt = () => interrupt(kernel);
    const doRestart = () => restart(kernel);
    const doShutdown = () => shutdown(kernel);
    const doRename = () => rename(kernel);
    const doDisconnect = () => disconnect(kernel);

    const fileLinks = files.map((filePath, index) => {
      const separator = index === 0 ? "" : "  |  ";
      const openFile = isUnsavedFilePath(filePath)
        ? () => openUnsavedEditor(filePath)
        : () => openEditor(filePath);
      const displayPath = isUnsavedFilePath(filePath) ? filePath : tildify(filePath);

      return (
        <span key={filePath}>
          {separator}
          <a onClick={openFile} title="Jump to file">
            {displayPath}
          </a>
        </span>
      );
    });

    const row = (
      <tr key={kernel.id || displayName} className="kernel-monitor-row">
        <td className="kernel-monitor-gateway">{gateway}</td>
        <td className="kernel-monitor-kernel">
          <a onClick={showSpec} title="Show kernel spec">
            {displayName}
          </a>
        </td>
        <td className="kernel-monitor-status">{status}</td>
        <td className="kernel-monitor-count">{executionCount}</td>
        <td className="kernel-monitor-time">{lastExecutionTime}</td>
        <td className="kernel-monitor-managements">
          <a className="icon icon-zap" onClick={doInterrupt} title="Interrupt kernel" />
          <a className="icon icon-sync" onClick={doRestart} title="Restart kernel" />
          {isRemote ? (
            <a className="icon icon-pencil" onClick={doRename} title="Rename session" />
          ) : null}
          {isRemote ? (
            <a
              className="icon icon-plug"
              onClick={doDisconnect}
              title="Disconnect (keep kernel running)"
            />
          ) : null}
          <a className="icon icon-trashcan" onClick={doShutdown} title="Shutdown kernel" />
        </td>
        <td className="kernel-monitor-files">{fileLinks}</td>
      </tr>
    );

    data.push(row);
  }

  return (
    <div className="kernel-monitor-wrapper">
      <table className="kernel-monitor-table">
        <thead>{head}</thead>
        <tbody>{data}</tbody>
      </table>
    </div>
  );
});

export default KernelMonitor;

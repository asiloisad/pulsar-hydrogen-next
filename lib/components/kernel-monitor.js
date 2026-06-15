/** @babel */
/** @jsx React.createElement */

import React from "react";
import { CompositeDisposable } from "atom";
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

const kernelKeys = new WeakMap();
let nextKernelKey = 1;

const getKernelKey = (kernel) => {
  if (kernel.id) {
    return kernel.id;
  }
  if (!kernelKeys.has(kernel)) {
    kernelKeys.set(kernel, `kernel-monitor-${nextKernelKey++}`);
  }
  return kernelKeys.get(kernel);
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

class KernelMonitor extends React.Component {
  state = { selectedKey: null };
  rootRef = React.createRef();

  componentDidMount() {
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      atom.commands.add(this.rootRef.current, {
        "hydrogen-next:kernel-monitor-up": () => this.move(-1),
        "hydrogen-next:kernel-monitor-down": () => this.move(1),
        "hydrogen-next:kernel-monitor-open": () => this.openFiles(),
        "hydrogen-next:kernel-monitor-interrupt": () => this.act(interrupt),
        "hydrogen-next:kernel-monitor-restart": () => this.act(restart),
        "hydrogen-next:kernel-monitor-shutdown": () => this.act(shutdown),
      }),
      // The highlight follows the kernel of the active center pane item. Clear
      // any manual arrow-key selection when the active item changes so it
      // re-syncs with the workspace.
      atom.workspace.getCenter().onDidChangeActivePaneItem(() => {
        if (this.state.selectedKey) {
          this.setState({ selectedKey: null });
        }
      }),
    );
  }

  componentWillUnmount() {
    this.disposables?.dispose();
  }

  kernels() {
    return [...this.props.store.runningKernels];
  }

  // The highlighted kernel: a manual arrow-key/click selection if one is set,
  // otherwise the kernel bound to the active center pane item, otherwise the
  // first running kernel so keyboard actions always have a target.
  selectedKernel(kernels = this.kernels()) {
    if (!kernels.length) {
      return null;
    }
    if (this.state.selectedKey) {
      const manual = kernels.find((k) => getKernelKey(k) === this.state.selectedKey);
      if (manual) {
        return manual;
      }
    }
    const active = this.props.store.kernel;
    if (active && kernels.includes(active)) {
      return active;
    }
    return kernels[0];
  }

  move(delta) {
    const kernels = this.kernels();
    if (!kernels.length) {
      return;
    }
    const current = this.selectedKernel(kernels);
    let index = current ? kernels.indexOf(current) : 0;
    index = Math.min(kernels.length - 1, Math.max(0, index + delta));
    this.setState({ selectedKey: getKernelKey(kernels[index]) });
  }

  act(fn) {
    const kernel = this.selectedKernel();
    if (kernel) {
      fn(kernel);
    }
  }

  openFiles() {
    const kernel = this.selectedKernel();
    if (!kernel) {
      return;
    }
    const files = this.props.store.getFilesForKernel(kernel) || [];
    for (const filePath of files) {
      if (isUnsavedFilePath(filePath)) {
        openUnsavedEditor(filePath);
      } else {
        openEditor(filePath);
      }
    }
  }

  render() {
    const { store } = this.props;
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

    const kernels = this.kernels();
    const selected = this.selectedKernel(kernels);
    const selectedKey = selected ? getKernelKey(selected) : null;

    const data = kernels.map((kernel) => {
      const gateway = kernel.transport?.gatewayName || "Local";
      const displayName = kernel.displayName || "Unknown";
      const kernelSpec = kernel.kernelSpec;
      const status = kernel.executionState || "unknown";
      const executionCount = kernel.executionCount ?? 0;
      const lastExecutionTime = kernel.lastExecutionTime || "N/A";
      const files = store.getFilesForKernel(kernel) || [];

      const isRemote = Boolean(kernel.transport?.gatewayName);
      const key = getKernelKey(kernel);
      const showSpec = () => showKernelSpec(kernelSpec);
      const select = () => this.setState({ selectedKey: key });
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

      const className =
        key === selectedKey ? "kernel-monitor-row selected" : "kernel-monitor-row";

      return (
        <tr key={key} className={className} onClick={select}>
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
    });

    return (
      <div className="kernel-monitor-wrapper" tabIndex={-1} ref={this.rootRef}>
        <table className="kernel-monitor-table">
          <thead>{head}</thead>
          <tbody>{data}</tbody>
        </table>
      </div>
    );
  }
}

export default observer(KernelMonitor);

/** @babel */
/** @jsx etch.dom */

import etch from 'etch'
import path from 'path'
import { autorun } from 'mobx'
import { isUnsavedFilePath, tildify } from '../utils'

const showKernelSpec = kernelSpec => {
  atom.notifications.addInfo('hydrogen-next: Kernel Spec', {
    detail: JSON.stringify(kernelSpec, null, 2),
    dismissable: true
  })
}

const interrupt = kernel => {
  kernel.interrupt()
}

const shutdown = kernel => {
  kernel.shutdown()
  kernel.destroy()
}

const restart = kernel => {
  kernel.restart(undefined)
}

const openUnsavedEditor = filePath => {
  const editor = atom.workspace.getTextEditors().find(editor => {
    const match = filePath.match(/\d+/)
    if (!match) {
      return false
    }
    return String(editor.id) === match[0]
  })
  if (!editor) {
    return
  }
  atom.workspace.open(editor, {
    searchAllPanes: true
  })
}

const openEditor = filePath => {
  atom.workspace
    .open(filePath, {
      searchAllPanes: true
    })
    .catch(err => {
      atom.notifications.addError('hydrogen-next', {
        description: err
      })
    })
}

class KernelMonitor {
  constructor(store) {
    this.store = store
    etch.initialize(this)

    this.disposer = autorun(() => {
      // Access properties to track dependencies
      this.store.runningKernels.forEach(kernel => {
        kernel.displayName
        kernel.executionState
        kernel.executionCount
        kernel.lastExecutionTime
        this.store.getFilesForKernel(kernel)
      })
      this.update()
    })
  }

  destroy() {
    if (this.disposer) {
      this.disposer()
    }
    etch.destroy(this)
  }

  update() {
    etch.update(this)
  }

  render() {
    const head = (
      <tr class="kernel-monitor-header">
        <th>Gateway</th>
        <th>Kernel</th>
        <th>Status</th>
        <th>Count</th>
        <th>Last Exec Time</th>
        <th>Managements</th>
        <th>Files</th>
      </tr>
    )

    const data = []
    for (let kernel of this.store.runningKernels) {
      const gateway = kernel.transport.gatewayName || 'Local'
      const displayName = kernel.displayName
      const kernelSpec = kernel.kernelSpec
      const status = kernel.executionState
      const executionCount = kernel.executionCount
      const lastExecutionTime = kernel.lastExecutionTime
      const files = this.store.getFilesForKernel(kernel)

      const showSpec = () => showKernelSpec(kernelSpec)
      const doInterrupt = () => interrupt(kernel)
      const doRestart = () => restart(kernel)
      const doShutdown = () => shutdown(kernel)

      const fileLinks = files.map((filePath, index) => {
        const separator = index === 0 ? '' : '  |  '
        const openFile = isUnsavedFilePath(filePath)
          ? () => openUnsavedEditor(filePath)
          : () => openEditor(filePath)
        const displayPath = isUnsavedFilePath(filePath)
          ? filePath
          : tildify(filePath)

        return (
          <span key={filePath}>
            {separator}
            <a onClick={openFile} title="Jump to file">
              {displayPath}
            </a>
          </span>
        )
      })

      const row = (
        <tr class="kernel-monitor-row">
          <td class="kernel-monitor-gateway">{gateway}</td>
          <td class="kernel-monitor-kernel">
            <a onClick={showSpec} title="Show kernel spec">
              {displayName}
            </a>
          </td>
          <td class="kernel-monitor-status">{status}</td>
          <td class="kernel-monitor-count">{executionCount}</td>
          <td class="kernel-monitor-time">{lastExecutionTime}</td>
          <td class="kernel-monitor-managements">
            <a
              class="icon icon-zap"
              onClick={doInterrupt}
              title="Interrupt kernel"
            />
            <a
              class="icon icon-sync"
              onClick={doRestart}
              title="Restart kernel"
            />
            <a
              class="icon icon-trashcan"
              onClick={doShutdown}
              title="Shutdown kernel"
            />
          </td>
          <td class="kernel-monitor-files">{fileLinks}</td>
        </tr>
      )

      data.push(row)
    }

    return (
      <div class="kernel-monitor-wrapper">
        <table class="kernel-monitor-table">
          <thead>{head}</thead>
          <tbody>{data}</tbody>
        </table>
      </div>
    )
  }

  getTitle() {
    return 'Kernel Monitor'
  }

  getDefaultLocation() {
    return 'bottom'
  }

  getAllowedLocations() {
    return ['center', 'bottom']
  }
}

module.exports = { KernelMonitor }

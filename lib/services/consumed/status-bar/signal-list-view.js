/** @babel */

import { SelectListView, highlightMatches } from "pulsar-select-list";
import WSKernel from "../../../ws-kernel";
import { log, setPreviouslyFocusedElement } from "../../../utils";

const basicCommands = [
  {
    name: "Interrupt",
    value: "interrupt-kernel",
  },
  {
    name: "Restart",
    value: "restart-kernel",
  },
  {
    name: "Shut Down",
    value: "shutdown-kernel",
  },
];
const wsKernelCommands = [
  {
    name: "Rename session for",
    value: "rename-kernel",
  },
  {
    name: "Disconnect from",
    value: "disconnect-kernel",
  },
];

export default class SignalListView {
  constructor(store, handleKernelCommand) {
    this.store = store;
    this.handleKernelCommand = handleKernelCommand;

    this.selectList = new SelectListView({
      itemsClassList: ["mark-active"],

      items: [],

      className: "hydrogen-next signal-list",

      filterKeyForItem: (item) => item.name,

      willShow: () => {
        setPreviouslyFocusedElement(this);
      },

      elementForItem: (item, options) => {
        const element = document.createElement("li");
        const matches = this.selectList.getMatchIndices(item) || [];
        element.appendChild(highlightMatches(item.name, matches));
        return element;
      },

      didConfirmSelection: (item) => {
        log("Selected command:", item);
        this.onConfirmed(item);
        this.cancel();
      },

      didCancelSelection: () => this.cancel(),

      emptyMessage: "No running kernels for this file type.",
    });
  }

  onConfirmed(kernelCommand) {
    if (this.handleKernelCommand) {
      this.handleKernelCommand(kernelCommand, this.store);
    }
  }

  async toggle() {
    if (this.panel != null) {
      this.cancel();
    }

    if (!this.store) {
      return;
    }
    const kernel = this.store.kernel;
    if (!kernel) {
      return;
    }
    const commands =
      kernel.transport instanceof WSKernel
        ? [...basicCommands, ...wsKernelCommands]
        : basicCommands;
    const listItems = commands.map((command) => ({
      name: `${command.name} ${kernel.kernelSpec.display_name} kernel`,
      command: command.value,
    }));
    await this.selectList.update({
      items: listItems,
    });
    this.attach();
  }

  attach() {
    if (this.panel == null) {
      this.panel = atom.workspace.addModalPanel({
        item: this.selectList,
      });
    }
    this.selectList.focus();
    this.selectList.reset();
  }

  destroy() {
    this.cancel();
    return this.selectList.destroy();
  }

  cancel() {
    if (this.panel != null) {
      this.panel.destroy();
    }

    this.panel = null;

    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }
}

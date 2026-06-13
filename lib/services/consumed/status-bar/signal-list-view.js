/** @babel */

import { SelectListView, highlightMatches } from "@asiloisad/select-list";
import WSKernel from "../../../ws-kernel";
import { log } from "../../../utils";

const basicCommands = [
  {
    name: "Interrupt kernel",
    value: "interrupt-kernel",
  },
  {
    name: "Restart kernel",
    value: "restart-kernel",
  },
  {
    name: "Shut down kernel",
    value: "shutdown-kernel",
  },
];
const wsKernelCommands = [
  {
    name: "Rename session",
    value: "rename-kernel",
  },
  {
    name: "Disconnect kernel",
    value: "disconnect-kernel",
  },
];
const terminalCommands = [
  {
    name: "Open Jupyter console in terminal",
    value: "open-jupyter-console",
  },
  {
    name: "Spawn Jupyter console terminal",
    value: "spawn-jupyter-console",
  },
];

export default class SignalListView {
  constructor(store, handleKernelCommand) {
    this.store = store;
    this.handleKernelCommand = handleKernelCommand;

    this.selectList = new SelectListView({
      willShow: async () => {
        if (!this.store) {
          return;
        }
        const kernel = this.store.kernel;
        if (!kernel) {
          return;
        }
        const commands =
          kernel.transport instanceof WSKernel
            ? [...basicCommands, ...wsKernelCommands, ...terminalCommands]
            : [...basicCommands, ...terminalCommands];
        const listItems = commands.map((command) => ({
          name: command.name,
          command: command.value,
        }));
        await this.selectList.update({
          items: listItems,
        });
      },
      className: "hydrogen-next signal-list",
      filterKeyForItem: (item) => item.name,
      elementForItem: (item, { filterKey, matchIndices }) => {
        const element = document.createElement("li");
        element.appendChild(highlightMatches(filterKey, matchIndices));
        return element;
      },
      didConfirmSelection: (item) => {
        log("Selected command:", item);
        this.selectList.hide();
        if (this.handleKernelCommand) {
          this.handleKernelCommand(item, this.store);
        }
      },
      didCancelSelection: () => this.selectList.hide(),
      emptyMessage: "No running kernels for this file type.",
    });
  }

  destroy() {
    this.selectList.destroy();
  }

  toggle() {
    this.selectList.toggle();
  }
}

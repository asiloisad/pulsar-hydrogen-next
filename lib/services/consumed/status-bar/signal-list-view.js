/** @babel */

import { SelectListView, highlightMatches } from "pulsar-select-list";
import WSKernel from "../../../ws-kernel";
import { log } from "../../../utils";

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
            ? [...basicCommands, ...wsKernelCommands]
            : basicCommands;
        const listItems = commands.map((command) => ({
          name: `${command.name} ${kernel.kernelSpec.display_name} kernel`,
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
        this.selectList.hide()
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
    this.selectList.toggle()
  }
}

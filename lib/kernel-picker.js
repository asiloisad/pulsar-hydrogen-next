/** @babel */

import { SelectListView, highlightMatches } from "pulsar-select-list";
import { log } from "./utils";

export default class KernelPicker {

  constructor(kernelSpecs) {
    this.kernelSpecs = kernelSpecs;
    this.onConfirmed = null;
    this.loaded = false;
    this.selectList = new SelectListView({
      // items: [],
      itemsClassList: ["mark-active"],
      willShow: async () => {
        await this.selectList.update({
          items: this.kernelSpecs,
        })
      },
      className: "hydrogen-next kernel-picker",
      filterKeyForItem: (item) => item.display_name,
      elementForItem: (item, { filterKey, matchIndices }) => {
        const element = document.createElement("li");
        element.appendChild(highlightMatches(filterKey, matchIndices));
        return element;
      },
      didConfirmSelection: (item) => {
        log("Selected kernel:", item);
        this.selectList.hide();
        if (this.onConfirmed) {
          this.onConfirmed(item);
        }
      },
      didCancelSelection: () => this.selectList.hide(),
      emptyMessage: "No kernels found",
    });
  }

  destroy() {
    this.selectList.destroy();
  }

  toggle() {
    this.selectList.toggle()
  }
}

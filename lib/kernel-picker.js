/** @babel */

import { SelectListView, highlightMatches } from "pulsar-select-list";
import { log } from "./utils";

export default class KernelPicker {

  constructor(kernelSpecs) {
    this.kernelSpecs = kernelSpecs;
    this.onConfirmed = null;
    this.loaded = false;

    this.selectList = new SelectListView({
      itemsClassList: ["mark-active"],

      items: [],

      willShow: async () => {
        await this.selectList.update({
          items: this.kernelSpecs,
        })
      },

      className: "hydrogen-next kernel-picker",

      filterKeyForItem: (item) => item.display_name,

      elementForItem: (item, options) => {
        const element = document.createElement("li");
        const matches = this.selectList.getMatchIndices(item) || [];
        element.appendChild(highlightMatches(item.display_name, matches));
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

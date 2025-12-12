/** @babel */

import SelectListView from "pulsar-select-list";
import { log, setPreviouslyFocusedElement } from "./utils";

export default class KernelPicker {
  constructor(kernelSpecs) {
    this.kernelSpecs = kernelSpecs;
    this.onConfirmed = null;

    this.selectList = new SelectListView({
      itemsClassList: ["mark-active"],
      items: [],
      className: "hydrogen-next kernel-picker",
      filterKeyForItem: (item) => item.display_name,

      willShow: () => {
        setPreviouslyFocusedElement(this);
      },

      elementForItem: (item, options) => {
        const element = document.createElement("li");
        const matches = this.selectList.getMatchIndices(item) || [];

        element.appendChild(
          SelectListView.highlightMatches(item.display_name, matches)
        );

        return element;
      },

      didConfirmSelection: (item) => {
        log("Selected kernel:", item);
        if (this.onConfirmed) {
          this.onConfirmed(item);
        }
        this.cancel();
      },

      didCancelSelection: () => this.cancel(),
      emptyMessage: "No kernels found",
    });
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

  attach() {
    if (this.panel == null) {
      this.panel = atom.workspace.addModalPanel({
        item: this.selectList,
      });
    }
    this.selectList.focus();
    this.selectList.reset();
  }

  async toggle() {
    if (this.panel != null) {
      this.cancel();
    } else {
      await this.selectList.update({
        items: this.kernelSpecs,
      });
      this.attach();
    }
  }
}

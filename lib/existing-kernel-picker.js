/** @babel */

import SelectListView, { highlightMatches } from "pulsar-select-list";
import store from "./store";
import {
  kernelSpecProvidesGrammar,
  setPreviouslyFocusedElement,
  tildify,
} from "./utils";

function getName(kernel) {
  const prefix = kernel.transport.gatewayName
    ? `${kernel.transport.gatewayName}: `
    : "";
  return `${prefix + kernel.displayName} - ${store
    .getFilesForKernel(kernel)
    .map(tildify)
    .join(", ")}`;
}

export default class ExistingKernelPicker {
  constructor() {
    this.selectList = new SelectListView({
      itemsClassList: ["mark-active"],

      items: [],

      className: "hydrogen-next existing-kernel-picker",

      filterKeyForItem: (kernel) => getName(kernel),

      willShow: () => {
        setPreviouslyFocusedElement(this);
      },

      elementForItem: (kernel, options) => {
        const element = document.createElement("li");
        const name = getName(kernel);
        const matches = this.selectList.getMatchIndices(kernel) || [];
        element.appendChild(highlightMatches(name, matches));
        return element;
      },

      didConfirmSelection: (kernel) => {
        const { filePath, editor, grammar } = store;
        if (!filePath || !editor || !grammar) {
          return this.cancel();
        }
        store.newKernel(kernel, filePath, editor, grammar);
        this.cancel();
      },

      didCancelSelection: () => this.cancel(),

      emptyMessage: "No running kernels for this language.",
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
    } else if (store.filePath && store.grammar) {
      await this.selectList.update({
        items: store.runningKernels.filter((kernel) =>
          kernelSpecProvidesGrammar(kernel.kernelSpec, store.grammar)
        ),
      });
      const markers = store.markers;
      if (markers) {
        markers.clear();
      }
      this.attach();
    }
  }
}

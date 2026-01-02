/** @babel */

import { CompositeDisposable } from "atom";
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
      helpMarkdown:
        "Available commands:\n" +
        "- **Enter** — Start kernel\n" +
        "- **Ctrl+Enter** — Insert kernel as magic comment",
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

    // Register command for inserting kernel as magic comment
    this.disposables = new CompositeDisposable(
      atom.commands.add(this.selectList.element, {
        "select-list:kernel": () => this.insertKernelComment(),
      })
    );
  }

  /**
   * Insert or modify the kernel magic comment (#:: kernelname) at the first line.
   */
  insertKernelComment() {
    const item = this.selectList.getSelectedItem();
    if (!item) {
      return;
    }
    this.selectList.hide();

    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    const kernelLine = `#:: ${item.name}`;
    const buffer = editor.getBuffer();
    const firstLine = buffer.lineForRow(0);

    if (firstLine && firstLine.match(/^#::\s*/)) {
      // Replace existing kernel magic comment line
      buffer.setTextInRange([[0, 0], [0, firstLine.length]], kernelLine);
    } else {
      // Insert new kernel magic comment with empty line after
      buffer.insert([0, 0], kernelLine + "\n\n");
    }

    log("Inserted kernel comment:", kernelLine);
  }

  destroy() {
    this.disposables.dispose();
    this.selectList.destroy();
  }

  toggle() {
    this.selectList.toggle()
  }
}

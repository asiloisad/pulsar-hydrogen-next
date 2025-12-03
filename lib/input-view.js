/** @babel */

import { TextEditor } from "atom";
import { setPreviouslyFocusedElement } from "./utils";

/**
 * A simple modal input dialog.
 * Used for authentication prompts and kernel input requests.
 * Does NOT save history (unlike ExecPanel) for security.
 */
export default class InputView {
  constructor({ prompt, defaultText, allowCancel, password }, onConfirmed, onCancelled) {
    this.onConfirmed = onConfirmed;
    this.onCancelled = onCancelled;

    this.element = document.createElement("div");
    this.element.classList.add("hydrogen-next", "input-view");

    const label = document.createElement("div");
    label.classList.add("label", "icon", "icon-arrow-right");
    label.textContent = prompt || "Kernel requires input";
    this.miniEditor = new TextEditor({
      mini: true,
    });

    if (password) {
      // Password mode: only show dots when there's actual text
      const updateMask = () => {
        const hasText = this.miniEditor.getText().length > 0;
        this.miniEditor.element.style.webkitTextSecurity = hasText ? "disc" : "none";
      };
      this.miniEditor.onDidChange(updateMask);
      updateMask();
    }

    if (defaultText) {
      this.miniEditor.setText(defaultText);
    }

    this.element.appendChild(label);
    this.element.appendChild(this.miniEditor.element);

    if (allowCancel) {
      atom.commands.add(this.element, {
        "core:confirm": () => this.confirm(),
        "core:cancel": () => this.cancel(),
      });
      this.miniEditor.element.addEventListener("blur", () => {
        if (document.hasFocus()) {
          this.cancel();
        }
      });
    } else {
      atom.commands.add(this.element, {
        "core:confirm": () => this.confirm(),
      });
    }
  }

  confirm() {
    const text = this.miniEditor.getText();
    if (this.onConfirmed) {
      this.onConfirmed(text);
    }
    this.close();
  }

  cancel() {
    const callback = this.onCancelled;
    this.close();
    if (callback) {
      callback();
    }
  }

  close() {
    if (this.panel) {
      this.panel.destroy();
    }
    this.panel = null;

    // Destroy the TextEditor to free resources
    if (this.miniEditor) {
      this.miniEditor.destroy();
      this.miniEditor = null;
    }

    this.element.remove();
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
    }
  }

  attach() {
    setPreviouslyFocusedElement(this);
    this.panel = atom.workspace.addModalPanel({
      item: this.element,
    });
    this.miniEditor.element.focus();
    this.miniEditor.scrollToCursorPosition();
  }
}

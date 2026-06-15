/** @babel */
/** @jsx React.createElement */

import React from "react";
import { Disposable } from "atom";
import { INSPECTOR_URI } from "../utils";
import Inspector from "../components/inspector";
import BasePane from "./base-pane";
import inspectorStore from "../store/inspector-store";

export default class InspectorPane extends BasePane {
  constructor() {
    super({
      title: "Inspector",
      iconName: "microscope",
      uri: INSPECTOR_URI,
      defaultLocation: "bottom",
      allowedLocations: ["bottom", "left", "right"],
      classNames: ["inspector"],
      reactElement: <Inspector inspectorStore={inspectorStore} />,
    });

    this.element.tabIndex = -1;
    this.element.addEventListener("focus", this.redirectFocus);
    this.disposer.add(
      new Disposable(() => this.element.removeEventListener("focus", this.redirectFocus)),
      atom.commands.add(this.element, {
        "hydrogen-next:inspector-scroll-up": (event) => this.scroll(event, -1),
        "hydrogen-next:inspector-scroll-down": (event) => this.scroll(event, 1),
      }),
    );
  }

  getFocusTarget() {
    return (
      this.element.querySelector("atom-text-editor.inspector-expression") ||
      (this.element.querySelector(".inspector-result") &&
        this.element.querySelector(".inspector-body")) ||
      this.element.querySelector(".inspector-body") ||
      this.element
    );
  }

  redirectFocus = (event) => {
    if (event.target !== this.element) {
      return;
    }
    const target = this.getFocusTarget();
    if (target !== this.element) {
      requestAnimationFrame(() => target.focus?.({ preventScroll: true }));
    }
  };

  focus = () => {
    this.getFocusTarget().focus?.({ preventScroll: true });
  };

  scroll(event, direction) {
    event?.stopPropagation?.();
    const target = this.element.querySelector(".inspector-body") || this.element;
    const lineHeight = parseFloat(getComputedStyle(target).lineHeight) || 20;
    target.scrollTop += direction * lineHeight * 3;
  }
}

/** @babel */
/** @jsx React.createElement */

import { CompositeDisposable } from "atom";
import React from "react";
import { reactFactory } from "../../utils";
import OutputStore from "../../store/output";
import ResultViewComponent from "./result-view";
export default class ResultView {
  destroy = () => {
    const editor = atom.workspace.getActiveTextEditor();

    if (editor != null) {
      editor.element.focus();
    }

    this.disposer.dispose();
    this.marker.destroy();
  };

  constructor(markerStore, kernel, editor, row, showResult = true) {
    const element = document.createElement("div");
    element.classList.add("hydrogen-next", "marker");
    this.disposer = new CompositeDisposable();
    markerStore.clearOnRow(row);
    this.marker = editor.markBufferPosition([row, Infinity], {
      invalidate: "touch",
    });
    this.outputStore = new OutputStore();
    this.outputStore.updatePosition({
      lineLength: editor.element.pixelPositionForBufferPosition([row, Infinity])
        .left,
      lineHeight: editor.getLineHeightInPixels(),
      editorWidth: editor.element.getWidth(),
      charWidth: editor.getDefaultCharWidth(),
    });
    editor.decorateMarker(this.marker, {
      type: "block",
      item: element,
      position: "after",
    });
    this.marker.onDidChange((event) => {
      if (!event.isValid) {
        markerStore.delete(this.marker.id);
      } else {
        this.outputStore.updatePosition({
          lineLength: editor.element.pixelPositionForBufferPosition(
            this.marker.getStartBufferPosition()
          ).left,
          lineHeight: editor.getLineHeightInPixels(),
          editorWidth: editor.element.getWidth(),
          charWidth: editor.getDefaultCharWidth(),
        });
      }
    });
    markerStore.new(this);
    reactFactory(
      <ResultViewComponent
        store={this.outputStore}
        kernel={kernel}
        editor={editor}
        destroy={this.destroy}
        showResult={showResult}
      />,
      element,
      null,
      this.disposer
    );
  }
}

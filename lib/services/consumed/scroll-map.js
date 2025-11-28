/** @babel */

import { CompositeDisposable } from "atom";

// Throttle helper (same as scroll-map uses)
function throttle(func, timeout) {
  let timer = null;
  let pending = false;

  return (...args) => {
    if (timer) {
      pending = true;
      return;
    }
    func.apply(null, args);
    timer = setTimeout(() => {
      timer = null;
      if (pending) {
        pending = false;
        func.apply(null, args);
      }
    }, timeout);
  };
}

/**
 * Scroll Map Layer for Hydrogen breakpoints (cell markers).
 * Displays markers on the scroll bar for each cell boundary.
 */
class BreakpointLayer {
  constructor(editor) {
    this.editor = editor;
    this.items = [];
    this.clickHandlers = new Map();
    this.baseClass = "scroll-item hydrogen-layer";
    this.disposables = new CompositeDisposable();

    // Throttled update method (50ms like other layers)
    this.update = throttle(() => this.updateSync(), 50);

    // Listen for buffer changes to update breakpoints
    this.disposables.add(
      this.editor.onDidStopChanging(() => this.update())
    );
  }

  updateSync() {
    if (!this.editor.scrollmap) {
      return;
    }
    this.recalculate();
    this.prepareItems();
    // Trigger etch re-render - scroll-map stores etch reference on scrollmap
    try {
      const etch = require("etch");
      etch.update(this.editor.scrollmap);
    } catch (e) {
      // etch not available, scroll-map will handle render
    }
  }

  recalculate() {
    this.items = [];
    if (!this.editor.component) {
      return;
    }

    // Get breakpoints (cell boundaries) from hydrogen marker layer
    const buffer = this.editor.buffer;
    if (!buffer.hbpMarkerLayer) {
      return;
    }

    const markers = buffer.hbpMarkerLayer.getMarkers();
    for (const marker of markers) {
      const range = marker.getRange();
      this.items.push({
        row: this.editor.screenPositionForBufferPosition(range.start).row,
      });
    }
  }

  getClickHandler(row) {
    let handler = this.clickHandlers.get(row);
    if (!handler) {
      handler = {
        click: () =>
          this.editor.scrollToScreenPosition([row, 0], { center: true }),
      };
      this.clickHandlers.set(row, handler);
    }
    return handler;
  }

  prepareItems() {
    if (!this.editor.component) {
      return;
    }
    const editorHeight = this.editor.component.getScrollHeight();
    if (!editorHeight) {
      return;
    }
    for (const item of this.items) {
      const pixelPos = this.editor.component.pixelPositionAfterBlocksForRow(
        item.row
      );
      item.c = this.baseClass;
      item.s = `top:${(pixelPos / editorHeight) * 100}%`;
      item.o = this.getClickHandler(item.row);
    }
  }

  destroy() {
    this.items = [];
    this.clickHandlers.clear();
    this.disposables.dispose();
  }
}

export class ScrollMapConsumer {
  constructor() {
    this.scrollMapService = null;
  }

  consume(scrollMapService) {
    this.scrollMapService = scrollMapService;
    scrollMapService.registerLayer("hydrogen", BreakpointLayer);

    return {
      dispose: () => {
        scrollMapService.unregisterLayer("hydrogen");
        this.scrollMapService = null;
      },
    };
  }
}

const scrollMapConsumer = new ScrollMapConsumer();
export default scrollMapConsumer;

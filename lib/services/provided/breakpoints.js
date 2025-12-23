/** @babel */

import { Emitter } from "atom";
import { getBreakpoints } from "../../code-manager";

const emitter = new Emitter();

/**
 * Emit breakpoints update for an editor.
 * Called from main.js when cell markers are updated.
 * @param {TextEditor} editor - The text editor
 * @param {Array<Point>} breakpoints - The breakpoints from updateCellMarkers
 */
export function emitBreakpointsUpdate(editor, breakpoints) {
  emitter.emit("did-update", { editor, breakpoints });
}

/**
 * Provides breakpoints service for other packages (e.g., scroll-map).
 * Returns cell breakpoint positions for a given editor.
 */
export function provideBreakpoints() {
  return {
    /**
     * Get breakpoints (cell boundaries) for an editor.
     * @param {TextEditor} editor - The text editor
     * @returns {Array<Point>} Array of buffer positions where breakpoints are located
     */
    getBreakpoints(editor) {
      if (!editor || !editor.buffer) {
        return [];
      }
      // getBreakpoints returns positions including end of file, exclude the last one
      const breakpoints = getBreakpoints(editor);
      return breakpoints.slice(0, -1);
    },

    initBreakpoints(editor) {
      if (!atom.config.get("hydrogen-next.cellMarkers")) {
        return [];
      }
      return this.getBreakpoints(editor)
    },

    /**
     * Subscribe to breakpoints updates.
     * @param {Function} callback - Called when breakpoints may have changed
     * @returns {Disposable}
     */
    onDidUpdate(callback) {
      return emitter.on("did-update", callback);
    },
  };
}

/** @babel */

import { getBreakpoints } from "../../code-manager";

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
  };
}

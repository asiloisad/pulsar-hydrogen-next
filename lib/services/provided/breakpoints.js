/** @babel */

import { Emitter, CompositeDisposable } from "atom";
import { getBreakpoints } from "../../code-manager";

const emitter = new Emitter();
const editorSubscriptions = new Map();

/**
 * Provides breakpoints service for other packages (e.g., scroll-map).
 * Returns cell breakpoint positions for a given editor.
 */
export function provideBreakpoints() {
  const disposables = new CompositeDisposable();

  // Watch for editor changes to emit updates
  disposables.add(
    atom.workspace.observeTextEditors((editor) => {
      if (editorSubscriptions.has(editor)) {
        return;
      }
      const sub = editor.onDidStopChanging(() => {
        emitter.emit("did-update");
      });
      editorSubscriptions.set(editor, sub);
      disposables.add(
        editor.onDidDestroy(() => {
          editorSubscriptions.get(editor)?.dispose();
          editorSubscriptions.delete(editor);
        })
      );
    })
  );

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

/** @babel */
/** @jsx React.createElement */

import { Disposable, Point } from "atom";
import React from "react";
import { createRoot } from "react-dom/client";
import os from "os";
import path from "path";
import Config from "./config";
import store from "./store";

export const INSPECTOR_URI = "atom://hydrogen/inspector";

export const WATCHES_URI = "atom://hydrogen/watch-sidebar";

export const OUTPUT_AREA_URI = "atom://hydrogen/output-area";

export const KERNEL_MONITOR_URI = "atom://hydrogen/kernel-monitor";

export const VARIABLE_EXPLORER_URI = "atom://hydrogen/variable-explorer";

// Import execution time utilities from shared module
import {
  NO_EXECTIME_STRING,
  executionTime,
} from "./shared/execution-time";

export { NO_EXECTIME_STRING };

/**
 * Replace home directory in path with tilde (~)
 * Replacement for tildify-commonjs package
 */
export function tildify(absolutePath) {
  const homeDir = os.homedir();
  if (!absolutePath || !homeDir) {
    return absolutePath;
  }
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  const normalizedHome = homeDir.replace(/\\/g, "/");

  if (normalizedPath === normalizedHome) {
    return "~";
  }

  // Ensure home directory ends with separator for proper prefix matching
  const homeWithSep = normalizedHome.endsWith("/")
    ? normalizedHome
    : normalizedHome + "/";

  if (normalizedPath.startsWith(homeWithSep)) {
    return "~/" + normalizedPath.slice(homeWithSep.length);
  }

  return absolutePath;
}

export function reactFactory(
  reactElement,
  domElement,
  additionalTeardown,
  disposer = store.subscriptions
) {
  const root = createRoot(domElement);
  root.render(reactElement);
  const disposable = new Disposable(() => {
    root.unmount();
    if (typeof additionalTeardown === "function") {
      additionalTeardown();
    }
  });
  disposer.add(disposable);
}

export function focus(item) {
  if (item && typeof item === "object") {
    const editorPane = atom.workspace.paneForItem(item);
    if (editorPane) {
      editorPane.activate();
    }
  }
}

export async function openOrShowDock(URI) {
  // atom.workspace.open(URI) will activate/focus the dock by default
  // dock.toggle() or dock.show() will leave focus wherever it was
  // this function is basically workspace.open, except it
  // will not focus the newly opened pane
  let dock = atom.workspace.paneContainerForURI(URI);

  if (dock && typeof dock.show === "function") {
    // If the target item already exist, activate it and show dock
    const pane = atom.workspace.paneForURI(URI);
    if (pane) {
      pane.activateItemForURI(URI);
    }
    return dock.show();
  }

  await atom.workspace.open(URI, {
    searchAllPanes: true,
    activatePane: false,
  });
  dock = atom.workspace.paneContainerForURI(URI);
  return dock && typeof dock.show === "function" ? dock.show() : null;
}

export function grammarToLanguage(grammar) {
  if (!grammar) {
    return null;
  }
  const grammarLanguage = grammar.name.toLowerCase();
  const mappings = Config.getJson("languageMappings");

  const kernelLanguage = Object.keys(mappings).find(
    (key) => mappings[key].toLowerCase() === grammarLanguage
  );

  return kernelLanguage ? kernelLanguage.toLowerCase() : grammarLanguage;
}

// Import msgSpecToNotebookFormat from shared module
import { msgSpecToNotebookFormat } from "./shared/output-utils";

export { msgSpecToNotebookFormat };

const markupGrammars = new Set([
  "source.gfm",
  "source.asciidoc",
  "text.restructuredtext",
  "text.tex.latex.knitr",
  "text.md",
  "source.weave.noweb",
  "source.weave.md",
  "source.weave.latex",
  "source.weave.restructuredtext",
  "source.pweave.noweb",
  "source.pweave.md",
  "source.pweave.latex",
  "source.pweave.restructuredtext",
  "source.dyndoc.md.stata",
  "source.dyndoc.latex.stata",
]);

export function isMultilanguageGrammar(grammar) {
  return markupGrammars.has(grammar.scopeName);
}

export const isUnsavedFilePath = (filePath) => {
  return filePath.match(/Unsaved\sEditor\s\d+/) ? true : false;
};

export function kernelSpecProvidesGrammar(kernelSpec, grammar) {
  if (!grammar || !grammar.name || !kernelSpec || !kernelSpec.language) {
    return false;
  }

  const grammarLanguage = grammar.name.toLowerCase();
  const kernelLanguage = kernelSpec.language.toLowerCase();

  if (kernelLanguage === grammarLanguage) {
    return true;
  }

  const mappedLanguage = Config.getJson("languageMappings")[kernelLanguage];

  if (!mappedLanguage) {
    return false;
  }

  return mappedLanguage.toLowerCase() === grammarLanguage;
}

export function getEmbeddedScope(editor, position) {
  const scopes = editor
    .scopeDescriptorForBufferPosition(position)
    .getScopesArray();
  return scopes.find((s, i) => {
    return i > 0 ? s.indexOf("source.") === 0 : false;
  });
}

export function getEditorDirectory(editor) {
  if (!editor) {
    return os.homedir();
  }
  const editorPath = editor.getPath();
  return editorPath ? path.dirname(editorPath) : os.homedir();
}

export function log(...message) {
  if (atom.config.get("hydrogen-next.debug")) {
    console.log("hydrogen-next:", ...message);
  }
}

export function hotReloadPackage() {
  const packName = "hydrogen-next";
  const packPath = atom.packages.resolvePackagePath(packName);
  if (!packPath) {
    return;
  }
  const packPathPrefix = packPath + path.sep;
  const zeromqPathPrefix =
    path.join(packPath, "node_modules", "zeromq") + path.sep;
  log(`deactivating ${packName}`);
  atom.packages.deactivatePackage(packName);
  atom.packages.unloadPackage(packName);

  // Delete require cache to re-require on activation.
  // But except zeromq native module which is not re-requireable.
  const packageLibsExceptZeromq = (filePath) =>
    filePath.startsWith(packPathPrefix) &&
    !filePath.startsWith(zeromqPathPrefix);

  Object.keys(require.cache)
    .filter(packageLibsExceptZeromq)
    .forEach((filePath) => delete require.cache[filePath]);
  atom.packages.loadPackage(packName);
  atom.packages.activatePackage(packName);
  log(`activated ${packName}`);
}

export function rowRangeForCodeFoldAtBufferRow(editor, row) {
  // $FlowFixMe
  const range = editor.tokenizedBuffer.getFoldableRangeContainingPoint(
    new Point(row, Infinity),
    editor.getTabLength()
  );
  return range ? [range.start.row, range.end.row] : null;
}

export const EmptyMessage = () => {
  return (
    <ul className="background-message centered">
      <li>No output to display</li>
    </ul>
  );
};

export { executionTime };

/**
 * Convert JavaScript string index to character index, handling Unicode properly.
 * Uses Intl.Segmenter for proper grapheme cluster handling.
 *
 * @param {Number} js_idx - JavaScript string index (UTF-16 code units)
 * @param {String} text - The text string
 * @returns {Number} - Character index (grapheme clusters)
 */
export function js_idx_to_char_idx(js_idx, text) {
  if (text === null || js_idx < 0) {
    return -1;
  }

  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const segments = [...segmenter.segment(text)];

  // Find which grapheme the js_idx falls into
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    const endIndex = nextSegment?.index ?? text.length;

    if (js_idx >= segment.index && js_idx < endIndex) {
      return i;
    }
  }

  return segments.length;
}

/**
 * Convert character index to JavaScript string index, handling Unicode properly.
 * Uses Intl.Segmenter for proper grapheme cluster handling.
 *
 * @param {Number} char_idx - Character index (grapheme clusters)
 * @param {String} text - The text string
 * @returns {Number} - JavaScript string index (UTF-16 code units)
 */
export function char_idx_to_js_idx(char_idx, text) {
  if (text === null || char_idx < 0) {
    return -1;
  }

  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const segments = [...segmenter.segment(text)];

  // If char_idx exceeds the number of graphemes, return text length
  if (char_idx >= segments.length) {
    return text.length;
  }

  // Find the JS string index at the char_idx-th grapheme
  return segments[char_idx]?.index ?? text.length;
}

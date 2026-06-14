/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import { action, observable, makeObservable } from "mobx";
import { AnsiText } from "../ansi-utils";
import { DATA_EXPLORER_URI, openInCenter } from "../utils";
import dataExplorerStore from "../store/data-explorer-store";

/**
 * Sanitize HTML by removing script tags for security.
 * Note: The HTML comes from kernel output (_repr_html_), which is generally
 * trusted, but we still strip scripts to prevent XSS from untrusted data.
 */
function sanitizeHTML(html) {
  if (!html || typeof html !== "string") return "";
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

// Custom cell component for rendering special repr formats
const ReprCell = ({ repr }) => {
  if (!repr) return null;

  // Render Markdown repr (as plain text for now)
  if (repr.markdown) {
    return <div className="repr-markdown">{repr.markdown}</div>;
  }

  // Render HTML repr - sanitized to remove script tags
  if (repr.html) {
    return (
      <div dangerouslySetInnerHTML={{ __html: sanitizeHTML(repr.html) }} className="repr-html" />
    );
  }

  // Render PNG image
  if (repr.png) {
    return (
      <img
        src={`data:image/png;base64,${repr.png}`}
        alt="Variable representation"
        className="repr-image"
        style={{ maxWidth: "200px", maxHeight: "100px" }}
      />
    );
  }

  // Render JPEG image
  if (repr.jpeg) {
    return (
      <img
        src={`data:image/jpeg;base64,${repr.jpeg}`}
        alt="Variable representation"
        className="repr-image"
        style={{ maxWidth: "200px", maxHeight: "100px" }}
      />
    );
  }

  // Render pretty repr with ANSI colors
  if (repr.pretty) {
    return <AnsiText text={repr.pretty} />;
  }

  // Fallback to text repr with ANSI colors
  if (repr.text) {
    return <AnsiText text={repr.text} />;
  }

  return null;
};

// Editable cell component
@observer
class EditableCell extends React.Component {
  isEditing = false;
  editValue = "";

  constructor(props) {
    super(props);
    makeObservable(this, {
      isEditing: observable,
      editValue: observable,
      startEditing: action,
      stopEditing: action,
      handleChange: action,
    });
  }

  startEditing = () => {
    // Get current text representation
    const { repr } = this.props.value;
    const currentValue = repr.text || repr.pretty || "";
    this.editValue = currentValue;
    this.isEditing = true;
  };

  stopEditing = () => {
    this.isEditing = false;
  };

  handleChange = (e) => {
    this.editValue = e.target.value;
  };

  handleKeyDown = (e) => {
    if (e.key === "Enter") {
      this.handleSubmit();
    } else if (e.key === "Escape") {
      this.stopEditing();
    }
  };

  handleSubmit = () => {
    const { name, onEdit } = this.props;
    if (this.editValue !== "") {
      onEdit(name, this.editValue);
    }
    this.stopEditing();
  };

  handleBlur = () => {
    this.handleSubmit();
  };

  render() {
    const { value } = this.props;

    if (this.isEditing) {
      return (
        <input
          type="text"
          value={this.editValue}
          onChange={this.handleChange}
          onKeyDown={this.handleKeyDown}
          onBlur={this.handleBlur}
          autoFocus
          className="variable-editor"
        />
      );
    }

    return (
      <div
        onDoubleClick={this.startEditing}
        className="variable-value editable"
        title="Double-click to edit"
      >
        <ReprCell repr={value.repr} />
      </div>
    );
  }
}

// No longer using ReactTable - using standard HTML table

/**
 * Mini Atom TextEditor for the filter.
 * Filtering remains live; Escape clears the mini editor.
 */
class FilterEditor extends React.Component {
  containerRef = React.createRef();

  componentDidMount() {
    this.editor = atom.workspace.buildTextEditor({
      mini: true,
      placeholderText: "Filter by name...",
    });
    // Register with the text editor registry so it gets scopes / services,
    // matching the way editors are built elsewhere.
    this._registryDisposable = atom.textEditors.add(this.editor);
    if (this.props.value) {
      this.editor.setText(this.props.value);
    }
    this.containerRef.current.appendChild(this.editor.element);
    this._changeDisposable = this.editor.onDidChange(() => {
      this.props.onChange(this.editor.getText());
    });
    this._commands = atom.commands.add(this.editor.element, {
      "core:confirm": () => this.props.onChange(this.editor.getText()),
      "core:cancel": () => {
        this.editor.setText("");
        this.props.onChange("");
      },
    });
  }

  componentDidUpdate() {
    if (this.editor && this.editor.getText() !== this.props.value) {
      this.editor.setText(this.props.value || "");
    }
  }

  componentWillUnmount() {
    this._changeDisposable?.dispose();
    this._commands?.dispose();
    this._registryDisposable?.dispose();
    this.editor?.destroy();
  }

  render() {
    return <div className="filter-editor" ref={this.containerRef} />;
  }
}

@observer
class VariableExplorer extends React.Component {
  containerRef = React.createRef();

  handleEdit = (name, newValue) => {
    this.props.store.kernel.variableExplorerStore.editVariable(name, newValue);
  };

  handleFilterChange = (text) => {
    this.props.store.kernel.variableExplorerStore.setFilterText(text);
  };

  handleRefresh = () => {
    // Force refresh bypassing visibility check
    this.props.store.kernel.variableExplorerStore._doFetchVariables();
  };

  handleToggleAutoRefresh = () => {
    this.props.store.kernel.variableExplorerStore.toggleAutoRefresh();
  };

  handleExplore = (name) => {
    dataExplorerStore.load(this.props.store.kernel, name);
    openInCenter(DATA_EXPLORER_URI);
  };

  render() {
    const { store } = this.props;

    if (!store || !store.kernel) {
      return (
        <div className="sidebar variable-explorer" ref={this.containerRef}>
          <background-tips>
            <ul className="centered background-message">
              <li>No kernel running</li>
            </ul>
          </background-tips>
        </div>
      );
    }

    // Check if the kernel is Python
    const isPythonKernel =
      store.kernel.language && store.kernel.language.toLowerCase() === "python";

    if (!isPythonKernel) {
      return (
        <div className="sidebar variable-explorer" ref={this.containerRef}>
          <background-tips>
            <ul className="centered background-message">
              <li>The Variables panel only works with Python kernels</li>
              <li className="text-subtle">
                Current kernel: {store.kernel.displayName || store.kernel.language || "Unknown"}
              </li>
            </ul>
          </background-tips>
        </div>
      );
    }

    const variableStore = store.kernel.variableExplorerStore;
    const data = variableStore.filteredVariables;

    return (
      <div className="sidebar variable-explorer" ref={this.containerRef}>
        <div className="variable-explorer-controls">
          <div className="filter-container">
            <FilterEditor
              value={variableStore.filterText}
              onChange={this.handleFilterChange}
            />
          </div>
          <div className="btn-group">
            <label className="input-label">
              <input
                className="input-checkbox"
                type="checkbox"
                checked={variableStore.autoRefresh}
                onChange={this.handleToggleAutoRefresh}
              />
            </label>
            <button
              className="btn icon icon-repo-sync"
              onClick={this.handleRefresh}
              title="Refresh variables"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="variable-wrapper">
          <table className="variable-table">
            <thead>
              <tr className="variable-header">
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {data.map((variable, index) => (
                <tr key={variable.name} className="variable-row">
                  <td className="variable-name">
                    <a
                      className="variable-name-link"
                      onClick={() => this.handleExplore(variable.name)}
                      title="Open in Data Explorer"
                    >
                      {variable.name}
                    </a>
                  </td>
                  <td className="variable-type">{variable.type}</td>
                  <td className="variable-value-cell">
                    <EditableCell value={variable} name={variable.name} onEdit={this.handleEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}

VariableExplorer.displayName = "VariableExplorer";
export default VariableExplorer;

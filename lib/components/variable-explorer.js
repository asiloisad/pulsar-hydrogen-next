/** @babel */
/** @jsx React.createElement */

import React from "react"
import { observer } from "mobx-react"
import { action, observable } from "mobx"
import Anser from "anser"

// Custom cell component for rendering values with ANSI colors
const AnsiText = ({ text }) => {
    if (!text) return null

    const ansiHtml = Anser.ansiToHtml(text, {
        use_classes: true,
        escapeXML: true
    })

    return (
        <span
            dangerouslySetInnerHTML={{ __html: ansiHtml }}
            className="ansi-text"
        />
    )
}

// Custom cell component for rendering special repr formats
const ReprCell = ({ repr }) => {
    if (!repr) return null

    // Render Markdown repr (as plain text for now)
    if (repr.markdown) {
        return (
            <div className="repr-markdown">
                {repr.markdown}
            </div>
        )
    }

    // Render HTML repr
    if (repr.html) {
        return (
            <div
                dangerouslySetInnerHTML={{ __html: repr.html }}
                className="repr-html"
            />
        )
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
        )
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
        )
    }

    // Render pretty repr with ANSI colors
    if (repr.pretty) {
        return <AnsiText text={repr.pretty} />
    }

    // Fallback to text repr with ANSI colors
    if (repr.text) {
        return <AnsiText text={repr.text} />
    }

    return null
}

// Editable cell component
@observer
class EditableCell extends React.Component {
    @observable
    isEditing = false

    @observable
    editValue = ""

    @action
    startEditing = () => {
        // Get current text representation
        const { repr } = this.props.value
        const currentValue = repr.text || repr.pretty || ""
        this.editValue = currentValue
        this.isEditing = true
    }

    @action
    stopEditing = () => {
        this.isEditing = false
    }

    @action
    handleChange = (e) => {
        this.editValue = e.target.value
    }

    handleKeyDown = (e) => {
        if (e.key === "Enter") {
            this.handleSubmit()
        } else if (e.key === "Escape") {
            this.stopEditing()
        }
    }

    handleSubmit = () => {
        const { name, onEdit } = this.props
        if (this.editValue !== "") {
            onEdit(name, this.editValue)
        }
        this.stopEditing()
    }

    handleBlur = () => {
        this.handleSubmit()
    }

    render() {
        const { value } = this.props

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
            )
        }

        return (
            <div
                onDoubleClick={this.startEditing}
                className="variable-value editable"
                title="Double-click to edit"
            >
                <ReprCell repr={value.repr} />
            </div>
        )
    }
}

// No longer using ReactTable - using standard HTML table

const VariableExplorer = observer(({ store }) => {
    if (!store || !store.kernel) {
        return (
            <div className="sidebar variable-explorer">
                <ul className="background-message centered">
                    <li>No kernel running</li>
                </ul>
            </div>
        )
    }

    // Check if the kernel is Python
    const isPythonKernel = store.kernel.language &&
        store.kernel.language.toLowerCase() === "python"

    if (!isPythonKernel) {
        return (
            <div className="sidebar variable-explorer">
                <ul className="background-message centered">
                    <li>Variable Explorer only works with Python kernels</li>
                    <li className="text-subtle">Current kernel: {store.kernel.displayName || store.kernel.language || "Unknown"}</li>
                </ul>
            </div>
        )
    }

    const handleEdit = (name, newValue) => {
        store.kernel.variableExplorerStore.editVariable(name, newValue)
    }

    const handleFilterChange = (e) => {
        store.kernel.variableExplorerStore.setFilterText(e.target.value)
    }

    const handleRefresh = () => {
        store.kernel.variableExplorerStore.fetchVariables()
    }

    const handleToggleAutoRefresh = () => {
        store.kernel.variableExplorerStore.toggleAutoRefresh()
    }

    const variableStore = store.kernel.variableExplorerStore
    const data = variableStore.filteredVariables

    return (
        <div className="sidebar variable-explorer">
            <div className="variable-explorer-controls">
                <div className="filter-container">
                    <input
                        type="text"
                        className="input-text native-key-bindings filter-input"
                        placeholder="Filter by name..."
                        value={variableStore.filterText}
                        onChange={handleFilterChange}
                    />
                </div>
                <div className="btn-group">
                    <button
                        className={`btn icon icon-sync${variableStore.autoRefresh ? " selected" : ""
                            }`}
                        onClick={handleToggleAutoRefresh}
                        title="Toggle auto-refresh"
                    >
                        Auto-refresh
                    </button>
                </div>
                <div className="btn-group">
                    <button
                        className="btn icon icon-repo-sync"
                        onClick={handleRefresh}
                        title="Refresh variables"
                    >
                        Refresh
                    </button>
                </div>
            </div>
            <div className="variable-explorer-wrapper">
                <table className="variable-explorer-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((variable, index) => (
                            <tr key={variable.name}>
                                <td style={{ fontWeight: 'bold' }}>{variable.name}</td>
                                <td style={{ fontStyle: 'italic', color: 'var(--text-color-subtle)' }}>
                                    {variable.type}
                                </td>
                                <td>
                                    <EditableCell
                                        value={variable}
                                        name={variable.name}
                                        onEdit={handleEdit}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
})

VariableExplorer.displayName = "VariableExplorer"
export default VariableExplorer

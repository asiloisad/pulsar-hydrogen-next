/** @babel */
/** @jsx React.createElement */

import React from "react"
import ReactTable, { ReactTableDefaults } from "react-table"
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

// Set default properties for React-Table
Object.assign(ReactTableDefaults, {
    className: "variable-explorer",
    showPagination: false
})

Object.assign(ReactTableDefaults.column, {
    className: "table-cell",
    headerClassName: "table-header"
})

const VariableExplorer = observer(({ store }) => {
    console.log("Variable Explorer: Component rendering, store:", store)

    if (!store || !store.kernel) {
        console.log("Variable Explorer: No store or kernel")
        return (
            <div className="sidebar variable-explorer">
                <ul className="background-message centered">
                    <li>No kernel running</li>
                </ul>
            </div>
        )
    }

    console.log("Variable Explorer: Kernel found, variableExplorerStore:", store.kernel.variableExplorerStore)

    const handleEdit = (name, newValue) => {
        console.log("Variable Explorer: handleEdit called", name, newValue)
        store.kernel.variableExplorerStore.editVariable(name, newValue)
    }

    const handleFilterChange = (e) => {
        console.log("Variable Explorer: handleFilterChange called", e.target.value)
        store.kernel.variableExplorerStore.setFilterText(e.target.value)
    }

    const handleRefresh = () => {
        console.log("Variable Explorer: handleRefresh called")
        store.kernel.variableExplorerStore.fetchVariables()
    }

    const handleToggleAutoRefresh = () => {
        console.log("Variable Explorer: handleToggleAutoRefresh called")
        store.kernel.variableExplorerStore.toggleAutoRefresh()
    }

    const variableStore = store.kernel.variableExplorerStore
    const data = variableStore.filteredVariables

    console.log("Variable Explorer: Rendering with data:", data)

    const columns = [
        {
            Header: "Name",
            accessor: "name",
            maxWidth: 150,
            style: {
                textAlign: "left",
                fontWeight: "bold"
            }
        },
        {
            Header: "Type",
            accessor: "type",
            maxWidth: 100,
            style: {
                textAlign: "left",
                fontStyle: "italic",
                color: "var(--text-color-subtle)"
            }
        },
        {
            Header: "Value",
            id: "value",
            accessor: row => row,
            Cell: props => (
                <EditableCell
                    value={props.value}
                    name={props.value.name}
                    onEdit={handleEdit}
                />
            ),
            style: {
                textAlign: "left"
            }
        }
    ]

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
                    <button
                        className="btn icon icon-repo-sync"
                        onClick={handleRefresh}
                        title="Refresh variables"
                    >
                        Refresh
                    </button>
                </div>
            </div>
            {data.length > 0 ? (
                <ReactTable data={data} columns={columns} minRows={0} />
            ) : (
                <ul className="background-message centered">
                    <li>No variables to display</li>
                </ul>
            )}
        </div>
    )
})

VariableExplorer.displayName = "VariableExplorer"
export default VariableExplorer

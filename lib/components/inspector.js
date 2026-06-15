/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import { RichMedia, Media } from "./output";
import Markdown from "./result-view/markdown";

function Message({ children }) {
  return <div className="inspector-message">{children}</div>;
}

function clearExpressionOrAbortMultiCursor(editor, onChange, event) {
  if ((editor.getCursors?.().length || 0) > 1 || (editor.getSelections?.().length || 0) > 1) {
    event?.abortKeyBinding?.();
    return;
  }
  editor.setText("");
  onChange("");
}

class InspectorExpressionEditor extends React.Component {
  containerRef = React.createRef();

  componentDidMount() {
    this.editor = atom.workspace.buildTextEditor({
      softWrapped: true,
      lineNumberGutterVisible: false,
      placeholderText: "Expression to inspect",
    });
    this.editor.element.classList.add("inspector-expression");
    if (this.props.grammar) {
      atom.grammars.assignLanguageMode(this.editor.getBuffer(), this.props.grammar.scopeName);
    }
    if (this.props.value) {
      this.editor.setText(this.props.value);
    }
    this.containerRef.current.appendChild(this.editor.element);
    this._changeDisposable = this.editor.onDidChange(() => {
      this.props.onChange(this.editor.getText());
    });
    this._commands = atom.commands.add(this.editor.element, {
      "core:confirm": () => this.props.onConfirm(this.editor.getText()),
      "core:cancel": (event) =>
        clearExpressionOrAbortMultiCursor(this.editor, this.props.onChange, event),
      "hydrogen-next:inspector-focus-body": () => this.props.onFocusBody?.(),
    });
  }

  componentDidUpdate(prevProps) {
    if (this.editor && this.editor.getText() !== this.props.value) {
      this.editor.setText(this.props.value || "");
    }
    const scopeName = this.props.grammar?.scopeName;
    if (this.editor && scopeName && scopeName !== prevProps.grammar?.scopeName) {
      atom.grammars.assignLanguageMode(this.editor.getBuffer(), scopeName);
    }
  }

  componentWillUnmount() {
    this._changeDisposable?.dispose();
    this._commands?.dispose();
    this.editor?.destroy();
  }

  focus() {
    this.editor?.element?.focus();
  }

  render() {
    return <div className="inspector-expression-editor" ref={this.containerRef} />;
  }
}

const InspectorResult = observer(({ inspectorStore }) => {
  const bundle = inspectorStore.bundle;

  if (inspectorStore.loading) {
    return <Message>Loading...</Message>;
  }
  if (inspectorStore.error) {
    return (
      <Message>
        <span className="text-error">{inspectorStore.error}</span>
      </Message>
    );
  }
  if (!bundle) {
    return <Message>No inspection loaded.</Message>;
  }
  if (!bundle["text/html"] && !bundle["text/markdown"] && !bundle["text/plain"]) {
    return <Message>No inspection bundle.</Message>;
  }

  return (
    <div
      className="inspector-result native-key-bindings"
      tabIndex={-1}
      style={{
        fontSize: atom.config.get("hydrogen-next.outputAreaFontSize") || "inherit",
      }}
    >
      <RichMedia data={bundle}>
        <Media.HTML />
        <Markdown />
        <Media.Plain />
      </RichMedia>
    </div>
  );
});

@observer
class Inspector extends React.Component {
  expressionRef = React.createRef();
  bodyRef = React.createRef();

  componentDidMount() {
    this._commands = atom.commands.add(this.bodyRef.current, {
      "hydrogen-next:inspector-focus-expression": () => this.focusExpression(),
    });
  }

  componentWillUnmount() {
    this._commands?.dispose();
  }

  focusExpression = () => {
    this.expressionRef.current?.focus();
  };

  focusBody = () => {
    this.bodyRef.current?.focus({ preventScroll: true });
  };

  render() {
    const { inspectorStore } = this.props;
    return (
      <div className="inspector-panel">
        <div className="inspector-controls">
          <InspectorExpressionEditor
            ref={this.expressionRef}
            value={inspectorStore.expression}
            onChange={inspectorStore.setExpression}
            onConfirm={inspectorStore.loadExpression}
            grammar={inspectorStore.kernel && inspectorStore.kernel.grammar}
            onFocusBody={this.focusBody}
          />
        </div>
        <div className="inspector-body" ref={this.bodyRef} tabIndex={0}>
          <InspectorResult inspectorStore={inspectorStore} />
        </div>
      </div>
    );
  }
}

export default Inspector;

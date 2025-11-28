/** @babel */
/** @jsx React.createElement */

import React from "react";
import { observer } from "mobx-react";
import History from "../result-view/history";

const Watch = observer(({ store, onRemove }) => {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const editorContainer = containerRef.current.querySelector(".watch-editor-container");
    if (editorContainer && store.editor) {
      editorContainer.appendChild(store.editor.element);
    }
  }, [store.editor]);

  const handleRun = () => {
    if (!store.isWatching) {
      store.toggleWatching();
    } else {
      store.run();
    }
  };

  const handlePause = () => {
    if (store.isWatching) {
      store.toggleWatching();
    }
  };

  const handleClear = () => {
    store.outputStore.clear();
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove(store);
    }
  };

  return (
    <div className="hydrogen watch-view" ref={containerRef}>
      <div className="watch-toolbar">
        <button
          className="btn btn-xs icon icon-playback-play watch-run-btn"
          onClick={handleRun}
          title="Run watch"
          disabled={store.isWatching}
        />
        <button
          className="btn btn-xs icon icon-playback-pause watch-pause-btn"
          onClick={handlePause}
          title="Pause watching"
          disabled={!store.isWatching}
        />
        <button
          className="btn btn-xs icon icon-trashcan watch-clear-btn"
          onClick={handleClear}
          title="Clear output"
        />
        <button
          className="btn btn-xs icon icon-x watch-remove-btn"
          onClick={handleRemove}
          title="Remove watch"
        />
      </div>
      <div className="watch-editor-container" />
      <History store={store.outputStore} />
    </div>
  );
});

export default Watch;

/** @babel */
/** @jsx React.createElement */

import { CompositeDisposable } from "atom";
import React, { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import Display from "./display";

function RangeSlider({ outputStore }) {
  const {
    index: storeIndex,
    setIndex: setStoreIndex,
    incrementIndex,
    decrementIndex,
    outputs,
  } = outputStore;
  const sliderRef = useRef();
  useEffect(() => {
    const disposer = new CompositeDisposable();
    disposer.add(
      // $FlowFixMe
      // $FlowFixMe
      atom.commands.add(sliderRef.current, "core:move-left", () =>
        decrementIndex()
      ),
      atom.commands.add(sliderRef.current, "core:move-right", () =>
        incrementIndex()
      )
    );
    return () => disposer.dispose();
  }, []);

  function onIndexChange(e) {
    const newIndex = Number(e.target.value);
    setStoreIndex(newIndex);
  }

  return (
    <div className="slider" ref={sliderRef}>
      <div className="current-output">
        <span
          className="btn btn-xs icon icon-chevron-left"
          onClick={() => decrementIndex()}
        />
        <span>
          {storeIndex + 1}/{outputs.length}
        </span>
        <span
          className="btn btn-xs icon icon-chevron-right"
          onClick={() => incrementIndex()}
        />
      </div>
      <input
        className="input-range"
        max={outputs.length - 1}
        min="0"
        id="range-input"
        onChange={onIndexChange}
        type="range"
        value={storeIndex}
      />
    </div>
  );
}

const History = observer(({ store }) => {
  const output = store.outputs[store.index];
  return output ? (
    <div className="history output-area">
      <RangeSlider outputStore={store} />
      <div
        className="multiline-container native-key-bindings"
        tabIndex={-1}
        style={{
          fontSize:
            atom.config.get(`hydrogen-next.outputAreaFontSize`) || "inherit",
        }}
        hydrogen-wrapoutput={atom.config
          .get(`hydrogen-next.wrapOutput`)
          .toString()}
      >
        <Display output={output} />
      </div>
    </div>
  ) : null;
});
export default History;

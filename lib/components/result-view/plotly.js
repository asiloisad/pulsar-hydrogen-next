/** @babel */
/** @jsx React.createElement */

/**
 * Adapted from
 * https://github.com/nteract/nteract/blob/master/packages/transform-plotly/src/index.tsx
 * Copyright (c) 2016 - present, nteract contributors All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @NOTE: This `PlotlyTransform` component could be used exactly same as the original `PlotlyTransform` component of @nteract/transform-plotly,
 *        except that this file adds the ability to download a plot from an electron context.
 */
import cloneDeep from "lodash/cloneDeep";
import * as React from "react";

export class PlotlyTransform extends React.Component {
  static defaultProps = {
    data: "",
    mediaType: "application/vnd.plotly.v1+json",
  };

  constructor(props) {
    super(props);
    this.downloadImage = this.downloadImage.bind(this);
  }

  componentDidMount() {
    // Handle case of either string to be `JSON.parse`d or pure object
    const figure = this.getFigure();
    // Use plotly.js-dist for better 3D/WebGL support
    this.Plotly = require("plotly.js-dist");

    // Merge layout with paper_bgcolor transparent for 3D plot compatibility
    const layout = {
      ...figure.layout,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
    };

    this.Plotly.newPlot(this.plotDiv, figure.data, layout, {
      modeBarButtonsToRemove: ["toImage"],
      modeBarButtonsToAdd: [
        {
          name: "Download plot as a png",
          icon: this.Plotly.Icons.camera,
          click: this.downloadImage,
        },
      ],
    });
  }

  shouldComponentUpdate(nextProps) {
    return this.props.data !== nextProps.data;
  }

  componentDidUpdate() {
    const figure = this.getFigure();

    if (!this.plotDiv) {
      return;
    }

    const plotDiv = this.plotDiv;
    plotDiv.data = figure.data;
    plotDiv.layout = figure.layout;
    this.Plotly.redraw(plotDiv);
  }

  plotDivRef = (plotDiv) => {
    this.plotDiv = plotDiv;
  };
  getFigure = () => {
    const figure = this.props.data;

    if (typeof figure === "string") {
      return JSON.parse(figure);
    }

    // The Plotly API *mutates* the figure to include a UID, which means
    // they won't take our frozen objects
    if (Object.isFrozen(figure)) {
      return cloneDeep(figure);
    }

    const { data = {}, layout = {} } = figure;
    return {
      data,
      layout,
    };
  };
  downloadImage = (gd) => {
    this.Plotly.toImage(gd).then(function (dataUrl) {
      const electron = require("electron");

      electron.remote.getCurrentWebContents().downloadURL(dataUrl);
    });
  };

  render() {
    const { layout } = this.getFigure();
    const style = {
      width: "100%",
      minHeight: "400px",
    };

    if (layout && layout.width) {
      style.width = layout.width;
    }
    if (layout && layout.height) {
      style.height = layout.height;
      style.minHeight = layout.height;
    }

    return <div ref={this.plotDivRef} style={style} className="plotly-container" />;
  }
}
export default PlotlyTransform;

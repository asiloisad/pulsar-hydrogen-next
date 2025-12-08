/** @babel */
/** @jsx React.createElement */

/**
 * Adapted from
 * https://github.com/nteract/nteract/blob/master/packages/transform-vega/src/index.tsx
 * Copyright (c) 2016 - present, nteract contributors All rights reserved.
 */
import React from "react";
import { embed as embedVega } from "@nteract/any-vega";

/** Simple error display component */
const ErrorDisplay = ({ error }) => {
  if (!error) return null;
  return (
    <div
      style={{
        color: "#dc3545",
        backgroundColor: "#f8d7da",
        border: "1px solid #f5c6cb",
        borderRadius: "4px",
        padding: "8px 12px",
        margin: "4px 0",
        fontFamily: "monospace",
        fontSize: "12px",
      }}
    >
      {error.message || String(error)}
    </div>
  );
};

/** All the information. All of it. On Vega (Lite) media types, at least. */
export const MEDIA_TYPES = {
  "application/vnd.vega.v2+json": {
    kind: "vega",
    version: "2",
    vegaLevel: 2,
    mediaType: "application/vnd.vega.v2+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v2.json",
  },
  "application/vnd.vega.v3+json": {
    kind: "vega",
    version: "3",
    vegaLevel: 3,
    mediaType: "application/vnd.vega.v3+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v3.json",
  },
  "application/vnd.vega.v4+json": {
    kind: "vega",
    version: "4",
    vegaLevel: 4,
    mediaType: "application/vnd.vega.v4+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v4.json",
  },
  "application/vnd.vega.v5+json": {
    kind: "vega",
    version: "5",
    vegaLevel: 5,
    mediaType: "application/vnd.vega.v5+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v5.json",
  },
  "application/vnd.vegalite.v1+json": {
    kind: "vega-lite",
    version: "1",
    vegaLevel: 2,
    mediaType: "application/vnd.vegalite.v1+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v1.json",
  },
  "application/vnd.vegalite.v2+json": {
    kind: "vega-lite",
    version: "2",
    vegaLevel: 3,
    mediaType: "application/vnd.vegalite.v2+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v2.json",
  },
  "application/vnd.vegalite.v3+json": {
    kind: "vega-lite",
    version: "3",
    vegaLevel: 5,
    mediaType: "application/vnd.vegalite.v3+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v3.json",
  },
  "application/vnd.vegalite.v4+json": {
    kind: "vega-lite",
    version: "4",
    vegaLevel: 5,
    mediaType: "application/vnd.vegalite.v4+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v4.json",
  },
  "application/vnd.vegalite.v5+json": {
    kind: "vega-lite",
    version: "5",
    vegaLevel: 6,
    mediaType: "application/vnd.vegalite.v5+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v5.json",
  },
};

/** Call the external library to do the embedding. */
export async function embed(anchor, mediaType, spec, options = {}) {
  const version = MEDIA_TYPES[mediaType];
  const defaults = {
    actions: false,
    mode: version.kind,
  };
  const embedThisVega = await embedVega(version);
  return embedThisVega(anchor, spec, { ...options, ...defaults });
}

/** React component embedding a certain Vega(-Lite) media type. */
export class VegaEmbed extends React.Component {
  constructor(props) {
    super(props);
    this.anchorRef = React.createRef();
  }

  render() {
    return (
      <div>
        <ErrorDisplay error={this.embedError} />
        <div ref={this.anchorRef} />
      </div>
    );
  }

  async callEmbedder() {
    if (this.anchorRef.current === null) {
      return;
    }

    try {
      this.embedResult = await embed(
        this.anchorRef.current,
        this.props.mediaType,
        this.props.spec,
        this.props.options
      );
      this.props.resultHandler?.(this.embedResult);
    } catch (error) {
      this.props.errorHandler?.(error);
      this.embedError = error;
      this.forceUpdate();
    }
  }

  shouldComponentUpdate(nextProps) {
    if (this.props.spec !== nextProps.spec) {
      this.embedError = undefined;
      return true;
    } else {
      return false;
    }
  }

  componentDidMount() {
    this.callEmbedder().catch((error) => {
      console.error("VegaEmbed: Failed to embed:", error);
    });
  }

  componentDidUpdate() {
    if (!this.embedError) {
      this.callEmbedder().catch((error) => {
        console.error("VegaEmbed: Failed to embed:", error);
      });
    }
  }

  componentWillUnmount() {
    if (this.embedResult) {
      if (this.embedResult.finalize) {
        this.embedResult.finalize();
      } else if (this.embedResult.view?.finalize) {
        this.embedResult.view.finalize();
      }

      this.embedResult = undefined;
    }
  }
}

export const Vega = (mediaType) => {
  const embed = ({ data, options, onResult, onError }) => (
    <VegaEmbed
      mediaType={mediaType}
      spec={data}
      options={options}
      resultHandler={onResult}
      errorHandler={onError}
    />
  );

  embed.defaultProps = {
    mediaType,
  };
  embed.MIMETYPE = mediaType;

  return embed;
};

export const Vega2 = Vega("application/vnd.vega.v2+json");
export const Vega3 = Vega("application/vnd.vega.v3+json");
export const Vega4 = Vega("application/vnd.vega.v4+json");
export const Vega5 = Vega("application/vnd.vega.v5+json");
export const VegaLite1 = Vega("application/vnd.vegalite.v1+json");
export const VegaLite2 = Vega("application/vnd.vegalite.v2+json");
export const VegaLite3 = Vega("application/vnd.vegalite.v3+json");
export const VegaLite4 = Vega("application/vnd.vegalite.v4+json");
export const VegaLite5 = Vega("application/vnd.vegalite.v5+json");

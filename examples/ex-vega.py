# Vega and Vega-Lite direct spec examples
# No external dependencies required - uses IPython display

# %% Vega-Lite 5 - Simple Bar Chart
from IPython.display import display

vegalite_spec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "A simple bar chart",
    "data": {
        "values": [
            {"category": "A", "value": 28},
            {"category": "B", "value": 55},
            {"category": "C", "value": 43},
            {"category": "D", "value": 91},
            {"category": "E", "value": 81},
        ]
    },
    "mark": "bar",
    "encoding": {
        "x": {"field": "category", "type": "nominal"},
        "y": {"field": "value", "type": "quantitative"},
        "color": {"field": "category", "type": "nominal"}
    }
}

display({"application/vnd.vegalite.v5+json": vegalite_spec}, raw=True)

# %% Vega-Lite 5 - Line Chart
line_spec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "A line chart with points",
    "data": {
        "values": [
            {"x": 0, "y": 0},
            {"x": 1, "y": 2},
            {"x": 2, "y": 1},
            {"x": 3, "y": 4},
            {"x": 4, "y": 3},
            {"x": 5, "y": 6},
        ]
    },
    "mark": {"type": "line", "point": True},
    "encoding": {
        "x": {"field": "x", "type": "quantitative"},
        "y": {"field": "y", "type": "quantitative"}
    }
}

display({"application/vnd.vegalite.v5+json": line_spec}, raw=True)

# %% Vega 5 - Arc/Pie Chart
vega_spec = {
    "$schema": "https://vega.github.io/schema/vega/v5.json",
    "description": "A basic pie chart",
    "width": 200,
    "height": 200,
    "autosize": "none",
    "signals": [
        {"name": "startAngle", "value": 0},
        {"name": "endAngle", "value": 6.29},
        {"name": "padAngle", "value": 0.02},
        {"name": "innerRadius", "value": 0},
        {"name": "sort", "value": True}
    ],
    "data": [
        {
            "name": "table",
            "values": [
                {"id": 1, "field": 4},
                {"id": 2, "field": 6},
                {"id": 3, "field": 10},
                {"id": 4, "field": 3},
                {"id": 5, "field": 7}
            ],
            "transform": [
                {
                    "type": "pie",
                    "field": "field",
                    "startAngle": {"signal": "startAngle"},
                    "endAngle": {"signal": "endAngle"},
                    "sort": {"signal": "sort"}
                }
            ]
        }
    ],
    "scales": [
        {
            "name": "color",
            "type": "ordinal",
            "domain": {"data": "table", "field": "id"},
            "range": {"scheme": "category20"}
        }
    ],
    "marks": [
        {
            "type": "arc",
            "from": {"data": "table"},
            "encode": {
                "enter": {
                    "fill": {"scale": "color", "field": "id"},
                    "x": {"signal": "width / 2"},
                    "y": {"signal": "height / 2"}
                },
                "update": {
                    "startAngle": {"field": "startAngle"},
                    "endAngle": {"field": "endAngle"},
                    "padAngle": {"signal": "padAngle"},
                    "innerRadius": {"signal": "innerRadius"},
                    "outerRadius": {"signal": "width / 2"}
                }
            }
        }
    ]
}

display({"application/vnd.vega.v5+json": vega_spec}, raw=True)

# %% Vega-Lite 5 - Scatter Plot with Tooltips
scatter_spec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "Scatter plot with tooltips",
    "data": {
        "values": [
            {"x": 1, "y": 2, "label": "Point A"},
            {"x": 2, "y": 5, "label": "Point B"},
            {"x": 3, "y": 3, "label": "Point C"},
            {"x": 4, "y": 8, "label": "Point D"},
            {"x": 5, "y": 6, "label": "Point E"},
        ]
    },
    "mark": {"type": "circle", "size": 100},
    "encoding": {
        "x": {"field": "x", "type": "quantitative", "title": "X Axis"},
        "y": {"field": "y", "type": "quantitative", "title": "Y Axis"},
        "color": {"field": "label", "type": "nominal"},
        "tooltip": [
            {"field": "label", "type": "nominal"},
            {"field": "x", "type": "quantitative"},
            {"field": "y", "type": "quantitative"}
        ]
    }
}

display({"application/vnd.vegalite.v5+json": scatter_spec}, raw=True)

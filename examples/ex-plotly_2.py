# on Windows: open the shell as admin then: `pip install plotly nbformat`
# on Unix: `sudo pip install plotly nbformat`
# You might need to reload Atom after installation of dependencies if they are not found

import plotly.io as pio
pio.renderers
pio.renderers.default = 'sphinx_gallery'

import plotly.graph_objects as go
import pandas as pd

# Read data from a csv
z_data = pd.read_csv('https://raw.githubusercontent.com/plotly/datasets/master/api_docs/mt_bruno_elevation.csv')

fig = go.Figure(data=go.Surface(z=z_data, showscale=False))
fig.update_layout(
    title=dict(text='Mt Bruno Elevation'),
    width=400, height=400,
    margin=dict(t=40, r=0, l=20, b=20)
)

name = 'default'
# Default parameters which are used when `layout.scene.camera` is not provided
camera = dict(
    up=dict(x=0, y=0, z=1),
    center=dict(x=0, y=0, z=0),
    eye=dict(x=1.25, y=1.25, z=1.25)
)

fig.update_layout(scene_camera=camera, title=name)
fig

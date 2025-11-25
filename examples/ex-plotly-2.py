# on Windows: open the shell as admin then: `pip install plotly nbformat`
# on Unix: `sudo pip install plotly nbformat`
# You might need to reload Pulsar after installation of dependencies if they are not found

# 3D Surface plot example using plotly.graph_objects
import plotly.graph_objects as go
import pandas as pd

# Read data from a csv
z_data = pd.read_csv('https://raw.githubusercontent.com/plotly/datasets/master/api_docs/mt_bruno_elevation.csv')

fig = go.Figure(data=go.Surface(z=z_data, showscale=False))
fig.update_layout(
    title='Mt Bruno Elevation',
    width=500, height=500,
    margin=dict(t=40, r=0, l=20, b=20)
)

# Camera settings
camera = dict(
    up=dict(x=0, y=0, z=1),
    center=dict(x=0, y=0, z=0),
    eye=dict(x=1.25, y=1.25, z=1.25)
)
fig.update_layout(scene_camera=camera)

# For Hydrogen compatibility, display the figure using IPython display
# which outputs the native application/vnd.plotly.v1+json MIME type
from IPython.display import display
display(fig)

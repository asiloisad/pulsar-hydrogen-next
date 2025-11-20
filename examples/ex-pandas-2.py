# on Windows: open the shell as admin then: `pip install pandas`
# on Unix: `sudo pip install pandas`
# You might need to reload Pulsar after installation of dependencies if they are not found

import pandas as pd

pd.options.display.html.table_schema = True
pd.options.display.max_rows = None

iris_url = "https://archive.ics.uci.edu/ml/machine-learning-databases/iris/iris.data"

df1 = pd.read_csv(iris_url)

df1

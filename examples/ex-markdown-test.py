# %% Test Markdown Output
# Run this cell to test markdown rendering

from IPython.display import display, Markdown

# Test basic markdown
display(Markdown("""
# Heading 1
## Heading 2
### Heading 3

**Bold text** and *italic text*

- List item 1
- List item 2
- List item 3

1. Numbered item
2. Numbered item

`inline code`

```python
def hello():
    print("code block")
```

> Blockquote text

[Link text](https://example.com)

---

| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
"""))

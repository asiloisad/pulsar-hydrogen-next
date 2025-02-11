# Running code inside markdown

Put your cursor inside the following code-block and then run the code using `CTRL+Enter`

```py
print("Hello from Python")
a = 1
```

There is second part.

```py
print(f"Memory is shared between cells: a={a}")
```

Another grammar & kernel can be used.

```js
console.log("Hello from JS")
console.log(`Memory do not share between kernels: a=${a}`)
```

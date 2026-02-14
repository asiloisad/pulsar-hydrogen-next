module.exports = {
  root: true,
  extends: "eslint:recommended",
  env: { es2022: true, browser: true, node: true },
  globals: { atom: "readonly" },
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  ignorePatterns: [
    "lib/components/output-area.js",
    "lib/components/result-view/display.js",
    "lib/components/result-view/list.js",
    "lib/components/result-view/result-view.js",
    "lib/components/variable-explorer.js",
    "lib/services/consumed/status-bar/status-bar-component.js",
  ],
  rules: {
    "no-unused-vars": "off",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-constant-condition": ["error", { checkLoops: false }],
  },
};

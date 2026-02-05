module.exports = {
  root: true,
  extends: ["eslint:recommended"],
  ignorePatterns: [
    "lib/components/output-area.js",
    "lib/components/result-view/display.js",
    "lib/components/result-view/list.js",
    "lib/components/result-view/result-view.js",
    "lib/components/variable-explorer.js",
    "lib/services/consumed/status-bar/status-bar-component.js",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  globals: {
    atom: "readonly",
    requestAnimationFrame: "readonly",
    WeakRef: "readonly",
  },
  rules: {
    "no-cond-assign": "off",
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^(etch|[A-Z][a-z])" }],
  },
};

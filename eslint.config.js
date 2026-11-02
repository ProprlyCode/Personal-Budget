// Lints the inline <script> in index.html plus the Node test/tooling files.
const js = require("@eslint/js");
const globals = require("globals");
const html = require("eslint-plugin-html");

module.exports = [
  { ignores: ["node_modules/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  {
    files: ["**/*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, Chart: "readonly", firebase: "readonly" }
    },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    // code inside page.evaluate() runs in the browser
    files: ["e2e/**/*.js"],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    files: ["tests/**/*.js", "e2e/**/*.js", "rules-tests/**/*.js", "scripts/**/*.js", "*.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }] }
  }
];

import js from "@eslint/js";
import solid from "eslint-plugin-solid/configs/typescript";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "public",
      "src/api/schema.d.ts",
      "playwright-report",
      "test-results",
      "prototype_v10_6.html",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    ...solid,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json" },
      globals: { ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "solid/reactivity": "warn",
      "solid/no-innerhtml": "error",
    },
  },
  {
    files: ["*.js", "scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
);

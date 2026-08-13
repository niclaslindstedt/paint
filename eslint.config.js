import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    // Build output and dependencies are out of scope for the linter.
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    // Node tooling scripts (icon generation, SEO checks) and agent-skill
    // helpers. These run under Node, so expose its globals rather than the
    // browser's.
    files: ["scripts/**/*.mjs", ".agent/skills/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
  },
  {
    files: [
      "src/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "vite.config.ts",
      "vitest.config.ts",
      "pwa-plugin.ts",
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TypeScript checks for undefined identifiers itself; the core rule
      // only produces false positives for DOM/Web globals.
      "no-undef": "off",
      // Defer to the TS-aware rule, which also honours the `_`-prefix
      // convention for intentionally unused parameters.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      // Rules that arrived enabled-by-default in the ESLint 10 /
      // eslint-plugin-react-hooks 7 majors; they fire on deliberate, working
      // patterns. Mirrors the framework's own configuration.
      "no-useless-assignment": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "skills/**", "references/**"],
  },
  {
    files: ["extensions/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-unreachable": "warn",
      "no-duplicate-case": "error",
      "no-constant-condition": "warn",
      "no-empty": "warn",
    },
  },
];

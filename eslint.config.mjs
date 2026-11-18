// Flat-config typescript-eslint, type-aware, the way Pomade and pomade-kit lint: hand-picked rules
// for silent bug classes (floating/misused promises, unused bindings, exhaustive switches,
// duplicate imports), React hooks rules on the UI, Playwright's missing-await family on the e2e
// specs. No style rules. `npm run lint` fails on any warning.
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const tsconfigRootDir = import.meta.dirname;

const baseHygieneRules = {
  "no-var": "error",
  "prefer-const": "error",
  "prefer-rest-params": "error",
  "prefer-spread": "error",
  "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
};

const typeAwareRules = {
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true },
  ],
  "@typescript-eslint/no-explicit-any": "error",
};

function typeAware(project) {
  return {
    languageOptions: { parser: tseslint.parser, parserOptions: { project, tsconfigRootDir } },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: { ...baseHygieneRules, ...typeAwareRules },
  };
}

export default tseslint.config(
  { ignores: [".claude/**", "dist/**", "test-results/**", "playwright-report/**", "**/*.d.ts"] },
  tseslint.configs.base,
  { name: "pomade-planner/config", files: ["eslint.config.mjs"], rules: baseHygieneRules },
  {
    name: "pomade-planner/app",
    files: ["src/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
    ...typeAware(["tsconfig.json"]),
    plugins: { "@typescript-eslint": tseslint.plugin, "react-hooks": reactHooks },
    rules: {
      ...baseHygieneRules,
      ...typeAwareRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    name: "pomade-planner/tooling",
    files: ["*.ts", "scripts/**/*.mjs", "fake-host/**/*.ts", "test/**/*.ts", "cli/**/*.ts"],
    ...typeAware(["tsconfig.node.json"]),
  },
  {
    name: "pomade-planner/e2e",
    files: ["e2e/**/*.ts"],
    ...typeAware(["tsconfig.node.json"]),
    plugins: { "@typescript-eslint": tseslint.plugin, playwright },
    rules: {
      ...baseHygieneRules,
      ...typeAwareRules,
      ...playwright.configs["flat/recommended"].rules,
      // The specs' own assertion helpers (`expect…` functions) count as assertions.
      "playwright/expect-expect": ["warn", { assertFunctionPatterns: ["^expect[A-Z]"] }],
    },
  },
);

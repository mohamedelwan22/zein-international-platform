import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-application directories (vendor skills, spec-kit artifacts, generated code):
    ".agents/**",
    ".opencode/**",
    ".specify/**",
    ".kilo/**",
    ".kiro/**",
    "specs/**",
    "docs/**",
    "checklists/**",
    "src/generated/**",
  ]),
]);

export default eslintConfig;

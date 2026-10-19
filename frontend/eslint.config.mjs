import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Coding standards: functions of at most 20 lines and 3 parameters.
const MAX_FUNCTION_LINES = 20;
const MAX_PARAMS = 3;

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", MAX_PARAMS],
      "import/no-default-export": "error",
      "no-console": "error",
    },
  },
  {
    // The viewer shows only image/* files of the job, from a blob: URL of the private download;
    // next/image cannot load blob: URLs, so a plain <img> is the only way to show them.
    files: ["src/features/job/documents/FileViewer.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // Favicons come from arbitrary remote hosts; next/image would fetch them through the Next server.
    files: ["src/features/sources/SourceIcon.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // Next.js resolves route files by their default export.
    files: ["app/**/{page,layout,not-found}.tsx"],
    rules: { "import/no-default-export": "off" },
  },
  globalIgnores([".next/**", "next-env.d.ts", "test-results/**", "playwright-report/**"]),
]);

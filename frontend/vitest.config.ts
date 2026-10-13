import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Date helpers format in the host zone; pinning it here (before workers start) keeps every
// date assertion independent of where the suite runs. Playwright pins the same zone.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    // src/config.ts validates this at import time, exactly like the browser bundle does.
    env: { NEXT_PUBLIC_API_URL: "http://api.test" },
    restoreMocks: true,
    unstubGlobals: true,
  },
});

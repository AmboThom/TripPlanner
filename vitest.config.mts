import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// The project declares the "@/" path alias in tsconfig.json. Next resolves it on
// its own; Vitest needs it stated here so route handlers can be imported under test.
// Named .mts so Vite loads it as ESM rather than warning about CJS.
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, ".") } },
});

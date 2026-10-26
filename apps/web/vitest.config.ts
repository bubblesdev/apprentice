import { defineConfig } from "vitest/config";

/** Logic tests only (view models, client, formatting); no DOM or Vite plugins needed. */
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });

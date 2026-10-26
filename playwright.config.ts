import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end: the real API (fake Meta adapters, the recorded PS1 guide, every check passing) and
 * the built PWA, driven on a phone-sized Chromium with a fake camera and microphone.
 * Run `pnpm build` first, then `pnpm e2e`. No key, no credits, no database.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:4174",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  webServer: [
    {
      command: "node dist/main.js",
      cwd: "apps/api",
      url: "http://localhost:8788/health",
      env: {
        PORT: "8788",
        CORS_ORIGIN: "http://localhost:4174",
        APPRENTICE_ADAPTERS: "fake",
        APPRENTICE_FAKE_JUDGE: "pass",
        MEDIA_STORE: "memory",
      },
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec vite build --mode e2e && pnpm exec vite preview --port 4174 --strictPort",
      cwd: "apps/web",
      url: "http://localhost:4174",
      env: { VITE_API_URL: "http://localhost:8788" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

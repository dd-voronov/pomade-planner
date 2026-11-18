import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Serves the fake-host harness page (fake-host/index.html). The apps it hosts are served on their
// own origins — each app's dev server or a preview of its build — as Pomade serves them on
// pomade-app://. The harness is told where: `__APP_URLS__`, from $FAKE_HOST_PLANNER_URL and
// $FAKE_HOST_BOARD_URL (default: the dev servers' ports, vite.config.ts). $FAKE_HOST_PORT moves
// the harness's own dev server.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    __APP_URLS__: JSON.stringify({
      planner: process.env.FAKE_HOST_PLANNER_URL ?? "http://localhost:5317/",
      board: process.env.FAKE_HOST_BOARD_URL ?? "http://localhost:5319/",
    }),
  },
  server: { port: Number(process.env.FAKE_HOST_PORT ?? 5318), strictPort: true },
});

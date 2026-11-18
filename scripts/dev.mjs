// `npm run dev` — both apps' dev servers, each on its own port (vite.config.ts), for Pomade's
// dev links: a link is the server's URL, whose /manifest.json Pomade fetches.
//
// `npm run dev:fake` (`--fake`) — the same servers plus the fake-host harness (fake-host/) on a
// third origin, so the apps run without Pomade against the fixture workspace (test/fixtures/) with
// hot reload. Open the printed URL; the harness's nav bar switches between the apps' surfaces.

import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const repo = fileURLToPath(new URL("..", import.meta.url));
const fake = process.argv.includes("--fake");

/** @param {import("vite").InlineConfig} config */
async function serve(config) {
  const server = await createServer(config);
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("dev: a dev server did not report its URL");
  return { server, url };
}

const planner = await serve({ configFile: `${repo}vite.config.ts`, mode: "planner" });
const board = await serve({ configFile: `${repo}vite.config.ts`, mode: "board" });
const servers = [planner.server, board.server];

if (fake) {
  const harness = await serve({
    configFile: `${repo}fake-host/vite.config.ts`,
    define: { __APP_URLS__: JSON.stringify({ planner: planner.url, board: board.url }) },
  });
  servers.push(harness.server);
  const open = new URL(harness.url);
  open.searchParams.set("app", board.url);
  open.searchParams.set("surface", "tab");
  open.searchParams.set("icon", "board");
  console.log(`\n  Planner and Board on the fake host: ${open.href}\n`);
} else {
  console.log(`\n  Planner: ${planner.url}   pomade apps link ${planner.url.replace(/\/$/, "")}`);
  console.log(`  Board:   ${board.url}   pomade apps link ${board.url.replace(/\/$/, "")}\n`);
}

const stop = async () => {
  await Promise.all(servers.map((server) => server.close()));
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

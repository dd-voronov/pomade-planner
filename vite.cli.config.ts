import { defineConfig } from "vite";

// The `pomade-planner` command (cli/main.ts) as one self-contained ES module in the Planner's app
// folder, dist/planner/cli/main.mjs: pomade-kit and js-yaml inlined, only Node's built-ins left as
// imports — an installed app folder (<userData>/apps/pomade-planner/) has no node_modules. Built
// after the Planner's UI into the same folder.
export default defineConfig({
  build: {
    ssr: "cli/main.ts",
    outDir: "dist/planner/cli",
    emptyOutDir: false,
    copyPublicDir: false,
    target: "node20",
    minify: false,
    rollupOptions: { output: { format: "es", entryFileNames: "main.mjs" } },
  },
  ssr: { target: "node", noExternal: true },
});

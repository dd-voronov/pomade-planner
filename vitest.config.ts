import { defineConfig } from "vitest/config";

// The Planner's day rules are tested on Daniil's clock: Europe/Madrid, with its DST changes. Set
// before the test workers start, so every worker runs in it.
process.env.TZ = "Europe/Madrid";

// Unit tests: pure logic next to its code (src/**/*.test.ts) and repo-level checks (test/).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});

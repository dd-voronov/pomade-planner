import { defineConfig } from "vitest/config";

// The Planner's day rules are tested in one fixed zone with DST changes: Europe/Madrid. Set
// before the test workers start, so every worker runs in it.
process.env.TZ = "Europe/Madrid";

// Unit tests: pure logic next to its code (src/**/*.test.ts) and repo-level checks (test/).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});

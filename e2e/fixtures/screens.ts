// Screenshots of every surface, for a person to look at: $SCREENSHOT_DIR, default
// test-results/screens/ (gitignored).

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Page } from "@playwright/test";

const DIR = resolve(process.env.SCREENSHOT_DIR ?? "test-results/screens");

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: join(DIR, `${name}.png`) });
}

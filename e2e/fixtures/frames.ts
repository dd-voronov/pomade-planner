// Waiting for a frame Pomade has just shown.

import type { Page } from "@playwright/test";

/**
 * Wait until a frame Pomade has just shown — a panel's icon pressed, a hidden tab brought back —
 * takes pointer input. An app frame is an out-of-process iframe: it takes input only after the
 * window has drawn it, 2 animation frames for a tab and up to 5 for a panel, and a click sent
 * earlier is dropped, not queued (HOST-API §5 "Hosting behavior", `pomade:T-239`). `page` is
 * Pomade's window; the frames counted are its own.
 */
export async function frameShown(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const next = (): void => {
          if (++frames === 5) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
}

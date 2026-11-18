// Board helpers shared by the fake-host and real-Pomade specs: locators by ticket and column, a
// pointer drag that works across the app's iframe, and the bytes a drop must leave in a file.

import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

import { frameShown } from "./frames";

export const card = (app: FrameLocator, id: string): Locator => app.locator(`[data-testid="card"][data-id="${id}"]`);
export const column = (app: FrameLocator, status: string): Locator => app.locator(`[data-testid="column"][data-status="${status}"]`);
export const cardsIn = (app: FrameLocator, status: string): Locator => column(app, status).getByTestId("card");

/** The IDs of a column's cards, top to bottom. */
export async function idsIn(app: FrameLocator, status: string): Promise<string[]> {
  return cardsIn(app, status).evaluateAll((els) => els.map((el) => el.getAttribute("data-id") ?? ""));
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("drag: element has no box");
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 60) };
}

/**
 * Drag `source` onto `target` with the mouse (page coordinates, so it works inside the iframe). `during`
 * runs while the card is held over the target — to look at the board mid-drag, or to change the file.
 */
export async function drag(page: Page, source: Locator, target: Locator, during?: () => Promise<void>): Promise<void> {
  // A frame Pomade has just shown again takes the pointer only once the window has drawn it.
  await source.hover();
  await frameShown(page);
  const from = await centre(source);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 4, { steps: 3 });
  const to = await centre(target);
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.move(to.x + 1, to.y + 1);
  if (during) await during();
  await page.mouse.up();
  // dnd-kit swallows every click for 50 ms after a drag ends (a drop is not a click); let that pass,
  // as a person's next click would.
  await page.evaluate(() => new Promise((done) => setTimeout(done, 60)));
}

/** The local calendar day, `YYYY-MM-DD` — what a drop writes into `updated:`. */
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `before` with only the `status:` and `updated:` lines replaced — every other byte as it was. */
export function withStatus(before: string, status: string, updated = today()): string {
  const after = before.replace(/^status: .*$/m, `status: ${status}`).replace(/^updated: .*$/m, `updated: ${updated}`);
  expect(after).not.toBe(before);
  return after;
}

/**
 * `before` with only the named frontmatter lines changed — a value replaces the key's line, `null`
 * removes it — and `updated:` set to today; every other byte as it was.
 */
export function withFields(before: string, changes: Record<string, string | null>, updated = today()): string {
  let after = before;
  for (const [key, value] of Object.entries(changes)) {
    const line = new RegExp(`^${key}: .*\\n`, "m");
    expect(after).toMatch(line);
    after = after.replace(line, value === null ? "" : `${key}: ${value}\n`);
  }
  after = after.replace(/^updated: .*$/m, `updated: ${updated}`);
  expect(after).not.toBe(before);
  return after;
}

/** The text of a ticket the Board creates (DESIGN §4.4), spelled out — not computed by the app's code. */
export function createdTicket(t: {
  id: string;
  kind: "problem" | "epic" | "task" | "signal";
  title: string;
  /** The `title:` value as YAML when it must be quoted. */
  titleYaml?: string;
  status: string;
  priority?: string;
  parent?: string;
  source?: string;
}): string {
  const day = today();
  const priority = t.priority ?? "P2";
  const source = t.source ?? "daniil";
  const parent = t.parent === undefined ? [] : [`${t.kind === "task" ? "epic" : "problem"}: ${t.parent}`];
  const head = [`id: ${t.id}`, `kind: ${t.kind}`, `title: ${t.titleYaml ?? t.title}`, `status: ${t.status}`];
  const fields =
    t.kind === "signal"
      ? [...head, `priority: ${priority}`, `source: ${source}`, ...parent, `created: ${day}`, `updated: ${day}`]
      : [...head, "type: feature", `priority: ${priority}`, ...parent, `created: ${day}`, `updated: ${day}`, `source: ${source}`];
  const sections = { problem: ["Problem", "Outcome"], epic: ["Goal", "Scope", "Acceptance"], task: ["Goal", "Acceptance"], signal: [] }[t.kind];
  return `---\n${fields.join("\n")}\n---\n\n# ${t.id} — ${t.title}\n${sections.map((s) => `\n## ${s}\n`).join("")}`;
}

/** An element's box; throws when it has none (not rendered). */
export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box: the element is not rendered");
  return box;
}

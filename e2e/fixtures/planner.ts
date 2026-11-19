// Planner helpers shared by the fake-host and real-Pomade specs: the app's clock (the `test.clock`
// hook, src/planner/clock.ts), rows by title, and the bytes a tick or a quick add must leave.

import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

/**
 * Set the Planner's clock — in every frame of the app — to a local wall-clock time
 * (`2026-11-18T01:30`), read in the frame's own time zone. `null` gives the Mac's clock back. A
 * Planner view in `frame` is then waited for until it has settled that day's daily note (made it
 * and read it, or found it made), so nothing moves under the next click.
 */
export async function setClock(frame: FrameLocator, local: string | null, boundaryHour = 3): Promise<void> {
  await frame.locator("html").evaluate(async (_, at) => {
    const hook = (window as Window & { __plannerTest?: { setClock(ms: number | null): Promise<void> } }).__plannerTest;
    if (!hook) throw new Error("the Planner's test hook is not installed yet");
    await hook.setClock(at === null ? null : new Date(at).getTime());
  }, local);
  if (local !== null && (await frame.locator("main[data-daily]").count()) > 0) await settled(frame, plannerDayOf(local, boundaryHour));
}

/** The planner day of a local wall-clock time (`2026-11-18T01:30` → `2026-11-17` with the 3:00 boundary). */
export function plannerDayOf(local: string, boundaryHour = 3): string {
  const d = new Date(local);
  if (d.getHours() < boundaryHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Wait until the Planner view in `frame` has settled `day`'s daily note (any day when absent). */
export async function settled(frame: FrameLocator, day?: string): Promise<void> {
  await expect(frame.locator(day === undefined ? 'main[data-daily]:not([data-daily="pending"])' : `main[data-daily="${day}"]`)).toHaveCount(1);
}

/** The overlay the app opened itself (`overlay.open`), as the kit's `mountApp` mounts it in the fake-host harness. */
export const overlay = (page: Page): FrameLocator => page.frameLocator('iframe[data-surface="overlay"]');

/** Click the Planner panel's + in `app` and wait for quick add's overlay, its title focused. */
export async function openQuickAdd(page: Page, app: FrameLocator): Promise<FrameLocator> {
  await app.getByTestId("planner-add").click();
  const o = overlay(page);
  await expect(o.getByTestId("qa-title")).toBeFocused();
  return o;
}

/** Click the Planner tab's + in `app` and wait for the add form at the foot of its list, the title focused. */
export async function openAddForm(app: FrameLocator): Promise<Locator> {
  await app.getByTestId("planner-add").click();
  await expect(app.getByTestId("qa-title")).toBeFocused();
  return app.getByTestId("add-form");
}

export const row = (app: FrameLocator, title: string): Locator => app.locator('[data-testid="task-row"]').filter({ has: app.getByTestId("task-title").getByText(title, { exact: true }) });

/** The titles of the visible list's rows, top to bottom. */
export function titles(app: FrameLocator): Promise<string[]> {
  return app.locator('[data-testid="task-row"] [data-testid="task-title"]').allTextContents();
}

/** `before` with `status:` set and `done-on:` appended at the end of the block (a tick) — every other byte as it was. */
export function ticked(before: string, day: string): string {
  const after = before.replace(/^status: open$/m, "status: done").replace(/\n---\n/, `\ndone-on: ${day}\n---\n`);
  expect(after).not.toBe(before);
  return after;
}

/** The text the add form writes for a task (DESIGN §3.7), spelled out — not computed by the app's code. */
export function quickAdded(t: { title: string; doOn?: string; deadline?: string; importance?: number; created: string; body?: string }): string {
  const lines = ["type: task", `title: ${t.title}`, "status: open"];
  if (t.doOn !== undefined) lines.push(`do-on: ${t.doOn}`);
  if (t.deadline !== undefined) lines.push(`deadline: ${t.deadline}`);
  if (t.importance !== undefined) lines.push(`importance: ${t.importance}`);
  lines.push(`created: ${t.created}`);
  return `---\n${lines.join("\n")}\n---\n${t.body ?? ""}`;
}

/**
 * `before` after done or skip on a recurring item (DESIGN §3.4), spelled out: `do-on: <from>`
 * becomes `do-on: <to>` and `entry` is the newest `## Log` line — right under the heading when the
 * section is there, else a new section at the end of the body after one blank line. Every other
 * byte as it was.
 */
export function logged(before: string, change: { doOn: [string, string]; entry: string }): string {
  const [from, to] = change.doOn;
  let after = before.replace(`\ndo-on: ${from}\n`, `\ndo-on: ${to}\n`);
  expect(after).not.toBe(before);
  const body = after.slice(after.indexOf("\n---\n", 4) + 5);
  if (after.includes("\n## Log\n") || after.startsWith("## Log\n", after.length - body.length)) after = after.replace("## Log\n", `## Log\n${change.entry}\n`);
  else if (body === "") after = `${after}\n## Log\n${change.entry}\n`;
  else after = `${after}${body.endsWith("\n\n") ? "" : "\n"}## Log\n${change.entry}\n`;
  return after;
}

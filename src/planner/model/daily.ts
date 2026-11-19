// Daily notes ([[daily-notes]]): one `type: daily-note` file per planner day, `<tasks root>/Daily/
// <YYYY-MM-DD>.md`, made from the template set in the settings (or the built-in one).
//
// - **When:** the first time the Planner's launch panel frame runs on a planner day — at Pomade's
//   start, or when the day boundary passes while it runs. Only that day's note, and only when its file isn't
//   there: a day the Planner didn't run on never gets one, a note deleted later that day isn't made
//   again, and nothing is made for a day before the last one it ran on. The day the Planner last ran on is machine-local app state (`DAILY_DAY_KEY`); the
//   Host API's file create is the guard when several frames run at once (a taken path is someone
//   else's note — success).
// - **Text:** the template with the app's `type: daily-note` and `date:` first in its frontmatter;
//   the template's other keys follow in their order, with their bytes (its own `type`/`date` give
//   way), then its body as it is. A template without frontmatter gets the app's block over its
//   text. A template that is missing, unreadable or has frontmatter that can't be parsed gives the
//   built-in note instead — never a failed day — and the settings page says why.

import { removeField, splitFrontmatter } from "pomade-kit/frontmatter";
import { joinPath, readFrontmatter } from "pomade-kit/protocol";
import { weekdayOf, type LocalDate } from "pomade-kit/schedule";

import { DAILY_FOLDER, FIELD } from "./items";

/** The machine-local state key holding the planner day the Planner last ran on (and made that day's note). */
export const DAILY_DAY_KEY = "planner.dailyNoteDay";

export const dailyNoteName = (day: LocalDate): string => `${day}.md`;

/** `<root>/Daily/<day>.md`. */
export const dailyNotePath = (root: string, day: LocalDate): string => joinPath(joinPath(root, DAILY_FOLDER), dailyNoteName(day));

/**
 * Whether a frame running on `day` makes that day's note: only on a day after the last one the
 * Planner ran on (`lastDay`, from the app state; `null` before the first run). A day boundary moved
 * later, which takes the planner back to yesterday, makes nothing. The file create itself says
 * whether the note was there already. Never a day other than `day` — no back-fill.
 */
export function shouldCreateDailyNote(day: LocalDate, lastDay: string | null): boolean {
  return lastDay === null || day > lastDay;
}

const WEEKDAYS: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Tuesday, November 10, 2026" — the built-in note's heading. */
export function longDayName(day: LocalDate): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(day)] ?? ""}, ${MONTHS[(m ?? 1) - 1] ?? ""} ${d ?? ""}, ${y ?? ""}`;
}

const appBlock = (day: LocalDate): string => `${FIELD.type}: daily-note\n${FIELD.date}: ${day}\n`;

/** The built-in daily note: the app's frontmatter, a date heading and an empty checklist. */
export function builtInDailyNote(day: LocalDate): string {
  return `---\n${appBlock(day)}---\n# ${longDayName(day)}\n\n- [ ]\n`;
}

export type TemplateRead =
  /** No template is set. */
  | { kind: "none" }
  | { kind: "text"; text: string }
  /** Set, but it couldn't be read; `reason` in a few words ("it isn't there"). */
  | { kind: "error"; reason: string };

export interface DailyNoteText {
  text: string;
  /** Why the template wasn't used, when one is set and it wasn't; `null` otherwise. */
  problem: string | null;
}

/** The day's note from the template ([[daily-notes]] "Template"). */
export function dailyNoteText(day: LocalDate, template: TemplateRead): DailyNoteText {
  if (template.kind === "none") return { text: builtInDailyNote(day), problem: null };
  if (template.kind === "error") return { text: builtInDailyNote(day), problem: template.reason };
  const text = template.text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if ("frontmatterError" in readFrontmatter(text)) return { text: builtInDailyNote(day), problem: "its frontmatter can't be read" };
  let rest = text;
  for (const key of [FIELD.type, FIELD.date]) {
    const removed = removeField(rest, key);
    if (!removed.ok) return { text: builtInDailyNote(day), problem: "its frontmatter can't be read" };
    rest = removed.text;
  }
  const { frontmatter, body } = splitFrontmatter(rest);
  if (frontmatter === "") return { text: `---\n${appBlock(day)}---\n${rest}`, problem: null };
  // The block's lines between its fences, then whatever blank lines followed it.
  const lines = frontmatter.split("\n");
  const close = lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---");
  const inner = lines.slice(1, close).map((l) => `${l}\n`).join("");
  const after = lines.slice(close + 1).join("\n");
  return { text: `---\n${appBlock(day)}${inner}---\n${after}${body}`, problem: null };
}

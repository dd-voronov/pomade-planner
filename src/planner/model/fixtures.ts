import type { Task } from "./items";
import { readRepeat } from "./recurring";

/** A task with every field unset except the ones given. */
export function task(fields: Partial<Task> = {}): Task {
  const title = fields.title ?? "Task";
  return {
    path: `Tasks/${title.toLowerCase().replace(/\W+/g, "-")}.md`,
    name: `${title.toLowerCase().replace(/\W+/g, "-")}.md`,
    folder: null,
    type: "task",
    title,
    titled: true,
    done: false,
    archived: false,
    date: null,
    doOn: null,
    deadline: null,
    importance: null,
    created: null,
    doneOn: null,
    problems: [],
    mtimeMs: 1,
    repeat: null,
    lastLog: null,
    progress: null,
    excerpt: null,
    ...fields,
  };
}

/** A recurring item with `repeat:` as read from frontmatter, and the other fields given. */
export function recurring(repeat: unknown, fields: Partial<Task> = {}): Task {
  return task({ type: "recurring", repeat: readRepeat(repeat), ...fields });
}

/** A local wall-clock instant (the tests run in Europe/Madrid): `at("2026-11-17 01:30")`. */
export function at(local: string): Date {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)(?::(\d\d)(?:\.(\d{3}))?)?$/.exec(local);
  if (!m) throw new Error(`at: ${local}`);
  const [, y, mo, d, h, mi, s, ms] = m.map(Number) as number[];
  return new Date(y!, mo! - 1, d!, h!, mi!, Number.isNaN(s) ? 0 : s!, Number.isNaN(ms) ? 0 : ms!);
}

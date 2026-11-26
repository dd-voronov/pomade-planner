// Synthetic backlogs in Pomade's convention (process/backlog "One item = one file"), for the fake host,
// dev:fake and the real-Pomade specs. Paths are relative to the backlog folder. Never a real
// workspace.

export interface TicketSpec {
  id: string;
  kind: "problem" | "epic" | "task" | "signal";
  title: string;
  status: string;
  priority?: string;
  /** `problem:` of an epic or signal, `epic:` of a task. */
  parent?: string;
  /** The file sits in `done/`. */
  inDone?: boolean;
  /** `reporter:` — a handle, or `claude`. */
  reporter?: string;
}

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function ticketPath(spec: TicketSpec): string {
  return `${spec.inDone ? "done/" : ""}${spec.id}-${slug(spec.title)}.md`;
}

/**
 * A ticket file shaped like Pomade's own: a quoted title, a comment line inside the block, keys in
 * the convention's order, and a body — so a field-only write has bytes around it to leave alone.
 */
export function ticketFile(spec: TicketSpec): string {
  const parentKey = spec.kind === "task" ? "epic" : "problem";
  const lines = [
    "---",
    `id: ${spec.id}`,
    `kind: ${spec.kind}`,
    `title: "${spec.title}"`,
    `status: ${spec.status}`,
    "type: feature",
    ...(spec.priority ? [`priority: ${spec.priority}`] : []),
    "# module and seams as in the convention",
    "module: board",
    ...(spec.parent ? [`${parentKey}: ${spec.parent}`] : []),
    "created: 2026-11-09",
    "updated: 2026-11-10",
    ...(spec.reporter ? [`reporter: ${spec.reporter}`] : []),
    "source: session-2026-11-09",
    "---",
    "",
    `# ${spec.id} — ${spec.title}`,
    "",
    "## Goal",
    "",
    "Synthetic ticket for the Board's tests.",
    "",
  ];
  return lines.join("\n");
}

/** The tickets of the sample backlog. */
export const SAMPLE_TICKETS: readonly TicketSpec[] = [
  { id: "P-001", kind: "problem", title: "Slow start", status: "planned", priority: "P1", reporter: "d.voronov" },
  { id: "P-002", kind: "problem", title: "Flaky sync", status: "grooming", priority: "P0", reporter: "claude" },
  { id: "P-003", kind: "problem", title: "Too many clicks to find a ticket", status: "backlog", priority: "P2" },
  { id: "P-004", kind: "problem", title: "Search is weak", status: "delivering", priority: "P1", reporter: "d.voronov" },
  { id: "P-005", kind: "problem", title: "Old request from the first round", status: "review", priority: "P2", reporter: "d.voronov" },
  { id: "P-006", kind: "problem", title: "Resolved long ago", status: "done", priority: "P3" },
  { id: "P-007", kind: "problem", title: "Not a problem after all", status: "dropped" },
  { id: "P-008", kind: "problem", title: "Wait for the platform", status: "parked", priority: "P2" },
  { id: "P-009", kind: "problem", title: "Settings are hard to find", status: "reviewed", priority: "P2", reporter: "d.voronov" },
  { id: "E-001", kind: "epic", title: "Fast start", status: "in-progress", priority: "P1", parent: "P-001", reporter: "d.voronov" },
  { id: "E-002", kind: "epic", title: "Sync rewrite", status: "planned", priority: "P0", parent: "P-002", reporter: "claude" },
  { id: "E-017", kind: "epic", title: "Icon picker redesign", status: "review", priority: "P1", parent: "P-003", reporter: "d.voronov" },
  { id: "E-004", kind: "epic", title: "Abandoned idea", status: "dropped", priority: "P3" },
  { id: "E-005", kind: "epic", title: "Waiting for the dashboard", status: "parked", priority: "P2" },
  { id: "E-003", kind: "epic", title: "Settings in one place", status: "reviewed", priority: "P2", parent: "P-009", reporter: "claude" },
  { id: "E-000", kind: "epic", title: "Repository setup", status: "done", priority: "P1", inDone: true },
  { id: "T-001", kind: "task", title: "Cache the index", status: "in-progress", priority: "P1", parent: "E-001", reporter: "claude" },
  { id: "T-002", kind: "task", title: "Lazy-load the panels", status: "planned", priority: "P2", parent: "E-001", reporter: "d.voronov" },
  { id: "T-003", kind: "task", title: "Fix a typo in the README", status: "backlog", priority: "P3" },
  { id: "T-004", kind: "task", title: "Conflict resolution UI", status: "planned", priority: "P1", parent: "E-002", reporter: "d.voronov" },
  { id: "T-000", kind: "task", title: "Set up the repository", status: "done", priority: "P2", parent: "E-000", inDone: true },
  { id: "T-005", kind: "task", title: "Status nobody knows", status: "wip", priority: "P2", parent: "E-001" },
  { id: "T-006", kind: "task", title: "Move the reporter setting", status: "reviewed", priority: "P3", parent: "E-003", reporter: "claude" },
  { id: "S-001", kind: "signal", title: "Cmd+click opened random files", status: "new", reporter: "d.voronov" },
];

/**
 * E-002's acceptance backlog: Solutions with `E-017`, the highest task ID only in `done/` (`T-041`,
 * so the next task is `T-042`), problems to pick as parents, epics and a problem in review, and no
 * signals.
 */
export const DELTA_TICKETS: readonly TicketSpec[] = [
  { id: "P-011", kind: "problem", title: "Hard to see what waits for review", status: "planned", priority: "P1", reporter: "d.voronov" },
  { id: "P-012", kind: "problem", title: "Board edits are slow", status: "grooming", priority: "P2" },
  { id: "P-013", kind: "problem", title: "Release notes are stale", status: "review", priority: "P2" },
  { id: "E-016", kind: "epic", title: "Old board", status: "done", priority: "P2", parent: "P-012", inDone: true },
  { id: "E-017", kind: "epic", title: "Icon picker redesign", status: "in-progress", priority: "P1", parent: "P-012" },
  { id: "E-018", kind: "epic", title: "Faster sync", status: "review", priority: "P0", parent: "P-011", reporter: "claude" },
  { id: "T-004", kind: "task", title: "Draw the icons", status: "planned", priority: "P2", parent: "E-017", reporter: "d.voronov" },
  { id: "T-041", kind: "task", title: "Verify T-040", status: "done", priority: "P3", parent: "E-016", inDone: true },
];

export function deltaBacklog(): Record<string, string> {
  return Object.fromEntries(DELTA_TICKETS.map((spec) => [ticketPath(spec), ticketFile(spec)]));
}

/** A ticket-named file whose frontmatter is not valid YAML. */
export const BROKEN_TICKET = { path: "T-999-broken.md", content: '---\nid: T-999\nkind: task\ntitle: [unclosed\nstatus: planned\n---\n\nBroken on purpose.\n' };

/** The sample backlog's files: the tickets, an unreadable ticket, and files that are not tickets. */
export function sampleBacklog(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const spec of SAMPLE_TICKETS) files[ticketPath(spec)] = ticketFile(spec);
  files[BROKEN_TICKET.path] = BROKEN_TICKET.content;
  files["BACKLOG.md"] = "# Backlog\n\nThe index; not a ticket.\n";
  files["PLAN.md"] = "---\ntitle: Plan\n---\n\nA hand-made list; not a ticket.\n";
  return files;
}

const STATUSES = {
  problem: ["backlog", "grooming", "planned", "delivering", "review", "reviewed", "done", "dropped", "parked"],
  epic: ["planned", "in-progress", "review", "reviewed", "done", "dropped", "parked"],
  task: ["backlog", "planned", "in-progress", "review", "reviewed", "done", "dropped"],
} as const;

/** A large backlog: `count` tickets spread over every kind and status, done epics and tasks in `done/`. */
export function scaleBacklog(count: number): Record<string, string> {
  const files: Record<string, string> = {};
  const kinds = ["problem", "epic", "task", "task"] as const;
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length] ?? "task";
    const statuses = STATUSES[kind];
    const status = statuses[Math.floor(i / kinds.length) % statuses.length] ?? "planned";
    const n = String(i + 1).padStart(3, "0");
    const letter = kind === "problem" ? "P" : kind === "epic" ? "E" : "T";
    const spec: TicketSpec = {
      id: `${letter}-${n}`,
      kind,
      title: `Scale ${kind} ${n} with a title long enough to wrap onto a second line`,
      status,
      priority: `P${i % 4}`,
      inDone: status === "done" && kind !== "problem",
    };
    if (kind === "task" && i % 3 !== 0) spec.parent = `E-${String(((i >> 2) << 2) + 2).padStart(3, "0")}`;
    files[ticketPath(spec)] = ticketFile(spec);
  }
  return files;
}

/** `files` placed under `folder` (workspace- or project-relative). */
export function under(folder: string, files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, content]) => [`${folder}/${path}`, content]));
}

// A synthetic workspace for the fake host: projects with frontmatter backlogs and a tasks folder.
// `npm run dev:fake` and the fake-host e2e serve it; it never touches a real workspace.
//
// - Alpha: the sample backlog in docs/roadmap/ (every kind and status, done/, an unreadable
//   ticket, a ticket with an unknown status, a signal, BACKLOG.md).
// - Beta: no docs/roadmap/ — its tickets are in tickets/, so the Board asks for the folder.
// - Gamma: its backlog folder chosen as plans/ (a per-project setting).
// - Scale: 300 tickets.
// - Delta: E-002's acceptance backlog (the highest task ID only in done/, no signals).
// - Tasks/: a Planner tasks root (PLANNER_TASKS) dated around Tue 2026-11-17 — every Today reason,
//   ticked and done tasks, later and undated ones, an unreadable task, a note the Planner ignores.
//   No settings file: the Planner starts at its onboarding unless the harness's `tasks` sets it.
//
// PLANNER_WORKSPACE (the harness's `fixture=planner`): the Planner with projects — nested groups,
// two projects named QuizLab, project folders in Tasks/ (Pomade/, QuizLab/, and one no project
// owns), no project-id → folder map yet; and Chores/, a second tasks root of recurring items
// (RECURRING_TASKS) dated around Wed 2026-12-02 — every state a recurring item can be in.
//
// NOTES_FILES (the harness's `extra=notes`, over either workspace): notes and thoughts in Tasks/
// and Tasks/QuizLab/, a resolved thought, two earlier daily notes in Tasks/Daily/, an archived
// note in Tasks/_archive/, and a daily-note template with eight checklist lines in Templates/.

import type { FakeHostOptions } from "pomade-kit/fake-host";

import { deltaBacklog, sampleBacklog, scaleBacklog, ticketFile, under } from "./backlog";

const task = (title: string, extra = "", status = "open"): string => `---\ntype: task\ntitle: ${title}\nstatus: ${status}\n${extra}created: 2026-11-09\n---\n`;

/** The planner day the Tasks/ fixture is dated around (a Tuesday). */
export const PLANNER_FIXTURE_DAY = "2026-11-17";

/** The tasks root of the fixture, by file name. */
export const PLANNER_TASKS: Record<string, string> = {
  "2026-11-09-buy-printer-ink.md": task("Buy printer ink", "do-on: 2026-11-09\n"),
  "2026-11-01-pay-the-tax.md": task("Pay the tax", "deadline: 2026-11-14\nimportance: 5\n"),
  "2026-11-10-renew-swimming-class.md": task("Renew Nora's swimming class", "deadline: 2026-11-17\n"),
  "2026-11-15-call-the-dentist.md": task("Call the dentist", "do-on: 2026-11-16\ndeadline: 2026-11-20\n"),
  "2026-11-16-book-flights.md": task("Book flights for the Christmas trip to see the grandparents in Valencia", "do-on: 2026-11-17\nimportance: 2\n"),
  "2026-11-16-water-plants.md": task("Water the plants", "do-on: 2026-11-17\ndone-on: 2026-11-17\n", "done"),
  "2026-11-05-return-parcel.md": task("Return the parcel", "do-on: 2026-11-08\ndone-on: 2026-11-10\n", "done"),
  "2026-11-12-plan-holidays.md": task("Plan the holidays", "do-on: 2026-11-25\n"),
  "2026-11-12-learn-piano.md": task("Learn a piano piece"),
  "2026-11-13-broken.md": "---\ntype: task\ntitle: [unclosed\n---\n",
  "reading-list.md": "---\ntitle: Reading list\n---\n- a book\n",
};

export const FIXTURE_WORKSPACE = {
  groups: [{ id: "build", name: "Building tools" }],
  projects: [
    { id: "alpha", name: "Alpha", root: "Projects/alpha", group: "build" },
    { id: "beta", name: "Beta", root: "Projects/beta" },
    { id: "gamma", name: "Gamma", root: "Projects/gamma", group: "build", settings: { backlogPath: "plans" } },
    { id: "scale", name: "Scale", root: "Projects/scale" },
    { id: "delta", name: "Delta", root: "Projects/delta", group: "build" },
  ],
  activeProject: "alpha",
  files: {
    ...under("Projects/alpha/docs/roadmap", sampleBacklog()),
    "Projects/beta/README.md": "# Beta\n",
    "Projects/beta/tickets/E-010-beta-epic.md": ticketFile({ id: "E-010", kind: "epic", title: "Beta epic", status: "planned", priority: "P1" }),
    "Projects/gamma/plans/P-001-gamma.md": ticketFile({ id: "P-001", kind: "problem", title: "Gamma problem", status: "review", priority: "P0" }),
    ...under("Projects/scale/docs/roadmap", scaleBacklog(300)),
    ...under("Projects/delta/docs/roadmap", deltaBacklog()),
    ...Object.fromEntries(Object.entries(PLANNER_TASKS).map(([name, text]) => [`Tasks/${name}`, text])),
  },
} satisfies FakeHostOptions;

/** Project items of PLANNER_WORKSPACE, by path under Tasks/. */
export const PROJECT_TASKS: Record<string, string> = {
  "Pomade/2026-11-15-review-the-host-api.md": task("Review the Host API", "deadline: 2026-11-16\n"),
  "Pomade/2026-11-16-ship-the-planner.md": task("Ship the planner", "do-on: 2026-11-17\nimportance: 3\n"),
  "Pomade/2026-11-16-write-release-notes.md": task("Write release notes", "do-on: 2026-11-24\n"),
  "QuizLab/2026-11-14-fix-the-score-screen.md": task("Fix the score screen", "do-on: 2026-11-15\n"),
  "QuizLab/2026-11-14-add-dark-mode.md": task("Add dark mode"),
  "QuizLab/2026-11-14-broken.md": "---\ntype: task\ntitle: [oops\n---\n",
  "Old stuff/2026-11-01-sort-the-attic.md": task("Sort the attic", "deadline: 2026-11-17\n"),
};

/** The planner day the Chores/ fixture is dated around (a Wednesday). */
export const RECURRING_FIXTURE_DAY = "2026-12-02";

const chore = (title: string, doOn: string | null, repeat: string, body = ""): string =>
  `---\ntype: recurring\ntitle: ${title}\nstatus: open\n${doOn === null ? "" : `do-on: ${doOn}\n`}repeat:\n${repeat}created: 2026-01-01\n---\n${body}`;

/** Recurring items of PLANNER_WORKSPACE, by path under Chores/. */
export const RECURRING_TASKS: Record<string, string> = {
  "2026-01-01-upload-invoices.md": chore(
    "Upload invoices",
    "2026-12-05",
    "  monthly: { days: [5] }\n  lead-days: 3\n",
    "Upload all invoices to the accountant's portal.\n\n## Log\n- 2026-11-04 done\n- 2026-10-05 skipped\n",
  ),
  "2026-01-01-pay-the-rent.md": chore("Pay the rent", "2026-11-01", "  monthly: { days: [1] }\n"),
  "2026-01-01-change-toothbrush.md": chore("Change toothbrush", "2026-11-09", "  after-completion: { months: 3 }\n", "## Log\n- 2026-08-09 done\n"),
  "2026-01-01-water-the-plants.md": chore("Water the plants", "2026-12-02", "  weekly: { days: [wed] }\n"),
  "2026-01-01-plan-the-week.md": chore("Plan the week", "2026-12-07", "  weekly: { days: [mon] }\n  lead-days: 7\n"),
  "2026-01-01-check-smoke-alarms.md": chore("Check the smoke alarms", "2026-12-15", "  monthly: { days: [15] }\n", "## Log\n- 2026-11-15 done\n"),
  "2026-01-01-gym-membership.md": chore("Pay the gym", "2026-12-10", "  monthly: { days: [10] }\n  end: 2026-11-30\n"),
  "2026-01-01-take-vitamins.md": chore("Take vitamins", "2026-12-02", "  weekly: { days: [fry] }\n"),
  "Pomade/2026-01-01-renew-the-certificate.md": chore("Renew the certificate", "2026-12-03", "  monthly: { days: [3] }\n  lead-days: 2\n"),
};

export const PLANNER_WORKSPACE = {
  groups: [
    { id: "build", name: "Building tools" },
    { id: "tools", name: "Tools", parent: "build" },
    { id: "archive", name: "Archive" },
    { id: "life", name: "Life" },
  ],
  projects: [
    { id: "pomade", name: "Pomade", root: "Projects/Pomade", group: "build" },
    { id: "kit", name: "pomade-kit", root: "Projects/pomade-kit", group: "tools" },
    { id: "quiz", name: "QuizLab", root: "Projects/QuizLab", group: "tools" },
    { id: "quiz-old", name: "QuizLab", root: "Projects/QuizLab-old", group: "archive" },
    { id: "school", name: "Nora's school", root: "Life/School", group: "life" },
    { id: "errands", name: "Errands", root: "Life/Errands" },
  ],
  activeProject: "pomade",
  files: {
    ...Object.fromEntries(Object.entries(PLANNER_TASKS).map(([name, text]) => [`Tasks/${name}`, text])),
    ...Object.fromEntries(Object.entries(PROJECT_TASKS).map(([name, text]) => [`Tasks/${name}`, text])),
    ...Object.fromEntries(Object.entries(RECURRING_TASKS).map(([name, text]) => [`Chores/${name}`, text])),
    "Projects/Pomade/README.md": "# Pomade\n",
    "Projects/QuizLab/README.md": "# QuizLab\n",
  },
} satisfies FakeHostOptions;

/** The daily-note template of NOTES_FILES: its own frontmatter, eight checklist lines. */
export const DAILY_TEMPLATE =
  "---\ntags: [daily]\ntype: journal\n---\n## Morning\n- [ ] Review Today\n- [ ] Water the plants\n- [ ] Stretch\n\n## Work\n- [ ] Inbox to zero\n- [ ] One deep-work block\n- [ ] Plan tomorrow\n\n## Evening\n- [ ] Read with Nora\n- [ ] Lights out by 23:00\n";

const item = (type: string, title: string, extra = "", status = "open"): string => `---\ntype: ${type}\ntitle: ${title}\nstatus: ${status}\n${extra}created: 2026-11-12\n---\n`;

/** Notes, thoughts, daily notes, an archived note and a template, by workspace path (dated around 2026-11-17). */
export const NOTES_FILES: Record<string, string> = {
  "Tasks/2026-11-12-quiz-timer-idea.md": `${item("note", "Quiz timer idea")}A countdown on every question — **red** in the last five seconds, then the answer slides in.\n`,
  "Tasks/2026-11-12-gift-ideas.md": `${item("note", "Gift ideas for Greta")}- the blue scarf from the market\n- tickets to the opera\n`,
  "Tasks/2026-11-12-sleep.md": `${item("thought", "Why do I sleep badly on Sundays?")}Maybe the late coffee.\n`,
  "Tasks/2026-11-12-standing-desk.md": `${item("thought", "Is a standing desk worth it?", "done-on: 2026-11-15\n", "resolved")}Yes — ordered one.\n`,
  "Tasks/QuizLab/2026-11-12-leaderboard.md": `${item("thought", "Does QuizLab need a leaderboard?")}Kids love them; parents less so.\n`,
  "Tasks/QuizLab/2026-11-12-sound-effects.md": `${item("note", "Sound effects")}Short, soft, never on a wrong answer.\n`,
  "Tasks/Daily/2026-11-15.md": "---\ntype: daily-note\ndate: 2026-11-15\n---\n# Sunday, November 15, 2026\n\n- [x] Pancakes\n- [x] Park with Nora\n- [ ] Call mum\n",
  "Tasks/Daily/2026-11-16.md": "---\ntype: daily-note\ntitle: Trip planning day\ndate: 2026-11-16\n---\nFlights first, then the hotel.\n\n- [x] Compare flights\n- [ ] Book the hotel\n",
  "Tasks/_archive/2026-11-01-old-idea.md": `${item("note", '"Old idea: a podcast"')}Not now.\n`,
  "Templates/Daily.md": DAILY_TEMPLATE,
};

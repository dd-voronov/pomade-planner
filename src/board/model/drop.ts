// What a drop does (DESIGN §4.4): a field-only write of `status` and `updated: <today>`; for an
// epic or task, a move into `done/` when it lands in `done` and back to the backlog folder when it
// leaves `done` — only while the backlog's "move done to done/" setting is on. Problems and signals
// never move. A column the kind can't take refuses the drop. A signal dropped on `triaged` without a
// `problem:` asks for its problem first; the answer (or skipping it) rides with the same write.
// The card popover's edits (priority, parent) are field-only writes of that key and `updated`.

import { joinPath } from "pomade-kit/protocol";

import { diskReason } from "../../core/host";
import { canTake, refusalText, type ColumnDef } from "./areas";
import { DONE_FOLDER, PARENT_KEY, type Kind, type Ticket } from "./ticket";

/** The kinds whose files move into `done/` and back. */
const MOVING_KINDS: readonly Kind[] = ["epic", "task"];

export interface DropInput {
  ticket: Ticket;
  target: ColumnDef;
  /** The backlog folder, workspace-relative. */
  backlog: string;
  moveDone: boolean;
  /** `YYYY-MM-DD`. */
  today: string;
  /**
   * The answer to "which problem?" for a signal dropped on `triaged` without one: a problem ID, or
   * `null` when the user skipped it. Absent = not asked yet.
   */
  parentChoice?: string | null;
}

/** One field-only write; `value: null` removes the key. */
export interface FieldWrite {
  key: string;
  value: string | null;
}

/** The status a signal is triaged into; a drop there asks for the signal's problem first. */
export const TRIAGED = "triaged";

export type DropPlan =
  /** Dropped where it already is: nothing to do. */
  | { kind: "same" }
  | { kind: "refused"; reason: string }
  /** Ask for the signal's problem (skippable), then plan again with `parentChoice`. */
  | { kind: "ask-parent" }
  | { kind: "write"; path: string; fields: FieldWrite[]; move: { from: string; to: string } | null };

export function planDrop({ ticket, target, backlog, moveDone, today, parentChoice }: DropInput): DropPlan {
  if (ticket.status === target.status) return { kind: "same" };
  if (!canTake(target, ticket.kind)) return { kind: "refused", reason: refusalText(target, ticket.kind) };
  const triage = ticket.kind === "signal" && target.status === TRIAGED && ticket.parent === null;
  if (triage && parentChoice === undefined) return { kind: "ask-parent" };

  let move: { from: string; to: string } | null = null;
  if (moveDone && MOVING_KINDS.includes(ticket.kind)) {
    const toDone = target.status === "done";
    if (toDone && !ticket.inDone) move = { from: ticket.path, to: joinPath(backlog, DONE_FOLDER, ticket.name) };
    else if (!toDone && ticket.inDone) move = { from: ticket.path, to: joinPath(backlog, ticket.name) };
  }
  const fields: FieldWrite[] = [{ key: "status", value: target.status }];
  if (triage && typeof parentChoice === "string") fields.push({ key: "problem", value: parentChoice });
  fields.push({ key: "updated", value: today });
  return { kind: "write", path: ticket.path, fields, move };
}

/** What the card popover edits. */
export type EditableField = "priority" | "parent";

export type EditPlan = { kind: "same" } | { kind: "none"; reason: string } | { kind: "write"; path: string; fields: FieldWrite[] };

/**
 * A popover edit: `priority`, or the kind's parent key (`problem:` for an epic or a signal, `epic:`
 * for a task) — set, or removed when `value` is `null` — plus `updated: <today>`. Nothing when the
 * value is already the file's.
 */
export function planEdit(ticket: Ticket, field: EditableField, value: string | null, today: string): EditPlan {
  const key = field === "priority" ? "priority" : PARENT_KEY[ticket.kind];
  if (key === null) return { kind: "none", reason: "Problems have no parent" };
  const current = field === "priority" ? ticket.priority : ticket.parent;
  if (current === value) return { kind: "same" };
  return {
    kind: "write",
    path: ticket.path,
    fields: [
      { key, value },
      { key: "updated", value: today },
    ],
  };
}

/** Why a drop's write did not happen, or stopped half-way. */
export type WriteFailure =
  /** The file changed on disk since the board read it: the host refused the write (`changed-on-disk`). */
  | { kind: "changed" }
  /** The host refused a call (`HostError`): its code and message, and which step it was. */
  | { kind: "host"; step: WriteStep; code: string; message: string; moveTo?: string };

/** The Host API call a write was at: the backlog folder's re-read, a field write, the `done/` move, a file create. */
export type WriteStep = "read" | "field" | "move" | "create";

/** The inline error a card shows after a failed drop; the card is reloaded from disk, never retried. */
export function describeFailure(failure: WriteFailure): string {
  if (failure.kind === "changed") return "Changed on disk since the board read it — not saved. The card shows the file as it is now.";
  const { step, code, message, moveTo } = failure;
  if (code === "not-found") return "The file is gone — not saved.";
  if (step === "move" && code === "already-exists") {
    return `Status saved, but not moved: ${moveTo ?? "the target"} already exists.`;
  }
  if (code === "unreadable-frontmatter") return "Its frontmatter can't be read — not saved. Open it to fix.";
  const prefix = step === "move" ? "Status saved, but not moved" : step === "create" ? "Couldn't create it" : "Couldn't save";
  return `${prefix}: ${diskReason(message)}.`;
}

/** The local calendar day as `YYYY-MM-DD`. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

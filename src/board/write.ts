// The Board's writes through the Host API: field-only writes guarded by the mtime the board read
// (DESIGN §4.4 "Never over a newer file"), and creating a ticket with its ID re-checked at write time.

import { HostError, type HostClient } from "pomade-kit/sdk";

import { bumpId, newTicketContent, newTicketPath, nextId, ticketFileName, type NewTicket } from "./model/create";
import type { FieldWrite, WriteFailure, WriteStep } from "./model/drop";
import type { Kind, Ticket } from "./model/ticket";
import { readEntries } from "./useBoardData";

export class Failure extends Error {
  constructor(readonly failure: WriteFailure) {
    super(failure.kind);
  }
}

/** Run one Host API step of a write; a refusal becomes a `Failure` naming the step. */
export async function step<T>(name: WriteStep, run: () => Promise<T>, moveTo?: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HostError) {
      const failure: WriteFailure = { kind: "host", step: name, code: error.code, message: error.message };
      if (moveTo !== undefined) failure.moveTo = moveTo;
      throw new Failure(failure);
    }
    throw new Failure({ kind: "host", step: name, code: "io-error", message: error instanceof Error ? error.message : String(error) });
  }
}

/** The failure an error stands for. */
export function failureOf(error: unknown, fallback: WriteStep = "field"): WriteFailure {
  return error instanceof Failure ? error.failure : { kind: "host", step: fallback, code: "io-error", message: String(error) };
}

/**
 * Field-only writes to a ticket the board read at `ticket.mtimeMs`: refused (`changed`) when the
 * file changed since; each write sets its key, or removes it when `value` is `null`.
 */
export async function writeFields(host: HostClient, ticket: Ticket, fields: readonly FieldWrite[]): Promise<void> {
  const current = await step("read", () => host.files.readFile({ path: ticket.path }));
  if (current.mtimeMs !== ticket.mtimeMs) throw new Failure({ kind: "changed" });
  for (const field of fields) {
    const { key, value } = field;
    await step("field", () => (value === null ? host.files.removeField({ path: ticket.path, key }) : host.files.setField({ path: ticket.path, key, value })));
  }
}

export interface CreateRequest extends Omit<NewTicket, "id"> {
  /** The backlog folder, workspace-relative. */
  backlog: string;
  moveDone: boolean;
}

/** How many taken IDs in a row a create steps over before it gives up. */
const MAX_BUMPS = 50;

/**
 * Create a ticket with the Host API's file create: the next free ID from a fresh read of the folder
 * and `done/` (not the board's last read), and a bump to the next number whenever the path is taken
 * by the time the file is written. Resolves to the new file's path and ID.
 */
export async function createTicket(host: HostClient, request: CreateRequest): Promise<{ path: string; id: string }> {
  const { backlog, moveDone, ...ticket } = request;
  const entries = (await step("read", () => readEntries(host, backlog))) ?? [];
  let id = nextId(ticket.kind satisfies Kind, entries, backlog);
  for (let attempt = 0; attempt < MAX_BUMPS; attempt++) {
    const path = newTicketPath(backlog, ticket.kind, ticket.status, moveDone, ticketFileName(id, ticket.title));
    const content = newTicketContent({ ...ticket, id });
    try {
      await host.files.create({ path, content });
      return { path, id };
    } catch (error) {
      if (error instanceof HostError && error.code === "already-exists") {
        id = bumpId(id);
        continue;
      }
      throw new Failure({ kind: "host", step: "create", code: error instanceof HostError ? error.code : "io-error", message: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Failure({ kind: "host", step: "create", code: "already-exists", message: `${MAX_BUMPS} IDs in a row are taken` });
}

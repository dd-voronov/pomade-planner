// The Board's writes through the Host API: field-only writes conditional on the mtime the board
// read ([[editing-drag-create]] "Never over a newer file"), creating a ticket with its ID re-checked at write time,
// and its settings — the synced settings file and a project's own backlog folder ([[backlog-location]]).

import { HostError, type HostClient } from "pomade-kit/sdk";
import type { ProjectRef } from "pomade-kit/protocol";

import { errorText } from "../core/host";
import { announceSettingsWrite } from "../core/live-settings";
import { saveSettingsFile, type SettingsValue } from "../core/settings-file";
import { bumpId, newTicketContent, newTicketPath, nextId, ticketFileName, type NewTicket } from "./model/create";
import type { FieldWrite, WriteFailure, WriteStep } from "./model/drop";
import { PROJECT_KEYS, relativeToProject, SETTINGS_CHANGED_KEY, SYNCED_SETTINGS_PATH } from "./model/settings";
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
 * Field-only writes to a ticket the board read at `ticket.mtimeMs`; each write sets its key, or
 * removes it when `value` is `null`. The first write is conditional on that mtime (`ifMtime`): when
 * the file changed since, the host refuses it (`changed-on-disk`), nothing is written and the
 * failure is `changed`. The writes after it follow the board's own.
 */
export async function writeFields(host: HostClient, ticket: Ticket, fields: readonly FieldWrite[]): Promise<void> {
  for (const [i, { key, value }] of fields.entries()) {
    const target = i === 0 ? { path: ticket.path, key, ifMtime: ticket.mtimeMs } : { path: ticket.path, key };
    try {
      await step("field", () => (value === null ? host.files.removeField(target) : host.files.setField({ ...target, value })));
    } catch (error) {
      if (error instanceof Failure && error.failure.kind === "host" && error.failure.code === "changed-on-disk") throw new Failure({ kind: "changed" });
      throw error;
    }
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

/**
 * Set (or, with `undefined`, remove) the Board's keys in its synced settings file, keeping every
 * other key; the Board's other frames re-read it. Throws `SettingsWriteError` (core/settings-file).
 */
export async function saveSyncedSettings(host: HostClient, patch: Record<string, SettingsValue | undefined>): Promise<void> {
  await saveSettingsFile(host, SYNCED_SETTINGS_PATH, patch);
  await announceSettingsWrite(host, SETTINGS_CHANGED_KEY);
}

/** Store `folder` (relative to the project's root) as the project's own backlog folder; `null` puts the project back on the workspace's default. */
export async function setBacklogFolder(host: HostClient, projectId: string, folder: string | null): Promise<void> {
  await host.project.setSettings({ projectId, settings: { [PROJECT_KEYS.backlogPath]: folder } });
}

export type FolderChoice =
  /** Stored as the project's own folder. */
  | { kind: "chosen"; folder: string }
  /** The dialog was cancelled: nothing changed. */
  | { kind: "cancelled" }
  /** Nothing was stored; `message` says why. */
  | { kind: "refused"; message: string };

/**
 * Ask for `project`'s backlog folder with Pomade's folder dialog bounded by the project, and store
 * the pick as the project's own folder. A folder outside the project is refused.
 */
export async function chooseBacklogFolder(host: HostClient, project: ProjectRef): Promise<FolderChoice> {
  try {
    const { path } = await host.files.pickFolder({ root: project.id, initial: project.root });
    if (path === null) return { kind: "cancelled" };
    const folder = relativeToProject(project.root, path);
    if (folder === null) return { kind: "refused", message: `${path} is outside ${project.name}. Choose a folder inside the project.` };
    await setBacklogFolder(host, project.id, folder);
    return { kind: "chosen", folder };
  } catch (error) {
    return { kind: "refused", message: `Couldn't set the backlog folder: ${errorText(error)}` };
  }
}

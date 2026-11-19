// An app's synced settings file ([[settings-and-state]]): `<workspace>/Apps/<app id>/settings.json`, git-synced
// with the workspace. Each app has its own and reads no other's. A write changes only the keys it
// names and keeps every other key. A missing file means every default; an app creates its file on
// its first settings write, never on a read.

import { HostError, type HostClient } from "pomade-kit/sdk";

import { diskReason, errorText, isNotFound } from "./host";

/** Workspace-relative path of the synced settings file of the app `appId`. */
export const settingsPathOf = (appId: string): string => `Apps/${appId}/settings.json`;

export type SettingsObject = Record<string, unknown>;

/** The keys of the file at `path` (`{}` for a missing file, `text === null`), or what is wrong with it. */
export function parseSettingsText(text: string | null, path: string): { object: SettingsObject; problem: null } | { object: null; problem: string } {
  if (text === null) return { object: {}, problem: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { object: null, problem: `${path} is not valid JSON (${(error as Error).message})` };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { object: null, problem: `${path} is not a JSON object` };
  return { object: raw as SettingsObject, problem: null };
}

export type SettingsValue = string | number | boolean | null | SettingsValue[] | { [key: string]: SettingsValue };

/**
 * The text of the file at `path` with `patch` applied: each key set, or removed when its value is
 * `undefined`; every other key kept, in its order. A file that isn't a JSON object is refused,
 * never overwritten.
 */
export function mergeSettingsText(text: string | null, patch: Record<string, SettingsValue | undefined>, path: string): { ok: true; text: string } | { ok: false; problem: string } {
  const parsed = parseSettingsText(text, path);
  if (parsed.object === null) return { ok: false, problem: parsed.problem };
  const next: SettingsObject = { ...parsed.object };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return { ok: true, text: `${JSON.stringify(next, null, 2)}\n` };
}

/** A settings write that didn't happen, in words for the form. */
export class SettingsWriteError extends Error {}

const reasonOf = (error: unknown): string => (error instanceof HostError ? diskReason(error.message) : errorText(error));

/**
 * Apply `patch` to the settings file at `path` (`mergeSettingsText`): the file is created when it
 * is missing; a file that isn't a JSON object is never overwritten. Throws `SettingsWriteError`.
 */
export async function saveSettingsFile(host: HostClient, path: string, patch: Record<string, SettingsValue | undefined>): Promise<void> {
  let text: string | null = null;
  try {
    text = (await host.files.readFile({ path })).content;
  } catch (error) {
    if (!isNotFound(error)) throw new SettingsWriteError(`Couldn't read ${path}: ${reasonOf(error)}.`);
  }
  const merged = mergeSettingsText(text, patch, path);
  if (!merged.ok) throw new SettingsWriteError(`Not saved: ${merged.problem}. Fix the file first.`);
  try {
    if (text === null) await host.files.create({ path, content: merged.text });
    else await host.files.write({ path, content: merged.text });
  } catch (error) {
    throw new SettingsWriteError(`Couldn't save ${path}: ${reasonOf(error)}.`);
  }
}

// One item's file as its compact view holds it ([[item-in-place]] "Only over the version the view read"): the
// version the view read — the item's fields from the folder read and its text, both of one mtime —
// and the view's writes, one at a time, each made over that version and followed by the next.

import { useCallback, useEffect, useRef, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";

import { errorText } from "../core/host";
import { taskOf, type ItemEntry, type Task } from "./model/items";
import { StaleError, WriteError } from "./write";

/** A version of the file: the item as the folder read gave it and the file's text, both at `task.mtimeMs`. */
export interface ItemVersion {
  task: Task;
  content: string;
  /** The version follows a write of this view (what was typed since stays); else the file changed elsewhere. */
  own: boolean;
}

export type WriteOutcome =
  | { kind: "saved" }
  /** There was nothing to write. */
  | { kind: "nothing" }
  /** The file changed on disk since the view read it: nothing was written. */
  | { kind: "stale" }
  | { kind: "error"; message: string }
  /** The file is gone, or the view closed before the write's turn came. */
  | { kind: "dropped" };

/**
 * The file of `task` (the item in the Planner's folder read; `null` once it is gone), live.
 * `version` is the newest one read, `null` until the first. `write(op)` runs `op` on the current
 * version once every earlier write is done and its result is read — `op` writes over the version
 * it is given (write.ts refuses a file that changed since), or answers `null` when it has nothing
 * to write — then reads the folder again
 * (`reload`). After the view is gone, a write still waiting runs over the file as it is then.
 */
export function useItemFile(host: HostClient, task: Task | null, reload: () => Promise<void>) {
  const [version, setVersion] = useState<ItemVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by a write: the file is read again even when its mtime didn't move. */
  const [epoch, setEpoch] = useState(0);
  const current = useRef<ItemVersion | null>(null);
  const synced = useRef(false);
  const waiters = useRef<((v: ItemVersion | null) => void)[]>([]);
  const nextOwn = useRef(false);
  const gone = useRef(false);
  const lastTask = useRef(task);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const settle = (v: ItemVersion | null) => {
    for (const resolve of waiters.current.splice(0)) resolve(v);
  };

  useEffect(() => {
    if (task !== null) lastTask.current = task;
  }, [task]);

  useEffect(() => {
    if (task === null) return;
    const held = current.current;
    if (synced.current && held !== null && held.task.path === task.path && held.task.mtimeMs === task.mtimeMs) return;
    synced.current = false;
    let live = true;
    void host.files.readFile({ path: task.path }).then(
      ({ content, mtimeMs }) => {
        // The folder read is behind (or ahead of) this text: its next version reads again.
        if (!live || mtimeMs !== task.mtimeMs) return;
        const next = { task, content, own: nextOwn.current };
        nextOwn.current = false;
        current.current = next;
        synced.current = true;
        setError(null);
        setVersion(next);
        settle(next);
      },
      (e: unknown) => {
        if (live) setError(`Can't read the file: ${errorText(e)}`);
      },
    );
    return () => {
      live = false;
    };
  }, [host, task, epoch]);

  useEffect(
    () => () => {
      gone.current = true;
      settle(null);
    },
    [],
  );

  /** The version a write runs on: the current one once it is read; after the view is gone, the file as it is. */
  const versionForWrite = useCallback(async (): Promise<ItemVersion | null> => {
    if (!gone.current) {
      if (synced.current) return current.current;
      const v = await new Promise<ItemVersion | null>((resolve) => waiters.current.push(resolve));
      // `null`: the view went away while this write waited.
      if (v !== null) return v;
    }
    const last = lastTask.current;
    if (last === null) return null;
    try {
      const { content, mtimeMs, frontmatter, frontmatterError } = await host.files.readFile({ path: last.path, frontmatter: true });
      const entry: ItemEntry = { path: last.path, name: last.name, kind: "file", mtimeMs, frontmatter: frontmatter ?? null };
      if (frontmatterError !== undefined) entry.frontmatterError = frontmatterError;
      const task = taskOf(entry, last.folder, content, last.archived);
      return task === null ? null : { task, content, own: true };
    } catch {
      return null;
    }
  }, [host]);

  const write = useCallback(
    (op: (version: ItemVersion) => Promise<void> | null): Promise<WriteOutcome> => {
      const run = async (): Promise<WriteOutcome> => {
        const v = await versionForWrite();
        if (v === null) return { kind: "dropped" };
        const writing = op(v);
        if (writing === null) return { kind: "nothing" };
        let outcome: WriteOutcome = { kind: "saved" };
        try {
          await writing;
        } catch (e) {
          outcome = e instanceof StaleError ? { kind: "stale" } : { kind: "error", message: e instanceof WriteError ? e.message : `Not saved: ${errorText(e)}.` };
        }
        synced.current = false;
        nextOwn.current = outcome.kind === "saved";
        if (!gone.current) setEpoch((n) => n + 1);
        await reload();
        return outcome;
      };
      const result = queue.current.then(run, run);
      queue.current = result;
      return result;
    },
    [versionForWrite, reload],
  );

  return { version, error, write };
}

export type ItemFileHandle = ReturnType<typeof useItemFile>;

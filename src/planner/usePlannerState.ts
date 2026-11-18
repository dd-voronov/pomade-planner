// The Planner's machine-local app state besides the view (Host API `state`, DESIGN §5): a key read
// once and followed through the other frames' changes; and the day's daily note, made by the
// launch panel frame the first time it runs on a planner day (DESIGN §3.5, model/daily).

import { useCallback, useEffect, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { JsonValue } from "pomade-kit/protocol";
import type { LocalDate } from "pomade-kit/schedule";

import { errorText } from "../core/host";
import { DAILY_DAY_KEY, shouldCreateDailyNote } from "./model/daily";
import { createDailyNote, WriteError } from "./write";

/** A state key's value, parsed (`parse` and `serialize` stable: module-level functions) — `null` until it is read — and a setter that stores it (the other frames follow). */
export function useAppState<T>(host: HostClient, key: string, parse: (value: JsonValue | null) => T, serialize: (value: T) => JsonValue): [T | null, (next: T) => void] {
  const [loaded, setLoaded] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    let live = true;
    const read = (v: JsonValue | null) => setLoaded({ key, value: parse(v) });
    void host.state.get(key).then(
      (v) => live && read(v),
      () => live && read(null),
    );
    const off = host.state.onChange((k, v) => {
      if (k === key) read(v);
    });
    return () => {
      live = false;
      off();
    };
  }, [host, key, parse]);
  const set = useCallback(
    (value: T) => {
      setLoaded({ key, value });
      void host.state.set(key, serialize(value)).catch(() => undefined);
    },
    [host, key, serialize],
  );
  return [loaded?.key === key ? loaded.value : null, set];
}

/**
 * Make `day`'s daily note in `root` the first time the Planner runs on that day — at Pomade's
 * launch, or when the day boundary passes while it runs (DESIGN §3.5). Only the frame `enabled`
 * makes it: the Planner's launch panel frame, which runs from Pomade's launch on. The file create
 * is still the guard (a taken path is the note already there). The day is recorded once the note
 * is there, so a relaunch that day, or a note deleted that day, makes nothing. A made note is read
 * at once (`reload`), so it shows without waiting for the watch. `settled`: the day's check is
 * over (and a made note read) — at once in a frame that doesn't make notes; `error`: what went
 * wrong making it.
 */
export function useDailyNoteCreation(
  host: HostClient,
  enabled: boolean,
  root: string,
  day: LocalDate,
  template: string | null,
  reload: () => Promise<void>,
): { settled: boolean; error: string | null } {
  const [done, setDone] = useState<{ day: LocalDate; error: string | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    // Read through an object: the async steps below see the cleanup's write.
    const run = { live: true };
    const live = () => run.live;
    void (async () => {
      let last: JsonValue | null;
      try {
        last = await host.state.get(DAILY_DAY_KEY);
      } catch {
        // Without the record, making a note could make it again after a delete: wait for the next run.
        if (live()) setDone({ day, error: null });
        return;
      }
      if (!live()) return;
      if (!shouldCreateDailyNote(day, typeof last === "string" ? last : null)) {
        setDone({ day, error: null });
        return;
      }
      try {
        const { result } = await createDailyNote(host, root, day, template);
        // A slower frame never moves the record back.
        const now = await host.state.get(DAILY_DAY_KEY);
        if (typeof now !== "string" || now < day) await host.state.set(DAILY_DAY_KEY, day);
        if (result === "created") await reload();
        if (live()) setDone({ day, error: null });
      } catch (e) {
        if (live()) setDone({ day, error: e instanceof WriteError ? e.message : `Couldn't make today's daily note: ${errorText(e)}.` });
      }
    })();
    return () => {
      run.live = false;
    };
  }, [host, enabled, root, day, template, reload]);
  if (!enabled) return { settled: true, error: null };
  return done?.day === day ? { settled: true, error: done.error } : { settled: false, error: null };
}

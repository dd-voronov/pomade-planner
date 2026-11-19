// Ticking ([[days-and-today]] "Ticking"): field-only writes of `status` and `done-on` — `done` and the planner day,
// or back to `open` with `done-on` removed. The file stays where it is.

import type { LocalDate } from "pomade-kit/schedule";

import { FIELD, STATUS } from "./items";

/** One field-only write; `value: null` removes the key. */
export interface FieldWrite {
  key: string;
  value: string | number | null;
}

export function tickWrites(done: boolean, day: LocalDate): FieldWrite[] {
  return done
    ? [
        { key: FIELD.status, value: STATUS.done },
        { key: FIELD.doneOn, value: day },
      ]
    : [
        { key: FIELD.status, value: STATUS.open },
        { key: FIELD.doneOn, value: null },
      ];
}

/** Resolving a thought ([[storage-and-item-types]] "Writing an item"): `status: resolved` and `done-on`, or back to `open` with `done-on` removed. */
export function resolveWrites(resolved: boolean, day: LocalDate): FieldWrite[] {
  return resolved
    ? [
        { key: FIELD.status, value: STATUS.resolved },
        { key: FIELD.doneOn, value: day },
      ]
    : tickWrites(false, day);
}

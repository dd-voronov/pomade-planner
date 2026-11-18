import { useId } from "react";

import { PRIORITIES } from "./model/create";

interface PrioritySelectProps {
  /** The priority now; anything outside P0–P3 (or none) selects nothing. */
  value: string | null;
  onChange: (priority: string) => void;
  disabled?: boolean;
}

/** P0–P3 as a segmented radio group: Tab reaches it once, ← → pick, coloured like the card's priority. */
export function PrioritySelect({ value, onChange, disabled = false }: PrioritySelectProps) {
  const name = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label="Priority" data-testid="priority-select">
      {PRIORITIES.map((p) => (
        <label key={p} className={`segmented__option segmented__option--${p.toLowerCase()}`}>
          <input
            type="radio"
            name={name}
            value={p}
            checked={value === p}
            disabled={disabled}
            data-testid={`priority-${p}`}
            onChange={() => onChange(p)}
          />
          <span>{p}</span>
        </label>
      ))}
    </div>
  );
}

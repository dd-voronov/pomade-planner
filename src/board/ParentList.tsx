import { PickList } from "./PickList";
import { isOpen } from "./model/areas";
import { filterParents } from "./model/parents";
import type { Ticket } from "./model/ticket";

interface ParentListProps {
  /** In picker order (`parentCandidates`). */
  candidates: readonly Ticket[];
  /** The parent chosen now; `null` = none. */
  value: string | null;
  /**
   * `follow`: the highlighted option is the value (a form field — typing picks the first match,
   * ↑ ↓ move, Enter submits the form). `pick`: ↑ ↓ only highlight; Enter or a click picks.
   */
  mode: "follow" | "pick";
  onChange: (parent: string | null) => void;
  /** "Problem", "Epic". */
  label: string;
  /** Focus the filter when the popover opens. */
  autoFocus?: boolean;
  /** Offer "No <parent>" as the first option (off where a separate button says it). */
  withNone?: boolean;
  disabled?: boolean;
}

const idOf = (ticket: Ticket): string => ticket.id;
const closedClass = (ticket: Ticket): string => (isOpen(ticket) ? "" : "pick-option--closed");

function ParentOption(ticket: Ticket) {
  return (
    <>
      <span className="pick-option__id">{ticket.id}</span>
      <span className="pick-option__title">{ticket.title}</span>
      {!isOpen(ticket) && ticket.status !== null ? <span className="pick-option__meta">{ticket.status}</span> : null}
    </>
  );
}

/** A filterable parent list: a search field over a listbox whose first option is "No parent". */
export function ParentList({ candidates, value, mode, onChange, label, autoFocus = false, withNone = true, disabled = false }: ParentListProps) {
  const name = label.toLowerCase();
  return (
    <PickList
      items={candidates}
      filter={filterParents}
      idOf={idOf}
      value={value}
      mode={mode}
      onChange={onChange}
      label={label}
      placeholder={`Search ${name}s by ID or title`}
      {...(withNone ? { noneLabel: `No ${name}` } : {})}
      emptyText={(query) => `No ${name} matches “${query}”`}
      renderOption={ParentOption}
      optionClass={closedClass}
      testId="parent"
      autoFocus={autoFocus}
      disabled={disabled}
    />
  );
}

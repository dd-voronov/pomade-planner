import type { HostClient } from "pomade-kit/sdk";

import { BoardGlyph } from "./BoardGlyph";
import type { NeedsYou } from "./model/needs-you";
import type { Kind, Ticket } from "./model/ticket";

const KIND_LETTER: Record<Kind, string> = { problem: "P", epic: "E", task: "T", signal: "S" };

interface RowsProps {
  host: HostClient;
  projectId: string;
  items: NeedsYou;
}

function Row({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  const p = ticket.priority;
  return (
    <li>
      <button type="button" className="ny-row" data-testid="needs-you-row" data-id={ticket.id} data-path={ticket.path} onClick={onOpen} title={ticket.title}>
        <span className="ny-row__meta">
          <span className={`kind-badge kind-badge--${ticket.kind}`}>{KIND_LETTER[ticket.kind]}</span>
          <span className="ny-row__id">{ticket.id}</span>
          {p !== null ? <span className={`priority priority--${/^P[0-3]$/.test(p) ? p.toLowerCase() : "other"}`}>{p}</span> : null}
        </span>
        <span className="ny-row__title">{ticket.title}</span>
      </button>
    </li>
  );
}

/** The two groups of one backlog — in review, new signals — each only when it has rows. */
export function Groups({ host, projectId, items }: RowsProps) {
  const openTicket = (path: string) => void host.tabs.openFile({ path, projectId }).catch(() => undefined);
  const groups = [
    { id: "review", label: "In review", rows: items.review },
    { id: "signals", label: "New signals", rows: items.signals },
  ].filter((g) => g.rows.length > 0);
  return (
    <>
      {groups.map((g) => (
        <section key={g.id} className="ny-group" data-testid={`needs-you-${g.id}`} aria-label={g.label}>
          <h3 className="ny-group__title">
            {g.label} <span className="ny-group__count">{g.rows.length}</span>
          </h3>
          <ul className="ny-group__rows">
            {g.rows.map((t) => (
              <Row key={t.path} ticket={t} onOpen={() => openTicket(t.path)} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** The glyph of the panel's empty states. */
export const needsYouGlyph = <BoardGlyph size={28} />;

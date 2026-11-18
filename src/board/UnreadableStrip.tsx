import type { Misfit } from "./model/areas";
import type { UnreadableFile } from "./model/ticket";

interface UnreadableStripProps {
  unreadable: readonly UnreadableFile[];
  misfits: readonly Misfit[];
  onOpen: (path: string) => void;
}

/**
 * Above the columns: every ticket file the board can't place — frontmatter that can't be read, or a
 * ticket of this area whose status has no column. Each is a greyed card that opens the file.
 */
export function UnreadableStrip({ unreadable, misfits, onOpen }: UnreadableStripProps) {
  const count = unreadable.length + misfits.length;
  if (count === 0) return null;
  return (
    <section className="unreadable" data-testid="unreadable-strip" aria-label="Unreadable">
      <h2 className="unreadable__title">
        Unreadable <span className="unreadable__count">{count}</span>
      </h2>
      <div className="unreadable__cards">
        {unreadable.map((file) => (
          <button
            type="button"
            key={file.path}
            className="unreadable-card"
            data-testid="unreadable-card"
            data-path={file.path}
            title={`${file.name}: ${file.reason}`}
            onClick={() => onOpen(file.path)}
          >
            <span className="unreadable-card__id">{file.id}</span>
            <span className="unreadable-card__name">{file.name}</span>
            <span className="unreadable-card__hint">can&apos;t read — open to fix</span>
          </button>
        ))}
        {misfits.map(({ ticket, reason }) => (
          <button
            type="button"
            key={ticket.path}
            className="unreadable-card"
            data-testid="unreadable-card"
            data-path={ticket.path}
            title={ticket.name}
            onClick={() => onOpen(ticket.path)}
          >
            <span className="unreadable-card__id">{ticket.id}</span>
            <span className="unreadable-card__name">{ticket.title}</span>
            <span className="unreadable-card__hint">{reason} — open to fix</span>
          </button>
        ))}
      </div>
    </section>
  );
}

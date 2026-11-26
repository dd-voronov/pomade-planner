import { useEffect, useRef, useState } from "react";

interface BoardMenuProps {
  moveDone: boolean;
  onToggleMoveDone: () => void;
  onChangeFolder: () => void;
}

function MoreGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.5" cy="8" r="1.25" />
    </svg>
  );
}

function CheckGlyph({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {on ? <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

/** The Board tab's ⋯ menu — the open project's own settings: the backlog's "move done to done/" switch and "Change backlog folder…". */
export function BoardMenu({ moveDone, onToggleMoveDone, onChangeFolder }: BoardMenuProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role^=menuitem]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="menu-wrap">
      <button
        type="button"
        className="icon-btn"
        aria-label="Board settings"
        data-tip="Board settings"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="board-menu-button"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreGlyph />
      </button>
      {open ? (
        <>
          <div className="menu-scrim" data-testid="board-menu-scrim" onClick={() => setOpen(false)} />
          <div className="menu" role="menu" ref={menu} data-testid="board-menu">
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={moveDone}
              className="menu__item"
              data-testid="menu-move-done"
              onClick={() => {
                setOpen(false);
                onToggleMoveDone();
              }}
            >
              <span className="menu__glyph">
                <CheckGlyph on={moveDone} />
              </span>
              Move done epics and tasks to <code>done/</code>
            </button>
            <div className="menu__separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              data-testid="menu-change-folder"
              onClick={() => {
                setOpen(false);
                onChangeFolder();
              }}
            >
              <span className="menu__glyph" />
              Change backlog folder…
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

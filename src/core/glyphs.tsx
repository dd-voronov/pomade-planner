// Glyphs both apps draw.

/** Pomade's own Settings glyph (the gear of its sidebar's Settings row). */
export function GearGlyph() {
  return (
    <span className="gear-glyph" aria-hidden="true">
      ⚙
    </span>
  );
}

export function CloseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

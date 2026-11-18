/** The Board glyph: three kanban columns, the strip icon's drawing (public/board.svg) in `currentColor`. */
export function BoardGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <rect x="2.5" y="2.5" width="3.6" height="13" rx="1" />
        <rect x="7.2" y="2.5" width="3.6" height="9" rx="1" />
        <rect x="11.9" y="2.5" width="3.6" height="6" rx="1" />
      </g>
    </svg>
  );
}

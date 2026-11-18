/** The Planner glyph: an open and a ticked to-do, the strip icon's drawing (public/planner.svg) in `currentColor`. */
export function PlannerGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="3.5" width="3.5" height="3.5" rx="0.8" />
        <path d="M3.3 12.3l1 1 1.9-2.1" />
        <path d="M8.5 5.25h7M8.5 12.25h7" />
      </g>
    </svg>
  );
}

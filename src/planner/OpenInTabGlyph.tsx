/** An arrow leaving a frame: open this in a tab. */
export function OpenInTabGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6.5 3.5H4.3c-.7 0-1.3.6-1.3 1.3v6.9c0 .7.6 1.3 1.3 1.3h6.9c.7 0 1.3-.6 1.3-1.3V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9.5 2.8h3.7v3.7M13 3L7.8 8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

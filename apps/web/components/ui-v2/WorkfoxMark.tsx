// Working monogram: a sharp geometric W drawn in strokes, currentColor so it follows
// tokens and white-label contexts. Replaceable in one file when a final mark is designed.
export function WorkfoxMark({
  size = 20, className, title,
}: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M3 5l4.5 14L12 8l4.5 11L21 5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

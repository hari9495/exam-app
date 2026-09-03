/**
 * Keyboard users otherwise tab through the entire sidebar nav on every page before reaching the
 * page itself. Visually hidden until focused, then it appears as a normal button. Pairs with the
 * `id="main"` on each console layout's <main>.
 */
export function SkipToContent() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:font-body focus:text-sm focus:font-semibold focus:text-paper"
    >
      Skip to content
    </a>
  );
}

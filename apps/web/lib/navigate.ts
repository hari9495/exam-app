// Full-page navigation to another origin (SSO / OAuth hand-offs). Kept in its own module so tests
// can mock it: jsdom 26 (Jest 30) makes window.location unforgeable, so it can no longer be stubbed.
export function goTo(url: string): void {
  window.location.assign(url);
}

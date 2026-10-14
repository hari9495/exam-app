import { test } from '@playwright/test';

// These walk-throughs drive the exam console as it was before the v2 cutover: they expect /dashboard after sign-in
// (the recruiter home is /v2/today now), the separate bulk-upload pages (now dialogs on the v2 lists) and the old
// editors. Every one fails at its first step on main, for that reason alone. They are skipped, with the reason in the
// run's log and report, until they are rewritten for v2. E2E_PRE_V2_CONSOLE=1 runs them anyway.
export const PRE_V2_REASON =
  'Written for the exam console before the v2 cutover (/dashboard, old bulk-upload pages and editors); needs a rewrite for v2';

export function skipPreV2Console(file: string): void {
  if (process.env.E2E_PRE_V2_CONSOLE) return;
  console.log(`[skipped] ${file}: ${PRE_V2_REASON}.`);
  test.skip(true, PRE_V2_REASON);
}

// T2-F 82 (answer 2887): YukthiX pages that moved inside the app. For 6 months the old address shows a stub ("This page
// has moved", the link) that opens the new page after 5 seconds; after that it opens the new page at once. /v2 and
// outside addresses keep their next.config redirects (at once).

export interface PageMove {
  /** The new address (with its query or hash). */
  to: string;
  /** Where it is now, as the menu names it. */
  title: string;
  /** The day it moved (yyyy-mm-dd). */
  since: string;
}

export const MOVES: Record<string, PageMove> = {
  '/yx/me/letters': { to: '/yx/me/documents', title: 'Me › Documents and letters', since: '2026-10-26' },
  '/yx/performance/cycles': { to: '/yx/performance#cycles', title: 'Performance › Review cycles', since: '2026-11-03' },
  '/yx/performance/reviews': { to: '/yx/performance', title: 'Performance', since: '2026-11-03' },
  '/yx/hiring/scorecards': { to: '/yx/settings/hiring', title: 'Settings › Hiring', since: '2026-11-09' },
  '/yx/hiring/duplicates': { to: '/yx/hiring/candidates?view=duplicates', title: 'Hiring › Candidates › Possible duplicates', since: '2026-11-09' },
  '/yx/settings/access-settings': { to: '/yx/settings/people/directory-and-privacy', title: 'Settings › Directory and privacy', since: '2026-11-12' },
  '/yx/settings/company-rules': { to: '/yx/settings', title: 'Settings', since: '2026-11-12' },
  '/yx/settings/payroll-rules': { to: '/yx/settings/payroll/loans-and-advances', title: 'Settings › Loans and advances', since: '2026-11-12' },
  '/yx/settings/performance': { to: '/yx/settings/talent/performance', title: 'Settings › Performance', since: '2026-11-26' },
};

export const STUB_MONTHS = 6;

/** Whether the old address still shows the stub on `today` (yyyy-mm-dd): until 6 months after the move, that day excluded. */
export function showsStub(move: PageMove, today: string): boolean {
  const [y, m, d] = move.since.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + STUB_MONTHS, d)).toISOString().slice(0, 10);
  return today < end;
}

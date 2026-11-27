// T2-G 41 (answer 2746): the company's modules on / off and their rail order (GET /org/modules, read by everyone signed
// in). A module that is off loses its menu links and its pages show "switched off"; the API refuses its calls (403). The
// API keeps the same list in apps/api/src/org-structure/modules.ts.

export interface CompanyModule {
  id: string;
  label: string;
  on: boolean;
  locked: boolean;
}

// Helpdesk off keeps its legal duties: speak-up and the Internal Committee, cases, ethics, accidents and policies.
const DESK_KEPT = '(accidents|cases|ethics|ic|my-cases|policies|policy-admin|policy-writer|privacy|report-misconduct|speakup|speakup-setup)';

/** The /yx pages of each switchable module. */
const PAGES: [string, RegExp][] = [
  ['time', /^\/yx\/time(\/|$)/],
  ['contract', /^\/yx\/contract-labour(\/|$)/],
  ['hire', /^\/yx\/(hiring|staffing)(\/|$)/],
  ['projects', /^\/yx\/projects(\/|$)/],
  ['performance', /^\/yx\/performance(\/|$)/],
  ['learning', /^\/yx\/learning(\/|$)/],
  ['helpdesk', new RegExp(`^/yx/desk(/(?!${DESK_KEPT}(/|$|\\?))|$)`)],
  ['engage', /^\/yx\/engage(\/|$)/],
  ['visitors', /^\/yx\/visitors(\/|$)/],
  ['analytics', /^\/yx\/analytics(\/|$)/],
];

/** The module a page belongs to, or null (Home, People, Payroll, Settings and the pages every module shares). */
export const moduleOfHref = (href: string): string | null => PAGES.find(([, re]) => re.test(href))?.[0] ?? null;

/** Whether a page is in a switched-off module. */
export const pageOff = (href: string, off: readonly string[]) => {
  const m = moduleOfHref(href);
  return m !== null && off.includes(m);
};

/** Rail items in the company's order: Home first, the modules as ordered, anything else (Settings) last as drawn. */
export function inCompanyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[] | undefined): T[] {
  if (!order?.length) return [...items];
  const rank = (id: string) => (id === 'home' ? -1 : order.includes(id) ? order.indexOf(id) : order.length + items.findIndex((i) => i.id === id));
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
}

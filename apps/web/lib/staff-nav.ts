import { SUPER_ADMIN_FULL_NAV } from './super-admin-nav';
import { RECRUITER_NAV_ITEMS } from './recruiter-nav';

// Staff surfaces rebuilt in v2: their nav hrefs get a /v2 prefix at render so the link points at the
// real page AND the Sidebar's startsWith() active-highlight matches the /v2 URL. Everything an
// org_admin can reach now has a v2 page, so admin/settings routes are prefixed here too. They used
// to stay on their old /users, /settings/* routes (relying on next.config redirects), which is what
// let the (org-admin) route group render a DIFFERENT sidebar and made the nav visibly "jump" the
// moment you opened a settings page.
const V2_ROUTES = new Set([
  '/dashboard', '/exams', '/questions', '/candidates', '/reports',
  '/walk-in-groups', '/jobs', '/approvals', '/analytics/hiring',
  '/message-templates', '/offer-template',
  '/users', '/audit-log', '/system-logs', '/data-rights',
  '/settings/branding', '/settings/integrations', '/settings/sso', '/settings/billing',
  '/settings/approvals', '/settings/pipelines',
]);

// The ONE staff sidebar, identical in every org-scoped shell (the (recruiter) and (org-admin) route
// groups both call this), so navigating between day-to-day and settings pages never swaps the nav.
// org_admin / acting super_admin get the complete feature nav (which includes the org-config
// surfaces); a plain recruiter gets the scoped subset. Both groups only ever render this for roles
// that already hold the config permissions, so the settings items need no extra per-item gating.
export function buildStaffNav(role: string | null, actingSuperAdmin: boolean) {
  const baseNav = actingSuperAdmin || role === 'org_admin' ? SUPER_ADMIN_FULL_NAV : RECRUITER_NAV_ITEMS;
  return baseNav.map((item) => (V2_ROUTES.has(item.href) ? { ...item, href: `/v2${item.href}` } : item));
}

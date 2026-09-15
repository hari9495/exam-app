import { Sun, LayoutDashboard, Users, Briefcase, FileText, BookOpen, BarChart3, TrendingUp, History } from 'lucide-react';
import { SUPER_ADMIN_FULL_NAV } from './super-admin-nav';
import { RECRUITER_NAV_ITEMS } from './recruiter-nav';

// Compliance/auditor read-only nav: only the view surfaces the auditor role can actually load
// (candidates + question bank via the :view keys, jobs/results via results:view, exams open, audit
// log via audit:view). No create/messaging/settings items — those routes deny an auditor anyway.
export const AUDITOR_NAV_ITEMS = [
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/candidates', label: 'Candidates', icon: Users, group: 'Hiring' },
  { href: '/jobs', label: 'Jobs', icon: Briefcase, group: 'Hiring' },
  { href: '/exams', label: 'Exams', icon: FileText, group: 'Assessments' },
  { href: '/questions', label: 'Question Bank', icon: BookOpen, group: 'Assessments' },
  { href: '/reports', label: 'Results', icon: BarChart3, group: 'Assessments' },
  { href: '/analytics/hiring', label: 'Hiring Analytics', icon: TrendingUp, group: 'Analytics' },
  { href: '/audit-log', label: 'Audit Log', icon: History, group: 'Admin' },
];

// The order collapsible sidebar sections render in (below the ungrouped, pinned top items).
// A nav item's `group` must be one of these; the Sidebar ignores a group not listed here.
export const NAV_GROUP_ORDER = ['Hiring', 'Assessments', 'Messaging', 'Analytics', 'Admin', 'Settings'] as const;

// Staff surfaces rebuilt in v2: their nav hrefs get a /v2 prefix at render so the link points at the
// real page AND the Sidebar's startsWith() active-highlight matches the /v2 URL. Everything an
// org_admin can reach now has a v2 page, so admin/settings routes are prefixed here too. They used
// to stay on their old /users, /settings/* routes (relying on next.config redirects), which is what
// let the (org-admin) route group render a DIFFERENT sidebar and made the nav visibly "jump" the
// moment you opened a settings page.
const V2_ROUTES = new Set([
  '/today', '/dashboard', '/exams', '/questions', '/candidates', '/reports',
  '/walk-in-groups', '/jobs', '/agency-submissions', '/approvals', '/referrals', '/analytics/hiring',
  '/message-templates', '/sms-templates', '/whatsapp-templates', '/offer-template', '/campaigns', '/surveys', '/calendar',
  '/users', '/audit-log', '/system-logs', '/data-rights',
  '/settings/branding', '/settings/integrations', '/settings/sso', '/settings/billing',
  '/settings/approvals', '/settings/pipelines', '/settings/business-hours', '/settings/custom-fields', '/settings/field-permissions', '/settings/user-groups', '/settings/roles', '/settings/permission-profiles',
  '/settings/record-visibility',
  '/settings/reminders',
  '/settings/scheduled-reports',
  '/settings/recycle-bin',
  '/settings/approval-emails',
  '/settings/interview-emails',
  '/settings/certificate',
  '/settings/sender-addresses',
  '/settings/apply-consent',
  '/settings/careers',
  '/settings/job-boards',
  '/settings/easy-apply',
  '/settings/agencies',
]);

// The ONE staff sidebar, identical in every org-scoped shell (the (recruiter) and (org-admin) route
// groups both call this), so navigating between day-to-day and settings pages never swaps the nav.
// org_admin / acting super_admin get the complete feature nav (which includes the org-config
// surfaces); a plain recruiter gets the scoped subset. Both groups only ever render this for roles
// that already hold the config permissions, so the settings items need no extra per-item gating.
export function buildStaffNav(role: string | null, actingSuperAdmin: boolean) {
  // auditor gets its own read-only subset; an acting super_admin / org_admin gets the full nav; every
  // other role gets the recruiter nav.
  const baseNav = actingSuperAdmin || role === 'org_admin' ? SUPER_ADMIN_FULL_NAV : role === 'auditor' ? AUDITOR_NAV_ITEMS : RECRUITER_NAV_ITEMS;
  return baseNav.map((item) => (V2_ROUTES.has(item.href) ? { ...item, href: `/v2${item.href}` } : item));
}

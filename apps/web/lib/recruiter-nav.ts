import { Sun, LayoutDashboard, FileText, BookOpen, Users, BarChart3, QrCode, Briefcase, TrendingUp, Mail, MessageSquare, MessageCircle, FileSignature, CheckSquare, Building2, CalendarClock } from 'lucide-react';

// The recruiter-scoped nav, shared by BOTH shells that can render it: the (recruiter) route group
// and the (panel) group, which owns /reports and shows this same sidebar to a recruiter or
// org_admin who lands there.
//
// It lives here because it used to be declared twice -- once per layout, with a comment in the
// panel copy saying it "mirrors" the recruiter one. Adding Walk-in Groups to the recruiter copy
// alone meant the item vanished from the sidebar the moment a recruiter clicked Results, which
// reads as the nav hiding things rather than as two lists that had drifted apart.
//
// Add any new recruiter-visible feature here, and to SUPER_ADMIN_FULL_NAV in super-admin-nav.ts.
export const RECRUITER_NAV_ITEMS = [
  // Ungrouped items pin flat at the top; grouped items render under collapsible section headers
  // (see NAV_GROUP_ORDER in staff-nav.ts). Same groups as SUPER_ADMIN_FULL_NAV, minus Admin/Settings.
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/candidates', label: 'Candidates', icon: Users, group: 'Hiring' },
  { href: '/jobs', label: 'Jobs', icon: Briefcase, group: 'Hiring' },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, group: 'Hiring' },
  { href: '/agency-submissions', label: 'Agency Submissions', icon: Building2, group: 'Hiring' },
  { href: '/walk-in-groups', label: 'Walk-in Groups', icon: QrCode, group: 'Hiring' },
  { href: '/exams', label: 'Exams', icon: FileText, group: 'Assessments' },
  { href: '/questions', label: 'Question Bank', icon: BookOpen, group: 'Assessments' },
  // Results (scores, pass/fail, CSV/XLSX/PDF export) previously only appeared for a
  // super-admin impersonating an org, so a plain recruiter had no way to reach the
  // reports console at all -- despite the recruiter role already holding results:view.
  { href: '/reports', label: 'Results', icon: BarChart3, group: 'Assessments' },
  { href: '/message-templates', label: 'Message Templates', icon: Mail, group: 'Messaging' },
  { href: '/sms-templates', label: 'SMS Templates', icon: MessageSquare, group: 'Messaging' },
  { href: '/whatsapp-templates', label: 'WhatsApp Templates', icon: MessageCircle, group: 'Messaging' },
  { href: '/offer-template', label: 'Offer Template', icon: FileSignature, group: 'Messaging' },
  { href: '/calendar', label: 'Calendar', icon: CalendarClock, group: 'Messaging' },
  { href: '/analytics/hiring', label: 'Hiring Analytics', icon: TrendingUp, group: 'Analytics' },
];

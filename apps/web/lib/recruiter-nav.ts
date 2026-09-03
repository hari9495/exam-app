import { LayoutDashboard, FileText, BookOpen, Users, BarChart3, QrCode, Briefcase, TrendingUp, Mail, FileSignature, CheckSquare } from 'lucide-react';

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
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/exams', label: 'Exams', icon: FileText },
  { href: '/questions', label: 'Question Bank', icon: BookOpen },
  { href: '/candidates', label: 'Candidates', icon: Users },
  // Results (scores, pass/fail, CSV/XLSX/PDF export) previously only appeared for a
  // super-admin impersonating an org, so a plain recruiter had no way to reach the
  // reports console at all -- despite the recruiter role already holding results:view.
  { href: '/reports', label: 'Results', icon: BarChart3 },
  { href: '/walk-in-groups', label: 'Walk-in Groups', icon: QrCode },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare },
  { href: '/analytics/hiring', label: 'Hiring Analytics', icon: TrendingUp },
  { href: '/message-templates', label: 'Message Templates', icon: Mail },
  { href: '/offer-template', label: 'Offer Template', icon: FileSignature },
];

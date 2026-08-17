import { LayoutDashboard, FileText, BookOpen, Users, BarChart3, History, ShieldCheck, Settings, Plug, KeyRound, TerminalSquare, QrCode, Briefcase } from 'lucide-react';

// The COMPLETE union of org-scoped staff features. A super_admin acting into an org sees this exact
// nav in EVERY staff shell (recruiter / org-admin / panel), so no feature is ever hidden by whichever
// route group they happen to be on. Regular org roles keep their own scoped nav; this is used only
// when `actingSuperAdmin` is true. Keep this list exhaustive -- it is the single source of truth for
// "a super_admin can reach everything." Add any new staff feature here too.
export const SUPER_ADMIN_FULL_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/exams', label: 'Exams', icon: FileText },
  { href: '/questions', label: 'Question Bank', icon: BookOpen },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/reports', label: 'Results', icon: BarChart3 },
  { href: '/users', label: 'Staff Users', icon: Users },
  { href: '/audit-log', label: 'Audit Log', icon: History },
  { href: '/system-logs', label: 'System Logs', icon: TerminalSquare },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Brand Settings', icon: Settings },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug },
  { href: '/settings/sso', label: 'Single Sign-On', icon: KeyRound },
  { href: '/walk-in-groups', label: 'Walk-in Groups', icon: QrCode },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
];

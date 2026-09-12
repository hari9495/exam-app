import { Sun, LayoutDashboard, FileText, BookOpen, Users, BarChart3, History, ShieldCheck, Settings, Plug, KeyRound, TerminalSquare, QrCode, Briefcase, TrendingUp, Mail, MessageSquare, MessageCircle, FileSignature, CreditCard, CheckSquare, GitPullRequestArrow, Kanban, Clock, SlidersHorizontal, EyeOff, Trash2, MailCheck, Send, FileCheck, Globe, Lock, Rss, Building2, CalendarClock } from 'lucide-react';

// The COMPLETE union of org-scoped staff features. A super_admin acting into an org sees this exact
// nav in EVERY staff shell (recruiter / org-admin / panel), so no feature is ever hidden by whichever
// route group they happen to be on. Regular org roles keep their own scoped nav; this is used only
// when `actingSuperAdmin` is true. Keep this list exhaustive -- it is the single source of truth for
// "a super_admin can reach everything." Add any new staff feature here too.
export const SUPER_ADMIN_FULL_NAV = [
  // Ungrouped items are pinned flat at the top of the sidebar (quick access). Everything else is
  // grouped into collapsible sections; `group` values must appear in NAV_GROUP_ORDER (staff-nav.ts).
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/candidates', label: 'Candidates', icon: Users, group: 'Hiring' },
  { href: '/jobs', label: 'Jobs', icon: Briefcase, group: 'Hiring' },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, group: 'Hiring' },
  { href: '/agency-submissions', label: 'Agency Submissions', icon: Building2, group: 'Hiring' },
  { href: '/walk-in-groups', label: 'Walk-in Groups', icon: QrCode, group: 'Hiring' },
  { href: '/exams', label: 'Exams', icon: FileText, group: 'Assessments' },
  { href: '/questions', label: 'Question Bank', icon: BookOpen, group: 'Assessments' },
  { href: '/reports', label: 'Results', icon: BarChart3, group: 'Assessments' },
  { href: '/message-templates', label: 'Message Templates', icon: Mail, group: 'Messaging' },
  { href: '/sms-templates', label: 'SMS Templates', icon: MessageSquare, group: 'Messaging' },
  { href: '/whatsapp-templates', label: 'WhatsApp Templates', icon: MessageCircle, group: 'Messaging' },
  { href: '/offer-template', label: 'Offer Template', icon: FileSignature, group: 'Messaging' },
  { href: '/calendar', label: 'Calendar', icon: CalendarClock, group: 'Messaging' },
  { href: '/analytics/hiring', label: 'Hiring Analytics', icon: TrendingUp, group: 'Analytics' },
  { href: '/users', label: 'Staff Users', icon: Users, group: 'Admin' },
  { href: '/audit-log', label: 'Audit Log', icon: History, group: 'Admin' },
  { href: '/system-logs', label: 'System Logs', icon: TerminalSquare, group: 'Admin' },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck, group: 'Admin' },
  // Org-config surfaces (the long tail). Only org_admin / acting super_admin ever render this list,
  // which is exactly who holds the config permissions, so no per-item permission gating is needed.
  { href: '/settings/branding', label: 'Brand Settings', icon: Settings, group: 'Settings' },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug, group: 'Settings' },
  { href: '/settings/sso', label: 'Single Sign-On', icon: KeyRound, group: 'Settings' },
  { href: '/settings/billing', label: 'Billing', icon: CreditCard, group: 'Settings' },
  { href: '/settings/approvals', label: 'Approval chains', icon: GitPullRequestArrow, group: 'Settings' },
  { href: '/settings/approval-emails', label: 'Approval Emails', icon: MailCheck, group: 'Settings' },
  { href: '/settings/pipelines', label: 'Pipelines', icon: Kanban, group: 'Settings' },
  { href: '/settings/business-hours', label: 'Business hours', icon: Clock, group: 'Settings' },
  { href: '/settings/custom-fields', label: 'Custom Fields', icon: SlidersHorizontal, group: 'Settings' },
  { href: '/settings/field-permissions', label: 'Field permissions', icon: EyeOff, group: 'Settings' },
  { href: '/settings/user-groups', label: 'User Groups', icon: Users, group: 'Settings' },
  { href: '/settings/permission-profiles', label: 'Permission Profiles', icon: Lock, group: 'Settings' },
  { href: '/settings/record-visibility', label: 'Record Visibility', icon: EyeOff, group: 'Settings' },
  { href: '/settings/recycle-bin', label: 'Recycle Bin', icon: Trash2, group: 'Settings' },
  { href: '/settings/sender-addresses', label: 'Sender Addresses', icon: Send, group: 'Settings' },
  { href: '/settings/apply-consent', label: 'Applicant Consent', icon: FileCheck, group: 'Settings' },
  { href: '/settings/careers', label: 'Careers Site', icon: Globe, group: 'Settings' },
  { href: '/settings/job-boards', label: 'Job Boards', icon: Rss, group: 'Settings' },
  { href: '/settings/easy-apply', label: 'Easy Apply', icon: Rss, group: 'Settings' },
  { href: '/settings/agencies', label: 'Agencies', icon: Building2, group: 'Settings' },
];

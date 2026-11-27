// T2-G 83 (Admin A4): settings pages link to the work pages they affect. Each drawn page's "Related" names screens by
// their design id; this is where each one lives in the app. A settings page shows a related link only when it has a
// live page here and the person's menu has it, so no link is dead or opens a page they cannot use.
export const SCREEN_PAGES: Record<string, string> = {
  // Platform
  'PLT-03': '/yx/notifications',
  'PLT-04': '/yx/approvals',
  'PLT-07': '/yx/me/delegation',
  'PLT-08': '/yx/settings/setup-hub',
  'PLT-11': '/yx/settings/access',
  'PLT-12': '/yx/settings/approval-policies',
  'PLT-13': '/yx/me/notifications',
  'PLT-14': '/yx/settings/integrations/integrations',
  'PLT-15': '/yx/settings/integrations/developers',
  'PLT-16': '/yx/settings/audit-log',
  'PLT-17': '/yx/settings/support-access',
  'PLT-19': '/yx/settings/account/plan-and-add-ons',
  'PLT-29': '/yx/settings/integrations/calendar-and-chat',
  // People
  'PPL-01': '/yx/people/directory',
  'PPL-02': '/yx/people/org-chart',
  'PPL-04': '/yx/people/changes',
  'PPL-05': '/yx/people/scheduled',
  'PPL-07': '/yx/people/import',
  'PPL-09': '/yx/people/restructure',
  'PPL-11': '/yx/people/onboarding',
  'PPL-14': '/yx/people/batches',
  'PPL-16': '/yx/people/probation',
  'PPL-19': '/yx/people/exits',
  'PPL-20': '/yx/people/clearance',
  'PPL-24': '/yx/people/absconding',
  'PPL-25': '/yx/people/assets',
  'PPL-27': '/yx/people/documents',
  'PPL-28': '/yx/people/letters',
  'PPL-29': '/yx/settings/letters',
  'PPL-30': '/yx/me/documents',
  'PPL-32': '/yx/people/profile-requests',
  'PPL-33': '/yx/me/privacy',
  // Time
  'TIM-02': '/yx/time/muster',
  'TIM-04': '/yx/time/exceptions',
  'TIM-05': '/yx/time/roster',
  'TIM-06': '/yx/time/shifts-setup',
  'TIM-09': '/yx/time/overtime-review',
  'TIM-11': '/yx/time/periods',
  'TIM-14': '/yx/time/setup/devices',
  'TIM-26': '/yx/time/setup/holidays',
  'TIM-27': '/yx/time/setup',
  'TIM-28': '/yx/time/setup',
  'TIM-30': '/yx/time/reports',
  'TIM-31': '/yx/time/setup/locations',
  'TIM-34': '/yx/time/auto-roster',
  'TIM-42': '/yx/time/setup/holiday-feeds',
  'TIM-43': '/yx/time/timesheet',
  // Pay and expenses
  'PAY-01': '/yx/payroll/runs',
  'PAY-10': '/yx/payroll/files',
  'PAY-12': '/yx/payroll/compensation',
  'PAY-14': '/yx/payroll/components',
  'PAY-16': '/yx/payroll/setup',
  'PAY-17': '/yx/payroll/loans',
  'PAY-20': '/yx/payroll/payslip-queries',
  'PAY-21': '/yx/me/payslips',
  'PAY-22': '/yx/me/tax',
  'PAY-23': '/yx/payroll/proofs',
  'PAY-24': '/yx/payroll/bonus',
  'PAY-26': '/yx/me/earned-pay',
  'PAY-30': '/yx/payroll/coverage',
  'CMP-01': '/yx/payroll/statutory',
  'CMP-03': '/yx/payroll/registers',
  'EXP-01': '/yx/expenses',
  'EXP-05': '/yx/expenses/advances',
  'EXP-08': '/yx/expenses/cards',
  // Hiring and staffing
  'HIR-01': '/yx/hiring/plans',
  'HIR-10': '/yx/hiring/bgv',
  'HIR-11': '/yx/hiring/costs',
  'HIR-14': '/yx/staffing/clients',
  'HIR-17': '/yx/staffing/placements',
  'HIR-18': '/yx/staffing/invoices',
  'HIR-19': '/yx/staffing/collections',
  'PRC-01': '/yx/hiring/assessments/questions',
  'PRC-18': '/yx/hiring/assessments/appeals',
  // Performance, learning, engage
  'PRF-04': '/yx/performance/cycles',
  'PRF-09': '/yx/performance/calibrations',
  'PRF-10': '/yx/performance/comp',
  'PRF-16': '/yx/performance/coach',
  'LRN-08': '/yx/learning/compliance',
  'ENG-01': '/yx/engage',
  'ENG-03': '/yx/engage/announcements',
  'ENG-04': '/yx/engage/surveys',
  'ENG-11': '/yx/engage/moderation',
  // Helpdesk, projects, contract labour, analytics, visitors
  'HLP-04': '/yx/desk/knowledge',
  'HLP-05': '/yx/desk/reports',
  'HLP-09': '/yx/desk/ethics',
  'HLP-10': '/yx/desk/policies',
  'HLP-11': '/yx/desk/policy-admin',
  'PRJ-01': '/yx/projects',
  'PRJ-03': '/yx/projects/capacity',
  'CLB-01': '/yx/contract-labour/contractors',
  'CLB-04': '/yx/contract-labour/registers',
  'ANL-08': '/yx/analytics/schedules',
  'VIS-02': '/yx/visitors/invites',
};

/** The page's related links the person can open (its own live page, in their menu); `extra` overrides per page. */
export function liveRelated<P extends { related?: { label: string; screenId: string }[] }>(page: P, inMenu: (href: string) => boolean, extra: Record<string, string> = {}): P {
  if (!page.related) return page;
  return { ...page, related: page.related.filter((r) => {
    const href = extra[r.screenId] ?? SCREEN_PAGES[r.screenId];
    return Boolean(href && inMenu(href));
  }) };
}

export const screenHref = (screenId: string, extra: Record<string, string> = {}): string | undefined => extra[screenId] ?? SCREEN_PAGES[screenId];

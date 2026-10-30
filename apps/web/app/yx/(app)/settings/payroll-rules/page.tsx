'use client';

import { CompanySettingsPage } from '../../../../../lib/yx-settings-page';

// Settings › Payroll & Statutory › Payroll rules (founder 30 Oct 2026, last 10, items 1 and 5): statutory bonus rules and
// loans and advances, per company or legal entity. HR changes them (org.settings.manage); payroll set-up reads them (payroll.setup.manage).
export default function YxPayrollRulesPage() {
  return <CompanySettingsPage section="payroll" />;
}

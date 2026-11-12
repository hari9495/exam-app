'use client';

import { useParams } from 'next/navigation';
import { PAY_SETTINGS } from '@yukthix/ui/hiring';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › Payroll & Statutory pages (S-3, answers 1323 to 1325): 4.3 Payroll policies, 4.4 Payslip layout and 4.5 Tax
// with the company's settings. HR's settings key changes them (payroll set-up reads them: payroll never changes policy);
// each change waits for a second person with HR's settings key while the company switch is on (the default).
const PAGES = Object.keys(PAY_SETTINGS);
const LINKS: Record<string, string> = { 'payslip.editor': '/yx/payroll/payslip-layout' };
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxPayrollSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={LINKS} canEdit={canEdit} secondPerson />;
}

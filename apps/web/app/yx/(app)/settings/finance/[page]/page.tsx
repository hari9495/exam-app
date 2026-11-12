'use client';

import { useParams } from 'next/navigation';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › Expenses & travel (4.8) (S-8, answer 1323): the drawn page with the company's expense choices that had no
// screen, and the link to the policy matrix editor (EXP-07). HR's settings key or expense set-up changes them.
const PAGES = ['4.8'];
const LINKS: Record<string, string> = { 'exp.policy_matrix_editor': '/yx/settings/expenses' };
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage') || has('expense.policy.manage');

export default function YxFinanceSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={LINKS} canEdit={canEdit} />;
}

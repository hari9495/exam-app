'use client';

import { useParams } from 'next/navigation';
import { PEOPLE_SETTINGS, withApprovalPolicies } from '@yukthix/ui/hiring';
import { APPROVAL_POLICIES, useApprovalPolicies } from '../../../../../../lib/yx-approval-policies';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › People & Access pages (S-4, answer 1323): 2.7 Exit & lifecycle policies and 2.10 Audit & data retention with
// the company's settings that had no screen. HR's settings key changes them (the audit log's length needs the access key
// too). Their other settings are still on Company rules and Access and privacy, linked from the page (S-7 moves them).
const PAGES = Object.keys(PEOPLE_SETTINGS);
const SCREENS: Record<string, string> = { 'company-rules': '/yx/settings/company-rules', 'access-settings': '/yx/settings/access-settings', 'PLT-04': '/yx/approvals' };
// S-6 (answer 1330): 2.4's drawn link opens the approval policy editor.
const LINKS: Record<string, string> = { 'approval.policy_editor': APPROVAL_POLICIES };
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxPeopleSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const policies = useApprovalPolicies(page === 'approvals');
  return (
    <RegistrySettingsPage
      slug={page}
      pageIds={PAGES}
      links={LINKS}
      screens={SCREENS}
      canEdit={canEdit}
      decorate={page === 'approvals' && policies.data ? (p) => withApprovalPolicies(p, policies.data!) : undefined}
    />
  );
}

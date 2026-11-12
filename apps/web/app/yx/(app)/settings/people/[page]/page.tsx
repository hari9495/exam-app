'use client';

import { useParams } from 'next/navigation';
import { PEOPLE_SETTINGS, withApprovalPolicies } from '@yukthix/ui/hiring';
import { APPROVAL_POLICIES, useApprovalPolicies } from '../../../../../../lib/yx-approval-policies';
import { useQuery } from '@tanstack/react-query';
import { ErasureCard, type ErasureReport } from '@yukthix/ui/org';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › People & Access pages (S-4, answer 1323; S-7, answers 1321, 1561: 2.1, 2.2, 2.3, 2.5, 2.6 and 2.9 too): 2.7 Exit & lifecycle policies and 2.10 Audit & data retention with
// the company's settings that had no screen. HR's settings key changes them (the audit log's length needs the access key
// too). Their other settings are still on Company rules and Access and privacy, linked from the page (S-7 moves them).
const PAGES = Object.keys(PEOPLE_SETTINGS);
const SCREENS: Record<string, string> = { 'PLT-04': '/yx/approvals' };
// S-6 (answer 1330): 2.4's drawn link opens the approval policy editor.
const LINKS: Record<string, string> = { 'approval.policy_editor': APPROVAL_POLICIES };
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxPeopleSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const policies = useApprovalPolicies(page === 'approvals');
  // S-7: 2.2 keeps Access and privacy's Special data erasure report (company-wide settings managers; a 403 hides it).
  const { accessToken } = useAuth();
  const perms = useYxPermissions();
  const erasure = useQuery<ErasureReport>({ queryKey: ['yx', 'org', 'people-privacy-erasure'], queryFn: () => apiFetch('/people/privacy-erasure', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && page === 'directory-and-privacy' && perms.has('org.settings.manage'), retry: false });
  return (
    <RegistrySettingsPage
      slug={page}
      pageIds={PAGES}
      links={LINKS}
      screens={SCREENS}
      canEdit={canEdit}
      decorate={page === 'approvals' && policies.data ? (p) => withApprovalPolicies(p, policies.data!) : undefined}
      extra={page === 'directory-and-privacy' && erasure.data ? <ErasureCard report={erasure.data} /> : undefined}
    />
  );
}

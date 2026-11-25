'use client';

import { useParams } from 'next/navigation';
import { CertificateCard, type CertificateTemplateView } from '@yukthix/ui/hiring';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { useAuth } from '../../../../../../lib/auth-context';

// Settings › Performance (6.3) (S-8, answer 1323): the drawn page with the company's performance choices that had no
// screen, and links to the editors (review templates and cycles, the comp review, competencies). HR's settings key or
// performance set-up changes them.
// Settings › Assessments (6.5) (AS-2, answers 2007, 2008, 2123): the company's test defaults; HR's settings key or the
// assessments settings key (test owners) changes them.
const PAGES = ['6.3', '6.5'];
const LINKS: Record<string, string> = {
  'perf.templates': '/yx/performance/cycles',
  'perf.comp_matrix': '/yx/performance/comp',
  'perf.competencies': '/yx/settings/performance',
};
const canEdit = (has: (k: string) => boolean, page: { id: string }) => has('org.settings.manage') || has(page.id === '6.5' ? 'assessments.settings.manage' : 'perf.setup.manage');

// Answer 2424 (retiring /v2): 6.5's Pass certificate section, the wording on a passing candidate's certificate, read and
// saved through its own API with the same keys (never while acting for someone else).
export default function YxTalentSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const certKey = page === 'assessments' && (perms.has('exam:manage') || perms.has('assessments.settings.manage'));
  const cert = useApi<CertificateTemplateView>(certKey ? '/certificate-template' : null);
  const write = useApiWrite();
  const extra = cert.data ? <CertificateCard template={cert.data} canEdit={!impersonating && !actingSuperAdmin} onSave={(input) => write('PUT', '/certificate-template', input)} /> : undefined;
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={LINKS} canEdit={canEdit} extra={extra} />;
}

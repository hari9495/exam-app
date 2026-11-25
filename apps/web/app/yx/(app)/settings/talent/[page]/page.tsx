'use client';

import { useParams } from 'next/navigation';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

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

export default function YxTalentSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={LINKS} canEdit={canEdit} />;
}

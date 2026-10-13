'use client';

import { ScorecardTemplatesScreen, type ScorecardTemplateView } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';

// Hiring › Interview scorecards (M10 batch AT5, YX-ATS-51): templates with weights and a pass bar.
export default function YxScorecardTemplatesPage() {
  const perms = useYxPermissions();
  const templates = useHiring<ScorecardTemplateView[]>('/scorecard-templates');
  const competencies = useHiring<{ id: string; name: string }[]>('/scorecard-competencies');
  const write = useHiringWrite();
  return (
    <ScorecardTemplatesScreen
      state={loadState(templates)}
      onRetry={() => void templates.refetch()}
      templates={templates.data ?? []}
      competencies={(competencies.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      canManage={perms.has('pipelines:configure')}
      onSave={(id, input) => (id ? write('PUT', `/scorecard-templates/${id}`, input) : write('POST', '/scorecard-templates', input))}
      onArchive={(id) => write('DELETE', `/scorecard-templates/${id}`)}
    />
  );
}

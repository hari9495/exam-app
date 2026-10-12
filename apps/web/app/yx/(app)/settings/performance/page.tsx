'use client';

import { PerformanceSetupScreen, type Competency, type RatingScale, type ReviewTemplate, type Skill } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, todayIst, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// Settings › Performance (M06-BUILD-DESIGN §5.2, §6; Settings 6.3 and PRF-14; PM-1.05): review templates and their
// versions, rating scales, competencies with the level each job title needs, and the company skills library.
export default function YxPerformanceSetupPage() {
  const perms = useYxPermissions();
  const scales = usePerf<RatingScale[]>('/scales');
  const templates = usePerf<ReviewTemplate[]>('/templates');
  const competencies = usePerf<Competency[]>('/competencies');
  const skills = usePerf<Skill[]>('/skills');
  // Job titles for the competency map; readable with the structure keys (the list is empty without them).
  const designations = useOrg<MasterRecord[]>('/masters/designations', perms.has('org.structure.view') || perms.has('org.settings.manage'));
  const write = usePerfWrite();
  const all = [scales, templates, competencies, skills];
  return (
    <PerformanceSetupScreen
      state={loadState(...all)}
      onRetry={() => void Promise.all(all.map((q) => q.refetch()))}
      today={todayIst()}
      scales={scales.data ?? []}
      templates={templates.data ?? []}
      competencies={competencies.data ?? []}
      skills={skills.data ?? []}
      designations={(designations.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name }))}
      onUseStarters={() => write('POST', '/setup/from-starter')}
      onSaveScale={(id, s) => (id ? write('PUT', `/scales/${encodeURIComponent(id)}`, s) : write('POST', '/scales', s))}
      onRetireScale={(id) => write('POST', `/scales/${encodeURIComponent(id)}/retire`)}
      onSaveTemplate={(id, t) => (id ? write('PUT', `/templates/${encodeURIComponent(id)}`, t) : write('POST', '/templates', t))}
      onNewVersion={(id) => write('POST', `/templates/${encodeURIComponent(id)}/new-version`)}
      onActivate={(id, version) => write('POST', `/templates/${encodeURIComponent(id)}/activate`, { version })}
      onRetireTemplate={(id) => write('POST', `/templates/${encodeURIComponent(id)}/retire`)}
      onSaveCompetency={(id, c) => (id ? write('PUT', `/competencies/${encodeURIComponent(id)}`, c) : write('POST', '/competencies', c))}
      onRetireCompetency={(id) => write('POST', `/competencies/${encodeURIComponent(id)}/retire`)}
      onSaveSkill={(id, s) => (id ? write('PUT', `/skills/${encodeURIComponent(id)}`, s) : write('POST', '/skills', s))}
      onRetireSkill={(id) => write('POST', `/skills/${encodeURIComponent(id)}/retire`)}
      onMergeSkill={(id, intoId) => write('POST', `/skills/${encodeURIComponent(id)}/merge`, { intoId })}
    />
  );
}

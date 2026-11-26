'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { CertificateCard, type CertificateTemplateView } from '@yukthix/ui/hiring';
import { AgendaTemplateSheet, GoalTemplateSheet, PERF_SETUP_LISTS, PerfStartersCard, RatingScaleSheet, ReviewTemplateSheet, SkillSheet, perfSetupPage, skillsInOrder, type AgendaTemplate, type GoalTemplate, type RatingScale, type ReviewTemplate, type Skill } from '@yukthix/ui/performance';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { useOrg, useYxPermissions } from '../../../../../../lib/yx-org';
import type { MasterRecord } from '@yukthix/ui/org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';
import { useAuth } from '../../../../../../lib/auth-context';

// Settings › Performance (6.3) (S-8, answer 1323): the drawn page with the company's performance choices that had no
// screen, and links to the editors (review templates and cycles, the comp review, competencies). HR's settings key or
// performance set-up changes them. Batch T2-C (2411): the old set-up copy is gone; its review templates, rating scales
// and skills library (answer 2671) are lists on this drawn page for perf.setup.manage, edited in their sheets through
// /performance; competencies are the drawn PRF-14 framework.
// Settings › Assessments (6.5) (AS-2, answers 2007, 2008, 2123): the company's test defaults; HR's settings key or the
// assessments settings key (test owners) changes them.
const PAGES = ['6.3', '6.5'];
const LINKS: Record<string, string> = {
  'perf.templates': '/yx/performance/cycles',
  'perf.comp_matrix': '/yx/performance/comp',
  'perf.competencies': '/yx/performance/competencies',
};
const canEdit = (has: (k: string) => boolean, page: { id: string }) => has('org.settings.manage') || has(page.id === '6.5' ? 'assessments.settings.manage' : 'perf.setup.manage');
type Open = { list: 'templates' | 'scales' | 'skills' | 'agenda' | 'goals'; row: number | 'new' } | null;

// Answer 2424 (retiring /v2): 6.5's Pass certificate section, the wording on a passing candidate's certificate, read and
// saved through its own API with the same keys (never while acting for someone else).
export default function YxTalentSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const certKey = page === 'assessments' && (perms.has('exam:manage') || perms.has('assessments.settings.manage'));
  const cert = useApi<CertificateTemplateView>(certKey ? '/certificate-template' : null);
  const write = useApiWrite();
  // 6.3's set-up lists (the /performance set-up routes need perf.setup.manage).
  const setup = page === 'performance' && perms.has('perf.setup.manage');
  const templates = usePerf<ReviewTemplate[]>(setup ? '/templates' : null);
  const scales = usePerf<RatingScale[]>(setup ? '/scales' : null);
  const skills = usePerf<Skill[]>(setup ? '/skills' : null);
  // T2-C item 70 (answer 2843): the company's 1:1 agenda templates (a manager's own are not listed here).
  const agenda = usePerf<AgendaTemplate[]>(setup ? '/one-on-one-templates' : null);
  // T2-C item 71 (answer 2844): goal templates by department or designation.
  const goalTemplates = usePerf<GoalTemplate[]>(setup ? '/goal-templates' : null);
  const departments = useOrg<MasterRecord[]>('/masters/departments', setup);
  const designations = useOrg<MasterRecord[]>('/masters/designations', setup);
  const choices = (rows?: MasterRecord[]) => (rows ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name }));
  const perfWrite = usePerfWrite();
  const [open, setOpen] = useState<Open>(null);
  const data = templates.data && scales.data && skills.data && agenda.data && goalTemplates.data ? { templates: templates.data, scales: scales.data, skills: skills.data, agendaTemplates: agenda.data, goalTemplates: goalTemplates.data } : null;
  const companyAgenda = (agenda.data ?? []).filter((t) => t.company);
  const at = <T,>(rows: T[], row: number | 'new') => (row === 'new' ? null : (rows[row] ?? null));
  const close = () => setOpen(null);
  const id = (x: { id: string }) => encodeURIComponent(x.id);
  const extra = cert.data ? (
    <CertificateCard template={cert.data} canEdit={!impersonating && !actingSuperAdmin} onSave={(input) => write('PUT', '/certificate-template', input)} />
  ) : data && !data.templates.length && !data.scales.length ? (
    <PerfStartersCard onUseStarters={() => perfWrite('POST', '/setup/from-starter')} />
  ) : undefined;
  const template = data && open?.list === 'templates' ? at(data.templates, open.row) : null;
  const scale = data && open?.list === 'scales' ? at(data.scales, open.row) : null;
  const skill = data && open?.list === 'skills' ? at(skillsInOrder(data.skills).map((x) => x.skill), open.row) : null;
  return (
    <>
      <RegistrySettingsPage
        slug={page}
        pageIds={PAGES}
        links={LINKS}
        canEdit={canEdit}
        extra={extra}
        decorate={data ? (p) => (p.id === '6.3' ? perfSetupPage(p, data) : p) : undefined}
        listEditors={data ? { [PERF_SETUP_LISTS.templates]: (row) => setOpen({ list: 'templates', row }), [PERF_SETUP_LISTS.scales]: (row) => setOpen({ list: 'scales', row }), [PERF_SETUP_LISTS.skills]: (row) => setOpen({ list: 'skills', row }), [PERF_SETUP_LISTS.agendaTemplates]: (row) => setOpen({ list: 'agenda', row }), [PERF_SETUP_LISTS.goalTemplates]: (row) => setOpen({ list: 'goals', row }) } : undefined}
      />
      {data && open?.list === 'templates' && (
        <ReviewTemplateSheet
          template={template}
          scales={data.scales.filter((s) => s.status === 'active')}
          hasDraft={Boolean(template && data.templates.some((x) => x.familyId === template.familyId && x.status === 'draft'))}
          onClose={close}
          onSave={(input) => (template ? perfWrite('PUT', `/templates/${id(template)}`, input) : perfWrite('POST', '/templates', input))}
          onActivate={() => perfWrite('POST', `/templates/${id(template!)}/activate`, { version: template!.version })}
          onNewVersion={() => perfWrite('POST', `/templates/${id(template!)}/new-version`)}
          onRetire={() => perfWrite('POST', `/templates/${id(template!)}/retire`)}
        />
      )}
      {data && open?.list === 'scales' && (
        <RatingScaleSheet scale={scale} onClose={close} onSave={(input) => (scale ? perfWrite('PUT', `/scales/${id(scale)}`, input) : perfWrite('POST', '/scales', input))} onRetire={() => perfWrite('POST', `/scales/${id(scale!)}/retire`)} />
      )}
      {data && open?.list === 'goals' && (() => {
        const t = at(data.goalTemplates, open.row);
        return <GoalTemplateSheet template={t} departments={choices(departments.data)} designations={choices(designations.data)} onClose={close} onSave={(input) => (t ? perfWrite('PUT', `/goal-templates/${id(t)}`, input) : perfWrite('POST', '/goal-templates', input))} onDelete={() => perfWrite('DELETE', `/goal-templates/${id(t!)}`)} />;
      })()}
      {data && open?.list === 'agenda' && (() => {
        const t = at(companyAgenda, open.row);
        return <AgendaTemplateSheet template={t} onClose={close} onSave={(input) => (t ? perfWrite('PUT', `/one-on-one-templates/${id(t)}`, input) : perfWrite('POST', '/one-on-one-templates', { ...input, company: true }))} onDelete={() => perfWrite('DELETE', `/one-on-one-templates/${id(t!)}`)} />;
      })()}
      {data && open?.list === 'skills' && (
        <SkillSheet
          skill={skill}
          skills={data.skills}
          onClose={close}
          onAdd={(input) => perfWrite('POST', '/skills', input)}
          onMerge={(intoId) => perfWrite('POST', `/skills/${id(skill!)}/merge`, { intoId })}
          onRetire={() => perfWrite('POST', `/skills/${id(skill!)}/retire`)}
        />
      )}
    </>
  );
}

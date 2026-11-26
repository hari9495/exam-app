import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card, DescriptionList } from '../../components/shell';
import { errorText } from '../org/org-kit';
import type { RatingScale, ReviewTemplate, ScaleInput, SectionKind, Skill, TemplateInput, TemplateKind, TemplateSection, Who } from '../performance/live/types';
import type { SettingDef, SettingsPageDef } from './settings-types';
import type { AgendaTemplate } from './agenda-templates-live';

// Settings 6.3 Performance (batch T2-C, 2411): the drawn page made live with the editors the old live copy had (batch PM1,
// M06-BUILD-DESIGN §5.2, §6, §9.1). Review templates, rating scales and the skills library show as lists on the drawn
// page (answer 2671: one skills library, here); Add and each row's Edit open these sheets, saved through their own API at
// once. Competencies are the drawn PRF-14 framework, linked from the page. A template in use changes only through a new
// version, a scale in use never changes, and nothing is deleted (retired or merged instead).

export const KIND_LABEL: Record<TemplateKind, string> = { annual: 'Annual', half_yearly: 'Half-yearly', quarterly: 'Quarterly', project: 'Project', probation: 'Probation' };
const SECTION_LABEL: Record<SectionKind, string> = { goals: 'Goals', competencies: 'Competencies', values: 'Values', questions: 'Open questions', overall: 'Overall rating' };
const WHO_LABEL: Record<Who, string> = { self: 'The employee', manager: 'The manager', peer: 'Peers (360°)', skip: 'Skip-level manager' };
const SKILL_KIND: Record<Skill['kind'], string> = { domain: 'Domain', skill: 'Skill', sub_skill: 'Sub-skill' };
const STATUS_LABEL = { draft: 'Draft', active: 'Active', retired: 'Retired', merged: 'Merged' } as const;
const total = (sections: readonly TemplateSection[]) => Math.round(sections.filter((s) => s.rated).reduce((t, s) => t + s.weight, 0) * 100) / 100;

export interface PerfSetupData {
  templates: ReviewTemplate[];
  scales: RatingScale[];
  skills: Skill[];
  /** T2-C item 70 (answer 2843): 1:1 agenda templates (company ones are edited here; a manager's own are not listed). */
  agendaTemplates?: AgendaTemplate[];
}

/** The skills library in the order the page lists it (by its path, Domain › Skill › Sub-skill). */
export function skillsInOrder(skills: readonly Skill[]): { skill: Skill; path: string }[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const path = (s: Skill, depth = 0): string => (s.parentId && byId.get(s.parentId) && depth < 3 ? `${path(byId.get(s.parentId)!, depth + 1)} › ${s.name}` : s.name);
  return skills.map((skill) => ({ skill, path: path(skill) })).sort((a, b) => a.path.localeCompare(b.path));
}

/** The keys of the lists this module adds to the drawn page (for listEditors). */
export const PERF_SETUP_LISTS = { templates: 'perf.review_templates', scales: 'perf.rating_scales', skills: 'perf.skills_library', agendaTemplates: 'perf.one_on_one_templates' } as const;

/**
 * The drawn 6.3 page with the live lists: review templates and rating scales under the drawn Review templates link,
 * the skills library under the drawn competency link. Rows keep the order of `data` (skills: skillsInOrder).
 */
export function perfSetupPage(page: SettingsPageDef, data: PerfSetupData): SettingsPageDef {
  const scaleName = new Map(data.scales.map((s) => [s.id, s.name]));
  const list = (key: string, label: string, columns: string[], rows: string[][], addLabel: string, helper: string): SettingDef => ({ key, label, kind: 'list', columns, rows, addLabel, helper, readOnlyList: true, starter: false });
  const templates = list(
    PERF_SETUP_LISTS.templates,
    'Review templates',
    ['Template', 'Status', 'Kind', 'Rating scale'],
    data.templates.map((t) => [`${t.name} · version ${t.templateVersion}`, [STATUS_LABEL[t.status], t.starter ? 'Starter' : null, t.status === 'draft' && t.problem ? `Not ready: ${t.problem}` : null].filter(Boolean).join(' · '), KIND_LABEL[t.kind], scaleName.get(t.scaleId) ?? '—']),
    'Add a template',
    'A template in use changes only through a new version. Nothing is deleted: retire a template instead.',
  );
  const scales = list(
    PERF_SETUP_LISTS.scales,
    'Rating scales',
    ['Scale', 'Ratings', 'Labels', 'Status'],
    data.scales.map((s) => [s.name, `${s.min}–${s.max}${s.step === 0.5 ? ' (half points)' : ''}`, s.levels.filter((l) => l.value % 1 === 0).map((l) => l.label).join(' · '), [STATUS_LABEL[s.status], s.inUse ? 'In use' : null].filter(Boolean).join(' · ')]),
    'Add a scale',
    'Once a template uses a scale, it cannot change, so ratings already given keep their meaning.',
  );
  const byId = new Map(data.skills.map((s) => [s.id, s]));
  const skills = list(
    PERF_SETUP_LISTS.skills,
    'Skills library',
    ['Skill', 'Level', 'Status'],
    skillsInOrder(data.skills).map(({ skill: s, path }) => [path, SKILL_KIND[s.kind], [s.status === 'merged' ? `Merged into ${byId.get(s.mergedIntoId ?? '')?.name ?? ''}` : STATUS_LABEL[s.status], s.competency ? 'Competency' : null].filter(Boolean).join(' · ')]),
    'Add a skill',
    'One library for the company: domains, skills and sub-skills. A skill in use is never deleted: retire it, or merge it into another.',
  );
  const after = (key: string, add: SettingDef[]) => (s: SettingsPageDef['sections'][number]) => {
    const i = s.settings.findIndex((d) => d.key === key);
    return i < 0 ? s : { ...s, settings: [...s.settings.slice(0, i + 1), ...add, ...s.settings.slice(i + 1)] };
  };
  // T2-C item 70 (answer 2843): the company's 1:1 agenda templates, under the 1:1 part of the page.
  const company = (data.agendaTemplates ?? []).filter((t) => t.company);
  const agenda = data.agendaTemplates
    ? [list(PERF_SETUP_LISTS.agendaTemplates, '1:1 agenda templates', ['Template', 'Agenda lines'], company.map((t) => [t.name, `${t.items.length} · ${t.items.slice(0, 2).join(' · ')}${t.items.length > 2 ? ' …' : ''}`]), 'Add a 1:1 template', 'Managers pick one when they plan a 1:1; its lines fill the agenda, which stays editable. Managers may also save their own.')]
    : [];
  let sections = page.sections.map(after('perf.templates', [templates, scales])).map(after('perf.competencies', [skills, ...agenda]));
  // A page drawn without those links still lists them, in a section of their own.
  const has = (k: string) => sections.some((s) => s.settings.some((d) => d.key === k));
  if (!has(templates.key)) sections = [...sections, { title: 'Review templates and scales', settings: [templates, scales] }];
  if (!has(skills.key)) sections = [...sections, { title: 'Skills library', settings: [skills] }];
  if (agenda.length && !has(agenda[0]!.key)) sections = [...sections, { title: '1:1 agenda templates', settings: agenda }];
  return { ...page, sections };
}

/** A new company copies the YukthiX starters: a five-point scale, four review templates and twelve competencies. */
export function PerfStartersCard({ onUseStarters }: { onUseStarters: () => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <Card title="No performance set-up yet">
      <Text as="p" tone="secondary">
        Start from the YukthiX starters: a five-point scale, four review templates and twelve competencies, all yours to change.
      </Text>
      {failed && (
        <InlineAlert tone="danger" title="That didn't work">
          {failed}
        </InlineAlert>
      )}
      <div>
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(null);
            try {
              await onUseStarters();
              toast?.toast({ tone: 'success', title: 'Starters copied', description: 'Change them to suit the company.' });
            } catch (e) {
              setFailed(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Use the starters
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ review templates

export interface ReviewTemplateSheetProps {
  /** null: a new template. */
  template: ReviewTemplate | null;
  /** Active scales a template may use. */
  scales: RatingScale[];
  /** The template's family already has a draft (no second new version). */
  hasDraft: boolean;
  onClose: () => void;
  onSave: (input: TemplateInput) => Promise<unknown>;
  onActivate: () => Promise<unknown>;
  onNewVersion: () => Promise<unknown>;
  onRetire: () => Promise<unknown>;
}

const blankSection = (): TemplateSection => ({ kind: 'questions', title: '', weight: 0, rated: false, whoAnswers: ['self', 'manager'], questions: [{ text: '', answer: 'text' }] });

/** A draft (or a new template) is edited here; an active or retired one is read, with New version and Retire. */
export function ReviewTemplateSheet(p: ReviewTemplateSheetProps) {
  const t = p.template;
  const toast = useToastIfAny();
  const [retiring, setRetiring] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const act = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(what);
    setFailed(null);
    try {
      await fn();
      toast?.toast({ tone: 'success', title: done });
      p.onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const retire = retiring && t && (
    <ConfirmDialog open onOpenChange={(o) => !o && setRetiring(false)} size="sm" title={`Retire ${t.name}?`} consequence="It is not offered for new review cycles. Reviews that used it keep it." confirmLabel="Retire template" destructive onConfirm={async () => {
      await p.onRetire();
      toast?.toast({ tone: 'success', title: 'Template retired' });
      p.onClose();
    }} />
  );
  if (!t || t.status === 'draft') return <TemplateForm {...p} failed={failed} busy={busy} onActivate={() => void act('activate', p.onActivate, 'Template activated')} onRetire={() => setRetiring(true)} toast={(title) => toast?.toast({ tone: 'success', title })}>{retire}</TemplateForm>;
  const scale = p.scales.find((s) => s.id === t.scaleId)?.name ?? '—';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && p.onClose()}
      size="md"
      title={`${t.name} · version ${t.templateVersion}`}
      subtitle={t.status === 'active' ? 'In use, so it changes only through a new version.' : 'Retired: not offered for new review cycles.'}
      footer={
        <>
          <Button onClick={p.onClose}>Close</Button>
          {t.status !== 'retired' && (
            <Button variant="danger" onClick={() => setRetiring(true)}>
              Retire
            </Button>
          )}
          {!p.hasDraft && (
            <Button variant="primary" loading={busy === 'version'} onClick={() => void act('version', p.onNewVersion, 'New version made as a draft')}>
              New version
            </Button>
          )}
        </>
      }
    >
      {failed && (
        <InlineAlert tone="danger" title="That didn't work">
          {failed}
        </InlineAlert>
      )}
      {p.hasDraft && (
        <InlineAlert tone="info" title="A new version is already a draft">
          Change the draft in the list.
        </InlineAlert>
      )}
      <DescriptionList
        items={[
          { label: 'Kind of review', value: KIND_LABEL[t.kind] },
          { label: 'Rating scale', value: scale },
          { label: 'Final score', value: t.scoring === 'weighted' ? 'Weighted sections' : "Manager's overall rating" },
          ...t.sections.map((s, i) => ({ label: `Section ${i + 1}`, value: `${s.title} · ${SECTION_LABEL[s.kind]}${s.rated ? ` · rated${t.scoring === 'weighted' ? `, ${s.weight} %` : ''}` : ''} · ${s.whoAnswers.map((w) => WHO_LABEL[w]).join(', ')}` })),
        ]}
      />
      {retire}
    </Drawer>
  );
}

function TemplateForm({ template, scales, onClose, onSave, onActivate, onRetire, failed: actFailed, busy, toast, children }: Omit<ReviewTemplateSheetProps, 'onActivate' | 'onRetire'> & { failed: string | null; busy: string | null; onActivate: () => void; onRetire: () => void; toast: (title: string) => void; children?: React.ReactNode }) {
  const [name, setName] = useState(template?.name ?? '');
  const [kind, setKind] = useState<TemplateKind | null>(template?.kind ?? 'annual');
  const [scaleId, setScaleId] = useState<string | null>(template?.scaleId ?? scales[0]?.id ?? null);
  const [scoring, setScoring] = useState<'weighted' | 'manager_overall'>(template?.scoring ?? 'weighted');
  const [sections, setSections] = useState<TemplateSection[]>(template?.sections.map((s) => ({ ...s, questions: s.questions.map((q) => ({ ...q })) })) ?? [{ kind: 'goals', title: 'Goals', weight: 100, rated: true, whoAnswers: ['self', 'manager'], questions: [] }]);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (i: number, patch: Partial<TemplateSection>) => setSections((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const sum = total(sections);
  const errors = [
    ...(name.trim().length >= 2 ? [] : [{ fieldId: 'tp-name', message: 'Name the template.' }]),
    ...(scaleId ? [] : [{ fieldId: 'tp-scale', message: 'Choose a rating scale.' }]),
    ...(sections.every((s) => s.title.trim().length >= 2) ? [] : [{ fieldId: 'tp-sections', message: 'Every section needs a title.' }]),
    ...(sections.every((s) => s.whoAnswers.length > 0) ? [] : [{ fieldId: 'tp-sections', message: 'Say who answers each section.' }]),
    ...(sections.every((s) => s.questions.every((q) => q.text.trim().length >= 3)) ? [] : [{ fieldId: 'tp-sections', message: 'Fill in or remove empty questions.' }]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({
        name: name.trim(),
        kind: kind ?? 'annual',
        scaleId: scaleId!,
        scoring,
        // Only the fields the API takes (sections read back from it also carry ids).
        sections: sections.map((s) => ({ kind: s.kind, title: s.title.trim(), weight: s.rated ? s.weight : 0, rated: s.rated, whoAnswers: s.whoAnswers, questions: s.questions.map((q) => ({ text: q.text.trim(), answer: q.answer, ...(q.required === undefined ? {} : { required: q.required }) })) })),
        ...(template ? { version: template.version } : {}),
      });
      toast('Template saved as a draft');
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={template ? `${template.name} · version ${template.templateVersion}` : 'Add a template'}
      subtitle="Saved as a draft. Activate it when the weights of rated sections add up to 100."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {template && (
            <Button variant="danger" onClick={onRetire}>
              Retire
            </Button>
          )}
          {template && (
            <Button loading={busy === 'activate'} onClick={onActivate}>
              Activate
            </Button>
          )}
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save draft
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {(failed || actFailed) && (
        <InlineAlert tone="danger" title={failed ? 'Not saved' : "That didn't work"}>
          {failed ?? actFailed}
        </InlineAlert>
      )}
      {template?.problem && (
        <InlineAlert tone="warning" title="Not ready to activate">
          {template.problem}
        </InlineAlert>
      )}
      <FormField id="tp-name" label="Name" required error={v.errorOf('tp-name')}>
        <TextField value={name} onChange={setName} maxLength={100} />
      </FormField>
      <div className="yx-lif-grid">
        <FormField id="tp-kind" label="Kind of review">
          <Select aria-label="Kind of review" value={kind} onChange={(x) => setKind(x as TemplateKind | null)} options={(Object.keys(KIND_LABEL) as TemplateKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </FormField>
        <FormField id="tp-scale" label="Rating scale" required error={v.errorOf('tp-scale')}>
          <Select aria-label="Rating scale" value={scaleId} onChange={setScaleId} options={scales.map((s) => ({ value: s.id, label: s.name }))} />
        </FormField>
      </div>
      <FormField id="tp-scoring" label="Final score">
        <Segment
          label="How the final score is worked out"
          value={scoring}
          onChange={setScoring}
          options={[
            { value: 'weighted', label: 'Weighted sections' },
            { value: 'manager_overall', label: "Manager's overall rating" },
          ]}
        />
      </FormField>
      <div id="tp-sections">
        {v.errorOf('tp-sections') && (
          <Text as="p" tone="danger" size="sm">
            {v.errorOf('tp-sections')}
          </Text>
        )}
        {scoring === 'weighted' && (
          <InlineAlert tone={sum === 100 ? 'success' : 'warning'} title={`Weights of rated sections: ${sum} of 100`}>
            {sum === 100 ? 'Ready to activate once saved.' : 'You can save the draft, but it can be activated only when they add up to 100.'}
          </InlineAlert>
        )}
        {sections.map((s, i) => (
          <Card
            key={i}
            title={`Section ${i + 1}`}
            actions={
              sections.length > 1 ? (
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setSections((ss) => ss.filter((_, j) => j !== i))}>
                  Remove section
                </Button>
              ) : undefined
            }
          >
            <div className="yx-lif-grid">
              <FormField id={`tp-s${i}-title`} label="Title" required>
                <TextField value={s.title} onChange={(x) => set(i, { title: x })} maxLength={100} />
              </FormField>
              <FormField id={`tp-s${i}-kind`} label="What it covers">
                <Select aria-label={`Section ${i + 1} covers`} value={s.kind} onChange={(x) => x && set(i, { kind: x as SectionKind })} options={(Object.keys(SECTION_LABEL) as SectionKind[]).map((k) => ({ value: k, label: SECTION_LABEL[k] }))} />
              </FormField>
            </div>
            <Checkbox checked={s.rated} onChange={(on) => set(i, { rated: on, weight: on ? s.weight : 0 })} label="Rated (counts towards the score)" />
            {s.rated && scoring === 'weighted' && (
              <FormField id={`tp-s${i}-weight`} label="Weight (%)">
                <NumberField value={s.weight} onChange={(x) => set(i, { weight: x ?? 0 })} min={0} max={100} decimals />
              </FormField>
            )}
            <fieldset className="yx-lif-row">
              <legend>
                <Text size="sm">Who answers</Text>
              </legend>
              {(Object.keys(WHO_LABEL) as Who[]).map((w) => (
                <Checkbox key={w} checked={s.whoAnswers.includes(w)} onChange={(on) => set(i, { whoAnswers: on ? [...s.whoAnswers, w] : s.whoAnswers.filter((x) => x !== w) })} label={WHO_LABEL[w]} />
              ))}
            </fieldset>
            {s.questions.map((q, j) => (
              <div className="yx-lif-grid" key={j}>
                <FormField id={`tp-s${i}-q${j}`} label={`Question ${j + 1}`}>
                  <TextField value={q.text} onChange={(x) => set(i, { questions: s.questions.map((y, k) => (k === j ? { ...y, text: x } : y)) })} maxLength={500} />
                </FormField>
                <FormField id={`tp-s${i}-a${j}`} label="Answer">
                  <Select aria-label={`Answer to question ${j + 1}`} value={q.answer} onChange={(x) => x && set(i, { questions: s.questions.map((y, k) => (k === j ? { ...y, answer: x as 'rating' | 'text' | 'both' } : y)) })} options={[{ value: 'rating', label: 'A rating' }, { value: 'text', label: 'Written' }, { value: 'both', label: 'Rating and written' }]} />
                </FormField>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => set(i, { questions: s.questions.filter((_, k) => k !== j) })}>
                  Remove question
                </Button>
              </div>
            ))}
            <Button size="sm" icon={Plus} onClick={() => set(i, { questions: [...s.questions, { text: '', answer: 'both' }] })}>
              Add a question
            </Button>
          </Card>
        ))}
        <Button icon={Plus} onClick={() => setSections((ss) => [...ss, blankSection()])}>
          Add a section
        </Button>
      </div>
      {children}
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ rating scales

export interface RatingScaleSheetProps {
  /** null: a new scale. */
  scale: RatingScale | null;
  onClose: () => void;
  onSave: (input: ScaleInput) => Promise<unknown>;
  onRetire: () => Promise<unknown>;
}

/** A new or unused active scale is edited here; one a template uses is read, with Retire while it is active. */
export function RatingScaleSheet({ scale, onClose, onSave, onRetire }: RatingScaleSheetProps) {
  const toast = useToastIfAny();
  const [retiring, setRetiring] = useState(false);
  const editable = !scale || (!scale.inUse && scale.status === 'active');
  const [name, setName] = useState(scale?.name ?? '');
  const [max, setMax] = useState<number | null>(scale?.max ?? 5);
  const [half, setHalf] = useState(scale?.step === 0.5);
  const [labels, setLabels] = useState<string[]>(scale ? scale.levels.filter((l) => l.value % 1 === 0).map((l) => l.label) : ['', '', '', '', '']);
  const [bands, setBands] = useState(scale?.bands.map((b) => ({ ...b })) ?? [{ fromScore: 1, toScore: 5, label: '' }]);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const top = Math.min(Math.max(max ?? 5, 2), 10);
  const points = Array.from({ length: top }, (_, i) => i + 1);
  const errors = [
    ...(name.trim().length >= 2 ? [] : [{ fieldId: 'sc-name', message: 'Name the scale.' }]),
    ...(points.every((_, i) => (labels[i] ?? '').trim()) ? [] : [{ fieldId: 'sc-levels', message: 'Give every rating a label.' }]),
    ...(bands.every((b) => b.label.trim()) ? [] : [{ fieldId: 'sc-bands', message: 'Give every band a label.' }]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ name: name.trim(), min: 1, max: top, step: half ? 0.5 : 1, levels: points.map((n, i) => ({ value: n, label: labels[i]!.trim(), description: null })), bands: bands.map((b) => ({ fromScore: b.fromScore, toScore: b.toScore, label: b.label.trim() })), ...(scale ? { version: scale.version } : {}) });
      toast?.toast({ tone: 'success', title: 'Rating scale saved' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const retire = retiring && scale && (
    <ConfirmDialog open onOpenChange={(o) => !o && setRetiring(false)} size="sm" title={`Retire ${scale.name}?`} consequence="It is no longer offered for templates. A scale a draft or active template uses cannot be retired." confirmLabel="Retire scale" destructive onConfirm={async () => {
      await onRetire();
      toast?.toast({ tone: 'success', title: 'Rating scale retired' });
      onClose();
    }} />
  );
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={scale ? scale.name : 'Add a rating scale'}
      subtitle="Once a template uses it, the scale cannot change, so ratings already given keep their meaning."
      footer={
        <>
          <Button onClick={onClose}>{editable ? 'Cancel' : 'Close'}</Button>
          {scale?.status === 'active' && (
            <Button variant="danger" onClick={() => setRetiring(true)}>
              Retire
            </Button>
          )}
          {editable && (
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Save
            </Button>
          )}
        </>
      }
    >
      {!editable && scale ? (
        <DescriptionList
          items={[
            { label: 'Status', value: [STATUS_LABEL[scale.status], scale.inUse ? 'In use' : null].filter(Boolean).join(' · ') },
            { label: 'Ratings', value: `${scale.min}–${scale.max}${scale.step === 0.5 ? ' (half points)' : ''}` },
            ...scale.levels.filter((l) => l.value % 1 === 0).map((l) => ({ label: String(l.value), value: l.label })),
            ...scale.bands.map((b) => ({ label: `Band ${b.fromScore}–${b.toScore}`, value: b.label })),
          ]}
        />
      ) : (
        <>
          {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
          {failed && (
            <InlineAlert tone="danger" title="Not saved">
              {failed}
            </InlineAlert>
          )}
          <FormField id="sc-name" label="Name" required error={v.errorOf('sc-name')}>
            <TextField value={name} onChange={setName} maxLength={80} />
          </FormField>
          <FormField id="sc-max" label="Ratings from 1 to" helper="Between 2 and 10.">
            <NumberField value={max} onChange={setMax} min={2} max={10} />
          </FormField>
          <Checkbox checked={half} onChange={setHalf} label="Allow half points (for example 3.5)" />
          <div id="sc-levels">
            {points.map((n, i) => (
              <FormField key={n} id={`sc-l${n}`} label={`Label for ${n}`} error={i === 0 ? v.errorOf('sc-levels') : undefined}>
                <TextField value={labels[i] ?? ''} onChange={(x) => setLabels((ls) => points.map((_, k) => (k === i ? x : (ls[k] ?? ''))))} maxLength={60} />
              </FormField>
            ))}
          </div>
          <Card title="Bands" actions={<Button size="sm" icon={Plus} onClick={() => setBands((bs) => [...bs, { fromScore: top, toScore: top, label: '' }])}>Add a band</Button>}>
            <Text as="p" tone="secondary" size="sm">
              A final score shows with its band. Bands run from 1 to the top rating with no gaps: each starts 0.01 after the one before ends (for example 2.49, then 2.50).
            </Text>
            <div id="sc-bands">
              {bands.map((b, i) => (
                <div className="yx-lif-grid" key={i}>
                  <FormField id={`sc-b${i}-from`} label="From">
                    <NumberField value={b.fromScore} onChange={(x) => setBands((bs) => bs.map((y, k) => (k === i ? { ...y, fromScore: x ?? 0 } : y)))} min={0} max={10} decimals />
                  </FormField>
                  <FormField id={`sc-b${i}-to`} label="To">
                    <NumberField value={b.toScore} onChange={(x) => setBands((bs) => bs.map((y, k) => (k === i ? { ...y, toScore: x ?? 0 } : y)))} min={0} max={10} decimals />
                  </FormField>
                  <FormField id={`sc-b${i}-label`} label="Label" error={i === 0 ? v.errorOf('sc-bands') : undefined}>
                    <TextField value={b.label} onChange={(x) => setBands((bs) => bs.map((y, k) => (k === i ? { ...y, label: x } : y)))} maxLength={60} />
                  </FormField>
                  {bands.length > 1 && (
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => setBands((bs) => bs.filter((_, k) => k !== i))}>
                      Remove band
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
      {retire}
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ skills library

export interface SkillSheetProps {
  /** null: add a skill. */
  skill: Skill | null;
  /** The whole library (parents and merge targets). */
  skills: Skill[];
  onClose: () => void;
  onAdd: (input: { name: string; kind: Skill['kind']; parentId: string | null }) => Promise<unknown>;
  onMerge: (intoId: string) => Promise<unknown>;
  onRetire: () => Promise<unknown>;
}

/** Add a skill; an active one is merged into another or retired (a skill in use is never deleted). */
export function SkillSheet({ skill, skills, onClose, onAdd, onMerge, onRetire }: SkillSheetProps) {
  const toast = useToastIfAny();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Skill['kind']>('skill');
  const [parentId, setParentId] = useState<string | null>(null);
  const [intoId, setIntoId] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);
  const ordered = skillsInOrder(skills);
  const pathOf = new Map(ordered.map((x) => [x.skill.id, x.path]));
  const active = ordered.filter((x) => x.skill.status === 'active');
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      toast?.toast({ tone: 'success', title: done });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const nameError = tried && name.trim().length < 2 ? 'Enter a name of at least 2 characters.' : null;
  const parentError = tried && kind !== 'domain' && !parentId ? (kind === 'skill' ? 'Choose the domain.' : 'Choose the skill.') : null;
  const add = () => {
    setTried(true);
    if (name.trim().length < 2 || (kind !== 'domain' && !parentId)) return;
    void run(() => onAdd({ name: name.trim(), kind, parentId: kind === 'domain' ? null : parentId }), 'Skill added');
  };
  const merge = () => {
    setTried(true);
    if (!intoId) return;
    void run(() => onMerge(intoId), 'Skill merged');
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={skill ? (pathOf.get(skill.id) ?? skill.name) : 'Add a skill'}
      subtitle={skill ? 'A skill in use is never deleted: retire it, or merge it into another and everything that used it follows.' : 'Domains hold skills; skills hold sub-skills.'}
      footer={
        <>
          <Button onClick={onClose}>{!skill || skill.status === 'active' ? 'Cancel' : 'Close'}</Button>
          {skill?.status === 'active' && (
            <Button variant="danger" onClick={() => setRetiring(true)}>
              Retire
            </Button>
          )}
          {!skill && (
            <Button variant="primary" loading={busy} onClick={add}>
              Add skill
            </Button>
          )}
          {skill?.status === 'active' && (
            <Button variant="primary" loading={busy} onClick={merge}>
              Merge
            </Button>
          )}
        </>
      }
    >
      {failed && (
        <InlineAlert tone="danger" title="That didn't work">
          {failed}
        </InlineAlert>
      )}
      {!skill ? (
        <>
          <FormField id="sk-kind" label="Level">
            <Segment label="Level in the library" value={kind} onChange={(k) => (setKind(k), setParentId(null))} options={(Object.keys(SKILL_KIND) as Skill['kind'][]).map((k) => ({ value: k, label: SKILL_KIND[k] }))} />
          </FormField>
          <FormField id="sk-name" label="Name" required error={nameError}>
            <TextField value={name} onChange={setName} maxLength={120} />
          </FormField>
          {kind !== 'domain' && (
            <FormField id="sk-parent" label={kind === 'skill' ? 'Domain' : 'Skill'} required error={parentError}>
              <Select aria-label={kind === 'skill' ? 'Domain' : 'Skill'} value={parentId} onChange={setParentId} options={active.filter((x) => x.skill.kind === (kind === 'skill' ? 'domain' : 'skill')).map((x) => ({ value: x.skill.id, label: x.path }))} searchable />
            </FormField>
          )}
        </>
      ) : skill.status === 'active' ? (
        <FormField id="sk-into" label="Merge into" helper="The skill is kept as merged. A competency on it moves to the skill you keep." error={tried && !intoId ? 'Choose the skill to keep.' : null}>
          <Select aria-label="Skill to keep" value={intoId} onChange={setIntoId} options={active.filter((x) => x.skill.kind === skill.kind && x.skill.id !== skill.id).map((x) => ({ value: x.skill.id, label: x.path }))} searchable />
        </FormField>
      ) : (
        <DescriptionList items={[{ label: 'Status', value: skill.status === 'merged' ? `Merged into ${skills.find((s) => s.id === skill.mergedIntoId)?.name ?? ''}` : STATUS_LABEL[skill.status] }, { label: 'Level', value: SKILL_KIND[skill.kind] }]} />
      )}
      {retiring && skill && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRetiring(false)} size="sm" title={`Retire ${skill.name}?`} consequence="It stays on past records and is not offered for new ones." confirmLabel="Retire skill" destructive onConfirm={async () => {
          await onRetire();
          toast?.toast({ tone: 'success', title: 'Skill retired' });
          onClose();
        }} />
      )}
    </Drawer>
  );
}

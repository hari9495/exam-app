import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import type { Choice, Competency, CompetencyInput, LoadState, RatingScale, ReviewTemplate, ScaleInput, SectionKind, Skill, TemplateInput, TemplateKind, TemplateSection, Who } from './types';

// Performance batch PM1, wired (M06-BUILD-DESIGN §5.2, §6, §9.1; Settings 6.3 and PRF-14): review templates, rating
// scales, competencies and the skills library. Everything here is company data checked when saved; a template in use
// changes only through a new version, a scale in use never changes, and nothing is deleted (retired or merged instead).

const KIND_LABEL: Record<TemplateKind, string> = { annual: 'Annual', half_yearly: 'Half-yearly', quarterly: 'Quarterly', project: 'Project', probation: 'Probation' };
const SECTION_LABEL: Record<SectionKind, string> = { goals: 'Goals', competencies: 'Competencies', values: 'Values', questions: 'Open questions', overall: 'Overall rating' };
const WHO_LABEL: Record<Who, string> = { self: 'The employee', manager: 'The manager', peer: 'Peers (360°)', skip: 'Skip-level manager' };
const GROUP_LABEL: Record<Competency['group'], string> = { core: 'Core', functional: 'Functional', leadership: 'Leadership' };
const STATUS_TONE = { draft: 'neutral', active: 'success', retired: 'neutral', merged: 'neutral' } as const;
const STATUS_LABEL = { draft: 'Draft', active: 'Active', retired: 'Retired', merged: 'Merged' } as const;
const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
const total = (sections: readonly TemplateSection[]) => Math.round(sections.filter((s) => s.rated).reduce((t, s) => t + s.weight, 0) * 100) / 100;

export interface PerformanceSetupScreenProps {
  state: LoadState;
  onRetry?: () => void;
  today: string;
  scales: RatingScale[];
  templates: ReviewTemplate[];
  competencies: Competency[];
  skills: Skill[];
  designations: Choice[];
  onUseStarters: () => Promise<unknown>;
  onSaveScale: (id: string | null, s: ScaleInput) => Promise<unknown>;
  onRetireScale: (id: string) => Promise<unknown>;
  onSaveTemplate: (id: string | null, t: TemplateInput) => Promise<unknown>;
  onNewVersion: (id: string) => Promise<unknown>;
  onActivate: (id: string, version: number) => Promise<unknown>;
  onRetireTemplate: (id: string) => Promise<unknown>;
  onSaveCompetency: (id: string | null, c: CompetencyInput) => Promise<unknown>;
  onRetireCompetency: (id: string) => Promise<unknown>;
  onSaveSkill: (id: string | null, s: { name: string; kind: Skill['kind']; parentId: string | null }) => Promise<unknown>;
  onRetireSkill: (id: string) => Promise<unknown>;
  onMergeSkill: (id: string, intoId: string) => Promise<unknown>;
}

export function PerformanceSetupScreen(p: PerformanceSetupScreenProps) {
  const { busy, error, run } = useRun();
  const empty = p.templates.length === 0 && p.scales.length === 0;
  return (
    <LivePage title="Performance" description="Review templates, rating scales, competencies and the skills library. A template in use changes only through a new version; nothing is deleted." state={p.state} onRetry={p.onRetry} what="performance set-up" grantedBy="your System Admin">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {empty ? (
        <EmptyState
          title="No performance set-up yet"
          description="Start from the YukthiX starters: a five-point scale, four review templates and twelve competencies, all yours to change."
          action={
            <Button variant="primary" loading={busy === 'starters'} onClick={() => void run('starters', p.onUseStarters)}>
              Use the starters
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="templates">
          <TabsList aria-label="Performance set-up">
            <TabsTrigger value="templates">Review templates</TabsTrigger>
            <TabsTrigger value="scales">Rating scales</TabsTrigger>
            <TabsTrigger value="competencies">Competencies</TabsTrigger>
            <TabsTrigger value="skills">Skills library</TabsTrigger>
          </TabsList>
          <TabsContent value="templates">
            <TemplatesTab {...p} />
          </TabsContent>
          <TabsContent value="scales">
            <ScalesTab {...p} />
          </TabsContent>
          <TabsContent value="competencies">
            <CompetenciesTab {...p} />
          </TabsContent>
          <TabsContent value="skills">
            <SkillsTab {...p} />
          </TabsContent>
        </Tabs>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ templates

function TemplatesTab(p: PerformanceSetupScreenProps) {
  const { busy, error, run } = useRun();
  const [editing, setEditing] = useState<ReviewTemplate | 'new' | null>(null);
  const [retiring, setRetiring] = useState<ReviewTemplate | null>(null);
  const scaleName = new Map(p.scales.map((s) => [s.id, s.name]));
  const hasDraft = (t: ReviewTemplate) => p.templates.some((x) => x.familyId === t.familyId && x.status === 'draft');
  const columns: TableColumn<ReviewTemplate>[] = [
    { key: 'name', header: 'Template', value: (t) => t.name, render: (t) => <Text>{`${t.name} · version ${t.templateVersion}`}</Text>, width: 260, hideable: false },
    { key: 'status', header: 'Status', value: (t) => t.status, render: (t) => <><Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge> {t.starter && <Badge tone="info">Starter</Badge>} {t.status === 'draft' && t.problem && <Badge tone="warning">Not ready</Badge>}</>, width: 220 },
    { key: 'kind', header: 'Kind', value: (t) => KIND_LABEL[t.kind], width: 120 },
    { key: 'scale', header: 'Scale', value: (t) => scaleName.get(t.scaleId) ?? '', width: 160 },
  ];
  return (
    <Card title="Review templates" actions={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add a template</Button>}>
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <DataTable
        label="Review templates"
        columns={columns}
        rows={p.templates}
        getRowId={(t) => t.id}
        rowNoun={['template', 'templates']}
        cardSummary
        empty={<EmptyState compact title="No templates yet." />}
        rowButtons={(t) => (
          <>
            {t.status === 'draft' && <Button size="sm" onClick={() => setEditing(t)}>Edit</Button>}
            {t.status === 'draft' && (
              <Button size="sm" variant="primary" loading={busy === `a-${t.id}`} onClick={() => void run(`a-${t.id}`, () => p.onActivate(t.id, t.version))}>
                Activate
              </Button>
            )}
            {t.status !== 'draft' && !hasDraft(t) && (
              <Button size="sm" loading={busy === `v-${t.id}`} onClick={() => void run(`v-${t.id}`, () => p.onNewVersion(t.id))}>
                New version
              </Button>
            )}
            {t.status !== 'retired' && (
              <Button size="sm" variant="danger" onClick={() => setRetiring(t)}>
                Retire
              </Button>
            )}
          </>
        )}
      />
      {p.templates.filter((t) => t.status === 'draft' && t.problem).map((t) => (
        <Text as="p" key={t.id} tone="secondary" size="sm">
          {`${t.name} (version ${t.templateVersion}): ${t.problem}`}
        </Text>
      ))}
      {editing && (
        <TemplateDrawer
          template={editing === 'new' ? null : editing}
          scales={p.scales.filter((s) => s.status === 'active')}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await p.onSaveTemplate(editing === 'new' ? null : editing.id, input);
            setEditing(null);
          }}
        />
      )}
      {retiring && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRetiring(null)} size="sm" title={`Retire ${retiring.name}?`} consequence="It is not offered for new review cycles. Reviews that used it keep it." confirmLabel="Retire template" destructive onConfirm={async () => {
          await p.onRetireTemplate(retiring.id);
          setRetiring(null);
        }} />
      )}
    </Card>
  );
}

const blankSection = (): TemplateSection => ({ kind: 'questions', title: '', weight: 0, rated: false, whoAnswers: ['self', 'manager'], questions: [{ text: '', answer: 'text' }] });

function TemplateDrawer({ template, scales, onClose, onSave }: { template: ReviewTemplate | null; scales: RatingScale[]; onClose: () => void; onSave: (t: TemplateInput) => Promise<void> }) {
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
      await onSave({ name: name.trim(), kind: kind ?? 'annual', scaleId: scaleId!, scoring, // Only the fields the API takes (sections read back from it also carry ids).
        sections: sections.map((s) => ({ kind: s.kind, title: s.title.trim(), weight: s.rated ? s.weight : 0, rated: s.rated, whoAnswers: s.whoAnswers, questions: s.questions.map((q) => ({ text: q.text.trim(), answer: q.answer, ...(q.required === undefined ? {} : { required: q.required }) })) })), ...(template ? { version: template.version } : {}) });
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
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save draft
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
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
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ scales

function ScalesTab(p: PerformanceSetupScreenProps) {
  const [editing, setEditing] = useState<RatingScale | 'new' | null>(null);
  const [retiring, setRetiring] = useState<RatingScale | null>(null);
  const columns: TableColumn<RatingScale>[] = [
    { key: 'name', header: 'Scale', value: (s) => s.name, width: 200, hideable: false },
    { key: 'range', header: 'Ratings', value: (s) => `${s.min}–${s.max}${s.step === 0.5 ? ' (half points)' : ''}`, width: 150 },
    { key: 'labels', header: 'Labels', value: (s) => s.levels.map((l) => l.label).join(' · '), width: 320 },
    { key: 'bands', header: 'Bands', value: (s) => s.bands.map((b) => `${b.label} ${b.fromScore}–${b.toScore}`).join(' · '), width: 320 },
    { key: 'status', header: 'Status', value: (s) => s.status, render: (s) => <><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge> {s.inUse && <Badge tone="info">In use</Badge>}</>, width: 160 },
  ];
  return (
    <Card title="Rating scales" actions={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add a scale</Button>}>
      <DataTable
        label="Rating scales"
        columns={columns}
        rows={p.scales}
        getRowId={(s) => s.id}
        rowNoun={['scale', 'scales']}
        cardSummary
        rowButtons={(s) => (
          <>
            {!s.inUse && s.status === 'active' && <Button size="sm" onClick={() => setEditing(s)}>Edit</Button>}
            {s.status === 'active' && (
              <Button size="sm" variant="danger" onClick={() => setRetiring(s)}>
                Retire
              </Button>
            )}
          </>
        )}
      />
      {editing && <ScaleDrawer scale={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={async (s) => {
        await p.onSaveScale(editing === 'new' ? null : editing.id, s);
        setEditing(null);
      }} />}
      {retiring && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRetiring(null)} size="sm" title={`Retire ${retiring.name}?`} consequence="It is no longer offered for templates. A scale a draft or active template uses cannot be retired." confirmLabel="Retire scale" destructive onConfirm={async () => {
          await p.onRetireScale(retiring.id);
          setRetiring(null);
        }} />
      )}
    </Card>
  );
}

function ScaleDrawer({ scale, onClose, onSave }: { scale: RatingScale | null; onClose: () => void; onSave: (s: ScaleInput) => Promise<void> }) {
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
      await onSave({ name: name.trim(), min: 1, max: top, step: half ? 0.5 : 1, levels: points.map((n, i) => ({ value: n, label: labels[i].trim(), description: null })), bands: bands.map((b) => ({ fromScore: b.fromScore, toScore: b.toScore, label: b.label.trim() })), ...(scale ? { version: scale.version } : {}) });
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
      size="md"
      title={scale ? scale.name : 'Add a rating scale'}
      subtitle="Once a template uses it, the scale cannot change, so ratings already given keep their meaning."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
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
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ competencies (PRF-14)

function CompetenciesTab(p: PerformanceSetupScreenProps) {
  const [editing, setEditing] = useState<Competency | 'new' | null>(null);
  const [retiring, setRetiring] = useState<Competency | null>(null);
  const columns: TableColumn<Competency>[] = [
    { key: 'name', header: 'Competency', value: (c) => c.name, width: 220, hideable: false },
    { key: 'group', header: 'Group', value: (c) => GROUP_LABEL[c.group], width: 120 },
    { key: 'levels', header: 'Levels', value: (c) => c.levels.map((l) => `${l.level}. ${l.label}`).join(' · '), width: 380 },
    { key: 'roles', header: 'Needed by', value: (c) => (c.roles.length ? c.roles.map((r) => `${r.designation} (${r.level})`).join(', ') : '—'), width: 240 },
    { key: 'status', header: 'Status', value: (c) => c.status, render: (c) => <><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge> {c.starter && <Badge tone="info">Starter</Badge>}</>, width: 160 },
  ];
  return (
    <Card title="Competencies" actions={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add a competency</Button>}>
      <Text as="p" tone="secondary" size="sm">
        Competencies are skills from the company skills library, with proficiency levels and the level each job title needs. Retired ones stay on past reviews.
      </Text>
      <DataTable
        label="Competencies"
        columns={columns}
        rows={p.competencies}
        getRowId={(c) => c.id}
        rowNoun={['competency', 'competencies']}
        cardSummary
        empty={<EmptyState compact title="No competencies yet." />}
        rowButtons={(c) =>
          c.status === 'active' ? (
            <>
              <Button size="sm" onClick={() => setEditing(c)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRetiring(c)}>
                Retire
              </Button>
            </>
          ) : null
        }
      />
      {editing && <CompetencyDrawer competency={editing === 'new' ? null : editing} designations={p.designations} today={p.today} onClose={() => setEditing(null)} onSave={async (c) => {
        await p.onSaveCompetency(editing === 'new' ? null : editing.id, c);
        setEditing(null);
      }} />}
      {retiring && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRetiring(null)} size="sm" title={`Retire ${retiring.name}?`} consequence="It is not offered for new reviews, and the levels job titles need end yesterday. Past reviews keep it." confirmLabel="Retire competency" destructive onConfirm={async () => {
          await p.onRetireCompetency(retiring.id);
          setRetiring(null);
        }} />
      )}
    </Card>
  );
}

function CompetencyDrawer({ competency, designations, today, onClose, onSave }: { competency: Competency | null; designations: Choice[]; today: string; onClose: () => void; onSave: (c: CompetencyInput) => Promise<void> }) {
  const [name, setName] = useState(competency?.name ?? '');
  const [group, setGroup] = useState<Competency['group']>(competency?.group ?? 'core');
  const [description, setDescription] = useState(competency?.description ?? '');
  const [levels, setLevels] = useState(competency?.levels.map((l) => ({ label: l.label, behaviours: l.behaviours ?? '' })) ?? [{ label: '', behaviours: '' }, { label: '', behaviours: '' }, { label: '', behaviours: '' }, { label: '', behaviours: '' }]);
  const [roles, setRoles] = useState(competency?.roles.map((r) => ({ designationId: r.designationId as string | null, level: r.level as number | null, from: fromKey(r.validFrom) as Date | null })) ?? []);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [
    ...(name.trim().length >= 2 ? [] : [{ fieldId: 'cp-name', message: 'Name the competency.' }]),
    ...(levels.length >= 2 && levels.every((l) => l.label.trim().length >= 2) ? [] : [{ fieldId: 'cp-levels', message: 'Give at least two levels, each with a label.' }]),
    ...(roles.every((r) => r.designationId && r.level && r.level <= levels.length && r.from) ? [] : [{ fieldId: 'cp-roles', message: `Each job title needs a level from 1 to ${levels.length} and a start date.` }]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ name: name.trim(), group, description: description.trim() || null, levels: levels.map((l) => ({ label: l.label.trim(), behaviours: l.behaviours.trim() || null })), roles: roles.map((r) => ({ designationId: r.designationId!, level: r.level!, validFrom: dayKey(r.from!) })), ...(competency ? { version: competency.version } : {}) });
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
      title={competency ? competency.name : 'Add a competency'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="cp-name" label="Name" required error={v.errorOf('cp-name')}>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <FormField id="cp-group" label="Group">
        <Segment label="Competency group" value={group} onChange={setGroup} options={(Object.keys(GROUP_LABEL) as Competency['group'][]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))} />
      </FormField>
      <FormField id="cp-desc" label="What it means" optional>
        <TextArea value={description} onChange={setDescription} rows={2} maxLength={500} />
      </FormField>
      <Card title="Proficiency levels" actions={levels.length < 10 ? <Button size="sm" icon={Plus} onClick={() => setLevels((ls) => [...ls, { label: '', behaviours: '' }])}>Add a level</Button> : undefined}>
        <div id="cp-levels">
          {levels.map((l, i) => (
            <div className="yx-lif-grid" key={i}>
              <FormField id={`cp-l${i}`} label={`Level ${i + 1}`} error={i === 0 ? v.errorOf('cp-levels') : undefined}>
                <TextField value={l.label} onChange={(x) => setLevels((ls) => ls.map((y, k) => (k === i ? { ...y, label: x } : y)))} maxLength={80} />
              </FormField>
              <FormField id={`cp-b${i}`} label="What it looks like" optional>
                <TextField value={l.behaviours} onChange={(x) => setLevels((ls) => ls.map((y, k) => (k === i ? { ...y, behaviours: x } : y)))} maxLength={500} />
              </FormField>
              {levels.length > 2 && (
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setLevels((ls) => ls.filter((_, k) => k !== i))}>
                  Remove level
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Level each job title needs" actions={<Button size="sm" icon={Plus} onClick={() => setRoles((rs) => [...rs, { designationId: null, level: null, from: fromKey(today) }])}>Map a job title</Button>}>
        <div id="cp-roles">
          {v.errorOf('cp-roles') && (
            <Text as="p" tone="danger" size="sm">
              {v.errorOf('cp-roles')}
            </Text>
          )}
          {roles.length === 0 && (
            <Text as="p" tone="secondary" size="sm">
              No job titles yet.
            </Text>
          )}
          {roles.map((r, i) => (
            <div className="yx-lif-grid" key={i}>
              <FormField id={`cp-r${i}`} label="Job title">
                <Select aria-label={`Job title ${i + 1}`} value={r.designationId} onChange={(x) => setRoles((rs) => rs.map((y, k) => (k === i ? { ...y, designationId: x } : y)))} options={designations} searchable />
              </FormField>
              <FormField id={`cp-rl${i}`} label="Level needed">
                <NumberField value={r.level} onChange={(x) => setRoles((rs) => rs.map((y, k) => (k === i ? { ...y, level: x } : y)))} min={1} max={levels.length} />
              </FormField>
              <FormField id={`cp-rf${i}`} label="From">
                <DatePicker value={r.from} onChange={(x) => setRoles((rs) => rs.map((y, k) => (k === i ? { ...y, from: x } : y)))} aria-label={`Level for job title ${i + 1} from`} />
              </FormField>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => setRoles((rs) => rs.filter((_, k) => k !== i))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ skills library (T2)

const SKILL_KIND: Record<Skill['kind'], string> = { domain: 'Domain', skill: 'Skill', sub_skill: 'Sub-skill' };

function SkillsTab(p: PerformanceSetupScreenProps) {
  const { error, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Skill['kind']>('skill');
  const [parentId, setParentId] = useState<string | null>(null);
  const [merging, setMerging] = useState<Skill | null>(null);
  const [intoId, setIntoId] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<Skill | null>(null);
  const byId = new Map(p.skills.map((s) => [s.id, s]));
  const path = (s: Skill): string => (s.parentId && byId.get(s.parentId) ? `${path(byId.get(s.parentId)!)} › ${s.name}` : s.name);
  const live = p.skills.filter((s) => s.status === 'active');
  const parents = live.filter((s) => (kind === 'skill' ? s.kind === 'domain' : s.kind === 'skill'));
  const columns: TableColumn<Skill>[] = [
    { key: 'path', header: 'Skill', value: (s) => path(s), width: 340, hideable: false },
    { key: 'kind', header: 'Level', value: (s) => SKILL_KIND[s.kind], width: 120 },
    { key: 'status', header: 'Status', value: (s) => s.status, render: (s) => <><Badge tone={STATUS_TONE[s.status]}>{s.status === 'merged' ? `Merged into ${byId.get(s.mergedIntoId ?? '')?.name ?? ''}` : STATUS_LABEL[s.status]}</Badge> {s.competency && <Badge tone="info">Competency</Badge>}</>, width: 260 },
  ];
  return (
    <Card title="Skills library" actions={<Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add a skill</Button>}>
      <Text as="p" tone="secondary" size="sm">
        One library for the company: domains, skills and sub-skills. A skill in use is never deleted: retire it, or merge it into another and everything that used it follows.
      </Text>
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <DataTable
        label="Skills library"
        columns={columns}
        rows={[...p.skills].sort((a, b) => path(a).localeCompare(path(b)))}
        getRowId={(s) => s.id}
        rowNoun={['skill', 'skills']}
        cardSummary
        rowButtons={(s) =>
          s.status === 'active' ? (
            <>
              <Button size="sm" onClick={() => { setMerging(s); setIntoId(null); }}>
                Merge into…
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRetiring(s)}>
                Retire
              </Button>
            </>
          ) : null
        }
      />
      {adding && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          size="md"
          title="Add a skill"
          confirmLabel="Add skill"
          confirmDisabled={name.trim().length < 2 || (kind !== 'domain' && !parentId)}
          onConfirm={async () => {
            await p.onSaveSkill(null, { name: name.trim(), kind, parentId: kind === 'domain' ? null : parentId });
            setAdding(false);
            setName('');
          }}
        >
          <FormField id="sk-kind" label="Level">
            <Segment label="Level in the library" value={kind} onChange={(k) => { setKind(k); setParentId(null); }} options={(Object.keys(SKILL_KIND) as Skill['kind'][]).map((k) => ({ value: k, label: SKILL_KIND[k] }))} />
          </FormField>
          <FormField id="sk-name" label="Name" required>
            <TextField value={name} onChange={setName} maxLength={120} />
          </FormField>
          {kind !== 'domain' && (
            <FormField id="sk-parent" label={kind === 'skill' ? 'Domain' : 'Skill'} required>
              <Select aria-label={kind === 'skill' ? 'Domain' : 'Skill'} value={parentId} onChange={setParentId} options={parents.map((s) => ({ value: s.id, label: path(s) }))} searchable />
            </FormField>
          )}
        </ConfirmDialog>
      )}
      {merging && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setMerging(null)}
          size="md"
          title={`Merge ${merging.name} into another skill?`}
          consequence="The skill is kept as merged. A competency on it moves to the skill you keep."
          confirmLabel="Merge"
          confirmDisabled={!intoId}
          onConfirm={async () => {
            await p.onMergeSkill(merging.id, intoId!);
            setMerging(null);
          }}
        >
          <FormField id="sk-into" label="Keep this skill" required>
            <Select aria-label="Skill to keep" value={intoId} onChange={setIntoId} options={live.filter((s) => s.kind === merging.kind && s.id !== merging.id).map((s) => ({ value: s.id, label: path(s) }))} searchable />
          </FormField>
        </ConfirmDialog>
      )}
      {retiring && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRetiring(null)} size="sm" title={`Retire ${retiring.name}?`} consequence="It stays on past records and is not offered for new ones." confirmLabel="Retire skill" destructive onConfirm={async () => {
          const ok = await run('retire', () => p.onRetireSkill(retiring.id));
          if (ok) setRetiring(null);
        }} />
      )}
    </Card>
  );
}


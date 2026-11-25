// HIR-03 job workspace › Settings (founder answer 261, 10 Nov 2026): the job settings that lived on the old candidates
// list (/pipeline/list), drawn from kit parts: tests and the stage that sends each, the interview scorecard, public
// applying and the careers site, job boards, fit criteria, and (answer 263) the pipeline's optional days target and
// limit per stage, read-only here: answer 302 moved the editor to Settings › Hiring (StageTargetsSheet). Without the
// job-manage key the values show as text. Buttons are never greyed out: pressed too early they show the field error and
// focus the field.
import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '../../components/button';
import { Switch } from '../../components/choice';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { MultiSelect, Select } from '../../components/select';
import { Card, DescriptionList } from '../../components/shell';
import { Drawer } from '../../components/drawer';
import { DataTable, type TableColumn } from '../../components/table';
import type { Choice, JobSettingsView } from './live/types';
import './hiring.css';

const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

/** One stage of the job's pipeline with its optional days target and limit (null = none). */
export interface StageTarget {
  id: string;
  name: string;
  daysTarget: number | null;
  limit: number | null;
}

export interface JobSettingsJob {
  status: 'draft' | 'pending_approval' | 'open' | 'on_hold' | 'closed';
  publicApplyEnabled: boolean;
  listOnCareers: boolean;
  applyUrl: string | null;
  boardIds: string[];
  fitCriteria: string | null;
  fitRubric: { label: string; weight: number }[];
}

export type JobSettingsPatch = Partial<{ publicApplyEnabled: boolean; listOnCareers: boolean; jobBoardIds: string[]; fitCriteria: string | null; fitRubric: { label: string; weight: number }[] | null }>;

export interface LiveJobSettings {
  /** pipeline:manage: change this job's settings. */
  canManage: boolean;
  /** pipelines:configure: may change the pipeline's stage targets in Settings › Hiring (every job on the pipeline). */
  canConfigure: boolean;
  job: JobSettingsJob;
  settings: JobSettingsView | null;
  pipelineName: string;
  stages: StageTarget[];
  /** Stages a test can be sent on (active and offer stages). */
  sendStages: Choice[];
  exams: Choice[];
  scorecardTemplates: Choice[];
  jobBoards: Choice[];
  onLinkExam: (examId: string) => Promise<unknown>;
  onUnlinkExam: (examId: string) => Promise<unknown>;
  onSendOn: (examId: string, stageId: string | null) => Promise<unknown>;
  onScorecard: (templateId: string | null) => Promise<unknown>;
  onUpdateJob: (patch: JobSettingsPatch) => Promise<unknown>;
  onScreenAll?: () => Promise<{ queued: number }>;
  onCopy: (text: string) => Promise<unknown>;
  /** Answer 302: opens Settings › Hiring, where the stage targets are changed. */
  onOpenSettings?: () => void;
}

/** One change to a stage's targets (only the stages that changed are sent). */
export type StageTargetChange = { stageId: string; daysTarget: number | null; limit: number | null };

const badDays = (t: StageTarget) => t.daysTarget != null && (t.daysTarget < 1 || t.daysTarget > 365);
const badLimit = (t: StageTarget) => t.limit != null && (t.limit < 1 || t.limit > 1000);
const targetText = (t: StageTarget) => [t.daysTarget != null ? `${t.daysTarget} days target` : null, t.limit != null ? `limit ${t.limit}` : null].filter(Boolean).join(' · ') || 'None';

/**
 * Founder answer 302: a pipeline's optional days target and limit per stage, edited from Settings › Hiring › Pipeline
 * templates (the pipelines key). Without the key the values show as text. Save is never greyed out: pressed with a bad
 * value it shows the field error and focuses the field.
 */
export function StageTargetsSheet({ open, onOpenChange, pipelineName, stages, canEdit, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; pipelineName: string; stages: StageTarget[]; canEdit: boolean; onSave?: (changes: StageTargetChange[]) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [targets, setTargets] = useState(stages);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const changes = targets.filter((t) => { const o = stages.find((s) => s.id === t.id); return o && (o.daysTarget !== t.daysTarget || o.limit !== t.limit); }).map((t) => ({ stageId: t.id, daysTarget: t.daysTarget, limit: t.limit }));
  const save = async () => {
    setTried(true);
    const bad = targets.findIndex((t) => badDays(t) || badLimit(t));
    if (bad >= 0) return focus(badDays(targets[bad]!) ? `st-days-${bad}` : `st-limit-${bad}`);
    if (!changes.length) return void toast?.toast({ tone: 'default', title: 'Nothing changed' });
    setBusy(true);
    setFailed(null);
    try {
      await onSave?.(changes);
      toast?.toast({ tone: 'success', title: 'Stage targets saved', description: `Every job on ${pipelineName} uses them.` });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Stage targets: ${pipelineName}`}
      subtitle="Pipeline templates"
      dirty={canEdit && changes.length > 0}
      footer={
        canEdit ? (
          <>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Save stage targets
            </Button>
          </>
        ) : (
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        )
      }
    >
      <div className="yx-hire-stack">
        <Text as="p" size="sm" tone="secondary">
          Optional. The board shows a card in amber once it is over the days target, and flags a stage holding more than its limit. Nothing is blocked. Empty means none. Every job on {pipelineName} uses them.
        </Text>
        {failed && <InlineAlert tone="danger" title={failed} />}
        {canEdit ? (
          targets.map((t, i) => (
            <div key={t.id} className="yx-hire-actions">
              <FormField id={`st-days-${i}`} label={`${t.name}: days target`} optional error={tried && badDays(t) ? 'Enter 1 to 365 days, or leave it empty.' : null}>
                <NumberField value={t.daysTarget} onChange={(v) => setTargets((x) => x.map((y, k) => (k === i ? { ...y, daysTarget: v } : y)))} min={1} max={365} />
              </FormField>
              <FormField id={`st-limit-${i}`} label={`${t.name}: limit`} optional error={tried && badLimit(t) ? 'Enter 1 to 1000 candidates, or leave it empty.' : null}>
                <NumberField value={t.limit} onChange={(v) => setTargets((x) => x.map((y, k) => (k === i ? { ...y, limit: v } : y)))} min={1} max={1000} />
              </FormField>
            </div>
          ))
        ) : (
          <DescriptionList items={stages.map((t) => ({ label: t.name, value: targetText(t) }))} />
        )}
      </div>
    </Drawer>
  );
}

export function JobSettingsPanel({ live }: { live: LiveJobSettings }) {
  const toast = useToastIfAny();
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [linkTried, setLinkTried] = useState(false);
  const [boards, setBoards] = useState<string[]>(live.job.boardIds);
  const [criteria, setCriteria] = useState(live.job.fitCriteria ?? '');
  const [rubric, setRubric] = useState(live.job.fitRubric);
  const [rubricTried, setRubricTried] = useState(false);
  const run = async (key: string, fn: () => Promise<unknown>, title?: string) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
      if (title) toast?.toast({ tone: 'success', title });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const { canManage: can, settings } = live;
  const linked = new Set(settings?.exams.map((e) => e.examId));
  // The API scores against weights in per cent: whole numbers that add up to 100 (an empty rubric is fine).
  const badRubric = rubric.findIndex((r) => !r.label.trim() || !(Number.isInteger(r.weight) && r.weight >= 0 && r.weight <= 100));
  const rubricTotal = rubric.reduce((t, r) => t + (r.weight || 0), 0);
  const name = (list: Choice[], v: string | null) => list.find((x) => x.value === v)?.label ?? null;
  const testCols: TableColumn<JobSettingsView['exams'][number]>[] = [
    { key: 't', header: 'Test', value: (e) => e.title },
    {
      key: 's',
      header: 'Sent when entering',
      value: (e) => e.sendOnStageId ?? '',
      render: (e) =>
        can ? (
          <Select aria-label={`Send ${e.title} when entering`} value={e.sendOnStageId} placeholder="Only when sent by hand" onChange={(v) => void run('sendon', () => live.onSendOn(e.examId, v), 'Test sending saved')} options={live.sendStages} clearable />
        ) : (
          <span>{name(live.sendStages, e.sendOnStageId) ?? 'Only when sent by hand'}</span>
        ),
    },
  ];
  return (
    <div className="yx-hire-stack">
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      <Card title="Tests">
        <div className="yx-hire-stack">
          <Text as="p" size="sm" tone="secondary">Tests candidates take for this role. A test can go automatically when a candidate enters a stage.</Text>
          <DataTable label="Linked tests" columns={testCols} rows={settings?.exams ?? []} getRowId={(e) => e.examId} empty={<EmptyState compact title="No tests linked." />} rowButtons={(e) => (can ? <Button size="sm" variant="danger" onClick={() => void run('unlink', () => live.onUnlinkExam(e.examId), `${e.title} unlinked`)}>Unlink {e.title}</Button> : null)} />
          {can && (
            <div className="yx-hire-actions">
              <FormField id="js-link" label="Link a test" hideLabel error={linkTried && !linking ? 'Choose the test to link.' : null}>
                <Select aria-label="Link a test" placeholder="Link a test" value={linking} onChange={setLinking} options={live.exams.filter((x) => !linked.has(x.value))} searchable />
              </FormField>
              <div>
                <Button size="sm" loading={busy === 'link'} onClick={() => {
                  setLinkTried(true);
                  if (!linking) return focus('js-link');
                  void run('link', async () => { await live.onLinkExam(linking); setLinking(null); setLinkTried(false); }, 'Test linked');
                }}>
                  Link test
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Interview scorecard">
        {can ? (
          <FormField id="js-scorecard" label="Scorecard for new interviews" helper="The panel rates each item; the result shows against the pass bar.">
            <Select aria-label="Scorecard for new interviews" value={settings?.scorecardTemplateId ?? null} placeholder="No scorecard" onChange={(v) => void run('scorecard', () => live.onScorecard(v), 'Scorecard saved')} options={live.scorecardTemplates} clearable />
          </FormField>
        ) : (
          <DescriptionList items={[{ label: 'Scorecard for new interviews', value: name(live.scorecardTemplates, settings?.scorecardTemplateId ?? null) ?? 'No scorecard' }]} />
        )}
      </Card>

      <Card title="Applications">
        <div className="yx-hire-stack">
          {can ? (
            <>
              <Switch
                className="yx-hire-switch"
                label="Take applications through a public link"
                description={live.job.status === 'open' ? undefined : 'Only an open job takes applications; open the job first.'}
                checked={live.job.publicApplyEnabled}
                onChange={(v) => {
                  if (v && live.job.status !== 'open') return setFailed('Only an open job takes applications. Open or resume the job first.');
                  void run('apply', () => live.onUpdateJob({ publicApplyEnabled: v }), v ? 'Public applying on' : 'Public applying off');
                }}
              />
              <Switch className="yx-hire-switch" label="Show on the careers site" checked={live.job.listOnCareers} onChange={(v) => void run('careers', () => live.onUpdateJob({ listOnCareers: v }), v ? 'Shown on the careers site' : 'Hidden from the careers site')} />
            </>
          ) : (
            <DescriptionList items={[{ label: 'Public applying', value: live.job.publicApplyEnabled ? 'On' : 'Off' }, { label: 'Careers site', value: live.job.listOnCareers ? 'Shown' : 'Hidden' }]} />
          )}
          {live.job.applyUrl && (
            <div className="yx-hire-actions">
              <Text mono>{live.job.applyUrl}</Text>
              <Button size="sm" onClick={() => void live.onCopy(live.job.applyUrl!).then(() => toast?.toast({ tone: 'success', title: 'Apply link copied' }))}>Copy apply link</Button>
            </div>
          )}
          {can ? (
            <>
              <FormField id="js-boards" label="Job boards" helper="The job is posted to these boards while it is open.">
                <MultiSelect aria-label="Job boards" value={boards} onChange={setBoards} options={live.jobBoards} />
              </FormField>
              <div>
                <Button size="sm" loading={busy === 'boards'} onClick={() => void run('boards', () => live.onUpdateJob({ jobBoardIds: boards }), 'Job boards saved')}>Save job boards</Button>
              </div>
            </>
          ) : (
            <DescriptionList items={[{ label: 'Job boards', value: live.job.boardIds.map((b) => name(live.jobBoards, b)).filter(Boolean).join(', ') || 'None' }]} />
          )}
        </div>
      </Card>

      <Card title="Fit criteria">
        <div className="yx-hire-stack">
          <Text as="p" size="sm" tone="secondary">Describe the ideal candidate; résumés are scored against it. The score is advice; a person decides.</Text>
          {can ? (
            <>
              <FormField id="js-fit" label="Ideal candidate" optional>
                <TextArea value={criteria} onChange={setCriteria} rows={4} maxLength={5000} />
              </FormField>
              {rubric.map((r, i) => (
                <div key={i} className="yx-hire-actions">
                  <FormField id={`js-r${i}`} label={`Rubric ${i + 1}`} error={rubricTried && !r.label.trim() ? 'Name what is scored.' : null}>
                    <TextField value={r.label} onChange={(v) => setRubric((x) => x.map((y, k) => (k === i ? { ...y, label: v } : y)))} maxLength={100} />
                  </FormField>
                  <FormField id={`js-w${i}`} label={`Weight ${i + 1} (%)`} error={rubricTried && !(Number.isInteger(r.weight) && r.weight >= 0 && r.weight <= 100) ? 'Enter a whole per cent from 0 to 100.' : null}>
                    <NumberField value={r.weight} onChange={(v) => setRubric((x) => x.map((y, k) => (k === i ? { ...y, weight: v ?? 0 } : y)))} min={0} max={100} />
                  </FormField>
                  <div>
                    <Button size="sm" variant="danger" onClick={() => setRubric((x) => x.filter((_, k) => k !== i))}>Remove rubric {i + 1}</Button>
                  </div>
                </div>
              ))}
              <div className="yx-hire-actions">
                <Button size="sm" icon={Plus} onClick={() => (rubric.length >= 8 ? setFailed('Up to 8 rubric lines.') : setRubric((x) => [...x, { label: '', weight: 0 }]))}>Add a rubric line</Button>
                <Button size="sm" variant="primary" loading={busy === 'fit'} onClick={() => {
                  setRubricTried(true);
                  if (badRubric >= 0) return focus(rubric[badRubric]!.label.trim() ? `js-w${badRubric}` : `js-r${badRubric}`);
                  if (rubric.length && rubricTotal !== 100) {
                    setFailed(`The weights must add up to 100 per cent (now ${rubricTotal}).`);
                    return focus('js-w0');
                  }
                  void run('fit', () => live.onUpdateJob({ fitCriteria: criteria.trim() || null, fitRubric: rubric.length ? rubric : null }), 'Fit criteria saved');
                }}>
                  Save fit criteria
                </Button>
                {live.onScreenAll && (
                  <Button size="sm" icon={Sparkles} loading={busy === 'screen'} onClick={() => void run('screen', async () => {
                    const r = await live.onScreenAll!();
                    toast?.toast({ tone: 'success', title: `${r.queued} résumés queued for scoring` });
                  })}>
                    Score every résumé
                  </Button>
                )}
              </div>
            </>
          ) : (
            <DescriptionList items={[{ label: 'Ideal candidate', value: live.job.fitCriteria || '—' }, { label: 'Rubric', value: live.job.fitRubric.map((r) => `${r.label} (${r.weight})`).join(', ') || '—' }]} />
          )}
        </div>
      </Card>

      <Card title="Stage targets" actions={live.canConfigure && live.onOpenSettings ? <Button size="sm" onClick={live.onOpenSettings}>Change in Settings</Button> : undefined}>
        <div className="yx-hire-stack">
          <Text as="p" size="sm" tone="secondary">
            Optional. The board shows a card in amber once it is over the days target, and flags a stage holding more than its limit. Nothing is blocked. These belong to the pipeline {live.pipelineName}, so every job on it uses them; they are changed in Settings › Hiring › Pipeline templates.
          </Text>
          <DescriptionList items={live.stages.map((t) => ({ label: t.name, value: targetText(t) }))} />
        </div>
      </Card>
    </div>
  );
}

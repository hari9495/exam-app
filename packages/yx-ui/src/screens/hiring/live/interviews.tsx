import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import type { Choice, InterviewView, LoadState, MyInterviewRow, Recommendation, ScorecardInput, ScorecardTemplateInput, ScorecardTemplateView } from './types';

// Recruitment batch AT5, wired (M10-BUILD-DESIGN §8.2, §8.3; founder D7): an interviewer's interviews, one interview
// with its scorecard, and the scorecard templates. Colleagues' scorecards stay hidden until you submit your own.

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const REC: { value: Recommendation; label: string }[] = [
  { value: 'strong_no', label: 'Strong no' },
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
  { value: 'strong_yes', label: 'Strong yes' },
];
const recLabel = (r: string | null) => REC.find((x) => x.value === r)?.label ?? '—';
const CARD: Record<MyInterviewRow['scorecard'], { label: string; tone: 'neutral' | 'warning' | 'success' | 'info' }> = {
  none: { label: 'No scorecard', tone: 'neutral' },
  not_started: { label: 'Scorecard to fill', tone: 'warning' },
  draft: { label: 'Scorecard started', tone: 'info' },
  submitted: { label: 'Scorecard in', tone: 'success' },
};

export interface MyInterviewsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: MyInterviewRow[];
  onOpen: (id: string) => void;
}

export function MyInterviewsScreen(p: MyInterviewsScreenProps) {
  const [show, setShow] = useState<'todo' | 'all'>('todo');
  const rows = show === 'todo' ? p.rows.filter((r) => r.status !== 'cancelled' && (r.scorecard === 'not_started' || r.scorecard === 'draft')) : p.rows;
  const cols: TableColumn<MyInterviewRow>[] = [
    { key: 'c', header: 'Candidate', value: (r) => r.candidateName, hideable: false },
    { key: 'j', header: 'Job', value: (r) => r.jobTitle },
    { key: 'w', header: 'When', value: (r) => r.when ?? '', render: (r) => <span>{r.when ? when(r.when) : 'Not fixed yet'}</span> },
    { key: 's', header: 'Scorecard', value: (r) => r.scorecard, render: (r) => <Badge tone={r.status === 'cancelled' ? 'neutral' : CARD[r.scorecard].tone}>{r.status === 'cancelled' ? 'Cancelled' : CARD[r.scorecard].label}</Badge> },
  ];
  return (
    <LivePage title="My interviews" description="Interviews you are on the panel for, and the scorecards you owe." state={p.state} onRetry={p.onRetry} what="your interviews" grantedBy="the recruiter">
      <Segment label="Show" value={show} onChange={setShow} options={[{ value: 'todo', label: 'Scorecards to do' }, { value: 'all', label: 'All' }]} />
      <DataTable label="My interviews" columns={cols} rows={rows} getRowId={(r) => r.id} rowNoun={['interview', 'interviews']} cardSummary empty={<EmptyState compact title={show === 'todo' ? 'No scorecards waiting for you.' : 'No interviews yet.'} />} rowButtons={(r) => <Button size="sm" onClick={() => p.onOpen(r.id)}>Open interview with {r.candidateName}</Button>} />
    </LivePage>
  );
}

export interface InterviewScreenProps {
  state: LoadState;
  onRetry?: () => void;
  view: InterviewView | null;
  onBack: () => void;
  onResume?: () => Promise<unknown>;
  onSave: (input: ScorecardInput) => Promise<unknown>;
  onSubmit: (input: ScorecardInput) => Promise<unknown>;
}

export function InterviewScreen(p: InterviewScreenProps) {
  const v = p.view;
  const mine = v?.scorecards.find((s) => s.mine);
  const others = v?.scorecards.filter((s) => !s.mine && s.status === 'submitted') ?? [];
  const slot = v?.interview.slots.find((s) => s.confirmed) ?? v?.interview.slots[0];
  return (
    <LivePage
      title={v ? `${v.interview.candidateName} · ${v.interview.jobTitle}` : 'Interview'}
      description={v ? [slot ? when(slot.startsAt) : 'Time not fixed yet', v.interview.location].join(' · ') : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this interview"
      grantedBy="the recruiter"
      actions={<Button onClick={p.onBack}>My interviews</Button>}
    >
      {v && (
        <>
          <div className="yx-tim-row">
            {v.panel.map((m) => <Badge key={m.userId} tone={m.submitted ? 'success' : 'neutral'}>{m.name}{m.submitted ? ' · in' : ''}</Badge>)}
            {v.interview.meetingUrl && <Button asChild size="sm"><a href={v.interview.meetingUrl} target="_blank" rel="noopener noreferrer">Join meeting</a></Button>}
          </div>
          {v.result && (
            <InlineAlert tone={!v.result.complete ? 'info' : v.result.passes ? 'success' : 'warning'} title={!v.result.complete ? `Scorecards ${v.result.submitted} of ${v.result.expected}` : v.result.passes ? `Passes the bar (${v.result.score} against ${v.template?.passBar})` : `Below the bar (${v.result.score} against ${v.template?.passBar})`}>
              {v.result.complete ? (v.result.passes ? 'Suggested next step: move to the next stage. A person decides.' : 'Suggested next step: reject. A person decides.') : 'The result shows when the whole panel has submitted.'}
            </InlineAlert>
          )}
          <Card title="Résumé">
            {v.resume ? (
              <>
                {v.resume.title && <Text as="p" weight="semibold">{v.resume.title}</Text>}
                {v.resume.summary && <Text as="p">{v.resume.summary}</Text>}
                {v.resume.skills && <Text as="p" tone="secondary">{v.resume.skills}</Text>}
                {v.resume.hasFile && p.onResume && <div><Button size="sm" onClick={() => void p.onResume!()}>Open the résumé</Button></div>}
              </>
            ) : (
              <Text as="p" tone="secondary">No résumé on file.</Text>
            )}
          </Card>
          {v.viewer.isPanelist && (
            !v.template ? (
              <InlineAlert tone="warning" title="No scorecard for this interview">Ask the recruiter to pick one for the job.</InlineAlert>
            ) : mine?.status === 'submitted' ? (
              <ScorecardRead title="Your scorecard" card={mine} template={v.template} />
            ) : (
              <ScorecardForm key={mine?.id ?? 'new'} {...p} view={v} />
            )
          )}
          {v.viewer.isPanelist && mine?.status !== 'submitted' ? (
            <Text as="p" tone="secondary">Other panellists’ scorecards appear here after you submit yours.</Text>
          ) : (
            others.map((s) => <ScorecardRead key={s.id} title={`${s.panelistName}’s scorecard`} card={s} template={v.template!} />)
          )}
          {v.earlier.length > 0 && (
            <Card title="Earlier rounds">
              {v.earlier.map((e, i) => <Text as="p" key={i}>{e.panelistName}: {recLabel(e.recommendation)} · {e.weightedScore}{e.summary ? ` · ${e.summary}` : ''}</Text>)}
            </Card>
          )}
        </>
      )}
    </LivePage>
  );
}

function ScorecardRead(p: { title: string; card: InterviewView['scorecards'][number]; template: NonNullable<InterviewView['template']> }) {
  return (
    <Card title={p.title}>
      <Text as="p" weight="semibold">{recLabel(p.card.recommendation)}{p.card.weightedScore != null ? ` · ${p.card.weightedScore} of ${p.template.scaleMax}${p.card.passes ? ' · passes the bar' : ' · below the bar'}` : ''}</Text>
      {p.template.items.map((it) => {
        const r = p.card.ratings.find((x) => x.itemId === it.id);
        return <Text as="p" key={it.id}>{it.label}: {r?.rating ?? '—'}{r?.notes ? ` · ${r.notes}` : ''}</Text>;
      })}
      {p.card.summary && <Text as="p" tone="secondary">{p.card.summary}</Text>}
    </Card>
  );
}

function ScorecardForm(p: InterviewScreenProps & { view: InterviewView }) {
  const t = p.view.template!;
  const mine = p.view.scorecards.find((s) => s.mine);
  const { busy, error, run } = useRun();
  const [ratings, setRatings] = useState<Record<string, { rating: number | null; notes: string }>>(Object.fromEntries(t.items.map((it) => { const r = mine?.ratings.find((x) => x.itemId === it.id); return [it.id, { rating: r?.rating ?? null, notes: r?.notes ?? '' }]; })));
  const [rec, setRec] = useState<Recommendation | null>(mine?.recommendation ?? null);
  const [summary, setSummary] = useState(mine?.summary ?? '');
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const input = (): ScorecardInput => ({ ratings: t.items.map((it) => ({ itemId: it.id, rating: ratings[it.id].rating, notes: ratings[it.id].notes.trim() || null })), recommendation: rec, summary: summary.trim() || null });
  const complete = t.items.every((it) => ratings[it.id].rating != null) && rec != null;
  const scale = Array.from({ length: t.scaleMax }, (_, i) => String(i + 1));
  return (
    <Card title={`Your scorecard · ${t.name}`}>
      {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
      {saved && !error && <Text as="p" tone="secondary">Draft saved.</Text>}
      <Text as="p" tone="secondary">Rate each item 1 to {t.scaleMax}. The pass bar is {t.passBar}.</Text>
      {t.items.map((it) => (
        <div key={it.id} className="yx-tim-stack">
          <FormField id={`sc-${it.id}`} label={`${it.label}${it.weight > 1 ? ` (counts ×${it.weight})` : ''}`} helper={it.guidance ?? undefined} required>
            <Segment label={it.label} value={ratings[it.id].rating == null ? null : String(ratings[it.id].rating)} onChange={(v) => { setRatings((r) => ({ ...r, [it.id]: { ...r[it.id], rating: Number(v) } })); setSaved(false); }} options={scale.map((x) => ({ value: x, label: x }))} />
          </FormField>
          <FormField id={`sn-${it.id}`} label={`Evidence for ${it.label}`} optional>
            <TextArea value={ratings[it.id].notes} onChange={(v) => setRatings((r) => ({ ...r, [it.id]: { ...r[it.id], notes: v } }))} rows={2} maxLength={4000} />
          </FormField>
        </div>
      ))}
      <FormField id="sc-rec" label="Overall recommendation" required>
        <Segment label="Overall recommendation" value={rec} onChange={setRec} options={REC} />
      </FormField>
      <FormField id="sc-sum" label="Summary" optional>
        <TextArea value={summary} onChange={setSummary} rows={3} maxLength={8000} />
      </FormField>
      <div className="yx-tim-row">
        <Button loading={busy === 'save'} onClick={() => void run('save', async () => { await p.onSave(input()); setSaved(true); })}>Save draft</Button>
        <Button variant="primary" disabled={!complete} onClick={() => setConfirming(true)}>Submit scorecard</Button>
      </div>
      {confirming && (
        <ConfirmDialog open onOpenChange={(o) => !o && setConfirming(false)} title="Submit your scorecard?" consequence="A submitted scorecard cannot be changed. You then see the other panellists' scorecards." confirmLabel="Submit scorecard" onConfirm={async () => { await p.onSubmit(input()); setConfirming(false); }} />
      )}
    </Card>
  );
}

export interface ScorecardTemplatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  templates: ScorecardTemplateView[];
  competencies: Choice[];
  canManage: boolean;
  onSave: (id: string | null, input: ScorecardTemplateInput) => Promise<unknown>;
  onArchive: (id: string) => Promise<unknown>;
}

export function ScorecardTemplatesScreen(p: ScorecardTemplatesScreenProps) {
  const [editing, setEditing] = useState<ScorecardTemplateView | 'new' | null>(null);
  const [archiving, setArchiving] = useState<ScorecardTemplateView | null>(null);
  const cols: TableColumn<ScorecardTemplateView>[] = [
    { key: 'n', header: 'Scorecard', value: (t) => t.name, hideable: false },
    { key: 'i', header: 'Items', type: 'number', value: (t) => t.items.length },
    { key: 'b', header: 'Pass bar', value: (t) => t.passBar, render: (t) => <span>{t.passBar} of {t.scaleMax}</span> },
    { key: 'u', header: 'In use', value: (t) => (t.inUse ? 'yes' : 'no'), render: (t) => (t.inUse ? <Badge tone="info">Used</Badge> : <Badge tone="neutral">Not used yet</Badge>) },
  ];
  return (
    <LivePage title="Interview scorecards" description="What a panel rates, with weights and the bar a candidate must reach." state={p.state} onRetry={p.onRetry} what="scorecards" grantedBy="your admin" actions={p.canManage && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>New scorecard</Button>}>
      <DataTable label="Interview scorecards" columns={cols} rows={p.templates} getRowId={(t) => t.id} rowNoun={['scorecard', 'scorecards']} empty={<EmptyState compact title="No scorecards yet." />} rowButtons={(t) => p.canManage ? (
        <>
          <Button size="sm" onClick={() => setEditing(t)}>{t.inUse ? `Copy ${t.name}` : `Edit ${t.name}`}</Button>
          <Button size="sm" variant="danger" onClick={() => setArchiving(t)}>Archive</Button>
        </>
      ) : null} />
      {editing && <TemplateDialog {...p} template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {archiving && <ConfirmDialog open destructive onOpenChange={(o) => !o && setArchiving(null)} title={`Archive ${archiving.name}?`} consequence="It is no longer offered for new interviews. Scorecards already filled keep it." confirmLabel="Archive scorecard" onConfirm={async () => { await p.onArchive(archiving.id); setArchiving(null); }} />}
    </LivePage>
  );
}

function TemplateDialog(p: ScorecardTemplatesScreenProps & { template: ScorecardTemplateView | null; onClose: () => void }) {
  const copy = Boolean(p.template?.inUse);
  const [name, setName] = useState(p.template ? (copy ? `${p.template.name} (copy)` : p.template.name) : '');
  const [scale, setScale] = useState<number | null>(p.template?.scaleMax ?? 4);
  const [bar, setBar] = useState<number | null>(p.template?.passBar ?? 2.5);
  const [items, setItems] = useState(p.template?.items.map((i) => ({ label: i.label, guidance: i.guidance ?? '', weight: i.weight, competencyId: i.competencyId })) ?? [{ label: '', guidance: '', weight: 1, competencyId: null as string | null }]);
  const [fromLib, setFromLib] = useState<string | null>(null);
  const barBad = bar == null || scale == null || bar < 1 || bar > scale;
  const ok = name.trim() && !barBad && items.length > 0 && items.every((i) => i.label.trim() && i.weight >= 1 && i.weight <= 10);
  const set = (k: number, patch: Partial<(typeof items)[number]>) => setItems((x) => x.map((y, i) => (i === k ? { ...y, ...patch } : y)));
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={p.template ? (copy ? `Copy ${p.template.name}` : `Edit ${p.template.name}`) : 'New scorecard'} confirmLabel="Save scorecard" confirmDisabled={!ok} onConfirm={async () => {
      await p.onSave(copy ? null : (p.template?.id ?? null), { name: name.trim(), scaleMax: scale!, passBar: bar!, items: items.map((i) => ({ label: i.label.trim(), guidance: i.guidance.trim() || null, weight: i.weight, competencyId: i.competencyId })) });
      p.onClose();
    }}>
      {copy && <Text as="p" tone="secondary">This scorecard has been used, so changes are saved as a new copy.</Text>}
      <FormField id="st-name" label="Name" required>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <div className="yx-tim-row">
        <FormField id="st-scale" label="Rating scale (1 to …)" required>
          <NumberField value={scale} onChange={setScale} min={3} max={10} />
        </FormField>
        <FormField id="st-bar" label="Pass bar" required error={barBad ? 'Between 1 and the top of the scale.' : undefined} helper="The weighted average a candidate must reach.">
          <NumberField value={bar} onChange={setBar} min={1} max={10} decimals />
        </FormField>
      </div>
      {items.map((it, k) => (
        <div key={k} className="yx-tim-row">
          <FormField id={`st-l${k}`} label={`Item ${k + 1}`} required>
            <TextField value={it.label} onChange={(v) => set(k, { label: v })} maxLength={200} />
          </FormField>
          <FormField id={`st-w${k}`} label={`Weight ${k + 1}`}>
            <NumberField value={it.weight} onChange={(v) => set(k, { weight: v ?? 1 })} min={1} max={10} />
          </FormField>
          <FormField id={`st-g${k}`} label={`What good looks like ${k + 1}`} optional>
            <TextField value={it.guidance} onChange={(v) => set(k, { guidance: v })} maxLength={1000} />
          </FormField>
          {items.length > 1 && <Button size="sm" variant="danger" onClick={() => setItems((x) => x.filter((_, i) => i !== k))}>Remove item {k + 1}</Button>}
        </div>
      ))}
      <div className="yx-tim-row">
        <Button size="sm" icon={Plus} disabled={items.length >= 30} onClick={() => setItems((x) => [...x, { label: '', guidance: '', weight: 1, competencyId: null }])}>Add an item</Button>
        {p.competencies.length > 0 && (
          <>
            <FormField id="st-lib" label="From the competency library" hideLabel>
              <Select aria-label="From the competency library" placeholder="From the competency library" value={fromLib} onChange={setFromLib} options={p.competencies} searchable />
            </FormField>
            <Button size="sm" disabled={!fromLib} onClick={() => { const c = p.competencies.find((x) => x.value === fromLib)!; setItems((x) => [...x.filter((i) => i.label.trim()), { label: c.label, guidance: '', weight: 1, competencyId: c.value }]); setFromLib(null); }}>Add competency</Button>
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}

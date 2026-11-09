// Hiring › Pipeline, candidate record, identity strip, interviews, scorecards, notetaker, AI review, bulk interview day.
// HIR-04, HIR-05, HIR-22, HIR-06, HIR-07, HIR-25, HIR-08, HIR-27 (M10 §7, YX-ATS-03 / 04 / 05 / 19 / 24 / 32 / 33 / 35 / 37 / 40).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, Merge, Mic, MicOff, Send, Shuffle, UserRound } from 'lucide-react';
import { Button } from '../../components/button';
import { AiBadge, Badge, PersonLabel } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { MenuItem } from '../../components/menu';
import { Segment } from '../../components/segment';
import { useToastIfAny } from '../../components/notify';
import { KanbanBoard, type KanbanColumn } from '../../components/kanban';
import { Calendar, type CalendarEvent } from '../../components/calendar';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR, formatPhone } from '../../lib/format';
import { PhoneFrame } from '../_kit/frames';
import { assignInterviewDay, findSlots, identityFlags, minutesToLabel, scorecardResult, type IdCheckpoint, type Panelist, type ScoreItem, type SlotRules } from './hiring-logic';
import { ExEmployeeBanner, HireFrame, IdentityStrip, PipelineFacts, RecordLayout, RecordingPlaceholder, SlotGrid, SummaryTiles, type ExEmployeeInfo, type Score } from './hiring-kit';
import type { Candidate } from './hiring-data';
import { EmailDialog, PickDialog, StageBadge, istDay } from './candidate-dialogs';
import type { CandidateProfileView, Choice, EmailCompose, EmailTemplateChoice, MergeChoices } from './live/types';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';

const scoresOf = (c: Candidate, viewer: 'recruiter' | 'hm' = 'recruiter'): Score[] => {
  const s: Score[] = [];
  if (c.assessment != null) s.push({ label: 'Test', value: `${c.assessment}`, tone: c.assessment >= 70 ? 'success' : c.assessment < 55 ? 'warning' : 'neutral' });
  if (c.aiInterview != null) s.push({ label: 'AI (advisory)', value: `${c.aiInterview}`, tone: 'ai' });
  if (c.panel != null) s.push({ label: 'Panel', value: `${c.panel}/5`, tone: c.panel >= 3 ? 'success' : 'warning' });
  return viewer === 'hm' ? s.filter((x) => x.label !== 'AI (advisory)' || c.stage !== 'AI round – review') : s;
};

/* ================================================================== HIR-04 · Pipeline board */

export interface PipelineBoardProps {
  job: string;
  candidates: Candidate[];
  stages: string[];
  persona: 'recruiter' | 'hm';
  state?: ListState;
  defaultMoveMenuFor?: string;
  defaultReasonFor?: { cardId: string; to: string };
}

/** One card on the live board (HIR-04): an application in a stage of the job's pipeline. */
export interface LivePipelineCard {
  /** The application (pipeline entry). */
  id: string;
  stageId: string;
  name: string;
  /** First fact line, e.g. "priya@example.com · Careers site". */
  line: string;
  scores: Score[];
  next: string;
  flags: string[];
  daysInStage: number;
}

export interface LivePipelineStage {
  id: string;
  title: string;
  /** Moving here is a rejection: it asks for a reason (the Rejected stage). */
  rejected: boolean;
  /** Shown collapsed at first, like Hired in the design. */
  collapsed?: boolean;
}

/** The live board (HIR-04): the job's stages and applications from GET hiring/jobs/:id/board; the API checks every move. */
export interface LivePipelineBoard {
  state: ListState;
  onRetry: () => void;
  job: string;
  jobId: string;
  jobs: { value: string; label: string }[];
  onJob: (jobId: string) => void;
  /** pipeline:manage and signed in as themselves; otherwise the board is read-only (decision 11). */
  canMove: boolean;
  /** Why the board is read-only, shown in the header. */
  readOnlyNote?: string;
  stages: LivePipelineStage[];
  cards: LivePipelineCard[];
  onMove: (cardId: string, toStageId: string) => Promise<void>;
  /** Resolves with the toast text and, while the candidate has not been told, an undo. */
  onReject: (cardId: string, reason: string) => Promise<{ description: string; undo: (() => Promise<void>) | null }>;
  onOpen: (cardId: string) => void;
  onBulk: () => void;
  onAdd: () => void;
}

// HIR-04
export function PipelineBoardScreen(props: PipelineBoardProps | { live: LivePipelineBoard }) {
  return 'live' in props ? <LivePipelineBoardView live={props.live} /> : <SamplePipelineBoard {...props} />;
}

function SamplePipelineBoard({ job, candidates, stages, persona, state = 'ready', defaultMoveMenuFor, defaultReasonFor }: PipelineBoardProps) {
  const [announce, setAnnounce] = useState('');
  const columns: KanbanColumn[] = useMemo(
    () =>
      stages.map((st) => ({
        id: st,
        title: st,
        slaDays: st === 'Applied' ? 3 : st === 'Screening' ? 5 : st === 'Panel' ? 7 : undefined,
        wipLimit: st === 'Panel' ? 6 : undefined,
        requiresReason: st === 'Rejected',
        addable: st === 'Applied' && persona === 'recruiter',
        emptyText: st === 'Hired' ? 'No hires yet for this job.' : undefined,
        cards: candidates
          .filter((c) => c.stage === st)
          .map((c) => {
            const flags: string[] = [];
            if (c.exEmployee) flags.push('Ex-employee');
            if (c.idFlag) flags.push('Identity review');
            return {
              id: c.id,
              name: c.name,
              daysInStage: c.daysInStage,
              facts: [`${c.current} · ${c.source}`, <PipelineFacts key="f" scores={scoresOf(c, persona)} next={c.next} flags={flags} />] as [ReactNode, ReactNode],
            };
          }),
      })),
    [candidates, stages, persona],
  );
  return (
    <PipelineBoardLayout
      job={job}
      count={candidates.length}
      jobPicker={<Select aria-label="Job" value="j1" onChange={() => {}} options={[{ value: 'j1', label: 'Senior QA Engineer · JOB-0311' }, { value: 'j3', label: 'Accountant · JOB-0305' }]} />}
      persona={persona}
      state={state}
      onRetry={() => {}}
      onAdd={() => {}}
      board={
        <>
          <KanbanBoard
            aria-label={`Hiring pipeline, ${job}`}
            defaultColumns={columns}
            noun="candidate"
            addCardLabel="Add candidate"
            onAddCard={() => {}}
            onOpenCard={() => {}}
            onMove={(id, from, to, reason) => setAnnounce(`${candidates.find((c) => c.id === id)?.name} moved from ${from} to ${to}${reason ? ` (${reason})` : ''}`)}
            defaultMoveMenuFor={defaultMoveMenuFor}
            defaultReasonFor={defaultReasonFor}
            defaultCollapsed={['Hired']}
            readOnly={persona === 'hm'}
          />
          <span className="yx-visually-hidden" aria-live="polite">
            {announce}
          </span>
        </>
      }
    />
  );
}

/** The header, the states and the board: the same for the design stories and the live page. */
function PipelineBoardLayout({ job, count, jobPicker, persona, state, onRetry, onAdd, onBulk, onShareFeedback, readOnlyNote, board }: {
  job: string;
  count: number;
  jobPicker: ReactNode;
  persona: 'recruiter' | 'hm';
  state: ListState;
  onRetry: () => void;
  onAdd: () => void;
  onBulk?: () => void;
  onShareFeedback?: () => void;
  readOnlyNote?: string;
  board: ReactNode;
}) {
  return (
    <HireFrame active="Pipeline">
      <PageHeader
        title="Pipeline"
        description={`${job} · ${count} candidate${count === 1 ? '' : 's'}. AI scores are advisory; people decide every move.${readOnlyNote ? ` ${readOnlyNote}` : ''}`}
        facts={jobPicker}
        actions={
          persona === 'recruiter' ? (
            <>
              <Button onClick={onBulk}>Bulk actions</Button>
              <Button variant="primary" onClick={onAdd}>
                Add candidate
              </Button>
            </>
          ) : (
            <Button onClick={onShareFeedback}>Share feedback</Button>
          )
        }
      />
      {state === 'loading' ? (
        <div className="yx-hire-board" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={320} />
          ))}
        </div>
      ) : state === 'error' ? (
        <ErrorState title="Couldn't load the pipeline" description="Check your connection and try again. No candidate was moved." onRetry={onRetry} reference="PIPE-3302" />
      ) : count === 0 ? (
        <EmptyState
          title="No candidates in this pipeline yet."
          description="Publish the job, share it with referrals, or add past candidates from rediscovery."
          action={
            persona === 'recruiter' ? (
              <Button variant="primary" onClick={onAdd}>
                Add candidate
              </Button>
            ) : undefined
          }
        />
      ) : (
        board
      )}
    </HireFrame>
  );
}

function LivePipelineBoardView({ live }: { live: LivePipelineBoard }) {
  const toaster = useToastIfAny();
  const shown = useMemo<KanbanColumn[]>(
    () =>
      live.stages.map((st, i) => ({
        id: st.id,
        title: st.title,
        requiresReason: st.rejected,
        addable: i === 0 && live.canMove,
        cards: live.cards
          .filter((c) => c.stageId === st.id)
          .map((c) => ({ id: c.id, name: c.name, daysInStage: c.daysInStage, facts: [c.line, <PipelineFacts key="f" scores={c.scores} next={c.next} flags={c.flags} />] as [ReactNode, ReactNode] })),
      })),
    [live.stages, live.cards, live.canMove],
  );
  // The card moves at once; a refused move puts it back (the page reloads the board after every answer).
  const [cols, setCols] = useState(shown);
  useEffect(() => setCols(shown), [shown]);
  const nameOf = (id: string) => live.cards.find((c) => c.id === id)?.name ?? 'The candidate';
  const titleOf = (id: string) => live.stages.find((s) => s.id === id)?.title ?? 'that stage';
  const refused = (title: string, e: unknown) => {
    setCols(shown);
    toaster?.toast({ tone: 'error', title, description: (e as Error).message });
  };
  const move = async (id: string, from: string, to: string, reason?: string) => {
    if (from === to) return;
    const name = nameOf(id);
    if (live.stages.find((s) => s.id === to)?.rejected) {
      try {
        const { description, undo } = await live.onReject(id, reason ?? '');
        const onUndo = undo
          ? () =>
              void undo().then(
                () => toaster?.toast({ tone: 'success', title: `${name} is back where they were` }),
                (e) => refused(`Could not undo for ${name}`, e),
              )
          : undefined;
        toaster?.toast({ tone: 'success', title: `${name} rejected`, description, ...(onUndo ? { onUndo } : {}) });
      } catch (e) {
        refused(`Could not reject ${name}`, e);
      }
      return;
    }
    try {
      await live.onMove(id, to);
      toaster?.toast({ tone: 'success', title: `${name} moved to ${titleOf(to)}` });
    } catch (e) {
      refused(`Could not move ${name}`, e);
    }
  };
  return (
    <PipelineBoardLayout
      job={live.job}
      count={live.cards.length}
      jobPicker={<Select aria-label="Job" value={live.jobId} onChange={(v) => v && v !== live.jobId && live.onJob(v)} options={live.jobs} />}
      persona={live.canMove ? 'recruiter' : 'hm'}
      state={live.state}
      onRetry={live.onRetry}
      onAdd={live.onAdd}
      onBulk={live.onBulk}
      onShareFeedback={() => toaster?.toast({ tone: 'default', title: 'Open a candidate to share feedback', description: 'Choose a name on the board; your note goes on their application.' })}
      readOnlyNote={live.readOnlyNote}
      board={
        <KanbanBoard
          aria-label={`Hiring pipeline, ${live.job}`}
          columns={cols}
          onColumnsChange={setCols}
          noun="candidate"
          addCardLabel="Add candidate"
          onAddCard={live.onAdd}
          onOpenCard={live.onOpen}
          onMove={(id, from, to, reason) => void move(id, from, to, reason)}
          defaultCollapsed={live.stages.filter((s) => s.collapsed).map((s) => s.id)}
          readOnly={!live.canMove}
        />
      }
    />
  );
}

/* ================================================================== HIR-05 · Candidate record */

export interface CandidateApplication {
  job: string;
  stage: string;
  applied: Date;
  source: string;
}

export interface CandidateRecordProps {
  candidate: Candidate;
  viewer: 'recruiter' | 'hr' | 'hm';
  exEmployee?: ExEmployeeInfo;
  minor?: { dob: Date; guardianConsent: 'pending' | 'verified' };
  identity: IdCheckpoint[];
  applications: CandidateApplication[];
  activity: TimelineItem[];
  duplicate?: Candidate | null;
  mergeOpen?: boolean;
  access?: 'ok' | 'denied' | 'not-found';
  now?: Date;
}

/** A possible duplicate of the open candidate (GET hiring/duplicates, the pairs that include it). */
export interface LiveDuplicate {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  reasons: string[];
}

/** The live candidate record: the API's profile for this viewer, their keys, and the actions. Each action resolves when done. */
export interface LiveCandidateRecord {
  state: 'loading' | 'ready' | 'error' | 'denied' | 'not-found';
  onRetry: () => void;
  profile: CandidateProfileView | null;
  /** candidate:manage, candidate:data_rights (erase, export, hold, merge), results:view (the résumé file). */
  can: { manage: boolean; dataRights: boolean; resume: boolean };
  now: Date;
  company?: string;
  duplicates: LiveDuplicate[];
  pools: Choice[];
  templates: EmailTemplateChoice[];
  senders: Choice[];
  /** Other candidates for "Merge with another candidate" (searchable). */
  mergeOptions: Choice[];
  onMergeSearch: (q: string) => void;
  loadOther: (id: string) => Promise<{ name: string; email: string | null; phone: string | null; hasResume: boolean }>;
  onBack: () => void;
  onOpenJob: (jobId: string) => void;
  onResume: () => Promise<void>;
  onEmail: (c: EmailCompose) => Promise<void>;
  onAddToPool: (listId: string) => Promise<{ added: number; refused: string[] }>;
  /** Merges `otherId` into this candidate (keepThis) or this one into `otherId`. */
  onMerge: (otherId: string, choices: MergeChoices, keepThis: boolean) => Promise<void>;
  onHold: (on: boolean, reason: string | null) => Promise<void>;
  onWithdrawPool: () => Promise<void>;
  onExport: () => Promise<void>;
  onErase: () => Promise<void>;
  /** HR clears an ineligible rehire flag (PUT lifecycle/exits/:id/hr) with a reason. */
  onClearRehire: (reason: string) => Promise<void>;
}

// HIR-05
export function CandidateRecordScreen(props: CandidateRecordProps | { live: LiveCandidateRecord }) {
  return 'live' in props ? <LiveCandidateRecordView live={props.live} /> : <SampleCandidateRecord {...props} />;
}

function SampleCandidateRecord({ candidate: c, viewer, exEmployee, minor, identity, applications, activity, duplicate = null, mergeOpen = false, access = 'ok', now }: CandidateRecordProps) {
  const [merge, setMerge] = useState(mergeOpen);
  if (access !== 'ok')
    return (
      <HireFrame active="Candidates & talent CRM">
        {access === 'denied' ? (
          <NoAccessState grantedBy="the recruiter who owns this job" what="this candidate" />
        ) : (
          <EmptyState title="Not found" description="This candidate doesn't exist or was anonymised after the retention period." action={<Button>Back to candidates</Button>} />
        )}
      </HireFrame>
    );
  return (
    <HireFrame active="Candidates & talent CRM">
      <RecordLayout
        banner={
          <>
            {exEmployee && <ExEmployeeBanner info={exEmployee} viewer={viewer} onClear={() => {}} />}
            {minor && (
              <InlineAlert tone="warning" title="Under 18: guardian consent needed">
                Date of birth {formatDate(minor.dob)}. {minor.guardianConsent === 'pending' ? 'Processing is paused until a parent or guardian gives verifiable consent.' : 'Guardian consent verified.'} No AI interview and no profiling for this candidate (DPDP s.9).
              </InlineAlert>
            )}
            {duplicate && viewer !== 'hm' && (
              <InlineAlert tone="info" title="Possible duplicate" actions={<Button size="sm" icon={Merge} onClick={() => setMerge(true)}>Review merge</Button>}>
                {duplicate.name} ({duplicate.email}) has the same phone number and a similar résumé.
              </InlineAlert>
            )}
          </>
        }
        header={
          <ObjectHeader
            name={c.name}
            person
            photoUrl={null}
            secondary={`${c.current} · ${c.experience} · ${c.location}`}
            status={
              <>
                <Badge tone="info">{c.stage}</Badge>
                {exEmployee && <Badge tone="neutral">Ex-employee</Badge>}
              </>
            }
            facts={
              viewer === 'hm'
                ? [
                    { label: 'Job', value: 'Senior QA Engineer' },
                    { label: 'Source', value: c.source },
                    { label: 'In stage', value: `${c.daysInStage} days` },
                  ]
                : [
                    { label: 'Email', value: c.email },
                    { label: 'Mobile', value: formatPhone(c.phone) },
                    { label: 'Expected CTC', value: formatINR(c.expected) },
                    { label: 'Source', value: c.source },
                  ]
            }
            actions={
              viewer === 'hm' ? (
                <Button variant="primary">Add feedback</Button>
              ) : (
                <>
                  <Button icon={CalendarPlus}>Schedule interview</Button>
                  <Button variant="primary">Move to next stage</Button>
                </>
              )
            }
            menu={
              viewer === 'hm' ? undefined : (
                <>
                  <MenuItem>Add to pool or hotlist</MenuItem>
                  <MenuItem>Merge with another candidate</MenuItem>
                  <MenuItem>Export candidate data</MenuItem>
                  <MenuItem destructive>Erase candidate data</MenuItem>
                </>
              )
            }
          />
        }
        aside={
          <>
            <Text weight="semibold">Activity</Text>
            <Timeline items={activity} today={now} />
          </>
        }
      >
        <IdentityStrip points={identity} onReverify={viewer !== 'hm' ? () => {} : undefined} onReview={viewer !== 'hm' ? () => {} : undefined} />
        <Tabs defaultValue="overview">
          <TabsList aria-label="Candidate sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="applications" count={applications.length}>
              Applications
            </TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            {viewer !== 'hm' && <TabsTrigger value="consent">Consent & retention</TabsTrigger>}
          </TabsList>
          <TabsContent value="overview">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Current role', value: c.current },
                { label: 'Experience', value: c.experience },
                { label: 'Location', value: c.location },
                { label: 'Notice period', value: '60 days' },
                { label: 'Skills (parsed from résumé)', value: 'Selenium, Playwright, REST API testing, SQL, JMeter' },
                { label: 'Next action', value: c.next },
              ]}
            />
          </TabsContent>
          <TabsContent value="applications">
            <ul className="yx-hire-list">
              {applications.map((a) => (
                <li key={a.job} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <Text weight="medium">{a.job}</Text>
                    <Text size="sm" tone="secondary">
                      Applied {formatDate(a.applied)} · {a.source}
                    </Text>
                  </div>
                  <Badge>{a.stage}</Badge>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="scores">
            <div className="yx-hire-stack">
              <SummaryTiles
                label="Scores"
                tiles={[
                  { label: 'Assessment', value: c.assessment != null ? `${c.assessment} / 100` : 'Not taken' },
                  { label: 'AI interview (advisory)', value: minor ? 'Not allowed' : c.aiInterview != null ? `${c.aiInterview} / 100` : 'Not taken', sub: 'Reviewed by a person' },
                  { label: 'Panel average', value: c.panel != null ? `${c.panel} / 5` : 'No scorecards yet' },
                ]}
              />
            </div>
          </TabsContent>
          {viewer !== 'hm' && (
            <TabsContent value="consent">
              <DescriptionList
                items={[
                  { label: 'Processing consent', value: 'Given 18 Sep 2026 · notice v3' },
                  { label: 'AI use notice', value: minor ? 'Not applicable (under 18)' : 'Consent given 18 Sep 2026' },
                  { label: 'Nurture: email', value: 'Opted in 18 Sep 2026' },
                  { label: 'Nurture: WhatsApp', value: 'No consent' },
                  { label: 'Retention', value: 'Until 29 Sep 2027 (12 months after last activity), then anonymised' },
                ]}
              />
            </TabsContent>
          )}
        </Tabs>
      </RecordLayout>
      {duplicate && <MergeDrawer open={merge} onOpenChange={setMerge} a={c} b={duplicate} />}
    </HireFrame>
  );
}

const PURPOSE: Record<string, string> = { application: 'Processing consent (applying for a job)', talent_pool: 'Kept for other roles (talent pool)' };
const REASON_TEXT: Record<string, string> = { phone: 'the same phone number', name_phone: 'the same name and number', resume: 'a similar résumé' };
const at = (iso: string) => new Date(iso);

/** The activity aside, built from what the record already holds (newest first). */
function activityOf(v: CandidateProfileView, team: string): TimelineItem[] {
  const me = { name: v.candidate.name };
  const hiring = { name: team };
  const items: TimelineItem[] = [
    { id: 'added', actor: hiring, action: 'added the candidate', at: at(v.candidate.createdAt) },
    ...v.applications.map((a) => ({ id: `ap-${a.id}`, actor: me, action: `applied for ${a.jobTitle}`, at: at(a.appliedAt) })),
    ...v.assessments.map((a) => ({ id: `as-${a.id}`, actor: hiring, action: `invited to ${a.exam}`, at: at(a.invitedAt) })),
    ...v.interviews.map((i) => ({ id: `iv-${i.id}`, actor: hiring, action: 'scheduled an interview', at: at(i.createdAt) })),
    ...v.messages.emails.slice(0, 10).map((e) => ({ id: `em-${e.id}`, actor: hiring, action: `emailed "${e.subject}"${e.status === 'failed' ? ' (not delivered)' : ''}`, at: at(e.createdAt) })),
    ...v.consents.flatMap((c) => [
      { id: `cg-${c.id}`, actor: me, action: `gave consent: ${PURPOSE[c.purpose] ?? c.purpose}`, at: at(c.givenAt) },
      ...(c.withdrawnAt ? [{ id: `cw-${c.id}`, actor: me, action: `withdrew consent: ${PURPOSE[c.purpose] ?? c.purpose}`, at: at(c.withdrawnAt) }] : []),
    ]),
    ...v.merges.map((m) => ({ id: `mg-${m.id}`, actor: hiring, action: m.keptId === v.candidate.id ? 'merged a duplicate into this candidate' : 'merged this candidate into another one', at: at(m.mergedAt) })),
    ...(v.legalHold ? [{ id: 'hold', actor: hiring, action: 'placed a legal hold', at: at(v.legalHold.at) }] : []),
  ];
  return items.sort((x, y) => y.at.getTime() - x.at.getTime());
}

function LiveCandidateRecordView({ live }: { live: LiveCandidateRecord }) {
  const toast = useToastIfAny();
  const [dialog, setDialog] = useState<null | 'email' | 'pool' | 'hold' | 'erase' | 'withdraw' | 'clear'>(null);
  const [merging, setMerging] = useState<{ otherId: string | null; fromMenu: boolean } | null>(null);
  const done = (title: string, description?: string): void => void toast?.toast({ tone: 'success', title, description });
  const v = live.profile;
  if (live.state !== 'ready' || !v || v.candidate.erasedAt)
    return (
      <HireFrame active="Candidates & talent CRM">
        {live.state === 'loading' ? (
          <div className="yx-hire-stack" aria-busy="true" aria-label="Loading the candidate">
            <Skeleton height={64} />
            <Skeleton height={240} />
          </div>
        ) : live.state === 'error' ? (
          <ErrorState title="This candidate could not be loaded." onRetry={live.onRetry} />
        ) : live.state === 'denied' ? (
          <NoAccessState grantedBy="your admin (a candidate key)" what="this candidate" />
        ) : (
          <EmptyState title="Not found" description="This candidate doesn't exist or was anonymised after the retention period." action={<Button onClick={live.onBack}>Back to candidates</Button>} />
        )}
      </HireFrame>
    );
  const c = v.candidate;
  const { manage, dataRights } = live.can;
  const hm = !manage && !dataRights;
  const ex = v.exEmployee ?? null;
  const viewer: 'recruiter' | 'hr' | 'hm' = hm ? 'hm' : ex?.exitCaseId ? 'hr' : 'recruiter';
  const latest = v.applications[0] ?? null;
  const open = v.applications.find((a) => !a.closed) ?? null;
  const poolConsent = v.consents.find((x) => x.purpose === 'talent_pool' && !x.withdrawnAt);
  const resume = v.resume;
  const title = [resume?.title, resume?.years != null ? `${resume.years} years` : null].filter(Boolean).join(' · ');
  const dup = live.duplicates[0] ?? null;
  return (
    <HireFrame active="Candidates & talent CRM">
      <RecordLayout
        banner={
          <>
            {ex && (
              <ExEmployeeBanner
                info={{ exitDate: ex.exitDate ? at(ex.exitDate) : null, exitType: ex.exitType, rehireEligible: ex.rehireEligible, rehireReason: ex.rehireReason, company: live.company }}
                viewer={viewer}
                onClear={() => setDialog('clear')}
              />
            )}
            {v.legalHold && (
              <InlineAlert tone="warning" title="Under legal hold">
                {v.legalHold.reason ? `${v.legalHold.reason} ` : ''}Nothing about this candidate is erased, merged away or swept while the hold is on.
              </InlineAlert>
            )}
            {dup && manage && (
              <InlineAlert tone="info" title="Possible duplicate" actions={dataRights ? <Button size="sm" icon={Merge} onClick={() => setMerging({ otherId: dup.id, fromMenu: false })}>Review merge</Button> : undefined}>
                {dup.name} ({dup.email}) has {dup.reasons.map((r) => REASON_TEXT[r] ?? r).join(' and ')}.{dataRights ? '' : ' Someone with the candidate data-rights key can merge them.'}
              </InlineAlert>
            )}
          </>
        }
        header={
          <ObjectHeader
            name={c.name}
            person
            photoUrl={null}
            secondary={title || 'No résumé details yet'}
            status={
              <>
                <StageBadge stage={c.globalStage} />
                {ex && <Badge tone="neutral">Ex-employee</Badge>}
                {v.legalHold && <Badge tone="warning">Legal hold</Badge>}
                {c.emailOptedOut && !hm && <Badge tone="neutral">No emails</Badge>}
              </>
            }
            facts={
              hm
                ? [
                    { label: 'Job', value: latest?.jobTitle ?? 'No application' },
                    { label: 'Source', value: latest?.source ?? 'Added by the team' },
                    { label: 'Applied', value: latest ? istDay(latest.appliedAt) : '—' },
                  ]
                : [
                    { label: 'Email', value: c.email ?? '—' },
                    { label: 'Mobile', value: c.phone ? formatPhone(c.phone) : '—' },
                    { label: 'Source', value: latest?.source ?? 'Added by the team' },
                    { label: 'Added', value: istDay(c.createdAt) },
                  ]
            }
            actions={
              <>
                {manage && !c.emailOptedOut && (
                  <Button icon={Send} onClick={() => setDialog('email')}>
                    Email
                  </Button>
                )}
                {open ? (
                  <Button variant="primary" onClick={() => live.onOpenJob(open.jobId)}>
                    Open in pipeline
                  </Button>
                ) : (
                  <Button onClick={live.onBack}>All candidates</Button>
                )}
              </>
            }
            menu={
              hm ? undefined : (
                <>
                  {manage && <MenuItem onSelect={() => setDialog('pool')}>Add to pool or hotlist</MenuItem>}
                  {manage && dataRights && <MenuItem onSelect={() => setMerging({ otherId: null, fromMenu: true })}>Merge with another candidate</MenuItem>}
                  {dataRights && <MenuItem onSelect={() => void live.onExport().then(() => done('Candidate data downloaded'), () => undefined)}>Export candidate data</MenuItem>}
                  {dataRights && <MenuItem onSelect={() => setDialog('hold')}>{v.legalHold ? 'Lift legal hold' : 'Place legal hold'}</MenuItem>}
                  {dataRights && !v.legalHold && (
                    <MenuItem destructive onSelect={() => setDialog('erase')}>
                      Erase candidate data
                    </MenuItem>
                  )}
                </>
              )
            }
          />
        }
        aside={
          <>
            <Text weight="semibold">Activity</Text>
            <Timeline items={activityOf(v, 'Hiring team')} today={live.now} />
          </>
        }
      >
        <Tabs defaultValue="overview">
          <TabsList aria-label="Candidate sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="applications" count={v.applications.length}>
              Applications
            </TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            {!hm && <TabsTrigger value="consent">Consent & retention</TabsTrigger>}
          </TabsList>
          <TabsContent value="overview">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Current role', value: resume?.title ?? '—' },
                { label: 'Experience', value: resume?.years != null ? `${resume.years} years` : '—' },
                { label: 'Skills (parsed from résumé)', value: resume?.skills ?? '—' },
                { label: 'Summary', value: resume?.summary ?? '—' },
                {
                  label: 'Résumé',
                  value: !resume?.hasFile ? (
                    'No résumé on file'
                  ) : resume.scan !== 'clean' ? (
                    resume.scan === 'infected' ? 'Blocked by the virus check' : 'Waiting for the virus check'
                  ) : live.can.resume ? (
                    <Button size="sm" onClick={() => void live.onResume()}>
                      Open the résumé
                    </Button>
                  ) : (
                    'On file'
                  ),
                },
                ...(hm ? [] : [{ label: 'Messages', value: `${v.messages.emails.length} emails · ${v.messages.sms} SMS · ${v.messages.whatsapp} WhatsApp` }]),
              ]}
            />
          </TabsContent>
          <TabsContent value="applications">
            {v.applications.length === 0 ? (
              <EmptyState compact title="No applications yet." />
            ) : (
              <ul className="yx-hire-list">
                {v.applications.map((a) => (
                  <li key={a.id} className="yx-hire-list__item">
                    <div className="yx-hire-list__main">
                      <Text weight="medium">{a.jobTitle}</Text>
                      <Text size="sm" tone="secondary">
                        Applied {istDay(a.appliedAt)}
                        {a.source ? ` · ${a.source}` : ''}
                      </Text>
                    </div>
                    <Badge tone={a.closed ? 'neutral' : 'info'}>{a.closed ? (a.closedReason ?? 'Closed') : [a.stage, a.status].filter(Boolean).join(' · ') || 'Applied'}</Badge>
                    <Button size="sm" onClick={() => live.onOpenJob(a.jobId)}>
                      Open job
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="scores">
            <div className="yx-hire-stack">
              <SummaryTiles
                label="Scores"
                tiles={[
                  { label: 'Assessments', value: v.assessments.length ? `${v.assessments.length}` : 'Not taken', sub: v.assessments[0] ? `Latest: ${v.assessments[0].exam}, ${v.assessments[0].status}` : undefined },
                  { label: 'Interviews', value: v.interviews.length ? `${v.interviews.length}` : 'None yet', sub: v.interviews[0] ? `Latest: ${v.interviews[0].status}` : undefined },
                  { label: 'Panel average', value: 'On the pipeline board', sub: 'Scorecards are read there' },
                ]}
              />
              {v.assessments.length > 0 && (
                <ul className="yx-hire-list">
                  {v.assessments.map((a) => (
                    <li key={a.id} className="yx-hire-list__item">
                      <div className="yx-hire-list__main">
                        <Text weight="medium">{a.exam}</Text>
                        <Text size="sm" tone="secondary">
                          Invited {istDay(a.invitedAt)}
                        </Text>
                      </div>
                      <Badge>{a.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
          {!hm && (
            <TabsContent value="consent">
              <div className="yx-hire-stack">
                <DescriptionList
                  items={[
                    ...(v.consents.length
                      ? v.consents.map((x) => ({ label: PURPOSE[x.purpose] ?? x.purpose, value: x.withdrawnAt ? `Withdrawn ${istDay(x.withdrawnAt)} · notice v${x.version}` : `Given ${istDay(x.givenAt)} · notice v${x.version}` }))
                      : [{ label: 'Consent', value: 'None recorded' }]),
                    { label: 'Nurture: email', value: c.emailOptedOut ? 'Opted out' : 'Not opted out' },
                    { label: 'Nurture: WhatsApp', value: c.whatsappOptedOut ? 'Opted out' : 'Not opted out' },
                    {
                      label: 'Retention',
                      value: v.legalHold ? 'On legal hold: kept until the hold is lifted' : v.retention?.until ? `Until ${istDay(v.retention.until)} (${v.retention.months} months after last activity), then anonymised` : '—',
                    },
                    ...(v.lists.length ? [{ label: 'Pools and hotlists', value: v.lists.map((l) => l.name).join(', ') }] : []),
                    ...(v.merges.length ? [{ label: 'Merges', value: v.merges.map((m) => `${m.keptId === c.id ? 'A duplicate was merged in' : 'Merged into another candidate'} on ${istDay(m.mergedAt)}`).join(' · ') }] : []),
                  ]}
                />
                {manage && poolConsent && (
                  <div className="yx-hire-actions">
                    <Button size="sm" onClick={() => setDialog('withdraw')}>
                      Record withdrawal: kept for other roles
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </RecordLayout>

      {dialog === 'email' && <EmailDialog count={1} templates={live.templates} senders={live.senders} onClose={() => setDialog(null)} onSend={async (m) => (await live.onEmail(m), done('Email on its way'))} />}
      {dialog === 'pool' && (
        <PickDialog
          title={`Add ${c.name} to a pool or hotlist`}
          label="List"
          options={live.pools}
          confirm="Add to list"
          note="A talent pool takes only candidates who agreed to be kept for other roles."
          onClose={() => setDialog(null)}
          onConfirm={async (id) => {
            const r = await live.onAddToPool(id);
            if (r.refused.length) throw new Error('Not added: the candidate did not agree to be kept for other roles. Use a hotlist instead.');
            done('Added to the list');
          }}
        />
      )}
      {dialog === 'hold' && <HoldDialog on={!v.legalHold} onClose={() => setDialog(null)} onSave={async (on, reason) => (await live.onHold(on, reason), done(on ? 'Legal hold placed' : 'Legal hold lifted'))} />}
      {dialog === 'withdraw' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="Record that the candidate withdrew?"
          consequence="They leave every talent pool now and are not added to one again unless they agree again."
          confirmLabel="Record withdrawal"
          onConfirm={async () => {
            await live.onWithdrawPool();
            setDialog(null);
            done('Withdrawal recorded');
          }}
        />
      )}
      {dialog === 'erase' && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Erase ${c.name}'s personal data?`}
          consequence="Name, contact details, résumé, messages and notes are removed for good. Applications, stages and scores stay without the name. The erase is recorded in the audit log. This cannot be undone."
          confirmLabel="Erase personal data"
          onConfirm={async () => {
            await live.onErase();
            setDialog(null);
            done('Personal data erased');
          }}
        />
      )}
      {dialog === 'clear' && <ClearRehireDialog onClose={() => setDialog(null)} onSave={async (reason) => (await live.onClearRehire(reason), done('Rehire flag cleared'))} />}
      {merging && (
        <LiveMerge
          live={live}
          otherId={merging.otherId}
          fromMenu={merging.fromMenu}
          onClose={() => setMerging(null)}
          onDone={(name) => done('Candidates merged', `${name} is one record now. The merge is in the audit log.`)}
        />
      )}
    </HireFrame>
  );
}

function HoldDialog(p: { on: boolean; onClose: () => void; onSave: (on: boolean, reason: string | null) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && p.onClose()}
      title={p.on ? 'Place a legal hold?' : 'Lift the legal hold?'}
      consequence={p.on ? 'While the hold is on, nothing about this candidate is erased, merged away or removed by the retention sweep.' : 'The candidate is handled by the normal retention rules again.'}
      confirmLabel={p.on ? 'Place hold' : 'Lift hold'}
      onConfirm={async () => {
        setTried(true);
        if (p.on && reason.trim().length < 3) return (setTimeout(() => document.getElementById('lh-reason')?.focus(), 0), false);
        await p.onSave(p.on, p.on ? reason.trim() : null);
        p.onClose();
      }}
    >
      {p.on && (
        <FormField id="lh-reason" label="Reason" required helper="For example the case or request reference." error={tried && reason.trim().length < 3 ? 'Enter a reason of at least 3 characters.' : null}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}

function ClearRehireDialog(p: { onClose: () => void; onSave: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && p.onClose()}
      title="Clear the rehire flag?"
      consequence="The person becomes eligible for rehire on their exit record. The reason is kept with HR's exit facts and the change is in the audit log."
      confirmLabel="Clear flag"
      onConfirm={async () => {
        setTried(true);
        if (reason.trim().length < 3) return (setTimeout(() => document.getElementById('rh-reason')?.focus(), 0), false);
        await p.onSave(reason.trim());
        p.onClose();
      }}
    >
      <FormField id="rh-reason" label="Reason" required error={tried && reason.trim().length < 3 ? 'Say why the flag is cleared (at least 3 characters).' : null}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

/** The merge drawer on the live record: the other candidate (chosen or from the duplicate alert), which record stays, and the fields. */
function LiveMerge({ live, otherId, fromMenu, onClose, onDone }: { live: LiveCandidateRecord; otherId: string | null; fromMenu: boolean; onClose: () => void; onDone: (name: string) => void }) {
  const v = live.profile!;
  const [other, setOther] = useState<string | null>(otherId);
  const [values, setValues] = useState<{ name: string; email: string | null; phone: string | null; hasResume: boolean } | null>(null);
  const [keep, setKeep] = useState<'a' | 'b'>('a');
  const [failed, setFailed] = useState<string | null>(null);
  const load = (id: string | null) => {
    setOther(id);
    setValues(null);
    setFailed(null);
    if (id) live.loadOther(id).then(setValues, (e: unknown) => setFailed(e instanceof Error ? e.message : 'That candidate could not be loaded.'));
  };
  useEffect(() => {
    if (otherId) load(otherId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const me = { name: v.candidate.name, email: v.candidate.email, phone: v.candidate.phone, hasResume: Boolean(v.resume?.hasFile) };
  const [kept, gone] = keep === 'a' ? [me, values] : [values, me];
  const fields: MergeFieldRow[] =
    kept && gone
      ? [
          { key: 'name', label: 'Name', a: kept.name, b: gone.name },
          { key: 'phone', label: 'Mobile', a: kept.phone ?? '(none)', b: gone.phone ?? '(none)' },
          { key: 'resume', label: 'Résumé', a: kept.hasResume ? `${kept.name}'s résumé` : '(none)', b: gone.hasResume ? `${gone.name}'s résumé` : '(none)' },
        ]
      : [];
  return (
    <MergeDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      a={null}
      b={null}
      live={{
        keptName: kept?.name ?? v.candidate.name,
        otherName: gone?.name ?? null,
        otherEmail: gone?.email ?? null,
        fields,
        error: failed,
        pick: fromMenu ? { options: live.mergeOptions.filter((o) => o.value !== v.candidate.id), value: other, onChange: load, onSearch: live.onMergeSearch } : undefined,
        keep: values ? { value: keep, options: [{ value: 'a', label: me.email ?? me.name }, { value: 'b', label: values.email ?? values.name }], onChange: setKeep } : undefined,
        onMerge: async (choice) => {
          const choices: MergeChoices = { name: choice.name === 'b' ? 'merged' : 'kept', phone: choice.phone === 'b' ? 'merged' : 'kept', resume: choice.resume === 'b' ? 'merged' : 'kept' };
          await live.onMerge(other!, choices, keep === 'a');
          onDone(kept!.name);
          onClose();
        },
      }}
    />
  );
}

const MERGE_FIELDS: { key: keyof Candidate; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Mobile' },
  { key: 'current', label: 'Current role' },
  { key: 'location', label: 'Location' },
];

/** One field the merge decides: `a` is the kept record's value, `b` the other's. Only differing fields are asked. */
export interface MergeFieldRow {
  key: string;
  label: string;
  a: string;
  b: string;
}

/** The live merge (HIR-05 Merge): what will happen is in the confirm; the caller merges and closes. */
export interface LiveMergeDrawer {
  keptName: string;
  otherName: string | null;
  otherEmail?: string | null;
  fields: MergeFieldRow[];
  /** Loading the other record failed. */
  error?: string | null;
  /** "Merge with another candidate": choose the duplicate first. */
  pick?: { options: Choice[]; value: string | null; onChange: (id: string | null) => void; onSearch?: (q: string) => void };
  /** Which record stays (the list's pair, or the record's alert). */
  keep?: { value: 'a' | 'b'; options: { value: 'a' | 'b'; label: string }[]; onChange: (v: 'a' | 'b') => void };
  onMerge: (choice: Record<string, 'a' | 'b'>) => Promise<void>;
}

export function MergeDrawer({ open, onOpenChange, a, b, live }: { open: boolean; onOpenChange: (o: boolean) => void; a: Candidate | null; b: Candidate | null; live?: LiveMergeDrawer }) {
  const [choice, setChoice] = useState<Record<string, 'a' | 'b'>>({});
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rows: MergeFieldRow[] = live ? live.fields : MERGE_FIELDS.map((f) => ({ key: f.key, label: f.label, a: String(a![f.key]), b: String(b![f.key]) }));
  const aName = live ? live.keptName : a!.name;
  const bName = live ? live.otherName : b!.name;
  const differing = rows.filter((f) => f.a !== f.b);
  const left = differing.filter((f) => !choice[f.key]);
  const needOther = Boolean(live?.pick) && !live?.pick?.value;
  const press = () => {
    setTried(true);
    if (needOther) return void setTimeout(() => document.getElementById('merge-pick')?.focus(), 0);
    if (!bName) return;
    if (left.length) return void setTimeout(() => document.querySelector<HTMLElement>(`#merge-${left[0]!.key} [role="radio"]`)?.focus(), 0);
    setConfirming(true);
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Merge candidates"
      subtitle="Both histories are kept. Choose the value to keep for each field that differs."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={press}>
            Merge records
          </Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        {live?.pick && (
          <FormField id="merge-pick" label="Duplicate to merge" required error={tried && needOther ? 'Choose the duplicate to merge.' : null}>
            <Select aria-label="Duplicate to merge" value={live.pick.value} onChange={(id) => (setChoice({}), live.pick!.onChange(id))} options={live.pick.options} searchable onSearchChange={live.pick.onSearch} />
          </FormField>
        )}
        {live?.error && <InlineAlert tone="danger" title="Not loaded">{live.error}</InlineAlert>}
        {live?.keep && (
          <FormField label="Record to keep">
            <Segment label="Record to keep" value={live.keep.value} onChange={(k) => (setChoice({}), live.keep!.onChange(k))} options={live.keep.options} />
          </FormField>
        )}
        {bName && left.length > 0 && <Text size="sm" tone="secondary">{left.length} {left.length === 1 ? 'field' : 'fields'} left to choose.</Text>}
        {bName && differing.length === 0 && <Text size="sm" tone="secondary">The details are the same; nothing to choose.</Text>}
        {bName &&
          differing.map((f) => (
            <div key={f.key} id={`merge-${f.key}`}>
              <FormField label={f.label} required error={tried && !choice[f.key] ? `Choose which ${f.label.toLowerCase()} to keep.` : null}>
                <RadioGroup
                  aria-label={f.label}
                  value={choice[f.key] ?? ''}
                  onChange={(val) => setChoice((c) => ({ ...c, [f.key]: val as 'a' | 'b' }))}
                  options={[
                    { value: 'a', label: f.a, description: `From ${aName}` },
                    { value: 'b', label: f.b, description: `From ${bName}` },
                  ]}
                />
              </FormField>
            </div>
          ))}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Merge ${bName ?? ''} into ${aName}?`}
        consequence={`${bName}${live?.otherEmail ? ` (${live.otherEmail})` : ''} becomes part of ${aName}. Applications, scores, documents, messages and consents from both records are kept on one candidate; if both applied to the same job, ${bName}'s application closes as merged. The merge is recorded in the audit log and cannot be undone.`}
        confirmLabel="Merge records"
        onConfirm={async () => {
          if (live) await live.onMerge(choice);
          setConfirming(false);
          onOpenChange(false);
        }}
      />
    </Drawer>
  );
}

/* ================================================================== HIR-06 · Interview calendar + slot finder */

export interface InterviewCalendarProps {
  events: CalendarEvent[];
  persona: 'recruiter' | 'interviewer';
  today: Date;
  panel?: Panelist[];
  rules?: SlotRules;
  slotFinderOpen?: boolean;
  myInterviews?: { id: string; candidate: string; round: string; when: string; scorecard: 'due' | 'overdue' | 'submitted' }[];
}

export const DEFAULT_RULES: SlotRules = { dayStart: 9 * 60 + 30, dayEnd: 17 * 60 + 30, duration: 60, buffer: 15, maxPerDay: 3 };

// HIR-06
export function InterviewCalendarScreen({ events, persona, today, panel = [], rules = DEFAULT_RULES, slotFinderOpen = false, myInterviews = [] }: InterviewCalendarProps) {
  const [open, setOpen] = useState(slotFinderOpen);
  const [chosen, setChosen] = useState<number | null>(null);
  const slots = findSlots(panel, rules);
  const unknownRequired = panel.filter((p) => p.required && p.busy == null);
  return (
    <HireFrame active="Interviews">
      <PageHeader
        title={persona === 'recruiter' ? 'Interviews' : 'My interviews'}
        description={persona === 'recruiter' ? 'Panel rounds for your jobs. Free / busy comes from connected calendars.' : 'Interviews you are on, and scorecards you owe.'}
        actions={persona === 'recruiter' ? <Button variant="primary" icon={CalendarPlus} onClick={() => setOpen(true)}>Find a slot</Button> : undefined}
      />
      {persona === 'interviewer' && (
        <Card title="Scorecards">
          {myInterviews.length === 0 ? (
            <EmptyState compact title="No interviews assigned to you this week." />
          ) : (
            <ul className="yx-hire-list">
              {myInterviews.map((i) => (
                <li key={i.id} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <PersonLabel name={i.candidate} secondary={`${i.round} · ${i.when}`} />
                  </div>
                  <Badge tone={i.scorecard === 'overdue' ? 'warning' : i.scorecard === 'submitted' ? 'success' : 'neutral'}>
                    Scorecard {i.scorecard}
                  </Badge>
                  {i.scorecard !== 'submitted' && <Button size="sm">Fill scorecard</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Calendar events={events} defaultView={persona === 'recruiter' ? 'week' : 'agenda'} defaultDate={today} today={today} aria-label="Interview calendar" />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="full"
        title="Find a slot · Panel 2 for Ananya Iyer"
        subtitle={`60 minutes · 1 Oct 2026 · buffer ${rules.buffer} min · up to ${rules.maxPerDay} interviews a day per interviewer`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={slots.length === 0}>Offer top 3 to candidate</Button>
            <Button variant="primary" icon={Send} disabled={chosen == null}>
              Book and send invites
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <div className="yx-hire-chips">
            <Badge>Buffer {rules.buffer} min</Badge>
            <Badge>Load cap {rules.maxPerDay} a day</Badge>
            <Badge>Working hours 9:30 am – 5:30 pm IST</Badge>
            <Badge>Candidate: available after 10:00 am</Badge>
          </div>
          {unknownRequired.length > 0 ? (
            <InlineAlert tone="warning" title="No slots proposed">
              {unknownRequired.map((p) => p.name).join(', ')} {unknownRequired.length === 1 ? 'has' : 'have'} no connected calendar, so availability is unknown. Ask them to connect a calendar or pick a time with them directly.
            </InlineAlert>
          ) : slots.length === 0 ? (
            <InlineAlert tone="warning" title="No common free slot on this day">
              Try the next working day or make an optional panelist required.
            </InlineAlert>
          ) : null}
          <SlotGrid panel={panel} from={rules.dayStart} to={rules.dayEnd} slots={slots} chosen={chosen} onChoose={setChosen} />
          <span className="yx-visually-hidden" aria-live="polite">
            {chosen != null ? `Chosen ${minutesToLabel(chosen)}. Availability is checked again when you book.` : ''}
          </span>
        </div>
      </Drawer>
    </HireFrame>
  );
}

/* ================================================================== HIR-07 · Scorecard form */

export interface ScorecardFormProps {
  candidate: string;
  round: string;
  skills: { skill: string; weight: number; passBar: number; hint: string }[];
  defaultRatings?: (number | null)[];
  identity?: IdCheckpoint[];
  submitted?: boolean;
}

function ScorecardBody({ candidate, round, skills, defaultRatings, identity, submitted }: ScorecardFormProps) {
  const [ratings, setRatings] = useState<(number | null)[]>(defaultRatings ?? skills.map(() => null));
  const [rec, setRec] = useState<string | undefined>();
  const items: ScoreItem[] = skills.map((s, i) => ({ ...s, rating: ratings[i] }));
  const res = scorecardResult(items);
  const flags = identity ? identityFlags(identity) : [];
  return (
    <div className="yx-hire-stack">
      {identity && <IdentityStrip points={identity} compact />}
      {flags.length > 0 && (
        <InlineAlert tone="info">Rate the interview on its merits. An identity flag goes to review separately and can&rsquo;t be the reason for your recommendation.</InlineAlert>
      )}
      {submitted && (
        <InlineAlert tone="success" title="Scorecard submitted" actions={<Button size="sm">Add comment</Button>}>
          The recruiter and hiring manager can see it. You can&rsquo;t edit it now; add a comment instead.
        </InlineAlert>
      )}
      {skills.map((s, i) => (
        <fieldset key={s.skill} className="yx-hire-skill" disabled={submitted}>
          <legend>
            <Text weight="semibold">{s.skill}</Text> <Text size="sm" tone="secondary">· weight {s.weight}% · pass bar {s.passBar} of 5</Text>
          </legend>
          <Text as="p" size="sm" tone="secondary">
            {s.hint}
          </Text>
          <RadioGroup
            aria-label={`${s.skill} rating`}
            orientation="horizontal"
            value={ratings[i] != null ? String(ratings[i]) : undefined}
            onChange={(v) => setRatings((r) => r.map((x, j) => (j === i ? Number(v) : x)))}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
          />
          {ratings[i] != null && ratings[i]! < s.passBar && <Badge tone="warning">Below pass bar</Badge>}
          <FormField label="Evidence" optional hideLabel>
            <TextArea rows={2} placeholder="What did the candidate say or do?" />
          </FormField>
        </fieldset>
      ))}
      <div className="yx-hire-result" aria-live="polite">
        <Text weight="semibold">{res.complete ? `Weighted score ${res.score} of 5` : 'Weighted score appears when every skill is rated'}</Text>
        <Text as="p" size="sm">
          {res.prompt}
        </Text>
      </div>
      <FormField label="Your recommendation" required>
        <RadioGroup
          aria-label="Recommendation"
          value={rec}
          onChange={setRec}
          options={[
            { value: 'strong-yes', label: 'Strong yes' },
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'strong-no', label: 'Strong no' },
          ]}
          orientation="horizontal"
          disabled={submitted}
        />
      </FormField>
      {!submitted && (
        <div className="yx-hire-actions">
          <Button>Save draft</Button>
          <Button variant="primary" disabled={!res.complete || !rec}>
            Submit scorecard
          </Button>
        </div>
      )}
      <Text size="xs" tone="muted">
        {candidate} · {round}
      </Text>
    </div>
  );
}

// HIR-07
export function ScorecardScreen(props: ScorecardFormProps) {
  return (
    <HireFrame active="Interviews">
      <PageHeader title={`Scorecard · ${props.candidate}`} description={`${props.round} · Senior QA Engineer · rate each skill against its pass bar`} />
      <div className="yx-hire-narrow">
        <ScorecardBody {...props} />
      </div>
    </HireFrame>
  );
}

// HIR-07 (phone)
export function ScorecardPhone(props: ScorecardFormProps) {
  return (
    <PhoneFrame tab="requests" title="Scorecard" hideTabs>
      <Text weight="semibold">{props.candidate}</Text>
      <ScorecardBody {...props} />
    </PhoneFrame>
  );
}

/* ================================================================== HIR-25 · Notetaker consent + draft scorecard review */

export interface Participant {
  name: string;
  role: 'Candidate' | 'Interviewer' | 'Hiring manager';
  consent: 'given' | 'declined' | 'waiting';
}

// HIR-25
export function NotetakerConsentPanel({ participants }: { participants: Participant[] }) {
  const recording = participants.every((p) => p.consent === 'given');
  const declined = participants.filter((p) => p.consent === 'declined');
  return (
    <Card title="Interview notetaker" actions={<Badge tone={recording ? 'success' : 'neutral'}>{recording ? 'Recording' : 'Not recording'}</Badge>}>
      <ul className="yx-hire-list">
        {participants.map((p) => (
          <li key={p.name} className="yx-hire-list__item">
            <PersonLabel name={p.name} secondary={p.role} />
            <Badge tone={p.consent === 'given' ? 'success' : p.consent === 'declined' ? 'warning' : 'neutral'}>
              {p.consent === 'given' ? 'Consent given' : p.consent === 'declined' ? 'Declined' : 'Waiting'}
            </Badge>
          </li>
        ))}
      </ul>
      <Text as="p" size="sm" tone="secondary">
        {recording ? (
          <>
            <MicIcon on /> Everyone consented. The transcript drafts scorecard notes; you confirm each rating before submitting.
          </>
        ) : declined.length ? (
          <>
            <MicIcon /> {declined.map((d) => d.name).join(', ')} declined. No recording or transcript: the interview continues and you fill the scorecard yourself.
          </>
        ) : (
          <>
            <MicIcon /> Recording starts only after every participant consents.
          </>
        )}
      </Text>
    </Card>
  );
}

function MicIcon({ on }: { on?: boolean }) {
  const I = on ? Mic : MicOff;
  return <I size={16} strokeWidth={1.5} aria-hidden="true" className="yx-hire-inline-icon" />;
}

export interface DraftRating {
  skill: string;
  aiRating: number;
  aiNote: string;
  quote: string;
}

// HIR-25 (draft review)
export function DraftScorecardReview({ candidate, drafts, defaultConfirmed = [] }: { candidate: string; drafts: DraftRating[]; defaultConfirmed?: number[] }) {
  const [confirmed, setConfirmed] = useState<Record<number, number>>(Object.fromEntries(defaultConfirmed.map((i) => [i, drafts[i].aiRating])));
  const done = Object.keys(confirmed).length === drafts.length;
  return (
    <HireFrame active="Interviews">
      <PageHeader title={`Review draft scorecard · ${candidate}`} description="Drafted from the consented transcript. Nothing is submitted until you confirm or change every rating." status={<AiBadge />} />
      <div className="yx-hire-narrow yx-hire-stack">
        {drafts.map((d, i) => (
          <fieldset key={d.skill} className="yx-hire-skill">
            <legend>
              <Text weight="semibold">{d.skill}</Text>
            </legend>
            <Text as="p" size="sm">
              {d.aiNote}
            </Text>
            <blockquote className="yx-hire-quote">&ldquo;{d.quote}&rdquo;</blockquote>
            <div className="yx-hire-row">
              <RadioGroup
                aria-label={`${d.skill} rating`}
                orientation="horizontal"
                value={String(confirmed[i] ?? d.aiRating)}
                onChange={(v) => setConfirmed((c) => ({ ...c, [i]: Number(v) }))}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              />
              {confirmed[i] != null ? (
                <Badge tone="success">{confirmed[i] === d.aiRating ? 'Confirmed' : `Changed from ${d.aiRating}`}</Badge>
              ) : (
                <Button size="sm" onClick={() => setConfirmed((c) => ({ ...c, [i]: d.aiRating }))}>
                  Confirm {d.aiRating}
                </Button>
              )}
            </div>
          </fieldset>
        ))}
        <div className="yx-hire-row">
          <Text size="sm" tone={done ? 'success' : 'secondary'} aria-live="polite">
            {Object.keys(confirmed).length} of {drafts.length} ratings confirmed
          </Text>
          <Button variant="primary" disabled={!done}>
            Submit scorecard
          </Button>
        </div>
      </div>
    </HireFrame>
  );
}

/* ================================================================== HIR-08 · AI interview review player */

export interface AiAnswer {
  q: string;
  score: number;
  evidence: string;
  transcript: string;
}

export interface AiReviewProps {
  candidate: Candidate;
  answers: AiAnswer[];
  integrity: string[];
  identity: IdCheckpoint[];
  decided?: 'progressed' | 'not-selected' | null;
  alternativeRequested?: boolean;
  now?: Date;
}

// HIR-08
export function AiInterviewReviewScreen({ candidate: c, answers, integrity, identity, decided = null, alternativeRequested = false }: AiReviewProps) {
  const [sel, setSel] = useState(0);
  const [decision, setDecision] = useState(decided);
  const [reason, setReason] = useState<string | null>(null);
  const total = Math.round(answers.reduce((s, a) => s + a.score, 0) / answers.length);
  const flags = identityFlags(identity);
  return (
    <HireFrame active="Pipeline">
      <RecordLayout
        banner={
          alternativeRequested ? (
            <InlineAlert tone="info" title="Candidate asked for a human interview instead">
              Requested 27 Sep 2026. Schedule a recruiter call; the AI result isn&rsquo;t used and the candidate is at no disadvantage.
            </InlineAlert>
          ) : undefined
        }
        header={
          <ObjectHeader
            name={`AI interview · ${c.name}`}
            icon={UserRound}
            secondary="Senior QA Engineer · 6 questions · English · video answers"
            status={
              <>
                <Badge tone="info">AI round – review</Badge>
                <AiBadge />
              </>
            }
            facts={[
              { label: 'Advisory score', value: `${total} / 100` },
              { label: 'Integrity flags', value: integrity.length || 'None' },
              { label: 'Identity', value: flags.length ? 'Review flag' : 'Matched' },
              { label: 'Recorded', value: '27 Sep 2026' },
            ]}
          />
        }
        aside={
          <div className="yx-hire-stack">
            <Text weight="semibold">Your decision</Text>
            <Text as="p" size="sm" tone="secondary">
              The score is advice. A person decides every move; there is never an automatic reject.
            </Text>
            {decision ? (
              <InlineAlert tone="success" title={decision === 'progressed' ? 'Moved to Panel' : 'Marked not selected'}>
                {decision === 'not-selected' ? 'The candidate gets the not-selected notice you picked.' : 'The recruiter schedules the panel round.'}
              </InlineAlert>
            ) : (
              <>
                <FormField label="Reason if not progressing" helper="From the decline-reason list">
                  <Select value={reason} onChange={setReason} clearable options={['Skills below the bar', 'Communication', 'Role / growth mismatch', 'Other'].map((v) => ({ value: v, label: v }))} />
                </FormField>
                <Button variant="primary" onClick={() => setDecision('progressed')}>
                  Move to panel
                </Button>
                <Button disabled={!reason} onClick={() => setDecision('not-selected')}>
                  Mark not selected
                </Button>
                {flags.length > 0 && <Button>Request re-verification</Button>}
              </>
            )}
          </div>
        }
      >
        <IdentityStrip points={identity} onReverify={() => {}} onReview={() => {}} />
        <div className="yx-hire-player">
          <RecordingPlaceholder label={`Answer ${sel + 1} recording`} state={`Answer ${sel + 1} · 2:14 · stored in-region (India)`} />
          <div className="yx-hire-stack">
            <Text weight="semibold">
              Q{sel + 1}. {answers[sel].q}
            </Text>
            <div className="yx-hire-chips">
              <Badge tone="ai">Rubric score {answers[sel].score} / 100</Badge>
              <AiBadge />
            </div>
            <Text size="sm" tone="secondary">
              Evidence
            </Text>
            <blockquote className="yx-hire-quote">&ldquo;{answers[sel].evidence}&rdquo;</blockquote>
            <Text size="sm" tone="secondary">
              Transcript (only this text was sent for AI scoring)
            </Text>
            <Text as="p" size="sm">
              {answers[sel].transcript}
            </Text>
          </div>
        </div>
        <ol className="yx-hire-qlist" aria-label="Questions">
          {answers.map((a, i) => (
            <li key={a.q}>
              <button type="button" className="yx-hire-qlist__btn" aria-current={i === sel || undefined} onClick={() => setSel(i)}>
                <span>
                  Q{i + 1}. {a.q}
                </span>
                <Badge tone="ai">{a.score}</Badge>
              </button>
            </li>
          ))}
        </ol>
        <Card title="Integrity signals">
          {integrity.length === 0 ? (
            <Text size="sm">No integrity signals.</Text>
          ) : (
            <ul className="yx-hire-plainlist">
              {integrity.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </Card>
      </RecordLayout>
    </HireFrame>
  );
}

/* ================================================================== HIR-27 · Bulk interview-day scheduler */

export interface BulkDayProps {
  drive: string;
  date: Date;
  candidates: string[];
  panels: { id: string; name: string; members: string; room: string }[];
  slots: number[];
  invitesSent?: boolean;
  autoAssigned?: boolean;
}

// HIR-27
export function BulkInterviewDayScreen({ drive, date, candidates, panels, slots, invitesSent = false, autoAssigned = true }: BulkDayProps) {
  const [assigned, setAssigned] = useState(autoAssigned);
  const [sent, setSent] = useState(invitesSent);
  const plan = assignInterviewDay(candidates, panels, slots);
  const at = (panel: string, slot: number) => plan.assigned.find((a) => a.panel === panel && a.start === slot);
  return (
    <HireFrame active="Interviews">
      <PageHeader
        title={`Interview day · ${drive}`}
        description={`${formatDate(date)} · ${panels.length} panels × ${slots.length} slots = ${panels.length * slots.length} interviews`}
        status={<Badge tone={sent ? 'success' : 'neutral'}>{sent ? 'Invites sent' : 'Draft'}</Badge>}
        actions={
          <>
            <Button icon={Shuffle} onClick={() => setAssigned(true)} disabled={sent}>
              Auto-assign
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="primary" icon={Send} disabled={!assigned || sent}>
                  Send {plan.assigned.length} invites
                </Button>
              }
              title={`Send ${plan.assigned.length} interview invites?`}
              consequence={`Candidates get their slot, room and panel by email and WhatsApp (where they opted in). Panel members get calendar invites. ${plan.unassigned.length ? `${plan.unassigned.length} candidates without a slot get nothing yet.` : ''}`}
              confirmLabel={`Send ${plan.assigned.length} invites`}
              onConfirm={() => setSent(true)}
            />
          </>
        }
      />
      {plan.unassigned.length > 0 && (
        <InlineAlert tone="warning" title={`${plan.unassigned.length} candidates don't fit this day`}>
          Add a panel or a slot, or move them to the next interview day: {plan.unassigned.join(', ')}.
        </InlineAlert>
      )}
      {!assigned ? (
        <EmptyState title="No one is assigned yet." description={`${candidates.length} shortlisted candidates are waiting. Auto-assign fills slots panel by panel; you can swap afterwards.`} action={<Button variant="primary" icon={Shuffle} onClick={() => setAssigned(true)}>Auto-assign</Button>} />
      ) : (
        <div className="yx-hire-slots__scroll" tabIndex={0} role="region" aria-label="Interview day assignments, scroll sideways">
          <table className="yx-hire-daygrid">
            <caption className="yx-visually-hidden">Assignments by panel and slot</caption>
            <thead>
              <tr>
                <th scope="col">Slot</th>
                {panels.map((p) => (
                  <th scope="col" key={p.id}>
                    {p.name}
                    <Text size="xs" tone="secondary" as="div">
                      {p.room} · {p.members}
                    </Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s}>
                  <th scope="row">{minutesToLabel(s)}</th>
                  {panels.map((p) => {
                    const a = at(p.id, s);
                    return <td key={p.id}>{a ? <PersonLabel name={a.candidate} size={20} /> : <Text size="sm" tone="muted">Free</Text>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Checkbox label="Send WhatsApp reminders 2 hours before each slot (only to candidates who opted in)" defaultChecked />
    </HireFrame>
  );
}

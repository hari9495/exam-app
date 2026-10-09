// Hiring › Pipeline, candidate record, identity strip, interviews, scorecards, notetaker, AI review, bulk interview day.
// HIR-04, HIR-05, HIR-22, HIR-06, HIR-07, HIR-25, HIR-08, HIR-27 (M10 §7, YX-ATS-03 / 04 / 05 / 19 / 24 / 32 / 33 / 35 / 37 / 40).
import { useMemo, useState, type ReactNode } from 'react';
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

// HIR-04
export function PipelineBoardScreen({ job, candidates, stages, persona, state = 'ready', defaultMoveMenuFor, defaultReasonFor }: PipelineBoardProps) {
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
    <HireFrame active="Pipeline">
      <PageHeader
        title="Pipeline"
        description={`${job} · ${candidates.length} candidates. AI scores are advisory; people decide every move.`}
        facts={<Select aria-label="Job" value="j1" onChange={() => {}} options={[{ value: 'j1', label: 'Senior QA Engineer · JOB-0311' }, { value: 'j3', label: 'Accountant · JOB-0305' }]} />}
        actions={
          persona === 'recruiter' ? (
            <>
              <Button>Bulk actions</Button>
              <Button variant="primary">Add candidate</Button>
            </>
          ) : (
            <Button>Share feedback</Button>
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
        <ErrorState title="Couldn't load the pipeline" description="Check your connection and try again. No candidate was moved." onRetry={() => {}} reference="PIPE-3302" />
      ) : candidates.length === 0 ? (
        <EmptyState title="No candidates in this pipeline yet." description="Publish the job, share it with referrals, or add past candidates from rediscovery." action={persona === 'recruiter' ? <Button variant="primary">Add candidate</Button> : undefined} />
      ) : (
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
          />
          <span className="yx-visually-hidden" aria-live="polite">
            {announce}
          </span>
        </>
      )}
    </HireFrame>
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

// HIR-05
export function CandidateRecordScreen({ candidate: c, viewer, exEmployee, minor, identity, applications, activity, duplicate = null, mergeOpen = false, access = 'ok', now }: CandidateRecordProps) {
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

const MERGE_FIELDS: { key: keyof Candidate; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Mobile' },
  { key: 'current', label: 'Current role' },
  { key: 'location', label: 'Location' },
];

export function MergeDrawer({ open, onOpenChange, a, b }: { open: boolean; onOpenChange: (o: boolean) => void; a: Candidate; b: Candidate }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const differing = MERGE_FIELDS.filter((f) => a[f.key] !== b[f.key]);
  const allChosen = differing.every((f) => choice[f.key]);
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
          <ConfirmDialog
            trigger={
              <Button variant="primary" disabled={!allChosen}>
                Merge records
              </Button>
            }
            title={`Merge ${b.name} into ${a.name}?`}
            consequence="Applications, scores, documents and consents from both records are kept on one candidate. The merge is recorded in the audit log."
            confirmLabel="Merge records"
            onConfirm={() => onOpenChange(false)}
          />
        </>
      }
    >
      <div className="yx-hire-stack">
        {!allChosen && <Text size="sm" tone="secondary">{differing.length - Object.keys(choice).length} fields left to choose.</Text>}
        {differing.map((f) => (
          <FormField key={f.key} label={f.label} required>
            <RadioGroup
              aria-label={f.label}
              value={choice[f.key]}
              onChange={(v) => setChoice((c) => ({ ...c, [f.key]: v }))}
              options={[
                { value: 'a', label: String(a[f.key]), description: `From ${a.name}` },
                { value: 'b', label: String(b[f.key]), description: `From ${b.name}` },
              ]}
            />
          </FormField>
        ))}
      </div>
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

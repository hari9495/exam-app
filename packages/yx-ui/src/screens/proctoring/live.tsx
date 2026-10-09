// Proctoring settings, live console, proctor planner, company audit view, manual ID review (T04, T08). PRC-12 … PRC-15.
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Lock, MessageSquare, Pause, Play, Send, ShieldAlert, XOctagon } from 'lucide-react';
import { Button, ButtonGroup } from '../../components/button';
import { Badge, AiBadge } from '../../components/display';
import { DataTable } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { RadioGroup, Switch } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { Kbd } from '../../components/foundations';
import { formatClock } from '../../components/exam';
import { PrcFrame, type ViewState } from './proctoring-shared';
import { CameraFrame, FlagTimeline, IdCapture, IntegrityScoreCard, ProctorTile, ScreenThumb } from './proctoring-kit';
import { filterByRisk, integrityLevel, liveCapacity, proctorActionError, sortByConcern, type IntegrityLevel, type LiveTileData } from './proctoring-logic';
import { EVENTS_SNEHA, SIGNALS_SNEHA, WEEK_DAYS, d } from './proctoring-data';

/* ================================================================== */
/* PRC-12 · Proctoring settings                                        */
/* ================================================================== */

type Mode = 'open' | 'ai' | 'record' | 'live';
type Action = 'off' | 'flag' | 'warn' | 'pause' | 'terminate';
const MODES: { id: Mode; name: string; summary: string; records: string }[] = [
  { id: 'open', name: 'Open', summary: 'No proctoring. For practice and training.', records: 'Nothing' },
  { id: 'ai', name: 'AI-only', summary: 'Automatic checks raise flags; a reviewer looks after the test.', records: 'Camera stills and 10-second clips around each flag' },
  { id: 'record', name: 'Record & review', summary: 'Records camera + screen + audio; a reviewer checks the flagged moments.', records: 'Camera (360p), screen (low frame rate), audio' },
  { id: 'live', name: 'Live', summary: 'A proctor watches up to 12 candidates at once and can chat, warn or pause.', records: 'Camera, screen, audio, companion phone if paired' },
];
interface MatrixRow {
  id: string;
  label: string;
  ai?: boolean;
  /** Lowest action allowed in Live (mode minimum). */
  liveMin?: Action;
  defaults: Record<Mode, Action>;
}
const MATRIX: MatrixRow[] = [
  { id: 'identity', label: 'Identity check fails', liveMin: 'pause', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'pause' } },
  { id: 'face', label: 'Face not in view', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'warn' } },
  { id: 'faces', label: 'More than one face', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'warn' } },
  { id: 'tab', label: 'Tab or window switch', defaults: { open: 'off', ai: 'flag', record: 'warn', live: 'warn' } },
  { id: 'phone', label: 'Phone in view', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
  { id: 'notes', label: 'Notes or books in view', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
  { id: 'earbuds', label: 'Earbuds or headphones', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
  { id: 'gaze', label: 'Looking away from the screen', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
  { id: 'noise', label: 'Second voice or noise', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
  { id: 'process', label: 'Blocked app running (Secure Client)', defaults: { open: 'off', ai: 'flag', record: 'warn', live: 'pause' } },
  { id: 'vm', label: 'Virtual machine or virtual camera', defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'pause' } },
  { id: 'llm', label: 'Answer reads like AI-generated text', ai: true, defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
  { id: 'time', label: 'Unusually fast correct answer', ai: true, defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
  { id: 'overlay', label: 'Overlay assistant window', ai: true, defaults: { open: 'off', ai: 'flag', record: 'flag', live: 'flag' } },
];
const ACTIONS: Action[] = ['off', 'flag', 'warn', 'pause', 'terminate'];
const ACTION_LABEL: Record<Action, string> = { off: 'Off', flag: 'Flag', warn: 'Warn', pause: 'Pause', terminate: 'Terminate' };

export function ProctoringSettingsScreen({ defaultMode = 'record', showMatrix = true, noFace = false, aiAllowed = false }: { defaultMode?: Mode; showMatrix?: boolean; noFace?: boolean; aiAllowed?: boolean }) {
  // PRC-12
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [matrix, setMatrix] = useState<Record<string, Action>>({});
  const [noFaceOn, setNoFace] = useState(noFace);
  const [aiOn, setAiOn] = useState(aiAllowed);
  const [tier, setTier] = useState('client');
  const m = MODES.find((x) => x.id === mode)!;
  const actionFor = (r: MatrixRow) => matrix[`${mode}.${r.id}`] ?? r.defaults[mode];
  return (
    <PrcFrame page="Proctoring settings">
      <PageHeader title="Proctoring" description="Java Backend Developer · L2, draft v4. Every published test has exactly one mode." actions={<Button variant="primary">Save settings</Button>} />
      <div className="yx-prc-grid4" role="radiogroup" aria-label="Proctoring mode">
        {MODES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={mode === x.id} className="yx-anl-choice" onClick={() => setMode(x.id)}>
            <strong>{x.name}</strong>
            <span>{x.summary}</span>
          </button>
        ))}
      </div>
      <Card title="In plain words">
        <p className="yx-prc-p">
          <strong>{m.name}:</strong> {m.summary} Records: {m.records}.{noFaceOn && ' Identity by ID check and proctor; no continuous face analysis.'} Nothing fails a candidate automatically: every signal is a flag a person reviews.
        </p>
      </Card>
      <div className="yx-prc-grid2">
        <Card title="Identity and room">
          <div className="yx-prc-stack">
            <Switch label="ID document check with face match" description={mode === 'live' ? 'Required in Live mode' : 'Optional in this mode'} defaultChecked disabled={mode === 'live'} checked={mode === 'live' ? true : undefined} />
            <Switch label="360° room scan at start" defaultChecked={mode === 'live'} />
            <Switch label="Companion phone camera" description="Paired by a one-time QR code" defaultChecked={mode === 'live'} />
            <Switch label="No face detection" description="For accommodations or places that restrict biometrics. Turns off face re-checks, gaze and face-area object signals." checked={noFaceOn} onChange={setNoFace} />
            <Switch label="Keystroke dynamics" description="Off by default. Needs the candidate's separate consent; never for under-18s." />
          </div>
        </Card>
        <Card title="Secure Client and AI help">
          <div className="yx-prc-stack">
            <FormField label="Lock-down tier">
              <RadioGroup value={tier} onChange={setTier} aria-label="Lock-down tier" options={[{ value: 'client', label: 'YukthiX Secure Client required', description: 'Windows, macOS, Linux, ChromeOS. Minimum version 3.2.' }, { value: 'ext', label: 'Browser extension allowed' }, { value: 'seb', label: 'Safe Exam Browser allowed' }, { value: 'none', label: 'Not used' }]} />
            </FormField>
            <FormField label="Blocked-app exceptions" helper="Approved assistive tech always wins over the blocked list">
              <TextField value="NVDA screen reader, Windows Magnifier" readOnly />
            </FormField>
            <Switch label="AI-allowed test" description="Candidates may use the approved assistant inside the runner; every prompt is logged. AI-assistance flags are turned off for this test." checked={aiOn} onChange={setAiOn} />
          </div>
        </Card>
      </div>
      {showMatrix && (
        <Card title="Advanced: what happens on each detection">
          <div className="yx-prc-stack">
            <p className="yx-prc-muted yx-prc-small">Terminate always keeps the attempt and evidence for review and appeal. AI-assistance signals can only flag.</p>
            <div className="yx-prc-scroll">
              <table className="yx-prc-table">
                <thead>
                  <tr>
                    <th scope="col">Detection</th>
                    <th scope="col">Action</th>
                    <th scope="col">Strikes before action</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((r) => {
                    const locked = (r.ai && !aiOn) || (mode === 'live' && r.liveMin);
                    const aiOff = r.ai && aiOn;
                    const v = aiOff ? 'off' : actionFor(r);
                    return (
                      <tr key={r.id}>
                        <th scope="row">
                          <span className="yx-prc-row">
                            {r.label} {r.ai && <AiBadge />}
                          </span>
                        </th>
                        <td className="yx-prc-cell">
                          <select
                            aria-label={`Action for ${r.label}`}
                            value={v}
                            disabled={mode === 'open' || aiOff}
                            onChange={(e) => setMatrix({ ...matrix, [`${mode}.${r.id}`]: e.target.value as Action })}
                          >
                            {ACTIONS.map((a) => (
                              <option key={a} value={a} disabled={(r.ai && a !== 'flag' && a !== 'off') || (mode === 'live' && r.liveMin && ACTIONS.indexOf(a) < ACTIONS.indexOf(r.liveMin))}>
                                {ACTION_LABEL[a]}
                              </option>
                            ))}
                          </select>
                          {locked && !aiOff && (
                            <span className="yx-prc-small yx-prc-muted">
                              {' '}
                              <Lock size={12} aria-hidden="true" /> {r.ai ? 'Flag only' : 'Live minimum'}
                            </span>
                          )}
                          {aiOff && <span className="yx-prc-small yx-prc-muted"> Off: AI help is allowed</span>}
                        </td>
                        <td className="yx-prc-cell">{v === 'warn' || v === 'pause' || v === 'terminate' ? '3' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-13 · Live console                                               */
/* ================================================================== */

interface ChatMsg {
  from: 'proctor' | 'candidate' | 'system';
  text: string;
  at: string;
}

export interface LiveConsoleProps {
  tiles: LiveTileData[];
  defaultOpenId?: string | null;
  defaultRisk?: 'all' | IntegrityLevel;
  confirm?: 'terminate' | 'pause' | null;
  missedStart?: boolean;
  state?: ViewState;
}

export function LiveConsoleScreen({ tiles: initial, defaultOpenId = null, defaultRisk = 'all', confirm = null, missedStart = false, state = 'ready' }: LiveConsoleProps) {
  // PRC-13
  const [tiles, setTiles] = useState(initial);
  const [risk, setRisk] = useState(defaultRisk);
  const [openId, setOpenId] = useState(defaultOpenId);
  const [dialog, setDialog] = useState<null | 'terminate' | 'pause'>(confirm);
  const [reason, setReason] = useState(confirm === 'terminate' ? 'Second person seen three times after two warnings.' : '');
  const [touched, setTouched] = useState(false);
  const [at, setAt] = useState(1520);
  const [chat, setChat] = useState<ChatMsg[]>([
    { from: 'system', text: 'Flag: more than one face at 23:15', at: '10:25 am' },
    { from: 'proctor', text: 'Please make sure you are alone in the room.', at: '10:26 am' },
    { from: 'candidate', text: 'Sorry, my brother came in. He has left.', at: '10:26 am' },
  ]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState('');
  const shown = useMemo(() => sortByConcern(filterByRisk(tiles, risk)), [tiles, risk]);
  const open = tiles.find((t) => t.id === openId);
  const cap = liveCapacity(tiles.filter((t) => t.status !== 'submitted').length);
  const counts = { all: tiles.length, high: filterByRisk(tiles, 'high').length, review: filterByRisk(tiles, 'review').length, clear: filterByRisk(tiles, 'clear').length };
  const err = touched ? proctorActionError(reason) : null;

  const act = (kind: 'pause' | 'resume' | 'terminate' | 'warn') => {
    if (!open) return;
    if (kind === 'warn') {
      setChat((c) => [...c, { from: 'proctor', text: 'Warning: please keep your face in view and your desk clear.', at: '10:31 am' }]);
      setLive(`Warning sent to ${open.name}`);
      return;
    }
    setTiles((ts) => ts.map((t) => (t.id === open.id ? { ...t, status: kind === 'pause' ? 'paused' : kind === 'resume' ? 'in-progress' : 'terminated' } : t)));
    setLive(kind === 'pause' ? `${open.name} paused. Timer stopped.` : kind === 'resume' ? `${open.name} resumed.` : `${open.name}'s attempt ended. Answers and evidence kept for review.`);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9 && shown[n - 1]) setOpenId(shown[n - 1].id);
    else if (e.key === 'w' && open) act('warn');
    else if (e.key === 'p' && open) setDialog('pause');
  };

  return (
    <PrcFrame page="Live console">
      <div className="yx-prc-stack" onKeyDown={onKey}>
        <PageHeader
          title="Live console"
          description="Quality supervisor certification · 29 Sep, 9:00 am slot · Hosur plant pool"
          facts={
            <span className="yx-prc-row">
              <Badge tone={cap.full ? 'warning' : 'success'}>
                Watching {cap.watching} of {cap.ratio} (1 : {cap.ratio})
              </Badge>
              <span className="yx-prc-small yx-prc-muted">
                Shortcuts: <Kbd>1</Kbd>–<Kbd>9</Kbd> open · <Kbd>W</Kbd> warn · <Kbd>P</Kbd> pause
              </span>
            </span>
          }
          actions={<Button>Hand over shift</Button>}
        />
        <p className="yx-visually-hidden" role="status" aria-live="polite">
          {live}
        </p>
        {missedStart && (
          <InlineAlert tone="warning" title="Proctor missing for the 11:00 am slot">
            4 candidates are in the waiting room. If no proctor joins by 11:10 am, their tests continue in Record & review with the waiting time credited. Nobody loses the attempt.
          </InlineAlert>
        )}
        <ButtonGroup aria-label="Filter by risk">
          {(['all', 'high', 'review', 'clear'] as const).map((r) => (
            <Button key={r} size="sm" aria-pressed={risk === r} onClick={() => setRisk(r)}>
              {r === 'all' ? 'All' : r === 'high' ? 'High concern' : r === 'review' ? 'Review' : 'Clear'} {counts[r]}
            </Button>
          ))}
        </ButtonGroup>
        {state === 'loading' ? (
          <div className="yx-prc-tiles" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="yx-prc-box">
                <CameraFrame state="connecting" size="sm" />
              </div>
            ))}
          </div>
        ) : state === 'empty' || shown.length === 0 ? (
          <EmptyState title={state === 'empty' ? 'No candidates in this slot yet.' : 'No candidates match this filter.'} description={state === 'empty' ? 'Tiles appear as candidates finish their identity checks.' : 'Choose "All" to see everyone.'} />
        ) : (
          <div className="yx-prc-tiles">
            {shown.map((t, i) => (
              <ProctorTile key={t.id} tile={t} index={i} selected={t.id === openId} onOpen={setOpenId} />
            ))}
          </div>
        )}
      </div>
      {open && (
        <Drawer
          open
          size="lg"
          onOpenChange={(o) => !o && setOpenId(null)}
          title={open.name}
          subtitle={`${open.question} · ${formatClock(open.secondsLeft)} left`}
          meta={<Badge tone={integrityLevel(open.score) === 'high' ? 'danger' : integrityLevel(open.score) === 'review' ? 'warning' : 'success'}>Integrity {open.score}</Badge>}
          footer={
            <>
              <Button icon={Send} onClick={() => act('warn')}>
                Warn
              </Button>
              {open.status === 'paused' ? (
                <Button icon={Play} onClick={() => act('resume')}>
                  Resume
                </Button>
              ) : (
                <Button icon={Pause} onClick={() => setDialog('pause')} disabled={open.status === 'terminated'}>
                  Pause
                </Button>
              )}
              <Button variant="danger" icon={XOctagon} onClick={() => setDialog('terminate')} disabled={open.status === 'terminated'}>
                End attempt
              </Button>
            </>
          }
        >
          <div className="yx-prc-stack">
            {open.status === 'terminated' && <InlineAlert tone="info">Attempt ended by you. It is not a fail: answers and evidence go to the integrity review queue, and the candidate can appeal.</InlineAlert>}
            <div className="yx-prc-grid2">
              <CameraFrame state={open.lastFlag?.startsWith('More than one') ? 'multiple' : 'live'} label="Webcam" size="lg" />
              <ScreenThumb note={`Screen · ${open.question}`} />
            </div>
            {open.accommodation && <InlineAlert tone="info">Adjusted profile applies: {open.accommodation}. The reason is not shown to proctors.</InlineAlert>}
            <Tabs defaultValue="events">
              <TabsList aria-label="Candidate detail">
                <TabsTrigger value="events" count={open.flags}>
                  Events
                </TabsTrigger>
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="score">Score</TabsTrigger>
              </TabsList>
              <TabsContent value="events">
                <FlagTimeline duration={2700} events={EVENTS_SNEHA} current={at} onSeek={setAt} label="Events so far" />
              </TabsContent>
              <TabsContent value="chat">
                <div className="yx-prc-stack">
                  <ul className="yx-prc-plain" aria-label="Chat with candidate" aria-live="polite">
                    {chat.map((m, i) => (
                      <li key={i}>
                        <span>
                          <strong>{m.from === 'proctor' ? 'You' : m.from === 'candidate' ? open.name : 'System'}:</strong> {m.text}
                        </span>
                        <span className="yx-prc-muted yx-prc-small">{m.at}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="yx-prc-row">
                    <TextField value={draft} onChange={setDraft} placeholder="Message to the candidate" aria-label="Message to the candidate" />
                    <Button
                      icon={MessageSquare}
                      onClick={() => {
                        if (!draft.trim()) return;
                        setChat((c) => [...c, { from: 'proctor', text: draft, at: '10:32 am' }]);
                        setDraft('');
                      }}
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="score">
                <IntegrityScoreCard signals={SIGNALS_SNEHA} />
              </TabsContent>
            </Tabs>
          </div>
        </Drawer>
      )}
      <ConfirmDialog
        open={dialog != null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === 'terminate' ? `End ${open?.name ?? 'this candidate'}'s attempt?` : `Pause ${open?.name ?? 'this candidate'}?`}
        consequence={dialog === 'terminate' ? 'The candidate can no longer answer. Answers and evidence are kept for review and appeal; this is not a fail.' : 'The timer stops and the candidate sees your message until you resume.'}
        confirmLabel={dialog === 'terminate' ? 'End attempt' : 'Pause test'}
        destructive={dialog === 'terminate'}
        confirmDisabled={!!proctorActionError(reason)}
        onConfirm={() => {
          act(dialog === 'terminate' ? 'terminate' : 'pause');
          setDialog(null);
          setReason('');
        }}
      >
        <FormField label="Reason" required error={err} helper="Saved in the audit log with your name">
          <TextArea value={reason} onChange={setReason} onBlur={() => setTouched(true)} rows={3} />
        </FormField>
      </ConfirmDialog>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-14 · Proctor planner                                            */
/* ================================================================== */

const PLAN_HOURS = [9, 11, 14, 16];
const DEMAND = [
  [36, 0, 22, 0],
  [45, 18, 30, 0],
  [12, 0, 0, 0],
  [48, 0, 40, 12],
  [0, 96, 0, 0],
];
const OWN = [
  [2, 0, 2, 0],
  [3, 0, 2, 0],
  [1, 0, 0, 0],
  [2, 0, 2, 0],
  [0, 0, 0, 0],
];
const POOL = [
  [1, 0, 0, 0],
  [1, 0, 1, 0],
  [0, 0, 0, 0],
  [1, 0, 1, 1],
  [0, 0, 0, 0],
];

export function ProctorPlannerScreen({ optedIn = true }: { optedIn?: boolean }) {
  // PRC-14
  return (
    <PrcFrame page="Proctor planner">
      <PageHeader
        title="Proctor planner"
        description="Shifts against booked Live slots · ratio 1 : 12 · week of 28 Sep"
        actions={
          <>
            <Button>Add shift</Button>
            <Button variant="primary">{optedIn ? 'Request YukthiX proctors' : 'Buy the YukthiX proctor add-on'}</Button>
          </>
        }
      />
      {!optedIn && <InlineAlert tone="info">YukthiX-pool capacity is hidden: your company has not opted in to YukthiX proctors. Only your own staff are planned.</InlineAlert>}
      <InlineAlert tone="warning" title="Missed start on Mon 28 Sep, 2:00 pm">No proctor joined within 10 minutes. 22 attempts continued in Record & review with time credited.</InlineAlert>
      <div className="yx-prc-scroll">
        <table className="yx-prc-table" aria-label="Proctors needed and staffed">
          <thead>
            <tr>
              <th scope="col">Slot</th>
              {WEEK_DAYS.map((w) => (
                <th key={w} scope="col">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_HOURS.map((h, hi) => (
              <tr key={h}>
                <th scope="row">{h > 12 ? `${h - 12}:00 pm` : `${h}:00 am`}</th>
                {WEEK_DAYS.map((_, di) => {
                  const booked = DEMAND[di][hi];
                  const need = Math.ceil(booked / 12);
                  const own = OWN[di][hi];
                  const pool = optedIn ? POOL[di][hi] : 0;
                  const gap = need - own - pool;
                  if (!booked) return <td key={di} className="yx-prc-cell" data-state="none">—</td>;
                  return (
                    <td key={di} className="yx-prc-cell" data-state={gap > 0 ? 'short' : 'good'}>
                      <div className="yx-prc-stack" data-gap="sm">
                        <strong>
                          {booked} booked · need {need}
                        </strong>
                        <span>
                          Own staff {own}
                          {optedIn && ` · YukthiX ${pool}`}
                        </span>
                        <span>{gap > 0 ? `Short by ${gap}` : 'Covered'}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="yx-prc-muted yx-prc-small">Fri 11:00 am (96 booked) is a centre session with invigilators, so no online proctors are needed.</p>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-15 · Company audit view (YukthiX-proctor actions)               */
/* ================================================================== */

interface AuditRow {
  id: string;
  at: Date;
  proctor: string;
  slot: string;
  candidate: string;
  action: string;
  grant: string;
  mfa: boolean;
}
export const AUDIT_ROWS: AuditRow[] = [
  { id: 'a1', at: d(28, 8, 9, 2), proctor: 'YX-P-0142 · Mohan Das', slot: 'Mon 28 Sep, 9:00 am', candidate: 'Arjun Nair', action: 'Opened live view', grant: '8:45 am – 11:15 am', mfa: true },
  { id: 'a2', at: d(28, 8, 9, 26), proctor: 'YX-P-0142 · Mohan Das', slot: 'Mon 28 Sep, 9:00 am', candidate: 'Sneha Iyer', action: 'Sent warning: "Please make sure you are alone"', grant: '8:45 am – 11:15 am', mfa: true },
  { id: 'a3', at: d(28, 8, 9, 40), proctor: 'YX-P-0142 · Mohan Das', slot: 'Mon 28 Sep, 9:00 am', candidate: 'Sneha Iyer', action: 'Viewed evidence clip 23:15', grant: '8:45 am – 11:15 am', mfa: true },
  { id: 'a4', at: d(28, 8, 10, 5), proctor: 'YX-P-0209 · Fathima Beevi', slot: 'Mon 28 Sep, 9:00 am', candidate: 'Meenakshi Sundaram', action: 'Paused test. Reason: "Phone visible on desk"', grant: '8:45 am – 11:15 am', mfa: true },
  { id: 'a5', at: d(28, 8, 11, 16), proctor: 'YX-P-0142 · Mohan Das', slot: 'Mon 28 Sep, 9:00 am', candidate: 'Vikram Hegde', action: 'Access denied: grant window ended', grant: '8:45 am – 11:15 am', mfa: true },
];

export function CompanyAuditScreen({ rows, state = 'ready' }: { rows: AuditRow[]; state?: ViewState }) {
  // PRC-15
  return (
    <PrcFrame page="Company audit view">
      <PageHeader title="YukthiX proctor activity" description="Every view and action by YukthiX-provided proctors in your slots. Each proctor could act only on assigned candidates during the slot window." actions={<Button>Export CSV</Button>} />
      <DataTable
        label="YukthiX proctor actions"
        columns={[
          { key: 'at', header: 'When', value: (r: AuditRow) => r.at, render: (r) => `${r.at.getDate()} Sep, ${r.at.getHours() > 12 ? r.at.getHours() - 12 : r.at.getHours()}:${String(r.at.getMinutes()).padStart(2, '0')} ${r.at.getHours() >= 12 ? 'pm' : 'am'}`, width: 140 },
          { key: 'proctor', header: 'Proctor', value: (r: AuditRow) => r.proctor, width: 220 },
          { key: 'slot', header: 'Slot', value: (r: AuditRow) => r.slot, groupable: true, width: 180 },
          { key: 'candidate', header: 'Candidate', value: (r: AuditRow) => r.candidate, width: 170 },
          { key: 'action', header: 'Action', value: (r: AuditRow) => r.action, width: 320 },
          { key: 'grant', header: 'Grant window', value: (r: AuditRow) => r.grant, width: 160 },
          { key: 'mfa', header: 'MFA', type: 'status', value: (r: AuditRow) => (r.mfa ? 'Verified' : 'Missing'), statusTone: (v) => (v === 'Verified' ? 'success' : 'danger'), width: 100 },
        ]}
        rows={state === 'empty' ? [] : rows}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        defaultGroupBy="slot"
        empty={<EmptyState title="No YukthiX proctor activity." description="This list fills when YukthiX proctors work your Live slots." />}
      />
    </PrcFrame>
  );
}

/* ================================================================== */
/* Manual ID review queue (T04 Q3, YX-EVAL-14)                         */
/* ================================================================== */

const ID_QUEUE = [
  { id: 'IDV-310', name: 'Sanjay Chatterjee', doc: 'PAN card', masked: 'XXXXXX781K', match: 0.41, liveness: 'Passed', reason: 'Low face-match score', waiting: '6 min' },
  { id: 'IDV-311', name: 'Keerthi Varma', doc: 'Driving licence', masked: 'TN-XX-XXXX-4412', match: 0.66, liveness: 'Passed', reason: 'Glare on the ID photo', waiting: '3 min' },
  { id: 'IDV-312', name: 'Revathi Murthy', doc: 'Admit card + institution-attested photo', masked: 'REG-7713', match: null, liveness: 'Passed', reason: 'No government ID: alternate path', waiting: '1 min' },
];

export function IdReviewQueueScreen({ defaultId = 'IDV-310', decided }: { defaultId?: string; decided?: 'approved' | 'rejected' }) {
  const [sel, setSel] = useState(defaultId);
  const [reason, setReason] = useState('');
  const item = ID_QUEUE.find((x) => x.id === sel)!;
  return (
    <PrcFrame page="ID review queue">
      <PageHeader title="ID review" description="Low-confidence identity checks wait here. The candidate sees 'A proctor is checking your ID' and is not refused." />
      <div className="yx-prc-split" data-wide-aside>
        <ul className="yx-prc-plain" aria-label="Waiting for ID review">
          {ID_QUEUE.map((x) => (
            <li key={x.id}>
              <span className="yx-prc-stack" data-gap="sm">
                <strong>{x.name}</strong>
                <span className="yx-prc-small yx-prc-muted">
                  {x.reason} · waiting {x.waiting}
                </span>
              </span>
              <Button variant="review" size="sm" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
                Review
              </Button>
            </li>
          ))}
        </ul>
        <section className="yx-prc-box" aria-label={`ID check for ${item.name}`}>
          <div className="yx-prc-grid2">
            <IdCapture docType={item.doc} masked={item.masked} state="captured" />
            <CameraFrame state="captured" label="Liveness selfie" />
          </div>
          <DescriptionList
            items={[
              { label: 'Face match', value: item.match == null ? 'Not run: alternate identity path' : `${item.match.toFixed(2)} (auto-approve at 0.80)` },
              { label: 'Liveness', value: item.liveness },
              { label: 'Stored', value: 'Document type, masked number and result only. Aadhaar is never stored unmasked.' },
            ]}
          />
          {decided === 'approved' && <InlineAlert tone="success">Approved manually. The candidate has moved to the room scan.</InlineAlert>}
          {decided === 'rejected' && <InlineAlert tone="info">Not verified. The candidate was offered a live video check with a proctor instead; nothing is failed.</InlineAlert>}
          {!decided && (
            <>
              <FormField label="Reason" required>
                <TextArea value={reason} onChange={setReason} rows={2} placeholder="What you checked" />
              </FormField>
              <div className="yx-prc-row">
                <Button disabled={reason.trim().length < 10}>Ask for a live video check</Button>
                <Button variant="primary" disabled={reason.trim().length < 10} icon={ShieldAlert}>
                  Approve identity
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
      <Meter value={3} max={10} label="Queue load" valueText="3 waiting, oldest 6 minutes" />
    </PrcFrame>
  );
}

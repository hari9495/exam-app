// T9 portals for people linked to the workforce: pre-joiners, alumni and nominees, external trainers,
// POSH IC external members and external parties, the audit-committee chair, anonymous reporters and the public verify page.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, FileText, Lock, Send, Upload } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { FormField, FieldRow, useTooEarly } from '../../components/field';
import { PlainTable } from '../../components/plain-table';
import { ToastProvider, useToast } from '../../components/notify';
import { CurrencyField, NumberField, TextArea, TextField, MaskedField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload, type UploadItem } from '../../components/upload';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { Icon } from '../../components/foundations';
import { formatDate, formatINR, formatTime } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import { ID_SPECS } from '../../lib/validators';
import {
  alumniAccessEnds,
  checklistPercent,
  daysUntil,
  formatAccessCode,
  isCompleteAccessCode,
  nomineeShareError,
  verifyDocument,
  type VerifiableDoc,
  type VerifyResult as DocVerifyResult,
} from './portals-logic';
import type { VerifyResult as PayVerifyResult } from '../pay/live/types';
import { BlockNote, ConsentPanel, Fact, FactRow, OtpInput, QrCode, StepDots, TenantPortal } from './portals-kit';
import type { IcCase, Nominee, PortalDoc, PreItem, TrainerSession, WbCase } from './t9-data';
import { useRun } from '../org/org-kit';
import { LEGAL_LINKS } from '../auth/kit';
import { ifscBank } from '../people/people-logic';
import { AcceptDialog } from '../people/live/joining';
import type { Letter, PortalClosed, PortalMe, SectionKey } from '../people/live/types';

const fakeUpload = () => Promise.resolve();
const uploaded = (name: string, status: UploadItem['status'] = 'done', error?: string): UploadItem => ({
  id: name,
  file: new File(['x'], name, { type: 'application/pdf' }),
  status,
  progress: 100,
  error,
});

const PRE_STATUS: Record<PreItem['status'], { tone: BadgeTone; text: string }> = {
  done: { tone: 'success', text: 'Done' },
  'in-review': { tone: 'info', text: 'HR is checking' },
  todo: { tone: 'neutral', text: 'To do' },
  'sent-back': { tone: 'danger', text: 'Sent back' },
  blocked: { tone: 'warning', text: 'Waiting' },
};

/* ================================================================== */
/* T9-01 Pre-boarding portal                                           */
/* ================================================================== */

export interface Joiner {
  name: string;
  email: string;
  role: string;
  department: string;
  manager: string;
  location: string;
  address: string;
  joiningDate: Date;
  reportingTime: string;
  buddy: string;
  batch: string | null;
  /** "Bring on day one" as HR wrote it, one thing a line (none: the card is not shown). */
  bring?: string;
}

export type PreOutcome = 'in-progress' | 'postponed' | 'reneged' | 'withdrawn' | 'cancelled' | 'joined';
export type PreTab = 'checklist' | 'offer' | 'documents';

/**
 * The live joining portal (/yx/join/[org], LIFE-2.01 / 2.02): the joiner's own forms, documents, consent and letters
 * after the emailed code. Dates are YYYY-MM-DD. Every action returns a promise; a refusal's message is shown as is.
 */
export interface LivePreboardingPortal {
  /** Shown until the joining loads (the company's web address name). */
  tenant: string;
  state: 'loading' | 'error' | 'ready';
  /** Null while loading. A closed joining comes back with `closed` only. */
  me: PortalMe | PortalClosed | null;
  /** The email they signed in with. */
  email: string;
  today: string;
  onRetry: () => void;
  onSignOut: () => void;
  onSave: (section: SectionKey, value: unknown) => Promise<unknown>;
  onStepUpCode: () => Promise<unknown>;
  onStepUp: (code: string) => Promise<unknown>;
  onUpload: (typeKey: string, file: File) => Promise<unknown>;
  onBgv: (consent: boolean, noticeVersion: string) => Promise<unknown>;
  onDownload: (letter: Letter, which: 'letter' | 'acceptance') => Promise<unknown>;
  onSignCode: (letter: Letter) => Promise<unknown>;
  onSign: (letter: Letter, input: { code: string; accept: boolean; disclosureAccepted: boolean }) => Promise<unknown>;
  onDecline: (input: { reason: string; note: string }) => Promise<unknown>;
}

export interface PreboardingPortalProps {
  tenant: string;
  accent?: string;
  joiner: Joiner;
  items: PreItem[];
  today: Date;
  outcome?: PreOutcome;
  /** For postponed: the new joining date. */
  newJoiningDate?: Date;
  /** For postponed: the day it was before. */
  movedFrom?: Date;
  tab?: PreTab;
  /** The page before the joining loads, or when it could not load. */
  state?: 'loading' | 'error';
  /** Shows "Sign out" (the live page always has it). */
  onSignOut?: () => void;
  children?: ReactNode;
  live?: undefined;
}
export type PreboardingPortalScreenProps = PreboardingPortalProps | { accent?: string; tab?: PreTab; live: LivePreboardingPortal };

const PRE_NAV = (tab: string) => [
  { label: 'Checklist', active: tab === 'checklist', href: '#checklist' },
  { label: 'Offer and letters', active: tab === 'offer', href: '#offer' },
  { label: 'Documents', active: tab === 'documents', href: '#documents' },
];
const ENDED: PreOutcome[] = ['withdrawn', 'cancelled', 'reneged', 'joined'];
const preDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/** The frame of every T9-01 page: the company, the tabs, who is signed in and until when. */
function PreFrame(p: { tenant: string; accent?: string; email: string; today: Date; endsOn: Date; ended: boolean; tab: PreTab; pinned?: ReactNode; onSignOut?: () => void; children: ReactNode }) {
  return (
    <TenantPortal
      tenant={p.tenant}
      portal="Your joining checklist"
      accent={p.accent}
      nav={p.ended ? [] : PRE_NAV(p.tab)}
      access={{ kind: 'otp', identity: p.email, endsOn: p.ended ? p.today : p.endsOn, today: p.ended ? new Date(p.today.getTime() + 86_400_000) : p.today, endsBecause: 'your joining date' }}
      footer={{ privacy: 'Privacy notice for pre-joiners (G-09)', ...(p.onSignOut ? { hrefs: LEGAL_LINKS } : {}) }}
      noLanguage={Boolean(p.onSignOut)}
      onSignOut={p.onSignOut}
      pinned={p.pinned}
    >
      {p.children}
    </TenantPortal>
  );
}

/** What a closed joining shows instead of the checklist, and the "date moved" note. */
function OutcomeNote({ tenant, outcome, on, newDate, from }: { tenant: string; outcome: PreOutcome; on: Date; newDate?: Date; from?: Date }) {
  if (outcome === 'postponed' && newDate)
    return (
      <InlineAlert tone="info" title={`Your joining date moved to ${formatDate(newDate)}`}>
        {from ? `It was ${formatDate(from)}. ` : ''}Open items now fall due before the new date. What you have already finished stays done.
      </InlineAlert>
    );
  if (outcome === 'withdrawn')
    return (
      <InlineAlert tone="warning" title="This offer has been withdrawn">
        {tenant} withdrew the offer on {formatDate(on)}. HR sends you a letter that explains why. This page is now closed. Your details are kept as a cancelled record, not deleted, as the law
        requires. Contact the HR team if you have questions.
      </InlineAlert>
    );
  if (outcome === 'reneged')
    return (
      <InlineAlert tone="info" title="You declined this offer">
        We recorded your reason and let the hiring team know. This page is now closed. Thank you for letting us know.
      </InlineAlert>
    );
  if (outcome === 'cancelled')
    return (
      <InlineAlert tone="warning" title="Your pre-joining access has ended">
        Your joining was cancelled, so this page is closed. Contact the HR team if you think this is a mistake.
      </InlineAlert>
    );
  if (outcome === 'joined')
    return (
      <InlineAlert tone="success" title={`Welcome to ${tenant}`}>
        You have joined, so this page is closed. Everything you filled in is already in your employee profile. Sign in to the employee app with your work email.
      </InlineAlert>
    );
  return null;
}

/** Loading and "could not load" (live; the stories show both). */
function PreState({ state, onRetry }: { state: 'loading' | 'error'; onRetry?: () => void }) {
  if (state === 'loading')
    return (
      <div className="yx-ps-stack" aria-busy="true" aria-label="Loading your joining checklist">
        <Skeleton height={56} />
        <Skeleton height={96} />
        <Skeleton height={220} />
      </div>
    );
  return (
    <InlineAlert tone="danger" title="Your joining checklist did not load">
      <div className="yx-ps-stack">
        <span>Check your internet connection, then try again. What you saved before is safe.</span>
        <div className="yx-ps-row">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </div>
    </InlineAlert>
  );
}

interface FirstDay {
  date: Date;
  reportingTime: string;
  location: string;
  address: string | null;
  manager: string | null;
  buddy: string | null;
  batch: string | null;
}

/** Forms stay changeable after they are done (and consent can be withdrawn) until the joining day. */
const CHANGEABLE: PreItem['section'][] = ['Forms', 'Bank and tax'];

/** The checklist home: welcome, progress, the items by section, the first day and "Changed your mind?". */
function PreHome({ firstName, intro, items, day, bring: bringText, onOpen, decline }: { firstName: string; intro: string; items: PreItem[]; day: FirstDay; bring?: string; onOpen?: (id: string) => void; decline: ReactNode }) {
  const bring = (bringText ?? '').split('\n').map((b) => b.trim()).filter(Boolean);
  const counted = items.filter((i) => !i.later);
  const pct = checklistPercent(counted);
  const sections = Array.from(new Set(items.map((i) => i.section)));
  return (
    <>
      <section className="yx-ps-hero">
        <h1>Welcome, {firstName}</h1>
        <p>
          {intro} <strong>{formatDate(day.date)}</strong>. Finish the items below before then so your first day is about meeting your team, not paperwork.
        </p>
      </section>
      <div className="yx-split">
        <div className="yx-split__main">
          <Card title="Your progress">
            <Meter label="Checklist complete" value={pct} max={100} warnAt={101} dangerAt={101} valueText={`${pct}% · ${counted.filter((i) => i.status === 'done' || i.status === 'in-review').length} of ${counted.length}`} />
          </Card>
          {items.some((i) => i.status === 'sent-back') && (
            <InlineAlert tone="danger" title="HR sent back an item">
              {items
                .filter((i) => i.status === 'sent-back')
                .map((i) => `${i.title}: ${i.note ?? 'Send it again.'}`)
                .join(' ')}
            </InlineAlert>
          )}
          {sections.map((s) => (
            <Card key={s} title={s}>
              <ul className="yx-ps-list">
                {items
                  .filter((i) => i.section === s)
                  .map((i) => (
                    <li key={i.id}>
                      <div className="yx-ps-list__main">
                        <span className="yx-ps-list__title">{i.title}</span>
                        {(i.hint || i.note || i.due) && (
                          <span className="yx-ps-list__meta">{[i.hint, i.note, i.due && i.status !== 'done' ? `Due ${formatDate(i.due)}` : null].filter(Boolean).join(' · ')}</span>
                        )}
                      </div>
                      <Badge tone={PRE_STATUS[i.status].tone}>{i.hrOwned && i.status === 'todo' ? 'HR completes this' : PRE_STATUS[i.status].text}</Badge>
                      {!i.hrOwned && !i.later && i.status !== 'in-review' && (i.status !== 'done' || CHANGEABLE.includes(i.section)) && (
                        <Button size="sm" onClick={onOpen ? () => onOpen(i.id) : undefined}>
                          {i.status === 'sent-back' ? 'Fix' : i.status === 'done' ? 'Change' : 'Open'}
                        </Button>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
        <div className="yx-split__aside">
          <Card title="Your first day">
            <DescriptionList
              items={[
                { label: 'Date', value: formatDate(day.date) },
                { label: 'Report at', value: `${formatTime(day.reportingTime)} · ${day.location}` },
                ...(day.address ? [{ label: 'Address', value: day.address }] : []),
                ...(day.manager ? [{ label: 'Your manager', value: day.manager }] : []),
                ...(day.buddy ? [{ label: 'Your buddy', value: day.buddy }] : []),
                ...(day.batch ? [{ label: 'Joining batch', value: day.batch }] : []),
              ]}
            />
          </Card>
          {bring.length > 0 && (
            <Card title="Bring on day one">
              <ul className="yx-ps-list">
                {bring.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </Card>
          )}
          {decline}
        </div>
      </div>
    </>
  );
}

const nextItem = (items: PreItem[]) => items.find((i) => (i.status === 'todo' || i.status === 'sent-back') && !i.hrOwned && !i.later);
const pinnedFor = (next: PreItem | undefined, onOpen?: (id: string) => void) =>
  next ? (
    <Button variant="primary" onClick={onOpen ? () => onOpen(next.id) : undefined}>
      {next.status === 'sent-back' ? `Fix ${next.title.toLowerCase()}` : `Continue: ${next.title}`}
    </Button>
  ) : undefined;

// T9-01
/** Pre-boarding home: welcome, completion %, the checklist by section (M01 §3.5) and the outcome banner. */
export function PreboardingPortalScreen(props: PreboardingPortalScreenProps) {
  if (props.live)
    return (
      <ToastProvider>
        <LivePreboarding live={props.live} accent={props.accent} tab={props.tab} />
      </ToastProvider>
    );
  const { tenant, accent, joiner, items, today, outcome = 'in-progress', newJoiningDate, movedFrom, tab = 'checklist', state, onSignOut, children } = props;
  const endsOn = outcome === 'postponed' && newJoiningDate ? newJoiningDate : joiner.joiningDate;
  const ended = ENDED.includes(outcome);
  return (
    <PreFrame tenant={tenant} accent={accent} email={joiner.email} today={today} endsOn={endsOn} ended={ended} tab={tab} onSignOut={onSignOut} pinned={!ended && !state && tab === 'checklist' ? pinnedFor(nextItem(items)) : undefined}>
      {state ? (
        <PreState state={state} />
      ) : (
        <>
          <OutcomeNote tenant={tenant} outcome={outcome} on={today} newDate={newJoiningDate} from={movedFrom} />
          {children}
          {!ended && !children && (
            <PreHome
              firstName={joiner.name.split(' ')[0]}
              intro={`You join as ${joiner.role} in ${joiner.department} on`}
              items={items}
              day={{ date: endsOn, reportingTime: joiner.reportingTime, location: joiner.location, address: joiner.address, manager: joiner.manager, buddy: joiner.buddy, batch: joiner.batch }}
              bring={joiner.bring}
              decline={<DeclineOffer company={tenant} />}
            />
          )}
        </>
      )}
    </PreFrame>
  );
}

/** The live checklist: what the joiner still has to do, from their own joining. */
export function preItemsOf(me: PortalMe): PreItem[] {
  const st = (k: SectionKey): PreItem['status'] => (me.sections[k] === 'done' ? 'done' : 'todo');
  const doc: Record<string, PreItem['status']> = { verified: 'done', uploaded: 'in-review', rejected: 'sent-back' };
  const fresh = 'Needs a fresh code from your email';
  return [
    { id: 'personal', section: 'Forms', title: 'Personal details', status: st('personal') },
    { id: 'identity', section: 'Forms', title: 'PAN and ID', hint: fresh, status: st('identity') },
    { id: 'emergency', section: 'Forms', title: 'Emergency contact', status: st('emergency') },
    { id: 'nominees', section: 'Forms', title: 'Family and nominees', hint: 'PF, gratuity and group insurance nominations with shares', status: st('nominees') },
    ...(me.bgv ? [{ id: 'bgv', section: 'Forms' as const, title: 'Background check consent', status: me.bgv.consented ? ('done' as const) : ('todo' as const) }] : []),
    ...me.documents.map((d) => ({
      id: `doc:${d.typeKey}`,
      section: 'Documents' as const,
      title: d.name,
      status: doc[d.status] ?? ('todo' as const),
      note: d.status === 'rejected' ? (d.rejectReason ?? undefined) : undefined,
      due: d.dueOn ? preDate(d.dueOn) : undefined,
      hrOwned: !d.personUploads,
    })),
    ...me.letters
      .filter((l) => l.status === 'issued' && (l.signature?.status === 'open' || l.signature?.status === 'signed'))
      .map((l) => ({ id: `letter:${l.id}`, section: 'E-sign' as const, title: `Accept your ${(l.title.split(': ')[0] ?? l.title).toLowerCase()}`, status: l.signature?.status === 'signed' ? ('done' as const) : ('todo' as const) })),
    { id: 'bank', section: 'Bank and tax', title: 'Bank account for salary', hint: fresh, status: st('bank') },
    { id: 'tax', section: 'Bank and tax', title: 'Choose your tax regime', hint: 'And income from an earlier employer this year (Form 12B)', status: st('tax') },
    ...me.tasks.map((t) => ({ id: `task:${t.id}`, section: 'After you join' as const, title: t.title, hint: 'In the employee app after you join', status: t.status === 'done' ? ('done' as const) : ('todo' as const), due: preDate(t.dueOn), later: true })),
  ];
}

/** Tabs follow the address (#offer, #documents), so the frame's links switch them and Back works. */
function useHashTab(initial: PreTab): PreTab {
  const [tab, setTab] = useState<PreTab>(initial);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      setTab(h === 'offer' || h === 'documents' || h === 'checklist' ? h : initial);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [initial]);
  return tab;
}
const goTab = (t: PreTab) => {
  window.location.hash = t;
};

function LivePreboarding({ live, accent, tab: initialTab = 'checklist' }: { live: LivePreboardingPortal; accent?: string; tab?: PreTab }) {
  const { toast } = useToast();
  const tab = useHashTab(initialTab);
  const [step, setStep] = useState<string | null>(null);
  useEffect(() => setStep(null), [tab]);
  const today = preDate(live.today);
  const me = live.me;
  if (!me || live.state !== 'ready' || me.closed) {
    const closed = me?.closed;
    return (
      <PreFrame tenant={me?.company ?? live.tenant} accent={accent} email={live.email} today={today} endsOn={today} ended={Boolean(closed)} tab={tab} onSignOut={live.onSignOut}>
        {closed ? (
          <>
            <OutcomeNote tenant={me!.company} outcome={closed.outcome} on={closed.on ? preDate(closed.on) : today} />
            {/* Founder 2 Nov 2026: the letters stay downloadable, read-only. */}
            {me!.letters.length > 0 && <OfferLettersPanel state="signed" joiner={PRE_NOBODY} ctc={0} letters={me!.letters} readOnly onDownload={live.onDownload} />}
          </>
        ) : (
          <PreState state={live.state === 'error' ? 'error' : 'loading'} onRetry={live.onRetry} />
        )}
      </PreFrame>
    );
  }
  const items = preItemsOf(me);
  const joiningOn = preDate(me.joiningOn);
  const a = me.answers;
  const done = (title: string) => {
    toast({ title, tone: 'success' });
    setStep(null);
  };
  const open = (id: string) => {
    if (id.startsWith('doc:')) return goTab('documents');
    if (id.startsWith('letter:')) return goTab('offer');
    setStep(id);
  };
  const stepUp = { onSendCode: live.onStepUpCode, onVerify: live.onStepUp };
  const saver = (k: SectionKey, title: string) => async (v: unknown) => {
    await live.onSave(k, v);
    done(title);
  };
  const stepView =
    step === 'personal' ? (
      <PersonalDetailsStep defaultValue={a.personal} onSave={saver('personal', 'Personal details saved')} />
    ) : step === 'identity' ? (
      <IdentityStep stage={me.steppedUp ? 'form' : 'step-up'} defaultName={a.identity?.legalName ?? me.name} onFile={a.identity ? { pan: a.identity.pan, aadhaar: a.identity.aadhaar } : undefined} {...stepUp} onSave={saver('identity', 'PAN and ID saved. HR checks them on your first day.')} />
    ) : step === 'bank' ? (
      <BankDetailsStep stage={me.steppedUp ? 'form' : 'step-up'} holderName={a.bank?.holderName ?? me.name} onFile={a.bank?.account} {...stepUp} onSave={saver('bank', 'Bank account saved. HR checks it before your first salary.')} />
    ) : step === 'emergency' ? (
      <EmergencyContactStep defaultValue={a.emergency} onSave={saver('emergency', 'Emergency contact saved')} />
    ) : step === 'nominees' ? (
      <NomineeForm
        defaultNominees={(a.nominees ?? []).map((n, i) => ({ id: `n${i}`, name: n.name, relation: n.relation, dob: n.dateOfBirth ? preDate(n.dateOfBirth) : null, pf: n.pf, gratuity: n.gratuity, insurance: n.insurance }))}
        onSave={(rows) => saver('nominees', 'Nominees saved')({ nominees: rows.map((r) => ({ name: r.name, relation: r.relation, ...(r.dob ? { dateOfBirth: dayKey(r.dob) } : {}), pf: r.pf, gratuity: r.gratuity, insurance: r.insurance })) })}
      />
    ) : step === 'tax' ? (
      <TaxRegimeStep defaultRegime={a.tax?.regime ?? null} defaultPrevious={a.tax?.previousIncome ?? null} fy={fyOf(joiningOn)} onSave={saver('tax', 'Tax choice saved')} />
    ) : step === 'bgv' && me.bgv ? (
      <BgvConsentStep
        items={me.bgv.items}
        notice={me.bgv.notice}
        company={me.company}
        consentedOn={me.bgv.consentedAt ? preDate(me.bgv.consentedAt) : null}
        onConsent={async () => {
          await live.onBgv(true, me.bgv!.notice);
          done('Consent given. Background checks can start.');
        }}
        onWithdraw={async () => {
          await live.onBgv(false, me.bgv!.notice);
          done('Consent withdrawn. Background checks stopped.');
        }}
      />
    ) : null;
  return (
    <PreFrame tenant={me.company} accent={accent} email={live.email} today={today} endsOn={joiningOn} ended={false} tab={tab} onSignOut={live.onSignOut} pinned={tab === 'checklist' && !stepView ? pinnedFor(nextItem(items), open) : undefined}>
      <OutcomeNote tenant={me.company} outcome={me.dateMoved ? 'postponed' : 'in-progress'} on={today} newDate={joiningOn} from={me.dateMoved ? preDate(me.dateMoved.from) : undefined} />
      {tab === 'offer' ? (
        <OfferLettersPanel state="to-sign" joiner={PRE_NOBODY} ctc={0} letters={me.letters} disclosureNeeded={!me.esignAccepted} onDownload={live.onDownload} onSignCode={live.onSignCode} onSign={async (l, x) => {
            await live.onSign(l, x);
            toast({ title: 'Letter accepted. Your sealed copy is ready to download.', tone: 'success' });
          }} />
      ) : tab === 'documents' ? (
        <PreboardingDocuments
          items={items}
          onUpload={async (typeKey, f) => {
            await live.onUpload(typeKey, f);
            toast({ title: 'Sent. HR checks it.', tone: 'success' });
          }}
        />
      ) : stepView ? (
        <div className="yx-ps-stack">
          <div className="yx-ps-row">
            <Button onClick={() => setStep(null)}>Back to checklist</Button>
          </div>
          {stepView}
        </div>
      ) : (
        <PreHome
          firstName={me.name.split(' ')[0] ?? me.name}
          intro={`You join ${me.employer || me.company}${me.designation ? ` as ${me.designation}` : ''} on`}
          items={items}
          day={{ date: joiningOn, reportingTime: me.firstDay.reportingTime, location: me.location, address: me.firstDay.address, manager: me.manager, buddy: me.firstDay.buddy, batch: me.firstDay.batch }}
          bring={me.firstDay.bring}
          onOpen={open}
          decline={<DeclineOffer company={me.company} onDecline={live.onDecline} />}
        />
      )}
    </PreFrame>
  );
}
/** The live offer panel needs no sample joiner. */
const PRE_NOBODY: Joiner = { name: '', email: '', role: '', department: '', manager: '', location: '', address: '', joiningDate: new Date(0), reportingTime: '09:30', buddy: '', batch: null };
/** "FY 2026-27" for a date (the year starts on 1 April). */
const fyOf = (d: Date) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

const DECLINE_REASONS = ['Accepted another offer', 'Counter-offer from current employer', 'Location or relocation', 'Personal reasons', 'Other'];

/** "Changed your mind?": decline with a reason; the hiring team is told and the page closes. */
export function DeclineOffer({ company, onDecline, defaultOpen }: { company: string; onDecline?: (input: { reason: string; note: string }) => Promise<unknown>; defaultOpen?: boolean }) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <Card title="Changed your mind?">
      <p className="yx-ps-muted">If you no longer plan to join, tell us here. The hiring team is told straight away.</p>
      <ConfirmDialog
        trigger={<Button variant="danger">Decline offer</Button>}
        defaultOpen={defaultOpen}
        title={`Decline the offer from ${company}?`}
        consequence="Your pre-joining access ends and the hiring team is told. You can't undo this from here."
        confirmLabel="Decline offer"
        destructive
        onOpenChange={(o) => !o && setTried(false)}
        onConfirm={async () => {
          setTried(true);
          if (!reason) {
            document.getElementById('decline-reason')?.focus();
            return false;
          }
          await onDecline?.({ reason, note: note.trim() });
        }}
      >
        <FormField id="decline-reason" label="Reason" required error={tried && !reason ? 'Choose a reason.' : null}>
          <Select value={reason} onChange={setReason} options={DECLINE_REASONS.map((x) => ({ value: x, label: x }))} placeholder="Choose a reason" />
        </FormField>
        <FormField label="Anything else" optional>
          <TextArea value={note} onChange={setNote} rows={3} maxLength={500} />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}

/** A save that failed: the server's reason, in a box that stays. */
function NotSaved({ error }: { error: string | null }) {
  return error ? (
    <InlineAlert tone="danger" title="Not saved">
      {error}
    </InlineAlert>
  ) : null;
}

/** A fresh code before PAN, ID and bank (AAL1 + step-up for this login type, P02 §4.7). */
export function StepUpCard({ onSendCode, onVerify, defaultSent = false, defaultCode = '' }: { onSendCode?: () => Promise<unknown>; onVerify?: (code: string) => Promise<unknown>; defaultSent?: boolean; defaultCode?: string }) {
  const [sent, setSent] = useState(defaultSent);
  const [otp, setOtp] = useState(defaultCode);
  const early = useTooEarly(otp.length !== 6 ? [{ fieldId: 'pre-stepup', message: 'Enter the 6-digit code from your email.' }] : []);
  const { busy, error, run } = useRun();
  const send = () =>
    void run('send', async () => {
      await onSendCode?.();
      setSent(true);
      setOtp('');
    });
  return (
    <Card title="Confirm it's you">
      <div className="yx-ps-stack">
        <p className="yx-ps-muted">PAN, ID and bank details need a fresh code. {sent ? 'We sent one to your email. It works for 5 minutes.' : 'We send it to your email.'}</p>
        {error && (
          <InlineAlert tone="danger" title="That didn't work">
            {error}
          </InlineAlert>
        )}
        {sent ? (
          <>
            <FormField id="pre-stepup" label="Code" hideLabel error={early.errorOf('pre-stepup')}>
              <OtpInput id="pre-stepup" value={otp} onChange={setOtp} invalid={Boolean(early.errorOf('pre-stepup'))} />
            </FormField>
            <div className="yx-ps-row">
              <Button variant="primary" loading={busy === 'verify'} onClick={() => !early.stop() && void run('verify', async () => onVerify?.(otp))}>
                Verify
              </Button>
              <Button loading={busy === 'send'} onClick={send}>
                Send a new code
              </Button>
            </div>
          </>
        ) : (
          <div className="yx-ps-row">
            <Button variant="primary" loading={busy === 'send'} onClick={send}>
              Send me a code
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'transgender', label: 'Transgender' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];
const STATES = [
  ['IN-AP', 'Andhra Pradesh'], ['IN-AS', 'Assam'], ['IN-BR', 'Bihar'], ['IN-CT', 'Chhattisgarh'], ['IN-DL', 'Delhi'], ['IN-GA', 'Goa'], ['IN-GJ', 'Gujarat'], ['IN-HR', 'Haryana'], ['IN-HP', 'Himachal Pradesh'], ['IN-JH', 'Jharkhand'], ['IN-KA', 'Karnataka'], ['IN-KL', 'Kerala'], ['IN-MP', 'Madhya Pradesh'], ['IN-MH', 'Maharashtra'], ['IN-OR', 'Odisha'], ['IN-PB', 'Punjab'], ['IN-RJ', 'Rajasthan'], ['IN-TN', 'Tamil Nadu'], ['IN-TG', 'Telangana'], ['IN-UP', 'Uttar Pradesh'], ['IN-UT', 'Uttarakhand'], ['IN-WB', 'West Bengal'],
].map(([value, label]) => ({ value, label }));

type PersonalValue = { dateOfBirth: string; gender: string; addressLine1: string; addressLine2?: string; city: string; stateCode: string; postalCode: string };

/** Personal details: date of birth, gender and home address (written to the record on day one). */
export function PersonalDetailsStep({ defaultValue, onSave, tried: triedFirst = false }: { defaultValue?: PersonalValue | null; onSave?: (v: PersonalValue) => Promise<unknown>; tried?: boolean }) {
  const [v, setV] = useState<PersonalValue>(defaultValue ?? { dateOfBirth: '', gender: '', addressLine1: '', city: '', stateCode: '', postalCode: '' });
  const set = (k: keyof PersonalValue) => (x: string | null) => setV((o) => ({ ...o, [k]: x ?? '' }));
  const errors = [
    !v.dateOfBirth && { fieldId: 'pd-dob', message: 'Give your date of birth.' },
    !v.gender && { fieldId: 'pd-gender', message: 'Choose an option.' },
    v.addressLine1.trim().length < 3 && { fieldId: 'pd-line1', message: 'Give your address.' },
    v.city.trim().length < 2 && { fieldId: 'pd-city', message: 'Give your city.' },
    !v.stateCode && { fieldId: 'pd-state', message: 'Choose your state.' },
    !/^[1-9][0-9]{5}$/.test(v.postalCode) && { fieldId: 'pd-pin', message: 'The PIN code is 6 digits.' },
  ].filter((e): e is { fieldId: string; message: string } => Boolean(e));
  const early = useTooEarly(errors);
  useEffect(() => {
    if (triedFirst) early.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { busy, error, run } = useRun();
  return (
    <Card
      title="Personal details"
      footer={
        <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', async () => onSave?.({ ...v, addressLine2: v.addressLine2?.trim() || undefined }))}>
          Save details
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <NotSaved error={error} />
        <FieldRow>
          <FormField id="pd-dob" label="Date of birth" required error={early.errorOf('pd-dob')}>
            <DatePicker id="pd-dob" value={v.dateOfBirth ? preDate(v.dateOfBirth) : null} onChange={(d) => set('dateOfBirth')(d ? dayKey(d) : '')} max={new Date()} />
          </FormField>
          <FormField id="pd-gender" label="Gender" required error={early.errorOf('pd-gender')}>
            <Select value={v.gender || null} onChange={set('gender')} options={GENDERS} placeholder="Choose" />
          </FormField>
        </FieldRow>
        <FormField id="pd-line1" label="Address" required error={early.errorOf('pd-line1')}>
          <TextField value={v.addressLine1} onChange={set('addressLine1')} maxLength={200} autoComplete="address-line1" />
        </FormField>
        <FormField id="pd-line2" label="Address line 2" optional>
          <TextField value={v.addressLine2 ?? ''} onChange={set('addressLine2')} maxLength={200} autoComplete="address-line2" />
        </FormField>
        <FieldRow>
          <FormField id="pd-city" label="City" required error={early.errorOf('pd-city')}>
            <TextField value={v.city} onChange={set('city')} maxLength={100} autoComplete="address-level2" />
          </FormField>
          <FormField id="pd-state" label="State" required error={early.errorOf('pd-state')}>
            <Select value={v.stateCode || null} onChange={set('stateCode')} options={STATES} searchable placeholder="Choose" />
          </FormField>
          <FormField id="pd-pin" label="PIN code" required error={early.errorOf('pd-pin')}>
            <TextField value={v.postalCode} onChange={(x) => set('postalCode')(x.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="postal-code" />
          </FormField>
        </FieldRow>
      </div>
    </Card>
  );
}

type IdentityValue = { legalName: string; pan: string; aadhaar?: string; uan?: string };

/** PAN and ID, behind a fresh code: name as on PAN, PAN, and optional Aadhaar and UAN (sealed; shown back masked). */
export function IdentityStep({
  stage: initial,
  defaultName,
  onFile,
  onSendCode,
  onVerify,
  onSave,
  tried: triedFirst = false,
}: {
  stage: 'step-up' | 'form';
  defaultName: string;
  /** What is saved already, masked ("••••••234F"). */
  onFile?: { pan: string; aadhaar: string | null };
  onSendCode?: () => Promise<unknown>;
  onVerify?: (code: string) => Promise<unknown>;
  onSave?: (v: IdentityValue) => Promise<unknown>;
  tried?: boolean;
}) {
  const [stage, setStage] = useState(initial);
  const [name, setName] = useState(defaultName);
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [uan, setUan] = useState('');
  const errors = [
    name.trim().length < 2 && { fieldId: 'id-name', message: 'Give your name as on your PAN card.' },
    (!pan || ID_SPECS.pan.validate(pan)) && { fieldId: 'id-pan', message: 'PAN is 5 letters, 4 digits, 1 letter (e.g. ABCPE1234F).' },
    aadhaar && ID_SPECS.aadhaar.validate(aadhaar) && { fieldId: 'id-aadhaar', message: 'Aadhaar is 12 digits. Check the number.' },
    uan && !/^[0-9]{12}$/.test(uan) && { fieldId: 'id-uan', message: 'UAN is 12 digits.' },
  ].filter((e): e is { fieldId: string; message: string } => Boolean(e));
  const early = useTooEarly(errors);
  useEffect(() => {
    if (triedFirst && stage === 'form') early.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { busy, error, run } = useRun();
  if (stage === 'step-up')
    return (
      <StepUpCard
        onSendCode={onSendCode}
        defaultSent={!onVerify}
        onVerify={async (c) => {
          await onVerify?.(c);
          setStage('form');
        }}
      />
    );
  return (
    <Card
      title="PAN and ID"
      footer={
        <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', async () => onSave?.({ legalName: name.trim(), pan, ...(aadhaar ? { aadhaar } : {}), ...(uan ? { uan } : {}) }))}>
          Save PAN and ID
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <NotSaved error={error} />
        <p className="yx-ps-muted">Kept sealed. You and HR see only the last four characters. HR checks the originals on your first day.</p>
        <FieldRow>
          <FormField id="id-name" label="Name as on PAN" required error={early.errorOf('id-name')}>
            <TextField value={name} onChange={setName} maxLength={200} autoComplete="name" />
          </FormField>
          <FormField id="id-pan" label="PAN" required error={early.errorOf('id-pan')} helper={onFile ? `On file: ${onFile.pan}. Type it again to change it.` : '5 letters, 4 digits, 1 letter'}>
            <MaskedField kind="pan" value={pan} onChange={setPan} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="id-aadhaar" label="Aadhaar" optional error={early.errorOf('id-aadhaar')} helper={onFile?.aadhaar ? `On file: ${onFile.aadhaar}.` : 'You can show another photo ID on your first day instead.'}>
            <MaskedField kind="aadhaar" value={aadhaar} onChange={setAadhaar} />
          </FormField>
          <FormField id="id-uan" label="UAN (if you had a PF account before)" optional error={early.errorOf('id-uan')}>
            <MaskedField kind="uan" value={uan} onChange={setUan} />
          </FormField>
        </FieldRow>
      </div>
    </Card>
  );
}

type EmergencyValue = { name: string; relation: string; phone: string };

/** Who to call in an emergency. */
export function EmergencyContactStep({ defaultValue, onSave, tried: triedFirst = false }: { defaultValue?: EmergencyValue | null; onSave?: (v: EmergencyValue) => Promise<unknown>; tried?: boolean }) {
  const [v, setV] = useState<EmergencyValue>(defaultValue ?? { name: '', relation: '', phone: '' });
  const set = (k: keyof EmergencyValue) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const errors = [
    v.name.trim().length < 2 && { fieldId: 'em-name', message: 'Give a name.' },
    v.relation.trim().length < 2 && { fieldId: 'em-relation', message: 'Give the relation, like Father or Spouse.' },
    !/^\+?[0-9 ]{10,16}$/.test(v.phone.trim()) && { fieldId: 'em-phone', message: 'Give a phone number of 10 digits or more.' },
  ].filter((e): e is { fieldId: string; message: string } => Boolean(e));
  const early = useTooEarly(errors);
  useEffect(() => {
    if (triedFirst) early.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { busy, error, run } = useRun();
  return (
    <Card
      title="Emergency contact"
      footer={
        <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', async () => onSave?.({ name: v.name.trim(), relation: v.relation.trim(), phone: v.phone.trim() }))}>
          Save contact
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <NotSaved error={error} />
        <FieldRow>
          <FormField id="em-name" label="Name" required error={early.errorOf('em-name')}>
            <TextField value={v.name} onChange={set('name')} maxLength={100} />
          </FormField>
          <FormField id="em-relation" label="Relation" required error={early.errorOf('em-relation')}>
            <TextField value={v.relation} onChange={set('relation')} maxLength={40} />
          </FormField>
        </FieldRow>
        <FormField id="em-phone" label="Phone" required error={early.errorOf('em-phone')}>
          <TextField type="tel" value={v.phone} onChange={set('phone')} maxLength={16} autoComplete="off" />
        </FormField>
      </div>
    </Card>
  );
}

const SCHEME_KEYS = ['pf', 'gratuity', 'insurance'] as const;
const SCHEME_LABEL = { pf: 'PF', gratuity: 'Gratuity', insurance: 'Group insurance' } as const;
/** Each scheme's shares add up to 100; a nominee with no share anywhere is a mistake (the server checks the same). */
export function nomineeProblems(rows: Nominee[]): string[] {
  if (!rows.length) return ['Add at least one nominee.'];
  const out: string[] = SCHEME_KEYS.flatMap((k) => {
    const t = rows.reduce((a, r) => a + (r[k] || 0), 0);
    return t === 100 ? [] : [`${SCHEME_LABEL[k]}: shares add up to ${t}%. Make them add up to 100%.`];
  });
  const none = rows.find((r) => r.pf + r.gratuity + r.insurance === 0);
  return none ? [...out, `${none.name} has no share in any scheme. Give a share or remove them.`] : out;
}

/** Family and nominees form: shares per scheme must add up to 100% (PF, gratuity, group insurance). */
export function NomineeForm({ defaultNominees, onSave, defaultTried = false, defaultAdding = false }: { defaultNominees: Nominee[]; onSave?: (rows: Nominee[]) => Promise<unknown>; defaultTried?: boolean; defaultAdding?: boolean }) {
  const [rows, setRows] = useState(defaultNominees);
  const [tried, setTried] = useState(defaultTried);
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(defaultAdding);
  const { busy, error, run } = useRun();
  const problems = nomineeProblems(rows);
  const totalOf = (k: (typeof SCHEME_KEYS)[number]) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const set = (id: string, k: (typeof SCHEME_KEYS)[number], v: number | null) => setRows((xs) => xs.map((r) => (r.id === id ? { ...r, [k]: v ?? 0 } : r)));
  const save = () => {
    setTried(true);
    setSaved(false);
    if (problems.length) return document.getElementById('nominee-problems')?.focus();
    if (onSave) void run('save', () => onSave(rows));
    else setSaved(true);
  };
  return (
    <Card
      title="Family and nominees"
      footer={
        <Button variant="primary" loading={busy === 'save'} onClick={save}>
          Save nominees
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <p className="yx-ps-muted">Nominate who receives your PF, gratuity and group insurance. Each scheme's shares must add up to 100%.</p>
        {tried && problems.length > 0 && (
          <div id="nominee-problems" tabIndex={-1}>
            <InlineAlert tone="danger" title="Fix the shares before saving">
              {problems.join(' ')}
            </InlineAlert>
          </div>
        )}
        <NotSaved error={error} />
        {saved && <InlineAlert tone="success" title="Nominees saved">HR will add these to Form 2 and Form F when you join.</InlineAlert>}
        <PlainTable
          label="Nominee shares"
          rows={rows}
          getRowId={(r) => r.id}
          empty="No nominees yet. Add the people who should receive your PF, gratuity and insurance."
          columns={[
            { key: 'name', header: 'Nominee', rowHeader: true, cell: (r) => r.name },
            { key: 'relation', header: 'Relation', cell: (r) => r.relation },
            { key: 'dob', header: 'Date of birth', date: true, cell: (r) => (r.dob ? formatDate(r.dob) : 'Not given') },
            ...SCHEME_KEYS.map((k) => ({
              key: k,
              header: `${k === 'insurance' ? 'Insurance' : SCHEME_LABEL[k]} %`,
              num: true,
              cell: (r: Nominee) => <NumberField aria-label={`${r.name} ${SCHEME_LABEL[k]} share`} value={r[k]} onChange={(v) => set(r.id, k, v)} min={0} max={100} aria-invalid={tried && totalOf(k) !== 100} />,
            })),
            {
              key: 'remove',
              header: <span className="yx-visually-hidden">Remove</span>,
              cell: (r: Nominee) => (
                <Button size="sm" onClick={() => setRows((xs) => xs.filter((x) => x.id !== r.id))} aria-label={`Remove ${r.name}`}>
                  Remove
                </Button>
              ),
            },
          ]}
          footer={[
            {
              id: 'total',
              label: 'Total',
              cells: Object.fromEntries(
                SCHEME_KEYS.map((k) => [
                  k,
                  <>
                    {totalOf(k)}% {totalOf(k) !== 100 && <Badge tone="danger">Must be 100%</Badge>}
                  </>,
                ]),
              ),
            },
          ]}
        />
        {rows.length < 6 && (
          <div className="yx-ps-row">
            <Button size="sm" onClick={() => setAdding(true)}>
              Add nominee
            </Button>
          </div>
        )}
      </div>
      {adding && <AddNomineeDialog onClose={() => setAdding(false)} onAdd={(n) => setRows((xs) => [...xs, { ...n, id: `new-${xs.length}-${n.name}`, pf: 0, gratuity: 0, insurance: 0 }])} />}
    </Card>
  );
}

function AddNomineeDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (n: { name: string; relation: string; dob: Date | null }) => void }) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const early = useTooEarly(
    [name.trim().length < 2 && { fieldId: 'nm-name', message: 'Give the nominee’s name.' }, relation.trim().length < 2 && { fieldId: 'nm-relation', message: 'Give the relation, like Mother or Spouse.' }].filter(
      (e): e is { fieldId: string; message: string } => Boolean(e),
    ),
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Add a nominee"
      consequence="Then give their share in each scheme in the table."
      confirmLabel="Add nominee"
      onConfirm={() => {
        if (early.stop()) return false;
        onAdd({ name: name.trim(), relation: relation.trim(), dob });
      }}
    >
      <FormField id="nm-name" label="Name" required error={early.errorOf('nm-name')}>
        <TextField value={name} onChange={setName} maxLength={100} />
      </FormField>
      <FormField id="nm-relation" label="Relation" required error={early.errorOf('nm-relation')}>
        <TextField value={relation} onChange={setRelation} maxLength={40} />
      </FormField>
      <FormField id="nm-dob" label="Date of birth" optional helper="Needed for a nominee under 18 (Form 2).">
        <DatePicker id="nm-dob" value={dob} onChange={setDob} max={new Date()} />
      </FormField>
    </ConfirmDialog>
  );
}

export type BankStage = 'step-up' | 'form' | 'verifying' | 'verified' | 'mismatch';
type BankValue = { holderName: string; accountNumber: string; ifsc: string };

/**
 * Bank details behind a step-up code (AAL1 + step-up for bank and PAN, M01 §3.5). Penny drop (verified / name
 * mismatch, P10 Q6) waits for a provider; until then HR checks the account (founder default, 2 Nov 2026).
 */
export function BankDetailsStep({
  stage: initial,
  holderName,
  onFile,
  onSendCode,
  onVerify,
  onSave,
}: {
  stage: BankStage;
  holderName: string;
  /** The account saved already, masked. */
  onFile?: string;
  onSendCode?: () => Promise<unknown>;
  onVerify?: (code: string) => Promise<unknown>;
  /** Live: saves the account (no penny drop yet; HR checks it). */
  onSave?: (v: BankValue) => Promise<unknown>;
}) {
  const [stage, setStage] = useState(initial);
  const sample = !onSave && stage !== 'form';
  const [holder, setHolder] = useState(holderName);
  const [ifsc, setIfsc] = useState(sample ? 'KVBL0001203' : '');
  const [acct, setAcct] = useState(sample ? '1203155000041872' : '');
  const [acct2, setAcct2] = useState(sample ? '1203155000041872' : '');
  const errors = [
    (!ifsc || ID_SPECS.ifsc.validate(ifsc)) && { fieldId: 'bk-ifsc', message: 'IFSC is 11 characters, e.g. HDFC0001234.' },
    holder.trim().length < 2 && { fieldId: 'bk-holder', message: 'Give the name on the account.' },
    !/^[0-9]{9,18}$/.test(acct) && { fieldId: 'bk-acct', message: 'The account number is 9 to 18 digits.' },
    acct2 !== acct && { fieldId: 'bk-acct2', message: 'The two account numbers are different. Check both.' },
  ].filter((e): e is { fieldId: string; message: string } => Boolean(e));
  const early = useTooEarly(errors);
  const { busy, error, run } = useRun();
  if (stage === 'step-up')
    return (
      <StepUpCard
        onSendCode={onSendCode}
        defaultSent={!onVerify}
        onVerify={async (c) => {
          await onVerify?.(c);
          setStage('form');
        }}
      />
    );
  const editable = stage === 'form';
  return (
    <Card
      title="Bank account for salary"
      footer={
        stage === 'form' ? (
          <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && (onSave ? void run('save', () => onSave({ holderName: holder.trim(), accountNumber: acct, ifsc })) : setStage('verifying'))}>
            {onSave ? 'Save account' : 'Verify account'}
          </Button>
        ) : stage === 'mismatch' ? (
          <>
            <Button onClick={() => setStage('form')}>Edit details</Button>
            <Button variant="primary">Send to HR to check</Button>
          </>
        ) : undefined
      }
    >
      <div className="yx-ps-stack">
        <NotSaved error={error} />
        {onSave && <p className="yx-ps-muted">{onFile ? `On file: ${onFile}. Type the account again to change it. ` : ''}HR checks the account before your first salary.</p>}
        <FieldRow>
          <FormField id="bk-ifsc" label="IFSC" required helper={ifscBank(ifsc) ?? '11 characters, printed on your cheque book'} error={early.errorOf('bk-ifsc')}>
            <MaskedField kind="ifsc" value={ifsc} onChange={setIfsc} disabled={!editable} />
          </FormField>
          <FormField id="bk-holder" label="Account holder" required error={early.errorOf('bk-holder')}>
            <TextField value={holder} onChange={setHolder} maxLength={200} disabled={!editable} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="bk-acct" label="Account number" required error={early.errorOf('bk-acct')}>
            <TextField value={acct} onChange={(x) => setAcct(x.replace(/\D/g, '').slice(0, 18))} inputMode="numeric" autoComplete="off" disabled={!editable} />
          </FormField>
          <FormField id="bk-acct2" label="Re-enter account number" required error={early.errorOf('bk-acct2') ?? (acct2 !== '' && acct !== acct2 ? 'The two account numbers are different. Check both.' : null)}>
            <TextField value={acct2} onChange={(x) => setAcct2(x.replace(/\D/g, '').slice(0, 18))} inputMode="numeric" autoComplete="off" disabled={!editable} />
          </FormField>
        </FieldRow>
        {stage === 'verifying' && (
          <InlineAlert tone="info" title="Checking your account">
            We are sending ₹1 to confirm the account and the name on it. This usually takes under a minute.
          </InlineAlert>
        )}
        {stage === 'verified' && (
          <InlineAlert tone="success" title="Account verified">
            Karur Vysya Bank, Hosur branch. Name at the bank: MEENAKSHI SUNDARAM, matches your profile.
          </InlineAlert>
        )}
        {stage === 'mismatch' && (
          <InlineAlert tone="warning" title="The name at the bank doesn't match">
            The bank returned "M SUNDARAM RAJAGOPAL". If this is your account, send it to HR to check with a cancelled cheque or passbook page.
          </InlineAlert>
        )}
      </div>
    </Card>
  );
}

type TaxValue = { regime: 'new' | 'old'; previousIncome: { grossSalary: number; tds: number } | null };

/** Tax regime choice and previous-employer income (Form 12B). Estimate only, not tax advice. */
export function TaxRegimeStep({
  defaultRegime = null,
  defaultPrevious,
  fy = 'FY 2026-27',
  onSave,
  tried: triedFirst = false,
}: {
  defaultRegime?: 'new' | 'old' | null;
  /** Undefined: the sample (an earlier job filled in). Null: no earlier employer. */
  defaultPrevious?: { grossSalary: number; tds: number } | null;
  fy?: string;
  onSave?: (v: TaxValue) => Promise<unknown>;
  tried?: boolean;
}) {
  const [regime, setRegime] = useState<string | undefined>(defaultRegime ?? undefined);
  const [hadJob, setHadJob] = useState(defaultPrevious !== null);
  const [gross, setGross] = useState<number | null>(defaultPrevious === undefined ? 4_20_000 : (defaultPrevious?.grossSalary ?? null));
  const [tds, setTds] = useState<number | null>(defaultPrevious === undefined ? 18_600 : (defaultPrevious?.tds ?? null));
  const errors = [
    !regime && { fieldId: 'tx-regime', message: 'Choose a regime.' },
    hadJob && gross === null && { fieldId: 'tx-gross', message: 'Give the gross salary from your last employer.' },
    hadJob && tds === null && { fieldId: 'tx-tds', message: 'Give the TDS already deducted (0 if none).' },
    hadJob && gross !== null && tds !== null && tds > gross && { fieldId: 'tx-tds', message: 'The TDS is more than the gross salary. Check both on your Form 16 or last payslip.' },
  ].filter((e): e is { fieldId: string; message: string } => Boolean(e));
  const early = useTooEarly(errors);
  useEffect(() => {
    if (triedFirst) early.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { busy, error, run } = useRun();
  return (
    <Card
      title="Choose your tax regime"
      footer={
        <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', async () => onSave?.({ regime: regime as 'new' | 'old', previousIncome: hadJob ? { grossSalary: gross!, tds: tds! } : null }))}>
          Save choice
        </Button>
      }
    >
      <div className="yx-ps-stack">
        <NotSaved error={error} />
        <FormField id="tx-regime" label="Income-tax regime" hideLabel required error={early.errorOf('tx-regime')}>
          <RadioGroup
            value={regime}
            onChange={setRegime}
            options={[
              { value: 'new', label: 'New regime (default)', description: 'Lower slab rates, few deductions. Standard deduction ₹75,000.' },
              { value: 'old', label: 'Old regime', description: 'Claim HRA, 80C, 80D and home loan interest with proofs.' },
            ]}
          />
        </FormField>
        <p className="yx-ps-muted">You can change this once more in the April declaration window. This is an estimate, not tax advice.</p>
        <Checkbox checked={hadJob} onChange={setHadJob} label="I worked for another employer earlier this financial year" />
        {hadJob && (
          <FieldRow>
            <FormField id="tx-gross" label={`Gross salary from last employer (${fy})`} helper="From your last payslip or Form 16 Part B" required error={early.errorOf('tx-gross')}>
              <CurrencyField value={gross} onChange={setGross} max={100_000_000} />
            </FormField>
            <FormField id="tx-tds" label="TDS already deducted" required error={early.errorOf('tx-tds')}>
              <CurrencyField value={tds} onChange={setTds} max={100_000_000} />
            </FormField>
          </FieldRow>
        )}
      </div>
    </Card>
  );
}

export type LetterSignState = 'loi' | 'to-sign' | 'signed' | 'declined';
const LETTER_BADGE: Record<string, { tone: BadgeTone; text: string }> = {
  open: { tone: 'warning', text: 'Waiting for you to accept' },
  signed: { tone: 'success', text: 'You accepted it' },
  declined: { tone: 'danger', text: 'Declined' },
  cancelled: { tone: 'neutral', text: 'No longer needed' },
};

/**
 * LOI, offer and appointment letter in one record (E18, YX-LC-24), with e-sign (P05 Q2). Live: the letters HR issued,
 * each downloadable, accepted with an emailed code (Aadhaar e-sign and the letter of intent wait for a provider).
 */
export function OfferLettersPanel({
  state,
  joiner,
  ctc,
  letters,
  disclosureNeeded = true,
  onDownload,
  onSignCode,
  onSign,
  defaultAccepting,
  readOnly = false,
}: {
  state: LetterSignState;
  joiner: Joiner;
  ctc: number;
  letters?: Letter[];
  /** A closed joining: download only; a letter still waiting to be accepted no longer is. */
  readOnly?: boolean;
  disclosureNeeded?: boolean;
  onDownload?: (l: Letter, which: 'letter' | 'acceptance') => Promise<unknown>;
  onSignCode?: (l: Letter) => Promise<unknown>;
  onSign?: (l: Letter, x: { code: string; accept: boolean; disclosureAccepted: boolean }) => Promise<unknown>;
  /** Story only: the accept step open for this letter. */
  defaultAccepting?: string;
}) {
  const [agree, setAgree] = useState(false);
  const [signTried, setSignTried] = useState(false);
  const [accepting, setAccepting] = useState<Letter | null>(() => letters?.find((l) => l.id === defaultAccepting) ?? null);
  const { busy, error, run } = useRun();
  if (letters) {
    const shown = letters.filter((l) => l.status === 'issued' || l.status === 'superseded');
    return (
      <div className="yx-ps-stack">
        {error && (
          <InlineAlert tone="danger" title="Not downloaded">
            {error}
          </InlineAlert>
        )}
        {shown.length === 0 && <EmptyState title="No letters yet" description="HR issues your appointment letter here. We email you when it is ready." />}
        {shown.map((l) => {
          const sig = readOnly && l.signature?.status === 'open' ? 'cancelled' : l.signature?.status;
          const badge = l.status === 'superseded' ? { tone: 'neutral' as BadgeTone, text: 'Replaced by a correction' } : sig ? LETTER_BADGE[sig] : { tone: 'success' as BadgeTone, text: 'Issued' };
          return (
            <Card key={l.id} title={l.title.split(': ')[0] ?? l.title} actions={<Badge tone={badge.tone}>{badge.text}</Badge>}>
              <div className="yx-ps-stack">
                <DescriptionList
                  columns={2}
                  items={[
                    { label: 'Reference', value: l.referenceNo ?? 'Not numbered', mono: true },
                    { label: 'Issued on', value: l.issuedAt ? formatDate(preDate(l.issuedAt)) : 'Not yet' },
                    ...(l.signature?.signedAt ? [{ label: 'You accepted it on', value: formatDate(preDate(l.signature.signedAt)) }] : []),
                  ]}
                />
                <div className="yx-ps-row">
                  <Button icon={Download} loading={busy === l.id} onClick={() => void run(l.id, async () => onDownload?.(l, 'letter'))}>
                    Download PDF
                  </Button>
                  {l.signature?.status === 'signed' && (
                    <Button icon={Download} loading={busy === `${l.id}-a`} onClick={() => void run(`${l.id}-a`, async () => onDownload?.(l, 'acceptance'))}>
                      Accepted copy
                    </Button>
                  )}
                  {!readOnly && l.status === 'issued' && l.signature?.status === 'open' && (
                    <Button variant="primary" icon={FileText} onClick={() => setAccepting(l)}>
                      Read and accept
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {accepting && (
          <AcceptDialog
            letter={accepting}
            disclosureNeeded={disclosureNeeded}
            onClose={() => setAccepting(null)}
            onCode={async () => onSignCode?.(accepting)}
            onSign={async (x) => onSign?.(accepting, x)}
          />
        )}
      </div>
    );
  }
  return (
    <div className="yx-ps-stack">
      <Card title={state === 'loi' ? 'Letter of intent' : 'Appointment letter'} actions={<Badge tone={state === 'signed' ? 'success' : state === 'declined' ? 'danger' : 'warning'}>{state === 'signed' ? 'Signed' : state === 'declined' ? 'Declined' : 'Waiting for your signature'}</Badge>}>
        <div className="yx-ps-stack">
          <DescriptionList
            columns={2}
            items={[
              { label: 'Designation', value: joiner.role },
              { label: 'Department', value: joiner.department },
              { label: 'Location', value: joiner.location },
              { label: 'Joining date', value: formatDate(joiner.joiningDate) },
              { label: 'Annual CTC', value: formatINR(ctc) },
              { label: 'Probation', value: '6 months' },
              { label: 'Reference', value: 'KF/HR/APT/2026/0187', mono: true },
            ]}
          />
          {state === 'loi' && (
            <InlineAlert tone="info" title="Your formal offer follows">
              This letter confirms our intent to hire you. The appointment letter with the full salary break-up will appear here after your documents are checked.
            </InlineAlert>
          )}
          <div className="yx-ps-row">
            <Button icon={FileText}>Read the full letter</Button>
            <Button icon={Download}>Download PDF</Button>
          </div>
        </div>
      </Card>
      {state === 'to-sign' && (
        <Card
          title="Sign with Aadhaar e-sign"
          footer={
            <Button variant="primary" onClick={() => {
                setSignTried(true);
                if (!agree) document.getElementById('esign-agree')?.focus();
              }}>
              Sign letter
            </Button>
          }
        >
          <div className="yx-ps-stack">
            <StepDots steps={['Read', 'Agree', 'Sign with OTP']} current={agree ? 2 : 1} />
            <FormField id="esign-agree" label="Agreement" hideLabel required error={signTried && !agree ? 'Tick that you have read the letter and accept it.' : null}>
              <Checkbox checked={agree} onChange={setAgree} label="I have read the appointment letter and accept its terms" />
            </FormField>
            <p className="yx-ps-muted">You get a one-time code from UIDAI on your Aadhaar-linked mobile. We never see or store the code.</p>
          </div>
        </Card>
      )}
      {state === 'signed' && (
        <InlineAlert tone="success" title="Signed on 24 Sep 2026, 7:18 pm">
          A signed copy is in Documents. HR countersigned on 25 Sep 2026.
        </InlineAlert>
      )}
    </div>
  );
}

/** Documents with camera upload; HR verifies PAN, Aadhaar, bank and education proofs (P05 Q7). */
export function PreboardingDocuments({ items, onUpload }: { items: PreItem[]; onUpload?: (typeKey: string, file: File) => Promise<unknown> }) {
  const docs = items.filter((i) => i.section === 'Documents');
  if (docs.length === 0) return <EmptyState title="No documents asked for" description="HR has not asked you for any documents. If that changes, they appear here." />;
  return (
    <div className="yx-ps-stack">
      {docs.map((doc) => (
        <Card key={doc.id} title={doc.title} actions={<Badge tone={PRE_STATUS[doc.status].tone}>{doc.hrOwned && doc.status === 'todo' ? 'HR completes this' : PRE_STATUS[doc.status].text}</Badge>}>
          <div className="yx-ps-stack">
            {doc.status === 'sent-back' && (
              <InlineAlert tone="danger" title="Upload this again">
                {doc.note ?? 'HR could not accept it. Send a clearer copy.'}
              </InlineAlert>
            )}
            {doc.hrOwned && doc.status === 'todo' && <p className="yx-ps-muted">HR adds this one. You don't need to send it.</p>}
            {!doc.hrOwned && (doc.status === 'todo' || doc.status === 'sent-back') && (
              <>
                {doc.due && <p className="yx-ps-muted">Due {formatDate(doc.due)}. On a phone you can take a photo of it.</p>}
                <FileUpload
                  upload={onUpload ? (f) => onUpload(doc.id.replace(/^doc:/, ''), f).then(() => undefined) : fakeUpload}
                  accept={['.pdf', '.jpg', '.jpeg', '.png']}
                  maxSize={20 * 1024 * 1024}
                  multiple={false}
                  capture="environment"
                  defaultItems={!onUpload && doc.status === 'sent-back' ? [uploaded('relieving-letter-page1.pdf', 'error', 'Sent back by HR')] : []}
                />
              </>
            )}
            {(doc.status === 'done' || doc.status === 'in-review') && <p className="yx-ps-muted">{doc.status === 'done' ? 'Verified by HR.' : 'Uploaded. HR is checking it.'}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * Background verification consent (BGV starts after offer acceptance, with consent; M01). Live: the itemised notice
 * as one consent (DPDP Act 2023), and once given, "Withdraw consent", which stops the checks (the law requires it).
 */
export function BgvConsentStep({
  items,
  notice = 'BGV-2026.2',
  company = 'Kaveri Foods',
  consentedOn,
  onConsent,
  onWithdraw,
  defaultWithdrawOpen,
}: {
  /** The notice as plain items (live); without them, the per-purpose sample. */
  items?: string[];
  notice?: string;
  company?: string;
  /** The day consent was given; null or left out: not given. */
  consentedOn?: Date | null;
  onConsent?: () => Promise<unknown>;
  onWithdraw?: () => Promise<unknown>;
  defaultWithdrawOpen?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  if (consentedOn)
    return (
      <Card title="Background verification consent" actions={<Badge tone="success">Consent given</Badge>}>
        <div className="yx-ps-stack">
          <p>
            You gave consent on {formatDate(consentedOn)} (notice {notice}). {company} can check what the notice lists.
          </p>
          {items && (
            <ul className="yx-ps-list">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          <div className="yx-ps-row">
            <ConfirmDialog
              trigger={<Button variant="danger">Withdraw consent</Button>}
              defaultOpen={defaultWithdrawOpen}
              title="Withdraw your consent?"
              consequence="Background checks stop at once. HR is told and decides what that means for your offer; nothing happens to it automatically. You can give consent again later."
              confirmLabel="Withdraw consent"
              destructive
              onConfirm={async () => {
                await onWithdraw?.();
              }}
            />
          </div>
        </div>
      </Card>
    );
  if (items)
    return (
      <div className="yx-ps-stack">
        {error && (
          <InlineAlert tone="danger" title="Consent not recorded">
            {error}
          </InlineAlert>
        )}
        <ConsentPanel
          title="Background verification consent"
          summary={
            <ul className="yx-ps-list">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          }
          purposes={[{ id: 'bgv', label: `I agree that ${company} checks what this notice lists`, required: true }]}
          noticeLabel="background verification notice"
          noticeVersion={notice}
          noticeHref={null}
          acceptLabel="Give consent"
          declinedText="Nothing was checked. HR is not told; you can give consent here later. Without it, no background check can start."
          onAccept={async () => {
            setError(null);
            try {
              await onConsent?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Try again.');
              throw e;
            }
          }}
        />
      </div>
    );
  return (
    <ConsentPanel
      title="Background verification consent"
      summary={
        <>
          <p>Kaveri Foods uses Sathya Verify Services to check your identity, address, education and last two employers.</p>
          <p>A mismatch only raises a flag for HR to discuss with you; it never withdraws your offer on its own.</p>
        </>
      }
      purposes={[
        { id: 'id', label: 'Identity and address check', required: true },
        { id: 'edu', label: 'Education check with your university', required: true },
        { id: 'emp', label: 'Employment check with your last two employers', required: true, description: 'We contact them only after you join if you ask us to wait.' },
        { id: 'crim', label: 'Court records search', description: 'Needed only for roles handling cash or stock.' },
      ]}
      noticeLabel="background verification notice"
      noticeVersion="BGV-2026.2"
      acceptLabel="Give consent"
    />
  );
}

/* ================================================================== */
/* T9-02 Alumni + nominee portal                                       */
/* ================================================================== */

// T9-02
/** One document in the live portals: a letter HR issued, or a pay document (payslips, Form 16; other pay documents sit with the letters). */
export interface LivePortalDoc {
  id: string;
  kind: 'Payslip' | 'Form 16' | 'Letter';
  title: string;
  /** YYYY-MM-DD. */
  issuedOn: string;
  /** Groups the list ("FY 2025-26"). */
  period?: string;
}

/**
 * The live alumni and nominee portals: the alumni login (LIFE-4.04, letters with payslips and Form 16) and the pay
 * documents portal (YX-DOC-16 / 19). Read-only, until access ends. Dates are YYYY-MM-DD.
 */
export interface LiveAlumniPortal {
  company: string;
  /** The former employee (for a nominee: the person who died). */
  name: string;
  /** The email they signed in with. */
  email: string;
  lastDay: string;
  accessUntil: string;
  today: string;
  /** Null while loading. */
  docs: LivePortalDoc[] | null;
  /** Some documents could not load; the rest still show. */
  loadError?: string | null;
  onDownload: (doc: LivePortalDoc) => Promise<unknown>;
  onSignOut: () => void;
}
type AlumniPerson = { name: string; email: string; exitDate: Date; lastRole?: string; code?: string };
type DocKind = 'Payslip' | 'Form 16' | 'Letter';
export type AlumniPortalScreenProps =
  | { tenant: string; accent?: string; person: AlumniPerson; docs: PortalDoc[]; today: Date; tab?: DocKind; live?: undefined }
  | { accent?: string; tab?: DocKind; live: LiveAlumniPortal };

const isoDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const portalDocs = (docs: LivePortalDoc[]): PortalDoc[] => docs.map((x) => ({ id: x.id, kind: x.kind, title: x.title, period: x.period, issuedOn: isoDate(x.issuedOn) }));
/** The live portals' download, busy state and refusal ("Not downloaded"). */
function useLiveDownload(live: LiveAlumniPortal | undefined) {
  const { busy, error, run } = useRun();
  const onDownload = live ? (id: string) => void run(id, () => live.onDownload(live.docs!.find((x) => x.id === id)!)) : undefined;
  return { busy, error, onDownload };
}
function LiveNotes({ live, error }: { live?: LiveAlumniPortal; error: string | null }) {
  if (!live) return null;
  return (
    <>
      {live.loadError && (
        <InlineAlert tone="warning" title="Some documents did not load">
          {live.loadError}
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="danger" title="Not downloaded">
          {error}
        </InlineAlert>
      )}
    </>
  );
}

/** Alumni: own payslips, Form 16 and letters, read-only, for 7 years from exit (YX-DOC-16). */
export function AlumniPortalScreen(props: AlumniPortalScreenProps) {
  const live = props.live;
  const { busy, error, onDownload } = useLiveDownload(live);
  const tenant = live ? live.company : props.tenant;
  const person: AlumniPerson = live ? { name: live.name, email: live.email, exitDate: isoDate(live.lastDay) } : props.person;
  const docs: PortalDoc[] = live ? portalDocs(live.docs ?? []) : props.docs;
  const today = live ? isoDate(live.today) : props.today;
  const ends = live ? isoDate(live.accessUntil) : alumniAccessEnds(person.exitDate);
  const kinds: DocKind[] = ['Payslip', 'Form 16', 'Letter'];
  const label = { Payslip: 'Payslips', 'Form 16': 'Form 16', Letter: 'Letters' } as const;
  const list = (k: DocKind) => {
    const rows = docs.filter((x) => x.kind === k);
    if (live && !live.docs) return <Skeleton height={120} />;
    return rows.length === 0 ? (
      <EmptyState title={`No ${label[k].toLowerCase()} were issued to you.`} description="If you expected one, ask the HR team; they can publish it here." />
    ) : (
      <DocList docs={rows} busy={busy} onDownload={onDownload} />
    );
  };
  return (
    <TenantPortal
      tenant={tenant}
      portal="Former employee documents"
      accent={props.accent}
      noLanguage={Boolean(live)}
      access={{ kind: 'otp', identity: person.email, endsOn: ends, today, endsBecause: live ? undefined : '7 years after you left' }}
      footer={{ privacy: 'Privacy notice for former employees (G-09)', ...(live ? { hrefs: LEGAL_LINKS } : {}) }}
      onSignOut={live?.onSignOut}
    >
      <section className="yx-ps-hero">
        <h1>Your documents from {tenant}</h1>
        <p>
          {[person.lastRole, person.code, `left on ${formatDate(person.exitDate)}`].filter(Boolean).join(' · ')}. You can view and download these, but not change them.
        </p>
      </section>
      <LiveNotes live={live} error={error} />
      <Tabs defaultValue={props.tab?.replace(/\s+/g, '-') ?? 'Payslip'}>
        <TabsList aria-label="Document type">
          {kinds.map((k) => (
            <TabsTrigger key={k} value={k.replace(/\s+/g, '-')} count={docs.filter((x) => x.kind === k).length}>
              {label[k]}
            </TabsTrigger>
          ))}
        </TabsList>
        {kinds.map((k) => (
          <TabsContent key={k} value={k.replace(/\s+/g, '-')}>
            {list(k)}
          </TabsContent>
        ))}
      </Tabs>
      <p className="yx-ps-muted">
        Need a document that isn't here, like a salary certificate for a loan? {live ? 'Ask the HR team.' : <Link href="#">Ask the HR team</Link>}
      </p>
    </TenantPortal>
  );
}

function DocList({ docs, busy, onDownload }: { docs: PortalDoc[]; busy?: string | null; onDownload?: (id: string) => void }) {
  const groups = Array.from(new Set(docs.map((x) => x.period ?? '')));
  return (
    <div className="yx-ps-stack">
      {groups.map((g) => (
        <Card key={g || 'all'} title={g || undefined}>
          <ul className="yx-ps-list">
            {docs
              .filter((x) => (x.period ?? '') === g)
              .map((x) => (
                <li key={x.id}>
                  <Icon icon={FileText} />
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">{x.title}</span>
                    <span className="yx-ps-list__meta">
                      Issued {formatDate(x.issuedOn)} · PDF{x.size ? ` · ${x.size}` : ''}
                    </span>
                  </div>
                  {x.status === 'pending' ? (
                    <Badge tone="warning">HR is preparing this</Badge>
                  ) : (
                    <Button size="sm" icon={Download} loading={busy === x.id} onClick={onDownload ? () => onDownload(x.id) : undefined}>
                      Download
                    </Button>
                  )}
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** Nominee or legal heir: only the claim documents HR releases (YX-DOC-19). */
export type NomineePortalScreenProps =
  | {
      tenant: string;
      accent?: string;
      nominee: { name: string; relation: string; email: string };
      deceased: { name: string; code: string; role: string; dateOfDeath: Date };
      docs: PortalDoc[];
      fnf: { label: string; amount: number }[];
      today: Date;
      claimsClosed?: boolean;
      live?: undefined;
    }
  | { accent?: string; live: LiveAlumniPortal };

export function NomineePortalScreen(props: NomineePortalScreenProps) {
  const { busy, error, onDownload } = useLiveDownload(props.live);
  if (props.live) {
    // Live (YX-DOC-19): the documents HR released to the nominee; the settlement and filing notes are not in the API yet.
    const live = props.live;
    return (
      <TenantPortal
        tenant={live.company}
        portal="Nominee claim documents"
        accent={props.accent}
        noLanguage
        access={{ kind: 'otp', identity: live.email, endsOn: isoDate(live.accessUntil), today: isoDate(live.today), endsBecause: 'or when HR closes the claims' }}
        footer={{ privacy: 'Privacy notice for nominees (G-09)', hrefs: LEGAL_LINKS }}
        onSignOut={live.onSignOut}
      >
        <section className="yx-ps-hero">
          <h1>Documents for {live.name}'s claims</h1>
          <p>We are sorry for your loss. {live.company} has released these documents to you as nominee, so you can file claims with the EPFO and the insurer.</p>
        </section>
        <LiveNotes live={live} error={error} />
        {!live.docs ? (
          <Skeleton height={120} />
        ) : live.docs.length === 0 ? (
          <EmptyState title="No documents are released to you yet." description="HR releases each one here when it is ready." />
        ) : (
          <DocList docs={portalDocs(live.docs)} busy={busy} onDownload={onDownload} />
        )}
      </TenantPortal>
    );
  }
  const { tenant, accent, nominee, deceased, docs, fnf, today, claimsClosed } = props;
  const net = fnf.reduce((a, l) => a + l.amount, 0);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Nominee claim documents"
      accent={accent}
      access={
        claimsClosed
          ? { kind: 'otp', identity: nominee.email, endsOn: today, today: new Date(today.getTime() + 86_400_000) }
          : { kind: 'otp', identity: nominee.email, endsOn: new Date(2033, 7, 3), today, endsBecause: 'or when HR closes the claims' }
      }
      footer={{ privacy: 'Privacy notice for nominees (G-09)' }}
    >
      <section className="yx-ps-hero">
        <h1>Documents for {deceased.name}'s claims</h1>
        <p>
          We are sorry for your loss. {tenant} has released these documents to you as {nominee.relation.toLowerCase()} and nominee, so you can file claims with the
          EPFO and the insurer.
        </p>
      </section>
      {claimsClosed ? (
        <InlineAlert tone="info" title="All claims are settled">
          HR closed the claims on {formatDate(today)}, so this page has closed. If you still need a copy of a document, contact the HR team.
        </InlineAlert>
      ) : (
        <div className="yx-split">
          <div className="yx-split__main">
            <DocList docs={docs} />
          </div>
          <div className="yx-split__aside">
            <Card title="Full and final settlement">
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Settlement lines, scrolls sideways on small screens">
              <table className="yx-ps-slabgrid">
                <caption className="yx-visually-hidden">Settlement lines</caption>
                <tbody>
                  {fnf.map((l) => (
                    <tr key={l.label}>
                      <th scope="row">{l.label}</th>
                      <td data-num>{formatINR(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Paid to the nominee's account</th>
                    <td data-num>
                      <strong>{formatINR(net)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
              <p className="yx-ps-muted">Paid on 22 Sep 2026 to the account in the nomination form.</p>
            </Card>
            <Card title="How to file">
              <ol className="yx-ps-stack">
                <li>Download the three EPFO forms; the employer part is already attested.</li>
                <li>File them on the EPFO portal or at the Hosur regional office.</li>
                <li>The gratuity form will appear here once HR signs it.</li>
              </ol>
            </Card>
          </div>
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-03 External trainer portal                                       */
/* ================================================================== */

// T9-03
/** External trainer: own sessions only; mark attendance, enter results, see the feedback summary (M07 Q6). */
export function TrainerPortalScreen({
  tenant,
  accent,
  trainer,
  sessions,
  selectedId,
  today,
  accessEnds,
  tab = 'attendance',
}: {
  tenant: string;
  accent?: string;
  trainer: { name: string; firm: string; email: string };
  sessions: TrainerSession[];
  selectedId: string;
  today: Date;
  accessEnds: Date;
  tab?: 'attendance' | 'results' | 'feedback';
}) {
  const [sel, setSel] = useState(selectedId);
  const s = sessions.find((x) => x.id === sel) ?? sessions[0];
  const [rows, setRows] = useState(s.attendees);
  const [saved, setSaved] = useState<string | null>(null);
  const ended = daysUntil(accessEnds, today) < 0;
  const invalidScore = rows.some((r) => r.score != null && (r.score < 0 || r.score > 100));
  const passed = rows.filter((r) => r.score != null && r.score >= s.passMark).length;
  const future = s.status === 'upcoming';
  return (
    <TenantPortal
      tenant={tenant}
      portal="Trainer sessions"
      accent={accent}
      access={{ kind: 'otp', identity: trainer.email, endsOn: accessEnds, today, endsBecause: '14 days after your last session' }}
      footer={{ privacy: 'Privacy notice for external trainers (G-09)' }}
    >
      {ended ? (
        <InlineAlert tone="info" title="Your access has ended">
          Access closes 14 days after your last session. {tenant}'s learning team can reopen it if you have another session.
        </InlineAlert>
      ) : (
        <div className="yx-split">
          <div className="yx-split__main">
            <Card title={s.course} actions={<Badge tone={s.status === 'today' ? 'info' : s.status === 'completed' ? 'success' : 'neutral'}>{s.status === 'today' ? 'Today' : s.status === 'completed' ? 'Completed' : 'Upcoming'}</Badge>}>
              <p className="yx-ps-muted">
                {formatDate(s.date)} · {formatTime(s.time)} · {s.venue} · {s.attendees.length} of {s.seats} seats · pass mark {s.passMark}%
              </p>
            </Card>
            {saved && (
              <InlineAlert tone="success" title={saved}>
                HR can see this now.
              </InlineAlert>
            )}
            <Tabs defaultValue={tab}>
              <TabsList aria-label="Session">
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="feedback">Feedback</TabsTrigger>
              </TabsList>
              <TabsContent value="attendance">
                {future ? (
                  <EmptyState title="Attendance opens on the day of the session." description={`You can mark attendance from ${formatDate(s.date)}.`} />
                ) : (
                  <Card footer={<Button variant="primary" onClick={() => setSaved(`Attendance saved: ${rows.filter((r) => r.present).length} present`)}>Save attendance</Button>}>
                    <ul className="yx-ps-list">
                      {rows.map((r) => (
                        <li key={r.id}>
                          <span className="yx-ps-list__main">{r.name}</span>
                          <Checkbox checked={!!r.present} onChange={(c) => setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, present: c } : x)))} label="Present" />
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="results">
                {s.status !== 'completed' && s.status !== 'today' ? (
                  <EmptyState title="Results open after the session." />
                ) : (
                  <Card
                    footer={
                      <Button variant="primary" disabled={invalidScore} onClick={() => setSaved(`Results saved: ${passed} passed`)}>
                        Save results
                      </Button>
                    }
                  >
                    {invalidScore && (
                      <InlineAlert tone="danger" title="Scores must be between 0 and 100">
                        Fix the highlighted scores before saving.
                      </InlineAlert>
                    )}
                    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Scores, scrolls sideways on small screens">
                    <table className="yx-ps-slabgrid">
                      <caption className="yx-visually-hidden">Scores</caption>
                      <thead>
                        <tr>
                          <th scope="col">Attendee</th>
                          <th scope="col">Score %</th>
                          <th scope="col">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} data-invalid={r.score != null && (r.score < 0 || r.score > 100) ? true : undefined}>
                            <th scope="row">{r.name}</th>
                            <td data-num>
                              {r.present === false ? (
                                'Absent'
                              ) : (
                                <input
                                  aria-label={`${r.name} score`}
                                  inputMode="numeric"
                                  value={r.score ?? ''}
                                  aria-invalid={r.score != null && (r.score < 0 || r.score > 100)}
                                  onChange={(e) => {
                                    const v = e.target.value === '' ? null : Number(e.target.value.replace(/[^\d-]/g, ''));
                                    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, score: v } : x)));
                                  }}
                                />
                              )}
                            </td>
                            <td>{r.present === false ? <Badge>Absent</Badge> : r.score == null ? <Badge>Not entered</Badge> : r.score >= s.passMark ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="feedback">
                {s.feedback ? (
                  <Card title="Feedback summary">
                    <FactRow label="Feedback">
                      <Fact label="Responses" value={`${s.feedback.responses} of ${rows.filter((r) => r.present).length}`} />
                      <Fact label="Average rating" value={`${s.feedback.avg} / 5`} />
                    </FactRow>
                    <ul className="yx-ps-list">
                      {s.feedback.comments.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <p className="yx-ps-muted">Comments are anonymous and shown only when 5 or more people respond.</p>
                  </Card>
                ) : (
                  <EmptyState title="No feedback yet." description="Attendees get the feedback form when the session ends." />
                )}
              </TabsContent>
            </Tabs>
          </div>
          <div className="yx-split__aside">
            <Card title="Your sessions">
              <ul className="yx-ps-list">
                {sessions.map((x) => (
                  <li key={x.id}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">{x.course}</span>
                      <span className="yx-ps-list__meta">
                        {formatDate(x.date)} · {x.attendees.length} attendees
                      </span>
                    </div>
                    <Button
                      size="sm"
                      aria-pressed={x.id === sel}
                      onClick={() => {
                        setSel(x.id);
                        setRows(x.attendees);
                        setSaved(null);
                      }}
                    >
                      {x.id === sel ? 'Open' : 'View'}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
            <p className="yx-ps-muted">You see attendee names only; no other employee details are shared with you.</p>
          </div>
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-04 POSH IC external member + external party                      */
/* ================================================================== */

const IC_STEPS = ['Acknowledged', 'Notice sent', 'Hearing scheduled', 'Inquiry', 'Findings drafted', 'Decision', 'Appeal window'] as const;

// T9-04
/** IC external member: only appointed cases, restricted area, AAL2 (M08 Q4). */
export function IcMemberPortalScreen({
  tenant,
  accent,
  member,
  cases,
  openRef,
  today,
  showUndertaking,
}: {
  tenant: string;
  accent?: string;
  member: { name: string; org: string; tenureEnds: Date };
  cases: IcCase[];
  openRef?: string;
  today: Date;
  showUndertaking?: boolean;
}) {
  const [open, setOpen] = useState(openRef ?? null);
  const c = cases.find((x) => x.ref === open);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Internal Committee · restricted"
      accent={accent}
      access={{ kind: 'otp', identity: member.name, endsOn: member.tenureEnds, today, endsBecause: 'end of your IC tenure' }}
      footer={{ privacy: 'Privacy notice for IC external members (G-09)' }}
    >
      <Dialog
        defaultOpen={showUndertaking}
        title="Confidentiality undertaking"
        description="Read and accept this before you open any case."
        size="md"
        footer={<Button variant="primary">Accept undertaking</Button>}
        preventClose
      >
        <div className="yx-ps-stack">
          <p className="yx-ps-p">
            I will keep the identity of the complainant, respondent and witnesses, and every detail of the inquiry, confidential as required by section 16 of the POSH Act. I
            will not copy, forward or discuss case material outside the committee.
          </p>
          <Checkbox label="I have no conflict of interest with the parties in the cases I am appointed to, and I will declare one if it arises" />
        </div>
      </Dialog>
      {c ? (
        <IcCaseDetail c={c} today={today} onBack={() => setOpen(null)} />
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>Your appointed cases</h1>
            <p>You see only cases {tenant} appointed you to. Messages outside this page only say you have an update on a confidential matter.</p>
          </section>
          {cases.length === 0 ? (
            <EmptyState title="No cases are assigned to you." description="The presiding officer adds you to a case when one is filed." />
          ) : (
            <Card>
              <ul className="yx-ps-list">
                {cases.map((x) => {
                  const left = daysUntil(x.inquiryDue, today);
                  return (
                    <li key={x.ref}>
                      <Icon icon={Lock} />
                      <div className="yx-ps-list__main">
                        <span className="yx-ps-list__title yx-ps-mono">{x.ref}</span>
                        <span className="yx-ps-list__meta">
                          Received {formatDate(x.receivedOn)} · {x.complainantType} complainant · inquiry due {formatDate(x.inquiryDue)}
                        </span>
                      </div>
                      {x.conflict ? (
                        <Badge tone="neutral">Excluded: conflict declared</Badge>
                      ) : (
                        <>
                          <Badge tone={left < 0 ? 'danger' : left <= 14 ? 'warning' : 'info'}>{left < 0 ? `${-left} days past the 90-day limit` : x.stage}</Badge>
                          <Button size="sm" onClick={() => setOpen(x.ref)}>
                            Open
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </TenantPortal>
  );
}

function IcCaseDetail({ c, today, onBack }: { c: IcCase; today: Date; onBack: () => void }) {
  const idx = IC_STEPS.indexOf(c.stage);
  const steps: ApprovalStep[] = IC_STEPS.map((s, i) => ({ id: s, label: s, status: i < idx ? 'done' : i === idx ? 'current' : 'pending' }));
  const [note, setNote] = useState('');
  return (
    <div className="yx-ps-stack">
      <div className="yx-ps-row" data-between>
        <h1 className="yx-ps-h">
          Case <span className="yx-ps-mono">{c.ref}</span>
        </h1>
        <Button onClick={onBack}>Back to cases</Button>
      </div>
      <FactRow label="Case dates">
        <Fact label="Received" value={formatDate(c.receivedOn)} />
        <Fact label="Inquiry must finish by" value={formatDate(c.inquiryDue)} tone={daysUntil(c.inquiryDue, today) < 0 ? 'danger' : undefined} />
        <Fact label="Next hearing" value={c.nextHearing ? `${formatDate(c.nextHearing)}, 3:00 pm` : 'Not set'} />
      </FactRow>
      <div className="yx-split">
        <div className="yx-split__main">
          <Card title="Case documents" actions={<Button size="sm" icon={Upload}>Add document</Button>}>
            <ul className="yx-ps-list">
              {['Complaint (written, 2 pages)', 'Respondent reply', 'Witness statement 1', 'Notice of hearing'].map((x) => (
                <li key={x}>
                  <Icon icon={FileText} />
                  <span className="yx-ps-list__main">{x}</span>
                  <Button variant="review" size="sm">View</Button>
                </li>
              ))}
            </ul>
            <p className="yx-ps-muted">Documents open in the viewer only; download is off for this case. Every view is logged.</p>
          </Card>
          <Card title="Your notes for the committee" footer={<Button variant="primary">Save note</Button>}>
            <FormField label="Note" hideLabel helper="Visible to committee members on this case only.">
              <TextArea value={note} onChange={setNote} rows={4} />
            </FormField>
          </Card>
        </div>
        <div className="yx-split__aside">
          <Card title="Stage">
            <ApprovalTimeline steps={steps} aria-label="Case stages" />
          </Card>
          <Card title="Conflict of interest">
            <p className="yx-ps-muted">If you know either party, declare it. You will be removed from this case and it will not be shown to you again.</p>
            <ConfirmDialog trigger={<Button>Declare a conflict</Button>} title="Declare a conflict on this case?" consequence="The presiding officer is told and you lose access to this case." confirmLabel="Declare conflict" onConfirm={() => undefined} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** External party (contractor, vendor staff, client staff, visitor) filing and following one case (E16). */
export function ExternalPartyCaseScreen({ tenant, accent, today, mode }: { tenant: string; accent?: string; today: Date; mode: 'file' | 'status' }) {
  const [type, setType] = useState<string | null>('Vendor staff');
  const [when, setWhen] = useState<Date | null>(null);
  const [what, setWhat] = useState('');
  const [tried, setTried] = useState(false);
  const late = when ? daysUntil(when, today) < -90 : false;
  return (
    <TenantPortal
      tenant={tenant}
      portal="Confidential complaint"
      accent={accent}
      narrow
      access={{ kind: 'otp', identity: 'priya.menon@example.in', endsOn: new Date(2027, 0, 30), today, endsBecause: 'case closure plus the appeal window' }}
      footer={{ privacy: 'Privacy notice for external parties (G-09)' }}
      pinned={mode === 'file' ? <Button variant="primary" onClick={() => setTried(true)}>Send complaint</Button> : undefined}
    >
      {mode === 'file' ? (
        <>
          <section className="yx-ps-hero">
            <h1>Raise a complaint of sexual harassment</h1>
            <p>This goes only to {tenant}'s Internal Committee. You can follow it here. Updates by email only say you have an update on a confidential matter.</p>
          </section>
          {tried && !what && (
            <InlineAlert tone="danger" title="Describe what happened to send the complaint">
              A few lines is enough; the committee will contact you for more.
            </InlineAlert>
          )}
          <FormField label="You are" required>
            <Select value={type} onChange={setType} options={['Contractor staff', 'Vendor staff', 'Client staff', 'Visitor', 'Other'].map((x) => ({ value: x, label: x }))} />
          </FormField>
          <FieldRow>
            <FormField label="Your employer" required>
              <TextField defaultValue="Sri Lakshmi Logistics" />
            </FormField>
            <FormField label="When did it happen" required helper="Complaints are normally filed within 3 months; the committee can extend this by 3 months with reasons.">
              <DatePicker value={when} onChange={setWhen} max={today} />
            </FormField>
          </FieldRow>
          {late && <BlockNote>This date is more than 3 months ago. You can still send it; add why it is being raised now.</BlockNote>}
          <FormField label="What happened" required error={tried && !what ? 'Describe what happened.' : null}>
            <TextArea value={what} onChange={setWhat} rows={6} />
          </FormField>
          <FormField label="Supporting documents" optional>
            <FileUpload upload={fakeUpload} accept={['.pdf', '.jpg', '.png', '.mp3']} />
          </FormField>
        </>
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>
              Your complaint <span className="yx-ps-mono">POSH-2026-009</span>
            </h1>
            <p>Filed on 9 Sep 2026. The inquiry must finish within 90 days.</p>
          </section>
          <Card title="Progress">
            <ApprovalTimeline
              aria-label="Complaint progress"
              steps={[
                { id: '1', label: 'Filed', status: 'done', at: new Date(2026, 8, 9, 18, 5) },
                { id: '2', label: 'Acknowledged by the committee', status: 'done', at: new Date(2026, 8, 11, 10, 30) },
                { id: '3', label: 'Notice sent to the respondent and their employer', status: 'done', at: new Date(2026, 8, 16, 12, 0) },
                { id: '4', label: 'Hearing', status: 'current', comment: 'The committee will write to you with a date.' },
                { id: '5', label: 'Findings and decision', status: 'pending' },
              ]}
            />
          </Card>
          <Card title="Message the committee" footer={<Button variant="primary" icon={Send}>Send message</Button>}>
            <FormField label="Message" hideLabel>
              <TextArea rows={3} />
            </FormField>
          </Card>
        </>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-05 Audit-committee chair portal                                  */
/* ================================================================== */

// T9-05
/** Whistleblower outcomes routed to the chair; acknowledge in 7 days, feedback in 3 months where the law applies (YX-CASE-17). */
export function AuditChairPortalScreen({
  tenant,
  accent,
  chair,
  cases,
  today,
  openRef,
}: {
  tenant: string;
  accent?: string;
  chair: { name: string; role: string };
  cases: WbCase[];
  today: Date;
  openRef?: string;
}) {
  const [open, setOpen] = useState(openRef ?? null);
  const c = cases.find((x) => x.ref === open);
  const active = cases.filter((x) => x.status !== 'Closed');
  const ackLate = active.filter((x) => x.status === 'Awaiting acknowledgement' && daysUntil(x.ackDue, today) <= 2);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Audit committee · whistleblower cases"
      accent={accent}
      access={{ kind: 'otp', identity: chair.name, endsOn: new Date(2028, 2, 31), today, endsBecause: 'end of your tenure' }}
      footer={{ privacy: 'Privacy notice for the audit-committee chair (G-09)' }}
    >
      {c ? (
        <div className="yx-ps-stack">
          <div className="yx-ps-row" data-between>
            <h1 className="yx-ps-h">
              <span className="yx-ps-mono">{c.ref}</span> · {c.category}
            </h1>
            <Button onClick={() => setOpen(null)}>Back to cases</Button>
          </div>
          {c.retaliation && (
            <InlineAlert tone="danger" title="Retaliation flagged">
              The reporter says they were moved off a key account after reporting. The ethics officer has put a protection order in place.
            </InlineAlert>
          )}
          <FactRow label="Deadlines">
            <Fact label="Acknowledge by" value={formatDate(c.ackDue)} />
            <Fact label="Feedback to reporter by" value={formatDate(c.feedbackDue)} tone={daysUntil(c.feedbackDue, today) <= 30 ? 'warning' : undefined} />
            <Fact label="Investigated by" value={c.investigator} />
          </FactRow>
          <Card title="Outcome from the investigation">
            <DescriptionList
              items={[
                { label: 'Finding', value: 'Substantiated in part. Two purchase orders were split to stay under the approval limit.' },
                { label: 'People involved', value: 'One manager in procurement (name held by the ethics officer)' },
                { label: 'Proposed action', value: 'Final warning, recovery of ₹2,40,000, procurement approval rules tightened' },
                { label: 'Evidence', value: '14 documents, 3 interviews' },
              ]}
            />
          </Card>
          <Card
            title="Your decision"
            footer={
              <>
                <Button>Ask for more information</Button>
                <Button variant="primary">Accept outcome and close</Button>
              </>
            }
          >
            <FormField label="Note to the ethics officer" optional>
              <TextArea rows={3} />
            </FormField>
          </Card>
        </div>
      ) : (
        <>
          <section className="yx-ps-hero">
            <h1>Cases routed to you</h1>
            <p>Serious cases by category or value come to the chair. HR is not a member of this group and cannot see these cases.</p>
          </section>
          {ackLate.length > 0 && (
            <InlineAlert tone="warning" title={`${ackLate.length} case needs acknowledgement within 2 days`}>
              The law requires an acknowledgement within 7 days of the report.
            </InlineAlert>
          )}
          {active.length === 0 ? (
            <EmptyState title="No open cases." description="You will get an email when a case is routed to the committee." />
          ) : (
            <Card>
              <ul className="yx-ps-list">
                {cases.map((x) => (
                  <li key={x.ref}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">
                        <span className="yx-ps-mono">{x.ref}</span> · {x.category}
                      </span>
                      <span className="yx-ps-list__meta">
                        {x.severity} · received {formatDate(x.receivedOn)} · feedback due {formatDate(x.feedbackDue)}
                        {x.retaliation ? ' · retaliation flagged' : ''}
                      </span>
                    </div>
                    <Badge tone={x.status === 'Closed' ? 'neutral' : x.status === 'Outcome ready' ? 'info' : x.status === 'Awaiting acknowledgement' ? 'warning' : 'neutral'}>{x.status}</Badge>
                    {x.status === 'Awaiting acknowledgement' ? (
                      <Button size="sm">Acknowledge</Button>
                    ) : (
                      <Button size="sm" onClick={() => setOpen(x.ref)}>
                        Open
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-07 Anonymous reporter case page                                  */
/* ================================================================== */

export interface AnonMessage {
  id: string;
  from: 'me' | 'desk';
  at: Date;
  text: string;
}

export type AnonStage = 'enter-code' | 'code-shown' | 'case' | 'wrong-code' | 'closed';

// T9-07
/** No login: the case access code is shown once at filing; status and two-way messages with it (YX-CASE-11). */
export function AnonymousCaseScreen({
  tenant,
  accent,
  stage: initial,
  caseInfo,
}: {
  tenant: string;
  accent?: string;
  stage: AnonStage;
  caseInfo: { ref: string; code: string; category: string; filedOn: Date; status: string; messages: AnonMessage[] };
}) {
  const [stage, setStage] = useState(initial);
  const [code, setCode] = useState(initial === 'wrong-code' ? 'K7QM-4TZ8-XR2P-9HDV' : '');
  const [saved, setSaved] = useState(false);
  const [reply, setReply] = useState('');
  const [messages, setMessages] = useState(caseInfo.messages);
  return (
    <TenantPortal
      tenant={tenant}
      portal="Speak up · anonymous report"
      accent={accent}
      narrow
      access={{ kind: 'access-code' }}
      footer={{ privacy: 'Anonymous reporter notice (G-10)', cookies: true }}
    >
      {stage === 'code-shown' && (
        <div className="yx-ps-stack">
          <InlineAlert tone="success" title="Your report was sent">
            Reference {caseInfo.ref}. The ethics desk will reply here, usually within 7 days.
          </InlineAlert>
          <Card title="Save your access code now">
            <div className="yx-ps-stack yx-ps-center">
              <p className="yx-ps-p">This is the only way back to your report. We show it once and we cannot recover it; we don't know who you are.</p>
              <span className="yx-ps-kbd-code">{caseInfo.code}</span>
              <div className="yx-ps-row">
                <Button icon={Download}>Download as text file</Button>
                <Button>Copy code</Button>
              </div>
              <Checkbox checked={saved} onChange={setSaved} label="I have saved my access code" />
              <Button variant="primary" disabled={!saved} onClick={() => setStage('case')}>
                Go to my report
              </Button>
            </div>
          </Card>
        </div>
      )}
      {(stage === 'enter-code' || stage === 'wrong-code') && (
        <div className="yx-signin">
          <div className="yx-signin__head">
            <h2 className="yx-signin__title">Check your anonymous report</h2>
            <p className="yx-signin__intro">Enter the 16-character access code you saved when you filed the report.</p>
          </div>
          <FormField label="Access code" required error={stage === 'wrong-code' ? "That code didn't match a report. Check each character; after 5 wrong tries you'll need to wait 15 minutes." : null}>
            <TextField value={code} onChange={(v) => setCode(formatAccessCode(v))} className="yx-ps-mono" placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" />
          </FormField>
          <Button variant="primary" fullWidth disabled={!isCompleteAccessCode(code)} onClick={() => setStage(code === caseInfo.code ? 'case' : 'wrong-code')}>
            Open report
          </Button>
          <p className="yx-signin__fine">
            Lost your code? It can't be recovered. <Link href="#">File a follow-up report</Link> and mention your earlier report's month and topic so the desk can link them.
          </p>
        </div>
      )}
      {(stage === 'case' || stage === 'closed') && (
        <div className="yx-ps-stack">
          <section className="yx-ps-hero">
            <h1>
              Report <span className="yx-ps-mono">{caseInfo.ref}</span>
            </h1>
            <p>
              {caseInfo.category} · filed {formatDate(caseInfo.filedOn)}
            </p>
          </section>
          <div className="yx-ps-row">
            <span>Status</span>
            <Badge tone={stage === 'closed' ? 'neutral' : 'info'}>{stage === 'closed' ? 'Closed' : caseInfo.status}</Badge>
          </div>
          <div className="yx-ps-chatlog" aria-live="polite" aria-label="Messages">
            {messages.map((m) => (
              <div key={m.id} className="yx-ps-bubble" data-from={m.from}>
                <span className="yx-ps-bubble__meta">
                  {m.from === 'me' ? 'You' : 'Ethics desk'} · {formatDate(m.at)}
                </span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          {stage === 'closed' ? (
            <InlineAlert tone="info" title="This report is closed">
              The desk closed it on 28 Sep 2026 after corrective action. You can no longer send messages. File a new report if the issue comes back.
            </InlineAlert>
          ) : (
            <Card
              title="Reply to the ethics desk"
              footer={
                <Button
                  variant="primary"
                  icon={Send}
                  disabled={!reply.trim()}
                  onClick={() => {
                    setMessages((xs) => [...xs, { id: `m${xs.length + 1}`, from: 'me', at: caseInfo.filedOn, text: reply }]);
                    setReply('');
                  }}
                >
                  Send reply
                </Button>
              }
            >
              <FormField label="Your reply" hideLabel helper="Don't include your name or anything that identifies you unless you choose to.">
                <TextArea value={reply} onChange={setReply} rows={3} />
              </FormField>
            </Card>
          )}
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-08 Public verify page                                            */
/* ================================================================== */

// T9-08
/** The live verify page (YX-DOC-11): the server checks the 10-letter code printed on a pay document. */
export interface LiveVerifyPage {
  onCheck: (code: string) => Promise<PayVerifyResult>;
}
const LIVE_CODE = /^[A-Za-z2-9]{10}$/;

/** Public verify page: only company, letter type, name, issue date and current / superseded (P05 Q5). */
export function VerifyPageScreen({ tenant, accent, docs, code: initialCode, live }: { tenant: string; accent?: string; docs: VerifiableDoc[]; code: string; live?: LiveVerifyPage }) {
  const [input, setInput] = useState(initialCode);
  const [code, setCode] = useState(initialCode);
  const sample = useMemo(() => verifyDocument(code, docs), [code, docs]);
  const [checked, setChecked] = useState<DocVerifyResult | null>(null);
  const { busy, error, run } = useRun();
  const early = useTooEarly(live && !LIVE_CODE.test(input.trim()) ? [{ fieldId: 'vf-code', message: 'Enter the 10-letter code printed on the document.' }] : []);
  const check = (c: string) =>
    run('check', async () => {
      setChecked(null);
      const r = await live!.onCheck(c);
      setChecked({ state: r.status, doc: { code: c, company: r.company, type: r.kind, name: r.name, issuedOn: new Date(`${r.issuedOn.slice(0, 10)}T00:00:00`), status: r.status === 'current' ? 'issued' : 'superseded' } });
    });
  // Scanning the QR code opens this page with the code: the answer shows at once, as in the design.
  useEffect(() => {
    if (live && LIVE_CODE.test(initialCode.trim())) void check(initialCode.trim().toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const result = live ? checked : code ? sample : null;
  return (
    <TenantPortal tenant={tenant} portal="Verify a document" accent={accent} narrow noLanguage={Boolean(live)} access={{ kind: 'public' }} footer={{ privacy: 'Privacy notice (G-05)', cookies: true, ...(live ? { hrefs: LEGAL_LINKS } : {}) }}>
      <section className="yx-ps-hero">
        <h1>Verify a letter or certificate</h1>
        <p>{live ? 'Scan the QR code on the document, or type the 10-letter code printed at its foot.' : 'Scan the QR code on the document, or type the verification code printed under it.'}</p>
      </section>
      <div className="yx-ps-row">
        <FormField id="vf-code" label="Verification code" error={early.errorOf('vf-code')}>
          <TextField value={input} onChange={setInput} className="yx-ps-mono" placeholder={live ? undefined : 'KF-VRF-XXXX-XXXX'} autoComplete="off" spellCheck={false} />
        </FormField>
      </div>
      <div className="yx-ps-row">
        <Button variant="primary" loading={busy === 'check'} onClick={() => (live ? !early.stop() && void check(input.trim().toUpperCase()) : setCode(input))}>
          Verify
        </Button>
      </div>
      {live && error && (
        <InlineAlert tone="danger" title="We couldn't verify this code">
          {error}
        </InlineAlert>
      )}
      {result &&
        (result.state === 'not-found' ? (
          <InlineAlert tone="danger" title="We couldn't verify this code">
            No current or past document from {tenant} has this code. Check the code, or ask the person to request a fresh copy from {tenant}.
          </InlineAlert>
        ) : (
          <Card
            title={result.state === 'current' ? 'This document is genuine and current' : 'This document was replaced by a newer version'}
            actions={<Badge tone={result.state === 'current' ? 'success' : 'warning'}>{result.state === 'current' ? 'Current' : 'Superseded'}</Badge>}
          >
            <div className="yx-ps-pass">
              <QrCode value={result.doc.code} size={120} label={`QR code for ${result.doc.code}`} />
              <DescriptionList
                items={[
                  { label: 'Company', value: result.doc.company },
                  { label: 'Document', value: result.doc.type },
                  { label: 'Issued to', value: result.doc.name },
                  { label: 'Issued on', value: formatDate(result.doc.issuedOn) },
                  ...(result.doc.supersededOn ? [{ label: 'Replaced on', value: formatDate(result.doc.supersededOn) }] : []),
                  { label: 'Code', value: result.doc.code, mono: true },
                ]}
              />
            </div>
            <p className="yx-ps-muted">For privacy we show only these details. Salary and other contents are never shown here.</p>
          </Card>
        ))}
    </TenantPortal>
  );
}

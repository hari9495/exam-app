import { useState } from 'react';
import { Check, Download, ExternalLink, Mail, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField, TimeField } from '../../components/inputs';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { dayKey } from '../../lib/dates';
import { formatDate, formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { useToastIfAny } from '../../components/notify';
import { dateText } from '../time/live/kit';
import { EmailDialog } from './candidate-dialogs';
import { RejectDialog } from './pipeline-sheets';
import type { ApplicationView, Choice, EmailCompose, EmailTemplateChoice, RejectInput, ScheduleInput } from './live/types';

// HIR-05 Application (founder answer 261, 10 Nov 2026): one application, opened on the candidate record (a card on the
// HIR-04 board opens the record with it). Tests and fit, messages, notes, the checklist, the owner and offers (HIR-09:
// the tab lists them and opens the offer builder and record). Interviews moved out (answer 301): Schedule interview is on the record's header (answer 274),
// each interview opens the HIR-07 scorecard page (resend and cancel there), and HIR-06 is the calendar.

const day = (iso: string) => dateText(iso.slice(0, 10));
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
/** Why SMS or WhatsApp is not offered. */
const noText = (a: { phone: string | null; smsOptedOut: boolean; whatsappOptedOut: boolean }) =>
  !a.phone ? 'No mobile number: no SMS or WhatsApp.' : `${[a.smsOptedOut ? 'SMS' : null, a.whatsappOptedOut ? 'WhatsApp' : null].filter(Boolean).join(' and ')}: opted out.`;
/** Offers still in play: one at a time per application (the API refuses a second). */
const OPEN_OFFER = ['draft', 'pending_approval', 'approved', 'sent', 'accepted'];
const OFFER_LABEL: Record<string, string> = { draft: 'Draft', pending_approval: 'Waiting for approval', approved: 'Approved', rejected: 'Not approved', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn', expired: 'Expired' };

export interface ApplicationDrawerProps {
  open: boolean;
  onClose: () => void;
  app: ApplicationView | null;
  loading?: boolean;
  canManage: boolean;
  statuses: Choice[];
  people: Choice[];
  templates: EmailTemplateChoice[];
  senders: Choice[];
  smsTemplates: EmailTemplateChoice[];
  whatsappTemplates: EmailTemplateChoice[];
  surveys: Choice[];
  /** Opens the full record (when the drawer is shown somewhere else). */
  onOpenProfile?: () => void;
  onStatus: (statusId: string) => Promise<unknown>;
  onReject: (input: RejectInput) => Promise<unknown>;
  onUndo: () => Promise<unknown>;
  onAssign: (userId: string | null) => Promise<unknown>;
  onChecklist: (itemId: string, done: boolean) => Promise<unknown>;
  onScoreFit?: () => Promise<unknown>;
  onResume: () => Promise<unknown>;
  onEmail: (c: EmailCompose) => Promise<unknown>;
  onSms: (body: string, templateId: string | null) => Promise<unknown>;
  onWhatsapp: (body: string, templateId: string | null) => Promise<unknown>;
  onResend: (channel: 'email' | 'sms' | 'whatsapp', id: string) => Promise<unknown>;
  onNote: (note: string, rating: number | null) => Promise<unknown>;
  onSurvey: (surveyId: string) => Promise<unknown>;
  /** HIR-09: a new offer opens the offer builder; an offer opens its record (approval, letter, versions, conditions). */
  onNewOffer: () => void;
  onOpenOffer: (offerId: string) => void;
}

export function ApplicationDrawer(p: ApplicationDrawerProps) {
  const a = p.app;
  const toast = useToastIfAny();
  const { busy, error, run: run0 } = useRun();
  const DONE: Record<string, string> = { undo: 'Rejection undone', status: 'Stage changed', fit: 'Fit scoring started', check: 'Checklist saved', assign: 'Owner saved', resend: 'Sent again', cancel: 'Cancelled', survey: 'Survey sent', };
  // Success is a toast (5 s); a failure stays in the drawer's notice.
  const run = (key: string, fn: () => Promise<unknown>) =>
    run0(key, async () => {
      await fn();
      if (DONE[key]) toast?.toast({ tone: 'success', title: DONE[key]! });
    });
  const told = (title: string) => () => void toast?.toast({ tone: 'success', title });
  const [rejecting, setRejecting] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [texting, setTexting] = useState<'sms' | 'whatsapp' | null>(null);
  const [noting, setNoting] = useState(false);
  return (
    <Drawer
      open={p.open}
      onOpenChange={(o) => !o && p.onClose()}
      size="lg"
      title={a?.name ?? 'Candidate'}
      subtitle={a ? [a.email, a.phone].filter(Boolean).join(' · ') : undefined}
      meta={a && <Badge tone={a.category === 'rejected' ? 'danger' : a.category === 'hired' ? 'success' : 'info'}>{a.stageName}</Badge>}
      notice={error ? <InlineAlert tone="danger" title="Not done">{error}</InlineAlert> : undefined}
    >
      {!a ? (
        <Text as="p" tone="secondary">{p.loading ? 'Loading…' : 'Not found.'}</Text>
      ) : (
        <div className="yx-hire-stack">
          {a.rejectionPendingUntil && (
            <InlineAlert tone="info" title="Rejected">
              The message goes at {when(a.rejectionPendingUntil)}. {p.canManage && <Button size="sm" onClick={() => void run('undo', p.onUndo)}>Undo rejection</Button>}
            </InlineAlert>
          )}
          <div className="yx-hire-actions">
            {p.onOpenProfile && <Button size="sm" icon={ExternalLink} onClick={p.onOpenProfile}>Full profile</Button>}
            {p.canManage && a.category !== 'rejected' && <Button size="sm" variant="danger" onClick={() => setRejecting(true)}>Reject</Button>}
          </div>
          {p.canManage && (
            <FormField id="ap-status" label="Stage">
              <Select aria-label="Stage" value={a.statusId} onChange={(v) => v && void run('status', () => p.onStatus(v))} options={p.statuses} />
            </FormField>
          )}
          <Tabs defaultValue="overview">
            <TabsList aria-label="Application sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="messages" count={a.emails.length + a.sms.length + a.whatsapp.length}>Messages</TabsTrigger>
              <TabsTrigger value="notes" count={a.notes.length}>Notes</TabsTrigger>
              <TabsTrigger value="offers" count={a.offers.length}>Offers</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="yx-hire-stack">
                <Card title="Résumé">
                  {a.resume ? (
                    <>
                      {a.resume.title && <Text as="p" weight="semibold">{a.resume.title}</Text>}
                      {a.resume.summary && <Text as="p">{a.resume.summary}</Text>}
                      {a.resume.skills.length > 0 && <div className="yx-hire-actions">{a.resume.skills.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}</div>}
                      {a.resume.hasFile && <div><Button size="sm" icon={Download} onClick={() => void run('resume', p.onResume)}>Open the résumé</Button></div>}
                    </>
                  ) : (
                    <Text as="p" tone="secondary">No résumé on file.</Text>
                  )}
                </Card>
                <Card title="Tests">
                  {a.tests.length === 0 && <Text as="p" tone="secondary">No linked tests yet.</Text>}
                  {a.tests.map((t) => (
                    <Text as="p" key={t.examId}>{t.title}: {t.score != null ? `${t.score}%` : t.status}{t.passFail ? ` · ${t.passFail === 'pass' ? 'passed' : 'not passed'}` : ''}</Text>
                  ))}
                </Card>
                <Card title="Fit">
                  {a.fit?.score != null ? (
                    <Text as="p">Fit score {a.fit.score}{a.fit.stale ? ' (the criteria changed since)' : ''}. {a.fit.summary ?? ''}</Text>
                  ) : (
                    <Text as="p" tone="secondary">{a.fit?.status === 'pending' ? 'Scoring…' : 'Not scored yet.'}</Text>
                  )}
                  {p.onScoreFit && p.canManage && <div><Button size="sm" icon={Sparkles} loading={busy === 'fit'} onClick={() => void run('fit', p.onScoreFit!)}>Score fit</Button></div>}
                </Card>
                {a.alternativeRequestedAt && (
                  <InlineAlert tone="info" title="Asked for another process">
                    On {formatDate(new Date(a.alternativeRequestedAt))} this candidate asked not to be assessed by the automated tool (New York City notice). The AI draft scorecard is not used for them; assess them another way.
                  </InlineAlert>
                )}
                {a.currentPay != null && (
                  <Card title="Pay history">
                    <DescriptionList items={[{ label: 'Current pay, given when applying', value: `${formatINR(a.currentPay)} a year` }]} />
                    <Text as="p" size="sm" tone="secondary">Shown only to people allowed to see offer pay.</Text>
                  </Card>
                )}
                {a.checklist.length > 0 && (
                  <Card title="Checklist">
                    {p.canManage
                      ? a.checklist.map((c) => <Checkbox key={c.id} label={c.label} checked={c.done} onChange={(v) => void run('check', () => p.onChecklist(c.id, v))} />)
                      : <DescriptionList items={a.checklist.map((c) => ({ label: c.label, value: c.done ? 'Done' : 'Not done' }))} />}
                  </Card>
                )}
                <Card title="Details">
                  {p.canManage ? (
                    <FormField id="ap-owner" label="Owner">
                      <Select aria-label="Owner" value={a.assignee} placeholder="Nobody" onChange={(v) => void run('assign', () => p.onAssign(v))} options={p.people} searchable clearable />
                    </FormField>
                  ) : (
                    <DescriptionList items={[{ label: 'Owner', value: p.people.find((x) => x.value === a.assignee)?.label ?? 'Nobody' }]} />
                  )}
                  {a.customFields.length > 0 && <DescriptionList items={a.customFields.map((f) => ({ label: f.label, value: f.value }))} />}
                  {a.rejectedReason && <Text as="p" tone="secondary">Rejected: {a.rejectedReason}</Text>}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="messages">
              <div className="yx-hire-stack">
                {p.canManage && (
                  <div className="yx-hire-actions">
                    <Button size="sm" icon={Mail} onClick={() => setEmailing(true)}>Email</Button>
                    {!a.smsOptedOut && a.phone && <Button size="sm" icon={MessageSquare} onClick={() => setTexting('sms')}>SMS</Button>}
                    {!a.whatsappOptedOut && a.phone && <Button size="sm" icon={MessageSquare} onClick={() => setTexting('whatsapp')}>WhatsApp</Button>}
                    {(!a.phone || a.smsOptedOut || a.whatsappOptedOut) && <Text size="sm" tone="secondary">{noText(a)}</Text>}
                    {p.surveys.length > 0 && <SurveyButton surveys={p.surveys} onSend={(id) => run('survey', () => p.onSurvey(id))} />}
                  </div>
                )}
                {[...a.emails.map((m) => ({ ...m, channel: 'email' as const, text: m.subject })), ...a.sms.map((m) => ({ ...m, channel: 'sms' as const, text: m.body })), ...a.whatsapp.map((m) => ({ ...m, channel: 'whatsapp' as const, text: m.body }))]
                  .sort((x, y) => y.at.localeCompare(x.at))
                  .map((m) => (
                    <div key={`${m.channel}-${m.id}`} className="yx-hire-actions">
                      <Badge tone="neutral">{m.channel === 'email' ? 'Email' : m.channel === 'sms' ? 'SMS' : 'WhatsApp'}</Badge>
                      <Text>{day(m.at)} · {m.text}</Text>
                      {m.status === 'failed' && p.canManage && <Button size="sm" onClick={() => void run('resend', () => p.onResend(m.channel, m.id))}>Send again</Button>}
                    </div>
                  ))}
                {a.emails.length + a.sms.length + a.whatsapp.length === 0 && <EmptyState compact title="No messages yet." />}
              </div>
            </TabsContent>

            <TabsContent value="notes">
              <div className="yx-hire-stack">
                <div><Button size="sm" icon={Plus} onClick={() => setNoting(true)}>Add a note</Button></div>
                {a.notes.length === 0 && <EmptyState compact title="No notes yet." />}
                {a.notes.map((n) => (
                  <Card key={n.id} title={`${n.author} · ${day(n.at)}`}>
                    {n.rating != null && <Text as="p" tone="secondary">Rating {n.rating} of 5</Text>}
                    {n.note && <Text as="p">{n.note}</Text>}
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="offers">
              <div className="yx-hire-stack">
                {p.canManage && !a.offers.some((o) => OPEN_OFFER.includes(o.status)) && <div><Button size="sm" icon={Plus} onClick={p.onNewOffer}>Create an offer</Button></div>}
                {a.offers.length === 0 && <EmptyState compact title="No offers yet." />}
                {a.offers.map((o) => (
                  <Card key={o.id} title={o.compensation ?? 'Offer'}>
                    <Text as="p">{OFFER_LABEL[o.status] ?? o.status} · starts {day(o.startDate)} · answer by {day(o.expiresAt)}</Text>
                    <div className="yx-hire-actions">
                      <Button size="sm" icon={ExternalLink} onClick={() => p.onOpenOffer(o.id)}>Open offer</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {rejecting && <RejectDialog count={1} templates={p.templates} onClose={() => setRejecting(false)} onReject={async (i) => { await p.onReject(i); told('Candidate rejected')(); }} />}
          {emailing && <EmailDialog count={1} templates={p.templates} senders={p.senders} onClose={() => setEmailing(false)} onSend={async (c) => { await p.onEmail(c); told('Email on its way')(); }} />}
          {texting && <TextDialog channel={texting} templates={texting === 'sms' ? p.smsTemplates : p.whatsappTemplates} onClose={() => setTexting(null)} onSend={(b, t) => (texting === 'sms' ? p.onSms(b, t) : p.onWhatsapp(b, t)).then(told(texting === 'sms' ? 'SMS sent' : 'WhatsApp message sent'))} />}
          {noting && <NoteDialog onClose={() => setNoting(false)} onSave={(n, r) => p.onNote(n, r).then(told('Note added'))} />}
        </div>
      )}
    </Drawer>
  );
}

function SurveyButton(p: { surveys: Choice[]; onSend: (id: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => { setTried(false); setOpen(true); }}>Send a survey</Button>
      {open && (
        <ConfirmDialog open onOpenChange={(o) => !o && setOpen(false)} title="Send a survey" confirmLabel="Send survey" onConfirm={async () => { setTried(true); if (!v) return false; await p.onSend(v); setOpen(false); }}>
          <FormField id="ap-survey" label="Survey" required error={tried && !v ? 'Choose a survey.' : null}>
            <Select aria-label="Survey" value={v} onChange={setV} options={p.surveys} />
          </FormField>
        </ConfirmDialog>
      )}
    </>
  );
}

function TextDialog(p: { channel: 'sms' | 'whatsapp'; templates: EmailTemplateChoice[]; onClose: () => void; onSend: (body: string, templateId: string | null) => Promise<unknown> }) {
  const [tpl, setTpl] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title={p.channel === 'sms' ? 'Send an SMS' : 'Send a WhatsApp message'} confirmLabel="Send" onConfirm={async () => { setTried(true); if (!body.trim()) return false; await p.onSend(body.trim(), tpl && !tpl.startsWith('default-') ? tpl : null); p.onClose(); }}>
      <FormField id="tx-tpl" label="Template" optional>
        <Select aria-label="Template" value={tpl} onChange={(v) => { setTpl(v); const t = p.templates.find((x) => x.value === v); if (t) setBody(t.body); }} options={p.templates.map((t) => ({ value: t.value, label: t.label }))} clearable />
      </FormField>
      <FormField id="tx-body" label="Message" required error={tried && !body.trim() ? 'Enter a message.' : null}>
        <TextArea value={body} onChange={setBody} rows={4} maxLength={p.channel === 'sms' ? 1600 : 4000} />
      </FormField>
    </ConfirmDialog>
  );
}

function NoteDialog(p: { onClose: () => void; onSave: (note: string, rating: number | null) => Promise<unknown> }) {
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title="Add a note" confirmLabel="Save note" onConfirm={async () => { setTried(true); if (!note.trim() && rating == null) return false; await p.onSave(note.trim(), rating); p.onClose(); }}>
      <FormField id="nt-note" label="Note" optional helper="General feedback. Interview judgements go on the scorecard." error={tried && !note.trim() && rating == null ? 'Enter a note or choose a rating.' : null}>
        <TextArea value={note} onChange={setNote} rows={4} maxLength={5000} />
      </FormField>
      <FormField id="nt-rating" label="Rating" optional>
        <Segment label="Rating" value={rating == null ? null : String(rating)} onChange={(v) => setRating(Number(v))} options={['1', '2', '3', '4', '5'].map((x) => ({ value: x, label: x }))} />
      </FormField>
    </ConfirmDialog>
  );
}

/** HIR-05 record › Schedule interview (answer 274), for one application. Times are entered and shown in India time. */
export interface ScheduleDialogProps {
  /** e.g. the job title, shown in the title. */
  forWhat?: string;
  people: Choice[];
  scorecardTemplates: Choice[];
  defaultScorecardId: string | null;
  onSchedule: (input: ScheduleInput) => Promise<unknown>;
  onClose: () => void;
}

export function ScheduleDialog(p: ScheduleDialogProps) {
  const [mode, setMode] = useState<'proposed' | 'self_book'>('proposed');
  const [slots, setSlots] = useState<{ date: Date | null; start: string | null; end: string | null }[]>([{ date: null, start: null, end: null }]);
  const [wFrom, setWFrom] = useState<Date | null>(null);
  const [wTo, setWTo] = useState<Date | null>(null);
  const [minutes, setMinutes] = useState<'15' | '30' | '45' | '60'>('30');
  const [panel, setPanel] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [tz, setTz] = useState('Asia/Kolkata');
  const [note, setNote] = useState('');
  const [scorecard, setScorecard] = useState<string | null>(p.defaultScorecardId);
  // India time (+05:30, no daylight saving) whatever the browser's zone; the time zone field is the candidate's.
  const iso = (d: Date, t: string) => new Date(`${dayKey(d)}T${t}:00+05:30`).toISOString();
  const slotsOk = slots.every((s) => s.date && s.start && s.end && s.end > s.start);
  const ok = location.trim() && tz.trim() && (mode === 'proposed' ? slotsOk : wFrom && wTo && wTo > wFrom);
  const [tried, setTried] = useState(false);
  const firstBad = () =>
    mode === 'proposed'
      ? (() => { const i = slots.findIndex((s) => !(s.date && s.start && s.end && s.end > s.start)); if (i < 0) return null; const s = slots[i]; return !s.date ? `sc-d${i}` : !s.start ? `sc-s${i}` : `sc-e${i}`; })()
      : !wFrom ? 'sc-wf' : !(wTo && wTo > wFrom) ? 'sc-wt' : null;
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={p.forWhat ? `Schedule an interview · ${p.forWhat}` : 'Schedule an interview'} confirmLabel="Schedule" onConfirm={async () => {
      setTried(true);
      if (!ok) {
        const id = firstBad() ?? (!location.trim() ? 'sc-loc' : 'sc-tz');
        setTimeout(() => document.getElementById(id)?.focus(), 0);
        return false;
      }
      await p.onSchedule({
        mode,
        slots: mode === 'proposed' ? slots.map((s) => ({ startsAt: iso(s.date!, s.start!), endsAt: iso(s.date!, s.end!) })) : [],
        windowStart: mode === 'self_book' ? new Date(`${dayKey(wFrom!)}T00:00:00+05:30`).toISOString() : null,
        windowEnd: mode === 'self_book' ? new Date(`${dayKey(wTo!)}T23:59:00+05:30`).toISOString() : null,
        slotMinutes: mode === 'self_book' ? (Number(minutes) as 15 | 30 | 45 | 60) : null,
        panelistUserIds: panel,
        location: location.trim(),
        timeZone: tz.trim(),
        note: note.trim() || null,
        scorecardTemplateId: scorecard,
      });
      p.onClose();
    }}>
      <Segment label="How the time is fixed" value={mode} onChange={setMode} options={[{ value: 'proposed', label: 'Propose times' }, { value: 'self_book', label: 'Candidate books' }]} />
      {mode === 'proposed' ? (
        <>
          {slots.map((s, i) => (
            <div key={i} className="yx-hire-actions">
              <FormField id={`sc-d${i}`} label={`Option ${i + 1} date`} error={tried && !s.date ? 'Choose a date.' : null}>
                <DatePicker aria-label={`Option ${i + 1} date`} value={s.date} onChange={(d) => setSlots((x) => x.map((y, k) => (k === i ? { ...y, date: d } : y)))} min={new Date()} />
              </FormField>
              <FormField id={`sc-s${i}`} label={`Option ${i + 1} from (IST)`} error={tried && !s.start ? 'Choose a start time.' : null}>
                <TimeField value={s.start} onChange={(v) => setSlots((x) => x.map((y, k) => (k === i ? { ...y, start: v } : y)))} />
              </FormField>
              <FormField id={`sc-e${i}`} label={`Option ${i + 1} to (IST)`} error={tried && !(s.end && (!s.start || s.end > s.start)) ? 'Choose an end time after the start time.' : null}>
                <TimeField value={s.end} onChange={(v) => setSlots((x) => x.map((y, k) => (k === i ? { ...y, end: v } : y)))} />
              </FormField>
              {slots.length > 1 && <Button size="sm" variant="danger" onClick={() => setSlots((x) => x.filter((_, k) => k !== i))}>Remove option {i + 1}</Button>}
            </div>
          ))}
          <div>{slots.length < 5 && <Button size="sm" icon={Plus} onClick={() => setSlots((x) => [...x, { date: null, start: null, end: null }])}>Add another time</Button>}</div>
        </>
      ) : (
        <>
          <FormField id="sc-wf" label="Bookable from" required error={tried && !wFrom ? 'Choose the first bookable date.' : null}>
            <DatePicker aria-label="Bookable from" value={wFrom} onChange={setWFrom} min={new Date()} />
          </FormField>
          <FormField id="sc-wt" label="Bookable until" required error={tried && !wTo ? 'Choose the last bookable date.' : tried && wFrom && wTo && !(wTo > wFrom) ? 'Choose an end date after the start date.' : null}>
            <DatePicker aria-label="Bookable until" value={wTo} onChange={setWTo} min={wFrom ?? new Date()} />
          </FormField>
          <FormField id="sc-len" label="Length">
            <Segment label="Length" value={minutes} onChange={setMinutes} options={[{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '1 hour' }]} />
          </FormField>
        </>
      )}
      <FormField id="sc-panel" label="Panel" optional helper="Each panellist fills a scorecard.">
        <MultiSelect aria-label="Panel" value={panel} onChange={setPanel} options={p.people} searchable />
      </FormField>
      <FormField id="sc-loc" label="Where" required helper="An address, or 'Video call' (a meeting link is added when your calendar is connected)." error={tried && !location.trim() ? 'Enter where the interview takes place.' : null}>
        <TextField value={location} onChange={setLocation} maxLength={500} />
      </FormField>
      <FormField id="sc-tz" label="Candidate's time zone" required helper="Used in the candidate's invitation. Times above are India time." error={tried && !tz.trim() ? 'Enter the time zone.' : null}>
        <TextField value={tz} onChange={setTz} maxLength={64} />
      </FormField>
      <FormField id="sc-card" label="Scorecard" optional>
        <Select aria-label="Scorecard" value={scorecard} onChange={setScorecard} options={p.scorecardTemplates} placeholder="No scorecard" clearable />
      </FormField>
      <FormField id="sc-note" label="Note to the candidate" optional>
        <TextArea value={note} onChange={setNote} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}



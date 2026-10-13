import { useState } from 'react';
import { CalendarPlus, Download, ExternalLink, Mail, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField, TimeField } from '../../../components/inputs';
import { Drawer } from '../../../components/drawer';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { MultiSelect, Select } from '../../../components/select';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { dayKey } from '../../../lib/dates';
import { useRun } from '../../org/org-kit';
import { dateText } from '../../time/live/kit';
import { EmailDialog } from './candidates';
import { RejectDialog, scorecardText } from './job-workspace';
import type { ApplicationView, Choice, EmailCompose, EmailTemplateChoice, OfferInput, RejectInput, ScheduleInput } from './types';

// Recruitment batch AT5, wired (M10-BUILD-DESIGN §8, §9): one application in the job workspace — the candidate,
// tests and fit, interviews (schedule with proposed slots or self-booking; calendar events and meeting links come
// from the existing calendar sync), messages, notes and offers. Replaces the older candidate drawer.

const day = (iso: string) => dateText(iso.slice(0, 10));
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const OFFER_LABEL: Record<string, string> = { draft: 'Draft', pending_approval: 'Waiting for approval', approved: 'Approved', rejected: 'Not approved', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn', expired: 'Expired' };

export interface ApplicationPanelProps {
  open: boolean;
  onClose: () => void;
  app: ApplicationView | null;
  loading?: boolean;
  canManage: boolean;
  statuses: Choice[];
  people: Choice[];
  scorecardTemplates: Choice[];
  defaultScorecardId: string | null;
  templates: EmailTemplateChoice[];
  senders: Choice[];
  smsTemplates: EmailTemplateChoice[];
  whatsappTemplates: EmailTemplateChoice[];
  offerTemplates: EmailTemplateChoice[];
  surveys: Choice[];
  /** The company asks for approval before an offer goes out. */
  offerApproval: boolean;
  onOpenProfile: () => void;
  onStatus: (statusId: string) => Promise<unknown>;
  onReject: (input: RejectInput) => Promise<unknown>;
  onUndo: () => Promise<unknown>;
  onAssign: (userId: string | null) => Promise<unknown>;
  onChecklist: (itemId: string, done: boolean) => Promise<unknown>;
  onScoreFit?: () => Promise<unknown>;
  onResume: () => Promise<unknown>;
  onSchedule: (input: ScheduleInput) => Promise<unknown>;
  onOpenInterview: (interviewId: string) => void;
  onCancelInterview: (interviewId: string) => Promise<unknown>;
  onResendInterview: (interviewId: string) => Promise<unknown>;
  onEmail: (c: EmailCompose) => Promise<unknown>;
  onSms: (body: string, templateId: string | null) => Promise<unknown>;
  onWhatsapp: (body: string, templateId: string | null) => Promise<unknown>;
  onResend: (channel: 'email' | 'sms' | 'whatsapp', id: string) => Promise<unknown>;
  onNote: (note: string, rating: number | null) => Promise<unknown>;
  onSurvey: (surveyId: string) => Promise<unknown>;
  onOffer: (input: OfferInput) => Promise<unknown>;
  onOfferAction: (offerId: string, action: 'send' | 'approval' | 'withdraw' | 'cancel_approval' | 'pdf') => Promise<unknown>;
}

export function ApplicationPanel(p: ApplicationPanelProps) {
  const a = p.app;
  const { busy, error, run } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [texting, setTexting] = useState<'sms' | 'whatsapp' | null>(null);
  const [noting, setNoting] = useState(false);
  const [offering, setOffering] = useState(false);
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
        <div className="yx-tim-stack">
          {a.rejectionPendingUntil && (
            <InlineAlert tone="info" title="Rejected">
              The message goes at {when(a.rejectionPendingUntil)}. {p.canManage && <Button size="sm" onClick={() => void run('undo', p.onUndo)}>Undo rejection</Button>}
            </InlineAlert>
          )}
          <div className="yx-tim-row">
            <Button size="sm" icon={ExternalLink} onClick={p.onOpenProfile}>Full profile</Button>
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
              <TabsTrigger value="interviews" count={a.interviews.length}>Interviews</TabsTrigger>
              <TabsTrigger value="messages" count={a.emails.length + a.sms.length + a.whatsapp.length}>Messages</TabsTrigger>
              <TabsTrigger value="notes" count={a.notes.length}>Notes</TabsTrigger>
              <TabsTrigger value="offers" count={a.offers.length}>Offers</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="yx-tim-stack">
                <Card title="Résumé">
                  {a.resume ? (
                    <>
                      {a.resume.title && <Text as="p" weight="semibold">{a.resume.title}</Text>}
                      {a.resume.summary && <Text as="p">{a.resume.summary}</Text>}
                      {a.resume.skills.length > 0 && <div className="yx-tim-row">{a.resume.skills.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}</div>}
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
                {a.checklist.length > 0 && (
                  <Card title="Checklist">
                    {a.checklist.map((c) => <Checkbox key={c.id} label={c.label} checked={c.done} disabled={!p.canManage} onChange={(v) => void run('check', () => p.onChecklist(c.id, v))} />)}
                  </Card>
                )}
                <Card title="Details">
                  <FormField id="ap-owner" label="Owner">
                    <Select aria-label="Owner" value={a.assignee} disabled={!p.canManage} placeholder="Nobody" onChange={(v) => void run('assign', () => p.onAssign(v))} options={p.people} searchable clearable />
                  </FormField>
                  {a.customFields.length > 0 && <DescriptionList items={a.customFields.map((f) => ({ label: f.label, value: f.value }))} />}
                  {a.rejectedReason && <Text as="p" tone="secondary">Rejected: {a.rejectedReason}</Text>}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="interviews">
              <div className="yx-tim-stack">
                {p.canManage && <div><Button size="sm" icon={CalendarPlus} onClick={() => setScheduling(true)}>Schedule an interview</Button></div>}
                {a.interviews.length === 0 && <EmptyState compact title="No interviews yet." />}
                {a.interviews.map((iv) => (
                  <Card key={iv.id} title={iv.when ? when(iv.when) : 'Time not fixed yet'}>
                    <Text as="p">{iv.status} · {iv.location} · {iv.panel.join(', ') || 'No panel'}</Text>
                    {iv.scorecards && <Text as="p" tone="secondary">{scorecardText(iv.scorecards)}</Text>}
                    <div className="yx-tim-row">
                      <Button size="sm" onClick={() => p.onOpenInterview(iv.id)}>Open interview</Button>
                      {iv.meetingUrl && <Button asChild size="sm"><a href={iv.meetingUrl} target="_blank" rel="noopener noreferrer">Join meeting</a></Button>}
                      {p.canManage && iv.status !== 'cancelled' && <Button size="sm" onClick={() => void run('resend', () => p.onResendInterview(iv.id))}>Send to candidate again</Button>}
                      {p.canManage && iv.status !== 'cancelled' && <Button size="sm" variant="danger" onClick={() => void run('cancel', () => p.onCancelInterview(iv.id))}>Cancel interview</Button>}
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="messages">
              <div className="yx-tim-stack">
                {p.canManage && (
                  <div className="yx-tim-row">
                    <Button size="sm" icon={Mail} onClick={() => setEmailing(true)}>Email</Button>
                    <Button size="sm" icon={MessageSquare} disabled={a.smsOptedOut || !a.phone} onClick={() => setTexting('sms')}>SMS</Button>
                    <Button size="sm" icon={MessageSquare} disabled={a.whatsappOptedOut || !a.phone} onClick={() => setTexting('whatsapp')}>WhatsApp</Button>
                    {p.surveys.length > 0 && <SurveyButton surveys={p.surveys} onSend={(id) => run('survey', () => p.onSurvey(id))} />}
                  </div>
                )}
                {[...a.emails.map((m) => ({ ...m, channel: 'email' as const, text: m.subject })), ...a.sms.map((m) => ({ ...m, channel: 'sms' as const, text: m.body })), ...a.whatsapp.map((m) => ({ ...m, channel: 'whatsapp' as const, text: m.body }))]
                  .sort((x, y) => y.at.localeCompare(x.at))
                  .map((m) => (
                    <div key={`${m.channel}-${m.id}`} className="yx-tim-row">
                      <Badge tone="neutral">{m.channel === 'email' ? 'Email' : m.channel === 'sms' ? 'SMS' : 'WhatsApp'}</Badge>
                      <Text>{day(m.at)} · {m.text}</Text>
                      {m.status === 'failed' && p.canManage && <Button size="sm" onClick={() => void run('resend', () => p.onResend(m.channel, m.id))}>Send again</Button>}
                    </div>
                  ))}
                {a.emails.length + a.sms.length + a.whatsapp.length === 0 && <EmptyState compact title="No messages yet." />}
              </div>
            </TabsContent>

            <TabsContent value="notes">
              <div className="yx-tim-stack">
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
              <div className="yx-tim-stack">
                {p.canManage && <div><Button size="sm" icon={Plus} onClick={() => setOffering(true)}>Create an offer</Button></div>}
                {a.offers.length === 0 && <EmptyState compact title="No offers yet." />}
                {a.offers.map((o) => (
                  <Card key={o.id} title={o.compensation}>
                    <Text as="p">{OFFER_LABEL[o.status] ?? o.status} · starts {day(o.startDate)} · answer by {day(o.expiresAt)}</Text>
                    {p.canManage && (
                      <div className="yx-tim-row">
                        <Button size="sm" onClick={() => void run('pdf', () => p.onOfferAction(o.id, 'pdf'))}>Open the letter</Button>
                        {o.status === 'draft' && p.offerApproval && <Button size="sm" variant="primary" onClick={() => void run('approval', () => p.onOfferAction(o.id, 'approval'))}>Send for approval</Button>}
                        {(o.status === 'approved' || (o.status === 'draft' && !p.offerApproval)) && <Button size="sm" variant="primary" onClick={() => void run('send', () => p.onOfferAction(o.id, 'send'))}>Send to candidate</Button>}
                        {o.status === 'pending_approval' && <Button size="sm" onClick={() => void run('cancel', () => p.onOfferAction(o.id, 'cancel_approval'))}>Cancel approval</Button>}
                        {o.status === 'sent' && <Button size="sm" variant="danger" onClick={() => void run('withdraw', () => p.onOfferAction(o.id, 'withdraw'))}>Withdraw offer</Button>}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {rejecting && <RejectDialog count={1} templates={p.templates} onClose={() => setRejecting(false)} onReject={async (i) => { await p.onReject(i); }} />}
          {scheduling && <ScheduleDialog {...p} onClose={() => setScheduling(false)} />}
          {emailing && <EmailDialog count={1} templates={p.templates} senders={p.senders} onClose={() => setEmailing(false)} onSend={async (c) => { await p.onEmail(c); }} />}
          {texting && <TextDialog channel={texting} templates={texting === 'sms' ? p.smsTemplates : p.whatsappTemplates} onClose={() => setTexting(null)} onSend={(b, t) => (texting === 'sms' ? p.onSms(b, t) : p.onWhatsapp(b, t))} />}
          {noting && <NoteDialog onClose={() => setNoting(false)} onSave={p.onNote} />}
          {offering && <OfferDialog templates={p.offerTemplates} approval={p.offerApproval} onClose={() => setOffering(false)} onSave={p.onOffer} />}
        </div>
      )}
    </Drawer>
  );
}

function SurveyButton(p: { surveys: Choice[]; onSend: (id: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Send a survey</Button>
      {open && (
        <ConfirmDialog open onOpenChange={(o) => !o && setOpen(false)} title="Send a survey" confirmLabel="Send survey" confirmDisabled={!v} onConfirm={async () => { await p.onSend(v!); setOpen(false); }}>
          <FormField id="ap-survey" label="Survey" required>
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
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title={p.channel === 'sms' ? 'Send an SMS' : 'Send a WhatsApp message'} confirmLabel="Send" confirmDisabled={!body.trim()} onConfirm={async () => { await p.onSend(body.trim(), tpl && !tpl.startsWith('default-') ? tpl : null); p.onClose(); }}>
      <FormField id="tx-tpl" label="Template" optional>
        <Select aria-label="Template" value={tpl} onChange={(v) => { setTpl(v); const t = p.templates.find((x) => x.value === v); if (t) setBody(t.body); }} options={p.templates.map((t) => ({ value: t.value, label: t.label }))} clearable />
      </FormField>
      <FormField id="tx-body" label="Message" required>
        <TextArea value={body} onChange={setBody} rows={4} maxLength={p.channel === 'sms' ? 1600 : 4000} />
      </FormField>
    </ConfirmDialog>
  );
}

function NoteDialog(p: { onClose: () => void; onSave: (note: string, rating: number | null) => Promise<unknown> }) {
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title="Add a note" confirmLabel="Save note" confirmDisabled={!note.trim() && rating == null} onConfirm={async () => { await p.onSave(note.trim(), rating); p.onClose(); }}>
      <FormField id="nt-note" label="Note" optional helper="General feedback. Interview judgements go on the scorecard.">
        <TextArea value={note} onChange={setNote} rows={4} maxLength={5000} />
      </FormField>
      <FormField id="nt-rating" label="Rating" optional>
        <Segment label="Rating" value={rating == null ? null : String(rating)} onChange={(v) => setRating(Number(v))} options={['1', '2', '3', '4', '5'].map((x) => ({ value: x, label: x }))} />
      </FormField>
    </ConfirmDialog>
  );
}

function ScheduleDialog(p: ApplicationPanelProps & { onClose: () => void }) {
  const [mode, setMode] = useState<'proposed' | 'self_book'>('proposed');
  const [slots, setSlots] = useState<{ date: Date | null; start: string | null; end: string | null }[]>([{ date: null, start: null, end: null }]);
  const [wFrom, setWFrom] = useState<Date | null>(null);
  const [wTo, setWTo] = useState<Date | null>(null);
  const [minutes, setMinutes] = useState<'15' | '30' | '45' | '60'>('30');
  const [panel, setPanel] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  const [note, setNote] = useState('');
  const [scorecard, setScorecard] = useState<string | null>(p.defaultScorecardId);
  const iso = (d: Date, t: string) => new Date(`${dayKey(d)}T${t}:00`).toISOString();
  const slotsOk = slots.every((s) => s.date && s.start && s.end && s.end > s.start);
  const ok = location.trim() && tz.trim() && (mode === 'proposed' ? slotsOk : wFrom && wTo && wTo > wFrom);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title="Schedule an interview" confirmLabel="Schedule" confirmDisabled={!ok} onConfirm={async () => {
      await p.onSchedule({
        mode,
        slots: mode === 'proposed' ? slots.map((s) => ({ startsAt: iso(s.date!, s.start!), endsAt: iso(s.date!, s.end!) })) : [],
        windowStart: mode === 'self_book' ? new Date(`${dayKey(wFrom!)}T00:00:00`).toISOString() : null,
        windowEnd: mode === 'self_book' ? new Date(`${dayKey(wTo!)}T23:59:00`).toISOString() : null,
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
            <div key={i} className="yx-tim-row">
              <FormField id={`sc-d${i}`} label={`Option ${i + 1} date`}>
                <DatePicker aria-label={`Option ${i + 1} date`} value={s.date} onChange={(d) => setSlots((x) => x.map((y, k) => (k === i ? { ...y, date: d } : y)))} min={new Date()} />
              </FormField>
              <FormField id={`sc-s${i}`} label="From">
                <TimeField value={s.start} onChange={(v) => setSlots((x) => x.map((y, k) => (k === i ? { ...y, start: v } : y)))} />
              </FormField>
              <FormField id={`sc-e${i}`} label="To">
                <TimeField value={s.end} onChange={(v) => setSlots((x) => x.map((y, k) => (k === i ? { ...y, end: v } : y)))} />
              </FormField>
              {slots.length > 1 && <Button size="sm" variant="danger" onClick={() => setSlots((x) => x.filter((_, k) => k !== i))}>Remove option {i + 1}</Button>}
            </div>
          ))}
          <div><Button size="sm" icon={Plus} disabled={slots.length >= 5} onClick={() => setSlots((x) => [...x, { date: null, start: null, end: null }])}>Add another time</Button></div>
        </>
      ) : (
        <>
          <FormField id="sc-wf" label="Bookable from" required>
            <DatePicker aria-label="Bookable from" value={wFrom} onChange={setWFrom} min={new Date()} />
          </FormField>
          <FormField id="sc-wt" label="Bookable until" required>
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
      <FormField id="sc-loc" label="Where" required helper="An address, or 'Video call' (a meeting link is added when your calendar is connected).">
        <TextField value={location} onChange={setLocation} maxLength={500} />
      </FormField>
      <FormField id="sc-tz" label="Time zone" required>
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

function OfferDialog(p: { templates: EmailTemplateChoice[]; approval: boolean; onClose: () => void; onSave: (i: OfferInput) => Promise<unknown> }) {
  const [comp, setComp] = useState('');
  const [start, setStart] = useState<Date | null>(null);
  const [expires, setExpires] = useState<Date | null>(null);
  const [tpl, setTpl] = useState<string | null>(p.templates[0]?.value ?? null);
  const [subject, setSubject] = useState(p.templates[0]?.subject ?? '');
  const [body, setBody] = useState(p.templates[0]?.body ?? '');
  const [then, setThen] = useState<OfferInput['then']>('save');
  const ok = comp.trim() && start && expires;
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title="Create an offer" confirmLabel={then === 'save' ? 'Save draft' : then === 'send' ? 'Send offer' : 'Send for approval'} confirmDisabled={!ok} onConfirm={async () => {
      await p.onSave({ compensation: comp.trim(), startDate: new Date(`${dayKey(start!)}T00:00:00`).toISOString(), expiresAt: new Date(`${dayKey(expires!)}T23:59:00`).toISOString(), templateId: tpl, subject: subject.trim(), body, then });
      p.onClose();
    }}>
      <FormField id="of-comp" label="Compensation" required helper="As it should read in the letter, e.g. ₹12,00,000 a year.">
        <TextField value={comp} onChange={setComp} maxLength={200} />
      </FormField>
      <FormField id="of-start" label="Start date" required>
        <DatePicker aria-label="Start date" value={start} onChange={setStart} min={new Date()} />
      </FormField>
      <FormField id="of-exp" label="Answer by" required>
        <DatePicker aria-label="Answer by" value={expires} onChange={setExpires} min={new Date()} />
      </FormField>
      <FormField id="of-tpl" label="Letter template" optional>
        <Select aria-label="Letter template" value={tpl} onChange={(v) => { setTpl(v); const t = p.templates.find((x) => x.value === v); if (t) { setSubject(t.subject); setBody(t.body); } }} options={p.templates.map((t) => ({ value: t.value, label: t.label }))} clearable />
      </FormField>
      <FormField id="of-subj" label="Subject" optional>
        <TextField value={subject} onChange={setSubject} maxLength={300} />
      </FormField>
      <FormField id="of-body" label="Letter" optional>
        <TextArea value={body} onChange={setBody} rows={8} maxLength={20000} />
      </FormField>
      <FormField id="of-then" label="Then">
        <Segment label="Then" value={then} onChange={setThen} options={[{ value: 'save', label: 'Keep as draft' }, ...(p.approval ? [{ value: 'approval' as const, label: 'Send for approval' }] : [{ value: 'send' as const, label: 'Send to candidate' }])]} />
      </FormField>
    </ConfirmDialog>
  );
}


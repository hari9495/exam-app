import { useEffect, useState } from 'react';
import { MessageCircle, Plus, RefreshCw, Send, Unlink } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { CopyValue, DeskPage, when } from './desk-kit';
import type { LoadState } from './types';
import type { AgentMailbox, AgentPresence as Presence, AvailabilityRow, DevOutboxItem, ForecastView, LineSecret, MsgKind, MsgLine, MsgSetup, MyChannels, ShiftView, TeamMember, WidgetView } from './esm3-types';

// Service Desk 3b-2 batch 3 screens (plain simple English; single choices use the joined Segment; nothing is checked
// while typing, only when saving): the desk's messaging lines and help widgets (Desk set-up), the person's own chat apps
// and phone (help centre), and the team page for leads (presence, capacity and languages, shifts, the staff forecast,
// the availability report, the agent's own mailbox).

export const KIND_LABEL: Record<MsgKind, string> = { whatsapp: 'WhatsApp', sms: 'SMS', teams: 'Microsoft Teams', slack: 'Slack' };
export const PRESENCE_LABEL: Record<Presence, string> = { available: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
const PRESENCE_TONE: Record<Presence, 'success' | 'warning' | 'danger' | 'neutral'> = { available: 'success', away: 'warning', busy: 'danger', offline: 'neutral' };
const Problem = ({ error }: { error: string | null }) => (error ? <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert> : null);
const hhmm = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hours = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;

// ---------------------------------------------------------------------------------------------- desk set-up: lines

export interface MessagingAdminProps {
  setup: MsgSetup | null | undefined;
  onAdd: (input: { kind: MsgKind; name: string; accountId: string | null; templates: Record<string, unknown> }) => Promise<LineSecret>;
  onSave: (line: MsgLine, input: { name?: string; state?: 'active' | 'paused'; deskId?: string }) => Promise<unknown>;
  onRotate: (line: MsgLine) => Promise<LineSecret>;
  /** Moves a line from another desk to this one. */
  deskId: string;
  widgets?: {
    list: WidgetView[];
    portals: { id: string; name: string }[];
    onAdd: (input: { portalId: string; name: string; allowedOrigins: string[]; allowAnonymous: boolean; mobile: boolean }) => Promise<{ secret: string } & WidgetView>;
    onSave: (w: WidgetView, input: { allowedOrigins?: string[]; state?: 'active' | 'paused'; allowAnonymous?: boolean; mobile?: boolean }) => Promise<unknown>;
    onRotate: (w: WidgetView) => Promise<{ secret: string }>;
  } | null;
}

export function MessagingAdmin(p: MessagingAdminProps) {
  const [kind, setKind] = useState<MsgKind>('whatsapp');
  const [name, setName] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [dltId, setDltId] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [shown, setShown] = useState<LineSecret | null>(null);
  const { busy, error, run } = useRun();
  const lines = p.setup?.channels ?? [];
  const accounts = (p.setup?.accounts ?? []).filter((a) => a.channel === kind && a.active);
  const taken = new Set(lines.map((l) => l.kind));
  return (
    <div className="yx-ops-stack">
      <Problem error={error} />
      {shown && (
        <InlineAlert tone="warning" title="Copy now, shown once" actions={<Button size="sm" onClick={() => setShown(null)}>I have copied them</Button>}>
          <span className="yx-ops-stack" data-gap="sm">
            <span>Your provider (or gateway) sends messages to this web address, signed with this secret. We cannot show the secret again; make a new one if it is lost.</span>
            <CopyValue label="Webhook address" value={shown.webhookUrl} />
            <CopyValue label="Signing secret" value={shown.secret} />
          </span>
        </InlineAlert>
      )}
      <Card title="Messaging lines">
        <div className="yx-ops-stack" data-gap="sm">
          <p className="yx-chat__meta">People write to these lines from WhatsApp, SMS, Teams or Slack once they have linked their phone or chat app. Each company has one line of each kind; it lands on one desk. Words of private or sensitive tickets never leave YukthiX.</p>
          {p.setup?.devTransport && <InlineAlert tone="info">Demo mode: nothing is really sent. Messages are kept on the server so you can see them.</InlineAlert>}
          {lines.length ? (
            <ul className="yx-esm-runs">
              {lines.map((l) => (
                <li key={l.id} className="yx-ops-stack" data-gap="sm">
                  <span className="yx-ops-row" data-between>
                    <strong>
                      {KIND_LABEL[l.kind]} · {l.name}
                    </strong>
                    <Badge tone={l.state === 'active' ? 'success' : 'neutral'}>{l.state === 'active' ? 'On' : 'Paused'}</Badge>
                  </span>
                  <span className="yx-chat__meta">{l.account ? `Your company account: ${l.account.name}${l.account.sender ? ` (${l.account.sender})` : ''}` : `YukthiX shared ${l.kind === 'teams' || l.kind === 'slack' ? 'app' : 'number'}`}{l.onThisDesk === false ? ' · lands on another desk' : ''}</span>
                  <div className="yx-ops-row">
                    {l.onThisDesk === false ? (
                      <Button size="sm" loading={busy === `move-${l.id}`} onClick={() => void run(`move-${l.id}`, () => p.onSave(l, { deskId: p.deskId }))}>
                        Bring it to this desk
                      </Button>
                    ) : (
                      <Button size="sm" loading={busy === `state-${l.id}`} onClick={() => void run(`state-${l.id}`, () => p.onSave(l, { state: l.state === 'active' ? 'paused' : 'active' }))}>
                        {l.state === 'active' ? 'Pause' : 'Turn on'}
                      </Button>
                    )}
                    <Button size="sm" icon={RefreshCw} loading={busy === `rot-${l.id}`} onClick={() => void run(`rot-${l.id}`, async () => setShown(await p.onRotate(l)))}>
                      New web address and secret
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No lines yet" description="Add WhatsApp, SMS, Teams or Slack below." />
          )}
        </div>
      </Card>
      <Card title="Add a line">
        <div className="yx-ops-stack" data-gap="sm">
          <Segment label="Channel" value={kind} onChange={(k) => { setKind(k); setAccount(null); }} options={(['whatsapp', 'sms', 'teams', 'slack'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          {taken.has(kind) ? (
            <InlineAlert tone="info">Your company already has a {KIND_LABEL[kind]} line. Bring it to this desk above.</InlineAlert>
          ) : (
            <>
              <FormField label="Name" required>
                <TextField value={name} onChange={setName} maxLength={100} placeholder={`IT help on ${KIND_LABEL[kind]}`} />
              </FormField>
              {(kind === 'whatsapp' || kind === 'sms') && (
                <FormField label="Number" helper={accounts.length ? 'Leave empty to use the YukthiX shared number.' : 'The YukthiX shared number is used. Add your own account in Settings › Notifications.'}>
                  <Select value={account} onChange={setAccount} clearable placeholder="YukthiX shared number" options={accounts.map((a) => ({ value: a.id, label: `${a.name}${a.sender ? ` (${a.sender})` : ''}` }))} />
                </FormField>
              )}
              {kind === 'whatsapp' && (
                <FormField label="Approved template for replies after 24 hours" helper="The name of the template Meta approved. Outside 24 hours WhatsApp only allows approved templates.">
                  <TextField value={tplName} onChange={setTplName} maxLength={100} placeholder="desk_reply_notice" />
                </FormField>
              )}
              {kind === 'sms' && (
                <>
                  <FormField label="Registered reply template (DLT)" helper="The text exactly as registered. The first {#var#} is the request number, a second one carries the start of the reply.">
                    <TextArea value={smsBody} onChange={setSmsBody} rows={2} maxLength={500} />
                  </FormField>
                  <FormField label="DLT template id">
                    <TextField value={dltId} onChange={setDltId} maxLength={30} inputMode="numeric" />
                  </FormField>
                </>
              )}
              <div className="yx-ops-row">
                <Button
                  variant="primary"
                  icon={Plus}
                  disabled={!name.trim() || (kind === 'sms' && !smsBody.includes('{#var#}'))}
                  loading={busy === 'add'}
                  onClick={() =>
                    void run('add', async () => {
                      const templates = kind === 'whatsapp' && tplName.trim() ? { reply_notice: { name: tplName.trim(), language: 'en', status: 'approved' } } : kind === 'sms' ? { reply_notice: { body: smsBody.trim(), dltTemplateId: dltId.trim() || null, status: 'approved' } } : {};
                      setShown(await p.onAdd({ kind, name: name.trim(), accountId: account, templates }));
                      setName('');
                    })
                  }
                >
                  Add the line
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
      {p.widgets && <WidgetsCard {...p.widgets} />}
    </div>
  );
}

function WidgetsCard(p: NonNullable<MessagingAdminProps['widgets']>) {
  const [portal, setPortal] = useState<string | null>(p.portals[0]?.id ?? null);
  const [name, setName] = useState('');
  const [sites, setSites] = useState('');
  const [anonymous, setAnonymous] = useState<'yes' | 'no'>('no');
  const [mobile, setMobile] = useState<'yes' | 'no'>('no');
  const [secret, setSecret] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const list = (t: string) => t.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return (
    <Card title="Help widget for your website and app">
      <div className="yx-ops-stack" data-gap="sm">
        <p className="yx-chat__meta">Put help on your own site: one script line, no other code in your page. Your server signs who the visitor is with the widget’s secret; without that they can only read public articles (if you allow it).</p>
        <Problem error={error} />
        {secret && (
          <InlineAlert tone="warning" title="Copy now, shown once" actions={<Button size="sm" onClick={() => setSecret(null)}>I have copied it</Button>}>
            <CopyValue label="Widget secret" value={secret} />
          </InlineAlert>
        )}
        {p.list.map((w) => (
          <div key={w.id} className="yx-ops-stack" data-gap="sm">
            <span className="yx-ops-row" data-between>
              <strong>{w.name}</strong>
              <Badge tone={w.state === 'active' ? 'success' : 'neutral'}>{w.state === 'active' ? 'On' : 'Paused'}</Badge>
            </span>
            <span className="yx-chat__meta">Sites: {w.allowedOrigins.join(', ') || 'none yet'}{w.mobile ? ' · mobile apps' : ''}</span>
            <CopyValue label="Script for your page" value={w.snippet} />
            <div className="yx-ops-row">
              <Button size="sm" loading={busy === `st-${w.id}`} onClick={() => void run(`st-${w.id}`, () => p.onSave(w, { state: w.state === 'active' ? 'paused' : 'active' }))}>
                {w.state === 'active' ? 'Pause' : 'Turn on'}
              </Button>
              <Button size="sm" icon={RefreshCw} loading={busy === `rot-${w.id}`} onClick={() => void run(`rot-${w.id}`, async () => setSecret((await p.onRotate(w)).secret))}>
                New secret
              </Button>
            </div>
          </div>
        ))}
        <FormField label="Help page it opens" required>
          <Select value={portal} onChange={setPortal} options={p.portals.map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose a help page" />
        </FormField>
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} placeholder="Website help" />
        </FormField>
        <FormField label="Sites it may run on" helper="Full addresses like https://shop.example.com, one per line.">
          <TextArea value={sites} onChange={setSites} rows={2} />
        </FormField>
        <Segment label="Visitors who are not signed in" value={anonymous} onChange={setAnonymous} options={[{ value: 'no', label: 'Sign-in needed' }, { value: 'yes', label: 'May read public articles' }]} />
        <Segment label="Mobile apps" value={mobile} onChange={setMobile} options={[{ value: 'no', label: 'Website only' }, { value: 'yes', label: 'Also our iOS and Android apps' }]} />
        <div className="yx-ops-row">
          <Button
            variant="primary"
            icon={Plus}
            disabled={!portal || !name.trim()}
            loading={busy === 'add-w'}
            onClick={() =>
              void run('add-w', async () => {
                const w = await p.onAdd({ portalId: portal!, name: name.trim(), allowedOrigins: list(sites), allowAnonymous: anonymous === 'yes', mobile: mobile === 'yes' });
                setSecret(w.secret);
                setName('');
                setSites('');
              })
            }
          >
            Add the widget
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- the person's own channels

export interface MyChannelsCardProps {
  channels: MyChannels | null | undefined;
  onJoinCode: (kind: 'whatsapp' | 'sms') => Promise<{ code: string; text: string; expiresInMinutes: number }>;
  onUnlink: (kind: 'whatsapp' | 'sms') => Promise<unknown>;
  /** The local demo's phone (dev transport only). */
  dev?: { outbox: DevOutboxItem[]; onSend: (kind: MsgKind, text: string, phone?: string) => Promise<unknown> } | null;
}

export function MyChannelsCard(p: MyChannelsCardProps) {
  const [join, setJoin] = useState<{ kind: 'whatsapp' | 'sms'; text: string; minutes: number; sendTo: string | null } | null>(null);
  const { busy, error, run } = useRun();
  const lines = p.channels?.lines ?? [];
  if (!lines.length) return null;
  return (
    <Card title="Get help on WhatsApp, SMS or chat">
      <div className="yx-ops-stack" data-gap="sm">
        <Problem error={error} />
        <ul className="yx-esm-runs">
          {lines.map((l) => (
            <li key={l.kind} className="yx-ops-stack" data-gap="sm">
              <span className="yx-ops-row" data-between>
                <strong>{KIND_LABEL[l.kind]}</strong>
                <Badge tone={l.linked ? 'success' : 'neutral'}>{l.linked ? `Linked ${l.linked.masked}` : 'Not linked'}</Badge>
              </span>
              {l.kind === 'whatsapp' || l.kind === 'sms' ? (
                <div className="yx-ops-row">
                  {l.linked ? (
                    <Button size="sm" icon={Unlink} loading={busy === `un-${l.kind}`} onClick={() => void run(`un-${l.kind}`, () => p.onUnlink(l.kind as 'whatsapp' | 'sms'))}>
                      Stop messages here
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={MessageCircle}
                      loading={busy === `join-${l.kind}`}
                      onClick={() =>
                        void run(`join-${l.kind}`, async () => {
                          const r = await p.onJoinCode(l.kind as 'whatsapp' | 'sms');
                          setJoin({ kind: l.kind as 'whatsapp' | 'sms', text: r.text, minutes: r.expiresInMinutes, sendTo: l.sendTo });
                        })
                      }
                    >
                      Link my phone
                    </Button>
                  )}
                </div>
              ) : (
                <span className="yx-chat__meta">{l.linked ? 'Write to the YukthiX app in your chat app.' : `Link ${KIND_LABEL[l.kind]} from the YukthiX app in ${KIND_LABEL[l.kind]}.`}</span>
              )}
              {join?.kind === l.kind && !l.linked && (
                <InlineAlert tone="info" title="Send this from your phone">
                  <span className="yx-ops-stack" data-gap="sm">
                    <span>{`Send the message below${join.sendTo ? ` to ${join.sendTo}` : ''} within ${join.minutes} minutes. Sending it means you agree to get replies there. Send STOP any time to stop.`}</span>
                    <CopyValue label="Message to send" value={join.text} />
                  </span>
                </InlineAlert>
              )}
            </li>
          ))}
        </ul>
        {p.dev && <DevPhone lines={lines} join={join?.text ?? null} {...p.dev} />}
      </div>
    </Card>
  );
}

/** Demo only: a pretend phone that sends from your own linked number (or a JOIN from a number you type). */
function DevPhone({ lines, join, outbox, onSend }: { lines: { kind: MsgKind; linked: unknown }[]; join: string | null; outbox: DevOutboxItem[]; onSend: (kind: MsgKind, text: string, phone?: string) => Promise<unknown> }) {
  const [kind, setKind] = useState<MsgKind>(lines[0]?.kind ?? 'whatsapp');
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (join) setText(join);
  }, [join]);
  const linked = lines.find((l) => l.kind === kind)?.linked;
  return (
    <div className="yx-ops-stack yx-dev-phone" data-gap="sm">
      <strong>Demo phone</strong>
      <span className="yx-chat__meta">Only in demo mode: send a message as if from your phone or chat app, and see what reaches it.</span>
      <Problem error={error} />
      <Segment label="Send on" value={kind} onChange={setKind} options={lines.map((l) => ({ value: l.kind, label: KIND_LABEL[l.kind] }))} />
      {!linked && (kind === 'whatsapp' || kind === 'sms') && (
        <FormField label="Phone number" helper="With + and the country code, for example +919812345678.">
          <TextField value={phone} onChange={setPhone} maxLength={16} inputMode="tel" />
        </FormField>
      )}
      <FormField label="Message">
        <TextArea value={text} onChange={setText} rows={2} maxLength={2000} />
      </FormField>
      <div className="yx-ops-row">
        <Button
          variant="primary"
          icon={Send}
          disabled={!text.trim()}
          loading={busy === 'send'}
          onClick={() =>
            void run('send', async () => {
              await onSend(kind, text.trim(), phone.trim() || undefined);
              setText('');
            })
          }
        >
          Send from my phone
        </Button>
      </div>
      <strong>Messages to my phone and chat apps</strong>
      {outbox.length ? (
        <ul className="yx-esm-runs" aria-label="Messages to my phone">
          {outbox.map((m, i) => (
            <li key={`${m.at}-${i}`}>
              <span className="yx-chat__meta">
                {KIND_LABEL[m.kind]} · {when(m.at)}
                {m.template ? ' · template' : ''}
              </span>
              <p className="yx-dev-phone__text">{m.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <span className="yx-chat__meta">Nothing yet.</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- the team page

export interface TeamScreenProps {
  state: LoadState;
  onRetry?: () => void;
  desks: { id: string; name: string }[];
  deskId: string | null;
  onDesk: (id: string) => void;
  canLead: boolean;
  canReport: boolean;
  me: { presence: Presence } | null;
  onPresence: (p: Presence) => Promise<unknown>;
  team: TeamMember[] | null | undefined;
  onRouting: (userId: string, input: { capacity: { ticket: number | null; chat: number | null; messaging: number | null }; languages: string[] }) => Promise<unknown>;
  shifts: ShiftView[];
  range: { from: string; to: string };
  onAddShift: (input: { userId: string; startsAt: string; endsAt: string; note?: string }) => Promise<unknown>;
  onRemoveShift: (s: ShiftView) => Promise<unknown>;
  onImportShifts: (csv: string) => Promise<{ added: number }>;
  forecast: ForecastView | null | undefined;
  availability: AvailabilityRow[] | null | undefined;
  mailbox?: { current: AgentMailbox | null; devAllowed: boolean; onLink: (kind: 'm365' | 'gmail' | 'dev', config?: Record<string, string>) => Promise<unknown>; onUnlink: () => Promise<unknown> } | null;
}

export function TeamScreen(p: TeamScreenProps) {
  const { busy, error, run } = useRun();
  const pick =
    p.desks.length > 1 ? (
      <Select aria-label="Desk" value={p.deskId} onChange={(v) => v && p.onDesk(v)} options={p.desks.map((d) => ({ value: d.id, label: d.name }))} />
    ) : undefined;
  return (
    <DeskPage title="Team and shifts" description="Who is working, how much each person takes, the roster and the staff forecast." actions={pick} state={p.state} onRetry={p.onRetry} what="your team">
      <div className="yx-ops-stack">
        <Problem error={error} />
        {p.me && (
          <Card title="My presence">
            <div className="yx-ops-stack" data-gap="sm">
              <Segment label="My presence" value={p.me.presence} onChange={(v) => void run('presence', () => p.onPresence(v))} options={(['available', 'away', 'busy', 'offline'] as const).map((v) => ({ value: v, label: PRESENCE_LABEL[v] }))} />
              <span className="yx-chat__meta">Only online agents get new work pushed to them. Busy and offline get none; away ends when you come back.</span>
            </div>
          </Card>
        )}
        {p.team && <TeamCard team={p.team} canLead={p.canLead} onRouting={p.onRouting} />}
        <ShiftsCard {...p} />
        {p.canReport && p.forecast && <ForecastCard forecast={p.forecast} />}
        {p.canReport && p.availability && <AvailabilityCard rows={p.availability} />}
        {p.mailbox && <MailboxCard {...p.mailbox} busy={busy} run={run} />}
      </div>
    </DeskPage>
  );
}

function TeamCard({ team, canLead, onRouting }: { team: TeamMember[]; canLead: boolean; onRouting: TeamScreenProps['onRouting'] }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [ticket, setTicket] = useState<number | null>(null);
  const [chat, setChat] = useState<number | null>(null);
  const [messaging, setMessaging] = useState<number | null>(null);
  const [langs, setLangs] = useState('');
  const { busy, error, run } = useRun();
  const open = (m: TeamMember) => {
    setEdit(m.userId);
    setTicket(m.capacity.ticket);
    setChat(m.capacity.chat);
    setMessaging(m.capacity.messaging);
    setLangs(m.languages.join(', '));
  };
  return (
    <Card title="The team now">
      <div className="yx-ops-stack" data-gap="sm">
        <Problem error={error} />
        <ul className="yx-esm-runs" aria-label="Team">
          {team.map((m) => (
            <li key={m.userId} className="yx-ops-stack" data-gap="sm">
              <span className="yx-ops-row" data-between>
                <strong>{m.name}</strong>
                <span className="yx-ops-row">
                  {m.onShift && <Badge tone="info">On shift</Badge>}
                  <Badge tone={PRESENCE_TONE[m.presence]}>{PRESENCE_LABEL[m.presence]}</Badge>
                </span>
              </span>
              <span className="yx-chat__meta">
                {m.openTickets} open ticket{m.openTickets === 1 ? '' : 's'}
                {m.capacity.ticket !== null ? ` of ${m.capacity.ticket}` : ''} · {m.activeChats} chat{m.activeChats === 1 ? '' : 's'}
                {m.capacity.chat !== null ? ` of ${m.capacity.chat}` : ''}
                {m.skills.length ? ` · skills ${m.skills.join(', ')}` : ''}
                {m.languages.length ? ` · speaks ${m.languages.join(', ')}` : ''}
              </span>
              {canLead && edit !== m.userId && (
                <div className="yx-ops-row">
                  <Button size="sm" onClick={() => open(m)}>
                    Change capacity and languages
                  </Button>
                </div>
              )}
              {edit === m.userId && (
                <div className="yx-ops-stack" data-gap="sm">
                  <div className="yx-ops-row">
                    <FormField label="Open tickets at most" helper="Empty: no limit of their own.">
                      <NumberField value={ticket} onChange={setTicket} min={0} max={500} />
                    </FormField>
                    <FormField label="Live chats at most">
                      <NumberField value={chat} onChange={setChat} min={0} max={10} />
                    </FormField>
                    <FormField label="WhatsApp, SMS and chat-app tickets at most">
                      <NumberField value={messaging} onChange={setMessaging} min={0} max={500} />
                    </FormField>
                  </div>
                  <FormField label="Languages they answer in" helper="Language codes, for example en, hi, ta.">
                    <TextField value={langs} onChange={setLangs} maxLength={60} />
                  </FormField>
                  <div className="yx-ops-row">
                    <Button
                      variant="primary"
                      loading={busy === m.userId}
                      onClick={() =>
                        void run(m.userId, async () => {
                          await onRouting(m.userId, { capacity: { ticket, chat, messaging }, languages: langs.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean) });
                          setEdit(null);
                        })
                      }
                    >
                      Save
                    </Button>
                    <Button onClick={() => setEdit(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function ShiftsCard(p: TeamScreenProps) {
  const [who, setWho] = useState<string | null>(null);
  const [day, setDay] = useState(p.range.from);
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [csv, setCsv] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const at = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();
  return (
    <Card title="Shifts">
      <div className="yx-ops-stack" data-gap="sm">
        <Problem error={error} />
        {done && <InlineAlert tone="success">{done}</InlineAlert>}
        {p.shifts.length ? (
          <ul className="yx-esm-runs" aria-label="Shifts">
            {p.shifts.map((s) => (
              <li key={s.id} className="yx-ops-row" data-between>
                <span>
                  <strong>{s.name}</strong> · {hhmm(s.startsAt)} to {new Date(s.endsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  {s.note ? ` · ${s.note}` : ''}
                </span>
                {p.canLead && (
                  <Button size="sm" variant="danger" loading={busy === s.id} onClick={() => void run(s.id, () => p.onRemoveShift(s))}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="yx-chat__meta">No shifts in these days.</span>
        )}
        {p.canLead && p.team && (
          <>
            <div className="yx-ops-row">
              <FormField label="Agent" required>
                <Select value={who} onChange={setWho} options={p.team.map((m) => ({ value: m.userId, label: m.name }))} placeholder="Choose" />
              </FormField>
              <FormField label="Day" required>
                <TextField type="date" value={day} onChange={setDay} />
              </FormField>
              <FormField label="From" required>
                <TextField type="time" value={from} onChange={setFrom} />
              </FormField>
              <FormField label="To" required>
                <TextField type="time" value={to} onChange={setTo} />
              </FormField>
            </div>
            <div className="yx-ops-row">
              <Button variant="primary" icon={Plus} disabled={!who || !day} loading={busy === 'add'} onClick={() => void run('add', () => p.onAddShift({ userId: who!, startsAt: at(day, from), endsAt: to > from ? at(day, to) : new Date(new Date(at(day, to)).getTime() + 86_400_000).toISOString() }))}>
                Add the shift
              </Button>
            </div>
            <FormField label="Or paste shifts as CSV" helper="One per line: email, start, end, note. For example: suresh@company.com, 2026-10-12 09:00, 2026-10-12 17:00, Day">
              <TextArea value={csv} onChange={setCsv} rows={3} />
            </FormField>
            <div className="yx-ops-row">
              <Button disabled={!csv.trim()} loading={busy === 'csv'} onClick={() => void run('csv', async () => {
                const r = await p.onImportShifts(csv);
                setDone(`Added ${r.added} shift${r.added === 1 ? '' : 's'}.`);
                setCsv('');
              })}>
                Import shifts
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ForecastCard({ forecast }: { forecast: ForecastView }) {
  return (
    <Card title="Staff forecast">
      <div className="yx-ops-stack" data-gap="sm">
        <p className="yx-chat__meta">{`Expected new tickets per day: the average of the same weekday over the last ${forecast.weeks} weeks. Staff needed counts ${forecast.perAgentPerDay} tickets per agent a day.`}</p>
        <table className="yx-esm-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Expected</th>
              <th scope="col">Staff needed</th>
              <th scope="col">On the roster</th>
            </tr>
          </thead>
          <tbody>
            {forecast.days.map((d) => (
              <tr key={d.day}>
                <td>{new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td>{d.expected}</td>
                <td>{d.staffNeeded}</td>
                <td>{d.short ? <Badge tone="warning">{`${d.rostered} (${d.short} short)`}</Badge> : d.rostered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AvailabilityCard({ rows }: { rows: AvailabilityRow[] }) {
  return (
    <Card title="Availability and work today">
      <table className="yx-esm-table">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">Online</th>
            <th scope="col">Away</th>
            <th scope="col">Busy</th>
            <th scope="col">Replies</th>
            <th scope="col">Replies an hour</th>
            <th scope="col">Solved</th>
            <th scope="col">Time logged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td>{r.name}</td>
              <td>{hours(r.minutes.available)}</td>
              <td>{hours(r.minutes.away)}</td>
              <td>{hours(r.minutes.busy)}</td>
              <td>{r.replies}</td>
              <td>{r.repliesPerOnlineHour ?? '—'}</td>
              <td>{r.solved}</td>
              <td>{hours(r.timeLoggedMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MailboxCard({ current, devAllowed, onLink, onUnlink, busy, run }: NonNullable<TeamScreenProps['mailbox']> & { busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [kind, setKind] = useState<'m365' | 'gmail' | 'dev'>(devAllowed ? 'dev' : 'm365');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  const fields: Record<'m365' | 'gmail', [string, string, string]> = { m365: ['Tenant id', 'Client id', 'Client secret'], gmail: ['Client id', 'Client secret', 'Refresh token'] };
  return (
    <Card title="My mailbox">
      <div className="yx-ops-stack" data-gap="sm">
        <p className="yx-chat__meta">Only email threads that belong to a ticket you work on are copied in, as internal notes. Nothing else in your mailbox is read. Unlinking stops it at once.</p>
        {current ? (
          <>
            <span className="yx-ops-row" data-between>
              <strong>{current.address}</strong>
              <Badge tone={current.status === 'active' ? 'success' : 'danger'}>{current.status === 'active' ? 'Syncing' : 'Not working'}</Badge>
            </span>
            <span className="yx-chat__meta">
              {current.imported} email{current.imported === 1 ? '' : 's'} added to tickets{current.lastSyncAt ? ` · last checked ${when(current.lastSyncAt)}` : ''}
              {current.lastError ? ` · ${current.lastError}` : ''}
            </span>
            <div className="yx-ops-row">
              <Button variant="danger" icon={Unlink} loading={busy === 'unlink'} onClick={() => void run('unlink', onUnlink)}>
                Unlink my mailbox
              </Button>
            </div>
          </>
        ) : (
          <>
            <Segment label="Mailbox" value={kind} onChange={setKind} options={[{ value: 'm365', label: 'Microsoft 365' }, { value: 'gmail', label: 'Gmail' }, ...(devAllowed ? [{ value: 'dev' as const, label: 'Demo mailbox' }] : [])]} />
            {kind !== 'dev' &&
              fields[kind].map((label, i) => (
                <FormField key={label} label={label} required>
                  <TextField value={[a, b, c][i]} onChange={[setA, setB, setC][i]} type={i === 2 ? 'password' : 'text'} autoComplete="off" />
                </FormField>
              ))}
            <div className="yx-ops-row">
              <Button
                variant="primary"
                disabled={kind !== 'dev' && (!a || !b || !c)}
                loading={busy === 'link'}
                onClick={() => void run('link', () => onLink(kind, kind === 'm365' ? { tenantId: a, clientId: b, clientSecret: c } : kind === 'gmail' ? { clientId: a, clientSecret: b, refreshToken: c } : undefined))}
              >
                Link my mailbox
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

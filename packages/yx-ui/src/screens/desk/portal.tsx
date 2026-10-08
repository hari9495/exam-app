import { type CSSProperties, type ReactNode, useState } from 'react';
import { LogOut, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, StatusBadge, browserTimeZone, when } from './desk-kit';
import { BannerList } from './help';
import { ReadingAidsCard, ReadingAidsFrame, useReadingAids } from './reading-aids';
import type { LoadState, PortalHome, PortalMe, PortalRaiseInput, PortalTicket, PortalTicketRow } from './types';

// The outside help page (§9.3, US-G-021): a company's customers sign in with a 6-digit email code (no password, no
// YukthiX account), follow their tickets and raise new ones. With open requests on, anyone may ask without an account
// and confirms the request by opening a link we email. Works at phone width.

export interface PortalScreenProps {
  state: LoadState | 'not-found';
  onRetry?: () => void;
  home: PortalHome | null;
  /** Signed in: the person, their tickets and, when one is open, that ticket. */
  me: PortalMe | null;
  tickets: PortalTicketRow[];
  ticket: PortalTicket | null;
  ticketState?: LoadState;
  /** A success line to show once, e.g. "Ticket CS-1004 is open." */
  notice?: string | null;
  timeZone?: string;
  onSendCode: (email: string) => Promise<void>;
  onVerify: (email: string, code: string) => Promise<void>;
  onAsk: (input: PortalRaiseInput & { name: string; email: string }) => Promise<void>;
  onMeToo: (id: string) => Promise<unknown>;
  onRaise: (input: PortalRaiseInput) => Promise<{ id: string; number: string }>;
  onOpenTicket: (id: string) => void;
  onBack: () => void;
  onReply: (text: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

const ACCENT = /^#[0-9a-fA-F]{6}$/;

export function PortalScreen(props: PortalScreenProps) {
  const [aids, setAids] = useReadingAids();
  const h = props.home;
  const style = h?.portal.accentColour && ACCENT.test(h.portal.accentColour) ? ({ '--yx-portal-accent': h.portal.accentColour } as CSSProperties) : undefined;
  const { busy, run } = useRun();
  let body: ReactNode;
  if (props.state === 'not-found') body = <EmptyState title="No such help page" description="Check the web address, or ask the company for the right link." />;
  else if (props.state !== 'ready' || !h) body = <DeskPage state={props.state} onRetry={props.onRetry} what="this help page">{null}</DeskPage>;
  else if (!props.me) body = <PortalSignIn {...props} home={h} />;
  else if (props.ticket || props.ticketState) body = <PortalTicketView {...props} />;
  else body = <PortalHomeView {...props} home={h} me={props.me} />;
  return (
    <ReadingAidsFrame value={h?.portal.readingAids ? aids : { font: false, mask: false, large: false, focus: false }}>
      <div className="yx-desk-portal" style={style}>
        <header className="yx-desk-portal__bar">
          <span className="yx-desk-portal__brand">
            <span className="yx-desk-portal__company">{h?.company ?? 'Help'}</span>
            {h && <span className="yx-ops-muted">{h.portal.name}</span>}
          </span>
          {props.me && (
            <Button size="sm" icon={LogOut} loading={busy === 'out'} onClick={() => void run('out', props.onSignOut)}>
              Sign out
            </Button>
          )}
        </header>
        <main className="yx-desk-portal__main">
          {body}
          {h?.portal.readingAids && <ReadingAidsCard value={aids} onChange={setAids} />}
        </main>
      </div>
    </ReadingAidsFrame>
  );
}

/** Team, topic, product, subject and details: shared by "Ask without an account" and the signed-in raise form. */
function usePortalRaiseForm(desks: PortalHome['desks']) {
  const [deskId, setDeskId] = useState<string | null>(desks.length === 1 ? desks[0].id : null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const desk = desks.find((d) => d.id === deskId);
  return {
    ready: Boolean(deskId && subject.trim() && details.trim()),
    input: (): PortalRaiseInput => ({ deskId: deskId!, ...(categoryId ? { categoryId } : {}), ...(productId ? { productId } : {}), subject: subject.trim(), description: details.trim() }),
    clear: () => {
      setSubject('');
      setDetails('');
    },
    fields: (
      <>
        {desks.length > 1 && (
          <FormField label="Team" required>
            <Select
              value={deskId}
              onChange={(v) => {
                setDeskId(v);
                setCategoryId(null);
                setProductId(null);
              }}
              options={desks.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Choose a team"
            />
          </FormField>
        )}
        {desk && desk.categories.length > 0 && (
          <FormField label="What is it about?" optional>
            <Select value={categoryId} onChange={setCategoryId} clearable options={desk.categories.map((c) => ({ value: c.id, label: c.parentId ? `· ${c.name}` : c.name }))} placeholder="Choose a topic" />
          </FormField>
        )}
        {desk && desk.products.length > 0 && (
          <FormField label="Product" optional>
            <Select value={productId} onChange={setProductId} clearable options={desk.products.map((p) => ({ value: p.id, label: p.name }))} placeholder="Choose a product" />
          </FormField>
        )}
        <FormField label="Subject" required>
          <TextField value={subject} onChange={setSubject} maxLength={200} />
        </FormField>
        <FormField label="Details" required helper="Dates, error messages and steps help us answer faster.">
          <TextArea value={details} onChange={setDetails} rows={5} maxLength={20000} />
        </FormField>
      </>
    ),
  };
}

export function PortalSignIn(props: PortalScreenProps & { home: PortalHome }) {
  const h = props.home;
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [asking, setAsking] = useState(false);
  const [askName, setAskName] = useState('');
  const [askEmail, setAskEmail] = useState('');
  const [asked, setAsked] = useState(false);
  const form = usePortalRaiseForm(h.desks);
  const { busy, error, run } = useRun();
  return (
    <>
      <Card title={h.portal.loginTitle || `Get help from ${h.company}`}>
        <div className="yx-ops-stack">
          {h.portal.loginText && <p>{h.portal.loginText}</p>}
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          {step === 'email' ? (
            <>
              <FormField label="Your email" required helper="We send a 6-digit code. No password needed.">
                <TextField type="email" autoComplete="email" value={email} onChange={setEmail} maxLength={254} />
              </FormField>
              <div className="yx-ops-row">
                <Button variant="primary" disabled={!email.includes('@')} loading={busy === 'send'} onClick={() => void run('send', async () => { await props.onSendCode(email.trim().toLowerCase()); setStep('code'); })}>
                  Send me a code
                </Button>
              </div>
            </>
          ) : (
            <>
              <InlineAlert tone="info">If this email can use the help page, a 6-digit code is on its way.</InlineAlert>
              <FormField label="6-digit code" required helper={`Sent to ${email}.`}>
                <TextField inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} maxLength={6} />
              </FormField>
              <div className="yx-ops-row">
                <Button variant="primary" disabled={code.length !== 6} loading={busy === 'verify'} onClick={() => void run('verify', () => props.onVerify(email.trim().toLowerCase(), code))}>
                  Sign in
                </Button>
                <Button onClick={() => { setStep('email'); setCode(''); }}>Use another email</Button>
                <Button loading={busy === 'send'} onClick={() => void run('send', () => props.onSendCode(email.trim().toLowerCase()))}>
                  Send a new code
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
      {h.portal.openRequests && (
        <Card title="Ask without an account">
          {asked ? (
            <InlineAlert tone="success" title="Check your email">
              Check your email and open the link to send your request.
            </InlineAlert>
          ) : !asking ? (
            <div className="yx-ops-stack" data-gap="sm">
              <p className="yx-ops-muted">No account? Send us a request. We email you a link to confirm it is you.</p>
              <div className="yx-ops-row">
                <Button onClick={() => setAsking(true)}>Ask without an account</Button>
              </div>
            </div>
          ) : (
            <div className="yx-ops-stack">
              <FormField label="Your name" required>
                <TextField value={askName} onChange={setAskName} maxLength={100} autoComplete="name" />
              </FormField>
              <FormField label="Your email" required>
                <TextField type="email" value={askEmail} onChange={setAskEmail} maxLength={254} autoComplete="email" />
              </FormField>
              {form.fields}
              <div className="yx-ops-row">
                <Button
                  variant="primary"
                  icon={Send}
                  disabled={!form.ready || !askName.trim() || !askEmail.includes('@')}
                  loading={busy === 'ask'}
                  onClick={() =>
                    void run('ask', async () => {
                      await props.onAsk({ ...form.input(), name: askName.trim(), email: askEmail.trim().toLowerCase() });
                      setAsked(true);
                    })
                  }
                >
                  Send request
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

export function PortalHomeView(props: PortalScreenProps & { home: PortalHome; me: PortalMe }) {
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [raising, setRaising] = useState(false);
  const [raised, setRaised] = useState<string | null>(null);
  const form = usePortalRaiseForm(props.home.desks);
  const { busy, error, run } = useRun();
  const tz = props.timeZone || browserTimeZone();
  const rows = props.tickets.filter((t) => show === 'all' || !['solved', 'closed'].includes(t.systemState));
  const notice = raised ? `Ticket ${raised} is open.` : props.notice;
  return (
    <>
      <p className="yx-ops-muted">
        Signed in as {props.me.name || props.me.email}
        {props.me.account ? ` · ${props.me.account}` : ''}
      </p>
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
      <BannerList banners={props.home.banners} onMeToo={props.onMeToo} />
      <Card title="My tickets" actions={<Segment label="Which tickets" options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} value={show} onChange={setShow} />}>
        {rows.length === 0 ? (
          <EmptyState compact title={show === 'open' ? 'You have no open tickets.' : 'You have no tickets yet.'} />
        ) : (
          <ul className="yx-ops-list" aria-label="My tickets">
            {rows.map((t) => (
              <li key={t.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <button type="button" className="yx-desk-link" onClick={() => props.onOpenTicket(t.id)}>
                    {t.subject}
                  </button>
                  <span className="yx-ops-list__sub">
                    <span className="yx-ops-mono">{t.number}</span> · raised {when(t.createdAt, tz)}
                    {!t.mine && t.raisedBy ? ` · raised by ${t.raisedBy}` : ''}
                  </span>
                </span>
                <StatusBadge label={t.status} state={t.systemState} />
              </li>
            ))}
          </ul>
        )}
        <p className="yx-ops-muted">Times are in your time zone: {tz}.</p>
      </Card>
      <Card title="Ask for help">
        {!raising ? (
          <div className="yx-ops-row">
            <Button variant="primary" onClick={() => setRaising(true)}>
              Raise a ticket
            </Button>
          </div>
        ) : (
          <div className="yx-ops-stack">
            {error && <InlineAlert tone="danger" title="The ticket was not raised">{error}</InlineAlert>}
            {form.fields}
            <div className="yx-ops-row">
              <Button onClick={() => setRaising(false)}>Cancel</Button>
              <Button
                variant="primary"
                icon={Send}
                disabled={!form.ready}
                loading={busy === 'raise'}
                onClick={() =>
                  void run('raise', async () => {
                    const r = await props.onRaise(form.input());
                    setRaised(r.number);
                    form.clear();
                    setRaising(false);
                  })
                }
              >
                Send
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

const WHO = { agent: 'Support team', requester: 'You', system: 'Update' } as const;

export function PortalTicketView(props: PortalScreenProps) {
  const t = props.ticket;
  const [text, setText] = useState('');
  const { busy, error, run } = useRun();
  const tz = props.timeZone || browserTimeZone();
  return (
    <>
      <div className="yx-ops-row">
        <Button onClick={props.onBack}>Back to my tickets</Button>
      </div>
      {!t ? (
        <DeskPage state={props.ticketState === 'ready' ? 'loading' : (props.ticketState ?? 'loading')} what="this ticket">
          {null}
        </DeskPage>
      ) : (
        <>
          <Card title={t.subject}>
            <div className="yx-ops-stack" data-gap="sm">
              <span className="yx-ops-row">
                <span className="yx-ops-mono">{t.number}</span>
                <StatusBadge label={t.status} state={t.systemState} />
              </span>
              <p className="yx-ops-muted">
                {t.desk} · raised {when(t.createdAt, tz)}
                {!t.mine && t.raisedBy ? ` by ${t.raisedBy}` : ''}
              </p>
              {t.resolveBy && <p>We aim to resolve it by {when(t.resolveBy, tz)} ({tz}).</p>}
            </div>
          </Card>
          <Card title="Conversation">
            <ol className="yx-ops-conv" aria-label="Conversation">
              {t.messages.map((m) => (
                <li key={m.id} className="yx-ops-msg" data-kind={m.mine ? 'mine' : undefined}>
                  <span className="yx-ops-msg__meta">
                    <span className="yx-ops-msg__who">{m.mine ? 'You' : m.side === 'agent' ? `${m.author} · ${WHO.agent}` : m.side === 'system' ? WHO.system : m.author}</span>
                    <span>{when(m.createdAt, tz)}</span>
                  </span>
                  <MessageBody html={m.bodyHtml} />
                </li>
              ))}
            </ol>
            {t.files.length > 0 && <p className="yx-ops-muted">Files on this ticket: {t.files.map((f) => f.fileName).join(', ')}</p>}
          </Card>
          {t.canReply ? (
            <Card title="Reply">
              <div className="yx-ops-stack">
                {error && <InlineAlert tone="danger" title="Your reply was not sent">{error}</InlineAlert>}
                <FormField label="Your reply" hideLabel>
                  <TextArea value={text} onChange={setText} rows={4} maxLength={20000} placeholder="Write to the support team" />
                </FormField>
                <div className="yx-ops-row">
                  <Button variant="primary" icon={Send} disabled={!text.trim()} loading={busy === 'reply'} onClick={() => void run('reply', async () => { await props.onReply(text.trim()); setText(''); })}>
                    Send reply
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <InlineAlert tone="info" title="This ticket is closed">
              Raise a new ticket if you still need help.
            </InlineAlert>
          )}
        </>
      )}
    </>
  );
}

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, StatusBadge, when } from './desk-kit';
import type { LoadState, SystemState } from './types';

// SD-1.31 "Contact YukthiX" (US-B-116 … US-B-118): a company's System Admin writes to YukthiX support and follows the
// answers. The server reads and writes only through its two bridge functions; this screen never sees the platform desk.

/** A row of GET /desk/support/yukthix/tickets. `number` is null while the ticket is still being sent. */
export interface YxSupportRow {
  id: string;
  number: string | null;
  subject: string;
  status: string;
  state: SystemState;
  severity: number;
  created_at: string;
  updated_at: string;
}

export interface YxSupportTicket {
  id: string;
  number: string;
  subject: string;
  status: string;
  state: SystemState;
  severity: number;
  tier: string | null;
  created_at: string;
  updated_at: string;
  /** body_html is cleaned by the server. side 'agent' = YukthiX. */
  messages: { id: string; side: string; at: string; body_html: string; author: string }[];
}

export interface YxSupportRaise {
  subject: string;
  body: string;
  severity: number;
  screen?: string;
}

export interface YukthixSupportScreenProps {
  state: LoadState;
  onRetry?: () => void;
  tickets: YxSupportRow[];
  onRaise: (input: YxSupportRaise) => Promise<{ number: string | null; sending: boolean }>;
  /** The page the admin came from (a path), offered with "Include the page I was on". */
  fromPage?: string;
  /** The open ticket, if any. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  ticket: YxSupportTicket | null;
  ticketState: LoadState;
  onReply: (id: string, body: string) => Promise<unknown>;
  supportAccessHref: string;
}

export const YX_SEVERITY = [
  { value: 1, label: 'Down for everyone' },
  { value: 2, label: 'Badly hurt' },
  { value: 3, label: 'A question or small problem' },
  { value: 4, label: 'An idea' },
] as const;
export const severityWords = (n: number) => YX_SEVERITY.find((s) => s.value === n)?.label ?? `Severity ${n}`;

export function YukthixSupportScreen(props: YukthixSupportScreenProps) {
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [severity, setSeverity] = useState<number>(3);
  const [withPage, setWithPage] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const send = () =>
    void run('raise', async () => {
      const r = await props.onRaise({ subject: subject.trim(), body: details.trim(), severity, ...(withPage && props.fromPage ? { screen: props.fromPage } : {}) });
      setSent(r.number ? `Sent. Your ticket number is ${r.number}.` : 'Sent. It gets its number in a minute; it is in the list below.');
      setSubject('');
      setDetails('');
      setWithPage(false);
    });
  return (
    <DeskPage title="Contact YukthiX" description="Write to the YukthiX support team about this company's account." state={props.state} onRetry={props.onRetry} what="your tickets with YukthiX">
      <InlineAlert tone="info" title="When we answer">
        Monday to Saturday, 9:00 to 19:00 India time. Severity 1 is answered round the clock. We reply within 1 hour for Severity 1, within 4 hours for Severity 2 and within 1 working day for Severity 3.
      </InlineAlert>
      <p className="yx-ops-muted">
        YukthiX may ask to look inside your company; you approve each time on <a className="yx-desk-link" href={props.supportAccessHref}>Support access</a>.
      </p>
      {sent && <InlineAlert tone="success" title={sent} />}
      <Card title="Write to YukthiX">
        <div className="yx-ops-stack">
          {error && <InlineAlert tone="danger" title="It was not sent">{error}</InlineAlert>}
          <FormField label="Subject" required>
            <TextField value={subject} onChange={setSubject} maxLength={200} />
          </FormField>
          <FormField label="Details" required helper="What happened, what you expected, and any error message.">
            <TextArea value={details} onChange={setDetails} rows={5} maxLength={10000} />
          </FormField>
          <FormField label="How bad is it?">
            <Segment label="How bad is it?" options={YX_SEVERITY.map((s) => ({ value: s.value, label: s.label }))} value={severity} onChange={setSeverity} />
          </FormField>
          {props.fromPage && <Checkbox checked={withPage} onChange={setWithPage} label="Include the page I was on" description={props.fromPage} />}
          <div className="yx-ops-row">
            <Button variant="primary" icon={Send} disabled={!subject.trim() || !details.trim()} loading={busy === 'raise'} onClick={send}>
              Send to YukthiX
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Your tickets with YukthiX">
        {props.tickets.length === 0 ? (
          <EmptyState compact title="No tickets with YukthiX yet." description="What you send appears here with our answers." />
        ) : (
          <ul className="yx-ops-list" aria-label="Your tickets with YukthiX">
            {props.tickets.map((t) => (
              <li key={t.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  {t.number ? (
                    <button type="button" className="yx-desk-link" aria-current={t.id === props.openId || undefined} onClick={() => props.onOpen(t.id)}>
                      {t.subject}
                    </button>
                  ) : (
                    <span>{t.subject}</span>
                  )}
                  <span className="yx-ops-list__sub">
                    <span className="yx-ops-mono">{t.number ?? 'No number yet'}</span> · {severityWords(t.severity)} · updated {when(t.updated_at)}
                  </span>
                </span>
                <StatusBadge label={t.status} state={t.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {props.openId && <TicketCard {...props} />}
    </DeskPage>
  );
}

function TicketCard({ ticket: t, ticketState, onOpen, onReply, openId }: YukthixSupportScreenProps) {
  const [text, setText] = useState('');
  const { busy, error, run } = useRun();
  return (
    <Card title={t ? `${t.number} · ${t.subject}` : 'Ticket'} actions={<Button size="sm" onClick={() => onOpen(null)}>Close</Button>}>
      {ticketState === 'loading' && <p className="yx-ops-muted">Loading the conversation…</p>}
      {ticketState === 'error' && <InlineAlert tone="danger" title="We couldn't load this ticket. Try again in a moment." />}
      {ticketState === 'ready' && t && (
        <div className="yx-ops-stack">
          <p className="yx-ops-muted">
            {severityWords(t.severity)} · {t.status} · raised {when(t.created_at)}
          </p>
          <ol className="yx-ops-conv" aria-label="Conversation">
            {t.messages.map((m) => (
              <li key={m.id} className="yx-ops-msg" data-kind={m.side === 'agent' ? undefined : 'mine'}>
                <span className="yx-ops-msg__meta">
                  <span className="yx-ops-msg__who">{m.side === 'agent' ? `${m.author} from YukthiX` : m.author || 'Your company'}</span>
                  <span>{when(m.at)}</span>
                </span>
                <MessageBody html={m.body_html} />
              </li>
            ))}
          </ol>
          {error && <InlineAlert tone="danger" title="Your reply was not sent">{error}</InlineAlert>}
          <FormField label="Your reply">
            <TextArea value={text} onChange={setText} rows={4} maxLength={10000} />
          </FormField>
          <div className="yx-ops-row">
            <Button
              variant="primary"
              icon={Send}
              disabled={!text.trim()}
              loading={busy === 'reply'}
              onClick={() =>
                void run('reply', async () => {
                  await onReply(openId!, text.trim());
                  setText('');
                })
              }
            >
              Send reply
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

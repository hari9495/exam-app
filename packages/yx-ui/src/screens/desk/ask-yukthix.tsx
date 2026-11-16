import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { InlineAlert, Skeleton } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { AssistantPanel, useToast, type AssistantMessage } from '../../components/notify';
import { TextArea, TextField } from '../../components/inputs';
import { useRun } from '../org/org-kit';
import { TalkToUsLiveDialog, type TalkTopic } from '../platform-b/growth-screens';

/** One message of an Ask YukthiX chat, as the API gives it. */
export interface AskMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources: { title: string; href: string | null }[];
  outcome: string | null;
  feedback: 'up' | 'down' | null;
}

export interface AskConversationView {
  id: string;
  ticketRef: string | null;
  featureRequestSent: boolean;
  /** Answer 2112: a sales request was sent from this chat (once per chat). */
  salesRequestSent?: boolean;
  /** After help.assistant.unhelpful_handover unhelpful answers (answer 2104). */
  offerPerson: boolean;
  messages: AskMessageView[];
}

/** `GET help/assistant`. */
export interface AskState {
  on: boolean;
  limit: number;
  remaining: number;
  /** The Contact YukthiX key (org.yukthix_support.raise): only then "Raise support ticket". */
  canRaiseTicket: boolean;
  /** Answer 2112: Plan & add-ons' key (org:manage_billing): only then "Send a sales request" on a buying question. */
  canAskSales?: boolean;
  conversation: AskConversationView | null;
}

export interface AskYukthixProps {
  /** Null while loading. */
  state: AskState | null;
  loadError?: string | null;
  onAsk: (question: string, conversationId?: string) => Promise<{ on: false } | { on: true; remaining: number; conversation: AskConversationView }>;
  onFeedback: (answerId: string, value: 'up' | 'down') => Promise<unknown>;
  onRaiseTicket: (conversationId: string) => Promise<{ ticket: string | number | null }>;
  onFeatureRequest: (conversationId: string, title: string, details: string) => Promise<{ number: number }>;
  /** Answer 2112: into the YukthiX sales-assist queue, with this chat. */
  onSalesRequest?: (conversationId: string, input: { phone: string; topics: TalkTopic[]; note?: string }) => Promise<{ dueAt: string }>;
  /** Where Contact YukthiX lives, for "Raise a ticket" while the assistant is not switched on. */
  contactHref: string;
}

const UNSURE: Record<string, string> = {
  not_covered: 'YukthiX help does not cover this. A person can answer it.',
  needs_person: 'Someone needs to look at your account. Raise a support ticket.',
  refused: 'This is not something Ask YukthiX can help with.',
  error: 'The answer did not come through.',
};

/** The thread for the drawn assistant panel (§45): sources that open an article, and the unsure note. */
function toPanel(messages: AskMessageView[]): AssistantMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    sources: m.sources.filter((s): s is { title: string; href: string } => Boolean(s.href)).map((s) => ({ label: s.title, href: s.href })),
    uncertain: m.outcome && UNSURE[m.outcome] ? UNSURE[m.outcome] : undefined,
    feedback: m.feedback ?? undefined,
  }));
}

/**
 * Ask YukthiX (answers 2101 to 2108), in the Help drawer: answers from YukthiX help, each citing its article; "Raise
 * support ticket" (with the chat) when the person has the Contact YukthiX key; "Send feature request" for everyone. Not
 * switched on yet: says so and offers Contact YukthiX. Buttons are never greyed out: pressed too early, they say why.
 */
export function AskYukthix(props: AskYukthixProps) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [conversation, setConversation] = useState<AskConversationView | null>(props.state?.conversation ?? null);
  const [remaining, setRemaining] = useState(props.state?.remaining ?? 0);
  const [pending, setPending] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [selling, setSelling] = useState(false);
  useEffect(() => {
    setConversation(props.state?.conversation ?? null);
    setRemaining(props.state?.remaining ?? 0);
  }, [props.state]);
  const early = useTooEarly(title.trim().length < 5 ? [{ fieldId: 'ask-fr-title', message: 'Say what you would like YukthiX to do (at least 5 characters).' }] : []);

  if (props.loadError) return <InlineAlert tone="danger" title="Ask YukthiX did not load">{props.loadError}</InlineAlert>;
  if (!props.state) return <Skeleton height={240} />;
  const s = props.state;
  if (!s.on)
    return (
      <InlineAlert tone="info" title="Ask YukthiX is not switched on yet" actions={s.canRaiseTicket ? <Button asChild><a href={props.contactHref}>Raise a ticket</a></Button> : undefined}>
        {s.canRaiseTicket ? 'Raise a ticket with YukthiX support and a person will answer.' : 'Your System Admin can raise a ticket with YukthiX support.'}
      </InlineAlert>
    );

  const messages = [...(conversation?.messages ?? []), ...(pending ? [{ id: 'pending', role: 'user' as const, text: pending, sources: [], outcome: null, feedback: null }] : [])];
  const send = (text: string) =>
    void run('ask', async () => {
      setPending(text);
      try {
        const r = await props.onAsk(text, conversation?.id);
        if (r.on) {
          setConversation(r.conversation);
          setRemaining(r.remaining);
        }
      } finally {
        setPending(null);
      }
    });
  const feedback = (id: string, value: 'up' | 'down') =>
    void run('feedback', async () => {
      await props.onFeedback(id, value);
      setConversation((c) => (c ? { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, feedback: value } : m)) } : c));
    });
  const raise = () =>
    void run('ticket', async () => {
      const r = await props.onRaiseTicket(conversation!.id);
      setConversation((c) => (c ? { ...c, ticketRef: r.ticket ? String(r.ticket) : 'sending' } : c));
      toast({ tone: 'success', title: 'Support ticket raised', description: r.ticket ? `Ticket ${r.ticket}, with this chat. YukthiX support will reply on Contact YukthiX.` : 'It is on its way to YukthiX support, with this chat.' });
    });
  const request = () => {
    if (early.stop()) return;
    void run('feature', async () => {
      const r = await props.onFeatureRequest(conversation!.id, title.trim(), details.trim());
      setConversation((c) => (c ? { ...c, featureRequestSent: true } : c));
      setAsking(false);
      early.reset();
      toast({ tone: 'success', title: 'Feature request sent', description: `Request ${r.number}. You will be told here when it is done.` });
    });
  };
  const buying = conversation?.messages.some((m) => m.outcome === 'buying');

  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <AssistantPanel messages={toPanel(messages)} onSend={send} generating={busy === 'ask'} onFeedback={feedback} />
      <p className="yx-ops-muted">
        Answers come from YukthiX help, never from your company's records. {remaining} of {s.limit} questions left today.
      </p>
      {conversation?.offerPerson && !conversation.ticketRef && <InlineAlert tone="warning" title="Not getting anywhere?">A person can help. Raise a support ticket and this chat goes with it.</InlineAlert>}
      {buying &&
        (conversation?.salesRequestSent ? (
          <InlineAlert tone="info" title="Buying or upgrading">A sales request went from this chat. YukthiX sales will call you.</InlineAlert>
        ) : s.canAskSales && props.onSalesRequest ? (
          <InlineAlert tone="info" title="Buying or upgrading" actions={<Button onClick={() => setSelling(true)}>Send a sales request</Button>}>
            YukthiX sales can help. They call you back, and this chat goes with the request.
          </InlineAlert>
        ) : (
          <InlineAlert tone="info" title="Buying or upgrading">YukthiX sales can help: whoever manages your plan can ask them from here or from Plan & add-ons.</InlineAlert>
        ))}
      {selling && conversation && props.onSalesRequest && (
        <TalkToUsLiveDialog
          about="buying or upgrading YukthiX"
          onSend={async (input) => {
            const r = await props.onSalesRequest!(conversation.id, input);
            setConversation((c) => (c ? { ...c, salesRequestSent: true } : c));
            return r;
          }}
          onClose={() => setSelling(false)}
        />
      )}
      {conversation && (
        <div className="yx-ops-row">
          {conversation.ticketRef ? (
            <span className="yx-ops-muted">Ticket {conversation.ticketRef} raised with this chat.</span>
          ) : s.canRaiseTicket ? (
            <Button loading={busy === 'ticket'} onClick={raise}>
              Raise support ticket
            </Button>
          ) : (
            <span className="yx-ops-muted">Your System Admin can raise a support ticket with YukthiX.</span>
          )}
          {conversation.featureRequestSent ? <span className="yx-ops-muted">Feature request sent.</span> : !asking && <Button onClick={() => setAsking(true)}>Send feature request</Button>}
        </div>
      )}
      {asking && conversation && (
        <div className="yx-ops-stack">
          <FormField id="ask-fr-title" label="What would you like YukthiX to do?" required error={early.errorOf('ask-fr-title')}>
            <TextField value={title} onChange={setTitle} maxLength={200} />
          </FormField>
          <FormField id="ask-fr-details" label="More detail" helper="Optional. YukthiX staff read it with this chat.">
            <TextArea rows={3} value={details} onChange={setDetails} maxLength={2000} />
          </FormField>
          <div className="yx-ops-row">
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'feature'} onClick={request}>
              Send feature request
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

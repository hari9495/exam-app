import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Paperclip, Phone, Send, Star } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { answersToSend, formProblems, type Answers } from '../../lib/forms';
import { useRun } from '../org/org-kit';
import { DeskPage, when } from './desk-kit';
import type { ChatCard, ChatMessage, ChatSession, InteractionView, MyChatQueue } from './esm2-types';
import type { PickKind, PickOption } from './esm-types';
import type { LoadState } from './types';
import { ServiceForm } from './service-form';

// Live chat (SD-2.18, SD-2.19, US-B-132, US-G-059) and interactions (SD-2.17, US-G-056). The requester chats from the
// help centre; agents take chats from the desk queue, send cards and files, hand a chat over, end it as resolved or
// turn it into a ticket. "Seen" shows only inside the chat (D11). Calls and walk-ups are logged as interactions and
// become a ticket when more work is needed. Plain words; nothing is checked while typing, only on Send.

export interface ChatLive {
  connected: boolean;
  /** The other side is typing (shown for a few seconds). */
  typing: boolean;
}

const MAX = 2000;

/** One chat: messages, cards, files, the "Seen" mark, and the box to write. */
export function ChatWindow(props: {
  session: ChatSession;
  me: 'requester' | 'agent';
  live: ChatLive;
  canWrite: boolean;
  onSend: (text: string, card?: ChatCard) => Promise<unknown>;
  onUpload?: (file: File) => Promise<unknown>;
  onOpenFile?: (fileId: string) => void;
  onTyping?: () => void;
  allowCards?: boolean;
}) {
  const [text, setText] = useState('');
  const [buttons, setButtons] = useState('');
  const { busy, error, run } = useRun();
  const end = useRef<HTMLDivElement>(null);
  const messages = props.session.messages ?? [];
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);
  const otherSeen = props.me === 'requester' ? props.session.agentSeenAt : props.session.requesterSeenAt;
  const lastMine = [...messages].reverse().find((m) => m.author === props.me);
  const seen = Boolean(lastMine && otherSeen && new Date(otherSeen) >= new Date(lastMine.at));
  const send = () =>
    run('send', async () => {
      const card = buttons.trim() ? { buttons: buttons.split(',').map((b) => b.trim()).filter(Boolean).slice(0, 5).map((label) => ({ label, reply: label })) } : undefined;
      await props.onSend(text.trim(), card);
      setText('');
      setButtons('');
    });
  return (
    <div className="yx-chat">
      <ol className="yx-chat__log" aria-label="Messages" aria-live="polite">
        {messages.map((m) => (
          <ChatBubble key={m.id} m={m} mine={m.author === props.me} canReply={props.me === 'requester' && props.canWrite} onReply={(r) => void run('send', () => props.onSend(r))} onOpenFile={props.onOpenFile} />
        ))}
      </ol>
      <div ref={end} />
      <div className="yx-ops-row" data-between>
        <span className="yx-chat__meta">{props.live.typing ? 'Typing…' : props.live.connected ? '' : 'Reconnecting…'}</span>
        {seen && <span className="yx-chat__meta">Seen</span>}
      </div>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {props.canWrite && (
        <div className="yx-ops-stack" data-gap="sm">
          <FormField label="Message" hideLabel>
            <TextArea
              rows={2}
              value={text}
              placeholder="Write a message"
              onChange={(v) => {
                setText(v);
                props.onTyping?.();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
          </FormField>
          {props.allowCards && (
            <FormField label="Reply buttons" optional helper="Up to 5, separated by commas. The person can answer with one tap.">
              <TextField size="sm" value={buttons} onChange={setButtons} placeholder="Yes, No" />
            </FormField>
          )}
          <div className="yx-ops-row">
            <Button variant="primary" icon={Send} loading={busy === 'send'} disabled={!text.trim() && !buttons.trim()} onClick={() => void send()}>
              Send
            </Button>
            {props.onUpload && (
              <label className="yx-chat__attach">
                <Paperclip aria-hidden size={16} /> Add a file
                <input
                  type="file"
                  className="yx-visually-hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void run('file', () => props.onUpload!(f));
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {text.length > MAX && <span className="yx-chat__meta">Keep it under {MAX} characters.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ m, mine, canReply, onReply, onOpenFile }: { m: ChatMessage; mine: boolean; canReply: boolean; onReply: (text: string) => void; onOpenFile?: (fileId: string) => void }) {
  if (m.author === 'system') {
    return (
      <li className="yx-chat__system">
        {m.body} <time dateTime={m.at}>{when(m.at)}</time>
      </li>
    );
  }
  return (
    <li className="yx-chat__bubble" data-mine={mine || undefined}>
      <span className="yx-chat__who">{mine ? 'You' : m.name}</span>
      {m.body && <p className="yx-chat__text">{m.body}</p>}
      {m.card && (
        <div className="yx-chat__card">
          {m.card.title && <strong>{m.card.title}</strong>}
          {m.card.text && <p>{m.card.text}</p>}
          {m.card.buttons?.length ? (
            <div className="yx-ops-row">
              {m.card.buttons.map((b) => (
                <Button key={b.label} size="sm" disabled={!canReply} onClick={() => onReply(b.reply)}>
                  {b.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {m.file && (
        <Button size="sm" icon={Paperclip} disabled={m.file.scan !== 'clean' || !onOpenFile} onClick={() => onOpenFile?.(m.file!.id)}>
          {m.file.name} {m.file.scan === 'pending' ? '(being checked)' : m.file.scan === 'clean' ? '' : '(blocked)'}
        </Button>
      )}
      <time className="yx-chat__meta" dateTime={m.at}>
        {when(m.at)}
      </time>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------- the requester

export interface RequesterChatProps {
  state: LoadState;
  onRetry?: () => void;
  queues: MyChatQueue[];
  chats: ChatSession[];
  current: ChatSession | null;
  live: ChatLive;
  initialQueueId?: string | null;
  onStart: (input: { queueId: string; subject: string; answers: Answers }) => Promise<unknown>;
  onOpen: (id: string | null) => void;
  onSend: (text: string, card?: ChatCard) => Promise<unknown>;
  onUpload: (file: File) => Promise<unknown>;
  onOpenFile: (fileId: string) => void;
  onTyping: () => void;
  onEnd: () => Promise<unknown>;
  onRate: (score: number, comment: string) => Promise<unknown>;
  onOpenTicket: (ticketId: string) => void;
  onPick: (kind: PickKind, q: string) => Promise<PickOption[]>;
}

const STATE_WORDS: Record<ChatSession['state'], string> = { queued: 'Waiting for someone', active: 'Chatting', ended: 'Ended' };

export function RequesterChatScreen(props: RequesterChatProps) {
  const [queueId, setQueueId] = useState<string | null>(props.initialQueueId ?? null);
  const [subject, setSubject] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const { busy, error, run } = useRun();
  const queue = props.queues.find((q) => q.id === queueId) ?? null;
  const c = props.current;
  return (
    <DeskPage title="Chat with us" description="Ask a quick question and someone from the team answers here." state={props.state} onRetry={props.onRetry} what="chat">
      <div className="yx-chat-layout">
        <Card title="Your chats">
          <div className="yx-ops-stack" data-gap="sm">
            <Button icon={MessageSquare} onClick={() => props.onOpen(null)}>
              New chat
            </Button>
            {props.chats.length === 0 ? (
              <EmptyState compact title="No chats yet." />
            ) : (
              <ul className="yx-chat__list">
                {props.chats.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="yx-chat__pick" aria-current={c?.id === s.id || undefined} onClick={() => props.onOpen(s.id)}>
                      <strong>{s.subject}</strong>
                      <span className="yx-chat__meta">
                        {STATE_WORDS[s.state]} · {when(s.startedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        {!c ? (
          <Card title="Start a chat">
            <div className="yx-ops-stack">
              {props.queues.length === 0 ? (
                <EmptyState compact title="Chat is not open right now." description="Raise a ticket from the help centre instead." />
              ) : (
                <>
                  <FormField label="Who do you want to chat with?" required>
                    <Select value={queueId} onChange={(v) => setQueueId(v)} options={props.queues.map((q) => ({ value: q.id, label: `${q.name} (${q.desk})`, description: q.online ? 'Someone is there now' : 'Nobody is there now: we will make a ticket if nobody joins' }))} />
                  </FormField>
                  <FormField label="What is it about?" optional>
                    <TextField value={subject} onChange={setSubject} maxLength={200} />
                  </FormField>
                  {queue && queue.preChat.sections.length > 0 && <ServiceForm form={queue.preChat} values={answers} onChange={setAnswers} errors={errors} onPick={props.onPick} />}
                  {error && <InlineAlert tone="danger">{error}</InlineAlert>}
                  <div className="yx-ops-row">
                    <Button
                      variant="primary"
                      disabled={!queue}
                      loading={busy === 'start'}
                      onClick={() =>
                        void run('start', async () => {
                          const problems = formProblems(queue!.preChat, answers);
                          setErrors(problems);
                          if (Object.keys(problems).length) throw new Error('Answer the questions first.');
                          await props.onStart({ queueId: queue!.id, subject: subject.trim(), answers: answersToSend(queue!.preChat, answers) });
                        })
                      }
                    >
                      Start chat
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        ) : (
          <Card
            title={c.subject}
            actions={
              <div className="yx-ops-row">
                <Badge tone={c.state === 'active' ? 'success' : c.state === 'queued' ? 'warning' : 'neutral'}>{STATE_WORDS[c.state]}</Badge>
                {c.state !== 'ended' && (
                  <Button size="sm" loading={busy === 'end'} onClick={() => void run('end', props.onEnd)}>
                    Leave chat
                  </Button>
                )}
              </div>
            }
          >
            <div className="yx-ops-stack">
              {c.ticket && (
                <InlineAlert tone="info" title={`Ticket ${c.ticket.number}`} actions={<Button size="sm" onClick={() => props.onOpenTicket(c.ticket!.id)}>Open ticket</Button>}>
                  You can follow it in your requests.
                </InlineAlert>
              )}
              <ChatWindow session={c} me="requester" live={props.live} canWrite={c.state !== 'ended'} onSend={props.onSend} onUpload={props.onUpload} onOpenFile={props.onOpenFile} onTyping={props.onTyping} />
              {c.state === 'ended' && c.rating === null && (
                <div className="yx-ops-stack" data-gap="sm">
                  <Segment label="How was this chat?" value={score} onChange={setScore} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: <span aria-label={`${n} out of 5`}>{'★'.repeat(n)}</span> }))} />
                  <FormField label="Anything to add?" optional>
                    <TextField value={comment} onChange={setComment} maxLength={500} />
                  </FormField>
                  <div className="yx-ops-row">
                    <Button icon={Star} disabled={!score} loading={busy === 'rate'} onClick={() => void run('rate', () => props.onRate(score!, comment.trim()))}>
                      Rate this chat
                    </Button>
                  </div>
                </div>
              )}
              {c.rating !== null && <p className="yx-chat__meta">Thanks for rating this chat {c.rating} out of 5.</p>}
            </div>
          </Card>
        )}
      </div>
    </DeskPage>
  );
}

/** US-G-059: a proactive prompt on a help page ("Stuck? Chat with IT now."), shown after its delay. */
export function ChatPromptBanner({ prompt, onChat, onDismiss }: { prompt: { text: string; desk: string; afterSeconds: number } | null; onChat: () => void; onDismiss: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!prompt) return;
    const h = setTimeout(() => setShow(true), prompt.afterSeconds * 1000);
    return () => clearTimeout(h);
  }, [prompt]);
  if (!prompt || !show) return null;
  return (
    <InlineAlert
      tone="info"
      title={prompt.text}
      actions={
        <div className="yx-ops-row">
          <Button size="sm" variant="primary" icon={MessageSquare} onClick={onChat}>
            Chat now
          </Button>
          <Button size="sm" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      }
    >
      {prompt.desk} is online.
    </InlineAlert>
  );
}

// ---------------------------------------------------------------------------------------------- agents

export interface AgentChatProps {
  state: LoadState;
  onRetry?: () => void;
  desks: { id: string; name: string }[];
  deskId: string | null;
  onDesk: (id: string) => void;
  meId: string;
  sessions: ChatSession[];
  current: ChatSession | null;
  live: ChatLive;
  queues: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  onOpen: (id: string) => void;
  onAccept: (id: string) => Promise<unknown>;
  onSend: (text: string, card?: ChatCard) => Promise<unknown>;
  onUpload: (file: File) => Promise<unknown>;
  onOpenFile: (fileId: string) => void;
  onTyping: () => void;
  onTransfer: (to: { queueId?: string; agentUserId?: string }) => Promise<unknown>;
  onEnd: (resolved: boolean) => Promise<unknown>;
  onOpenTicket: (ticketId: string) => void;
  interactions: InteractionView[];
  firstContactResolution: number | null;
  onLog: (input: { channel: 'call' | 'walk_up'; subject: string; notes: string; outcome: 'open' | 'resolved'; callRef?: string }) => Promise<unknown>;
  onPromote: (i: InteractionView) => Promise<unknown>;
  onCloseInteraction: (i: InteractionView) => Promise<unknown>;
}

export function AgentChatScreen(props: AgentChatProps) {
  const [tab, setTab] = useState<'chats' | 'calls'>('chats');
  const { busy, error, run } = useRun();
  const [handTo, setHandTo] = useState<string | null>(null);
  const c = props.current;
  const waiting = props.sessions.filter((s) => s.state === 'queued');
  const active = props.sessions.filter((s) => s.state === 'active');
  const mine = c?.agentUserId === props.meId;
  return (
    <DeskPage
      title="Live chat"
      description="Take chats from the queue, answer them here, and turn them into tickets when more work is needed."
      state={props.state}
      onRetry={props.onRetry}
      what="live chat"
      actions={
        <div className="yx-ops-row">
          {props.desks.length > 1 && <Select aria-label="Desk" value={props.deskId} onChange={(v) => v && props.onDesk(v)} options={props.desks.map((d) => ({ value: d.id, label: d.name }))} />}
          <Segment label="Show" value={tab} onChange={setTab} options={[{ value: 'chats', label: 'Chats' }, { value: 'calls', label: 'Calls and walk-ups' }]} />
        </div>
      }
    >
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {tab === 'calls' ? (
        <InteractionsCard {...props} />
      ) : (
        <div className="yx-chat-layout">
          <Card title={`Waiting (${waiting.length})`}>
            <div className="yx-ops-stack" data-gap="sm">
              <span className="yx-chat__meta">{props.live.connected ? 'Live: new chats appear here.' : 'Reconnecting…'}</span>
              <ChatList sessions={waiting} current={c?.id} onOpen={props.onOpen} />
              <strong>In progress ({active.length})</strong>
              <ChatList sessions={active} current={c?.id} onOpen={props.onOpen} />
            </div>
          </Card>
          {!c ? (
            <Card title="No chat open">
              <EmptyState compact title="Choose a chat on the left." />
            </Card>
          ) : (
            <Card
              title={`${c.person ?? ''} · ${c.subject}`}
              actions={
                <div className="yx-ops-row">
                  {c.state === 'queued' && (
                    <Button variant="primary" loading={busy === 'accept'} onClick={() => void run('accept', () => props.onAccept(c.id))}>
                      Take this chat
                    </Button>
                  )}
                  {c.state === 'active' && mine && (
                    <>
                      <Button variant="approve" loading={busy === 'resolved'} onClick={() => void run('resolved', () => props.onEnd(true))}>
                        End: resolved
                      </Button>
                      <Button loading={busy === 'ticket'} onClick={() => void run('ticket', () => props.onEnd(false))}>
                        Make a ticket
                      </Button>
                    </>
                  )}
                  {c.ticket && (
                    <Button size="sm" onClick={() => props.onOpenTicket(c.ticket!.id)}>
                      Open {c.ticket.number}
                    </Button>
                  )}
                </div>
              }
            >
              <div className="yx-ops-stack">
                {c.preChat?.length ? (
                  <dl className="yx-esm-summary" aria-label="Before the chat">
                    {c.preChat.map((p) => (
                      <div key={p.label}>
                        <dt>{p.label}</dt>
                        <dd>{p.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <ChatWindow session={c} me="agent" live={props.live} canWrite={c.state === 'active' && mine} allowCards onSend={props.onSend} onUpload={props.onUpload} onOpenFile={props.onOpenFile} onTyping={props.onTyping} />
                {c.state !== 'ended' && (
                  <div className="yx-ops-row">
                    <Select
                      aria-label="Hand over to"
                      placeholder="Hand over to…"
                      value={handTo}
                      onChange={setHandTo}
                      options={[...props.queues.filter((q) => q.id !== c.queueId).map((q) => ({ value: `q:${q.id}`, label: `Queue: ${q.name}` })), ...props.agents.filter((a) => a.id !== c.agentUserId).map((a) => ({ value: `a:${a.id}`, label: a.name }))]}
                    />
                    <Button disabled={!handTo} loading={busy === 'hand'} onClick={() => void run('hand', async () => {
                      await props.onTransfer(handTo!.startsWith('q:') ? { queueId: handTo!.slice(2) } : { agentUserId: handTo!.slice(2) });
                      setHandTo(null);
                    })}>
                      Hand over
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </DeskPage>
  );
}

function ChatList({ sessions, current, onOpen }: { sessions: ChatSession[]; current?: string; onOpen: (id: string) => void }) {
  if (!sessions.length) return <span className="yx-chat__meta">None.</span>;
  return (
    <ul className="yx-chat__list">
      {sessions.map((s) => (
        <li key={s.id}>
          <button type="button" className="yx-chat__pick" aria-current={current === s.id || undefined} onClick={() => onOpen(s.id)}>
            <strong>{s.person}</strong>
            <span>{s.subject}</span>
            <span className="yx-chat__meta">
              {s.queue} · {when(s.startedAt)}
              {s.agent ? ` · ${s.agent}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const OUTCOME: Record<InteractionView['outcome'], { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' }> = {
  open: { label: 'Open', tone: 'warning' },
  resolved: { label: 'Resolved there', tone: 'success' },
  ticket: { label: 'Became a ticket', tone: 'info' },
  abandoned: { label: 'Left', tone: 'neutral' },
};

function InteractionsCard(props: AgentChatProps) {
  const [channel, setChannel] = useState<'call' | 'walk_up'>('call');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [callRef, setCallRef] = useState('');
  const [outcome, setOutcome] = useState<'open' | 'resolved'>('resolved');
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      <Card title="Log a call or a walk-up">
        <div className="yx-ops-stack">
          <Segment label="How did they reach you?" value={channel} onChange={setChannel} options={[{ value: 'call', label: 'Phone call' }, { value: 'walk_up', label: 'Walked up' }]} />
          <FormField label="What was it about?" required>
            <TextField value={subject} onChange={setSubject} maxLength={200} />
          </FormField>
          <FormField label="Notes" optional helper="Personal data like card or Aadhaar numbers is hidden when saved.">
            <TextArea rows={3} value={notes} onChange={setNotes} maxLength={4000} />
          </FormField>
          {channel === 'call' && (
            <FormField label="Call reference" optional helper="From your phone system, if it has one.">
              <TextField value={callRef} onChange={setCallRef} maxLength={100} />
            </FormField>
          )}
          <Segment label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: 'resolved', label: 'Sorted out' }, { value: 'open', label: 'Needs more work' }]} />
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <div className="yx-ops-row">
            <Button
              variant="primary"
              icon={Phone}
              loading={busy === 'log'}
              disabled={!subject.trim()}
              onClick={() =>
                void run('log', async () => {
                  await props.onLog({ channel, subject: subject.trim(), notes: notes.trim(), outcome, ...(callRef.trim() ? { callRef: callRef.trim() } : {}) });
                  setSubject('');
                  setNotes('');
                  setCallRef('');
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Recent contacts" actions={props.firstContactResolution !== null ? <span className="yx-chat__meta">Sorted out at first contact: {props.firstContactResolution}%</span> : undefined}>
        {props.interactions.length === 0 ? (
          <EmptyState compact title="No contacts logged yet." />
        ) : (
          <ul className="yx-esm-runs">
            {props.interactions.map((i) => (
              <li key={i.id} className="yx-ops-row" data-between>
                <span>
                  <strong>{i.subject}</strong> · {i.channel === 'call' ? 'Call' : i.channel === 'walk_up' ? 'Walk-up' : 'Chat'} · {i.person ?? 'Someone'} · {when(i.startedAt)}
                </span>
                <span className="yx-ops-row">
                  <Badge tone={OUTCOME[i.outcome].tone}>{OUTCOME[i.outcome].label}</Badge>
                  {i.ticketId && (
                    <Button size="sm" onClick={() => props.onOpenTicket(i.ticketId!)}>
                      Open {i.ticketNumber}
                    </Button>
                  )}
                  {i.outcome === 'open' && (
                    <>
                      <Button size="sm" disabled={!i.person} loading={busy === `p${i.id}`} onClick={() => void run(`p${i.id}`, () => props.onPromote(i))}>
                        Make a ticket
                      </Button>
                      <Button size="sm" loading={busy === `c${i.id}`} onClick={() => void run(`c${i.id}`, () => props.onCloseInteraction(i))}>
                        Mark sorted out
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

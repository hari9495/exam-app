// HIR-04 board, answer 2434 follow-up (lead, 18 Nov 2026): a stage message template set to "Ask before sending" asks the
// recruiter after a candidate moves to its stage: send it as written, edit and send, or skip. One question per channel
// (email, SMS, WhatsApp), in that order. Sending and skipping are recorded by the API.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { Dialog } from '../../components/overlay';
import { CHANNEL_LABEL, type MessageChannel } from './stage-message-sheet';
import './hiring.css';

/** One message a stage move offers (the move's pendingMessage, pendingSmsMessage or pendingWhatsappMessage). */
export interface PendingStageMessage {
  channel: MessageChannel;
  templateId: string | null;
  /** Email only. */
  subject?: string;
  body: string;
}

export interface StageMessagePromptProps {
  candidate: string;
  stage: string;
  /** What is still to answer; the first is asked. Empty: nothing shown. */
  messages: PendingStageMessage[];
  onSend: (message: PendingStageMessage, edited: boolean) => Promise<unknown>;
  onSkip: (message: PendingStageMessage) => Promise<unknown>;
  /** The first message is answered (sent or skipped): the caller drops it. */
  onDone: () => void;
}

const MAX = { email: 8000, sms: 1600, whatsapp: 1600 } as const;
const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

export function StageMessagePrompt(props: StageMessagePromptProps) {
  const first = props.messages[0];
  if (!first) return null;
  // A fresh form for each message.
  return <Prompt key={`${first.channel}-${first.templateId ?? 'standard'}-${props.messages.length}`} {...props} message={first} />;
}

function Prompt({ candidate, stage, message, onSend, onSkip, onDone }: StageMessagePromptProps & { message: PendingStageMessage }) {
  const toast = useToastIfAny();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(message.subject ?? '');
  const [body, setBody] = useState(message.body);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<'send' | 'skip' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const email = message.channel === 'email';
  const label = CHANNEL_LABEL[message.channel];
  const bodyBad = !body.trim() || body.length > MAX[message.channel];

  const run = async (what: 'send' | 'skip') => {
    setFailed(null);
    if (what === 'send') {
      setTried(true);
      if (email && !subject.trim()) return (setEditing(true), focus('smp-subject'));
      if (bodyBad) return (setEditing(true), focus('smp-body'));
    }
    setBusy(what);
    try {
      if (what === 'send') {
        const edited = subject !== (message.subject ?? '') || body !== message.body;
        await onSend({ ...message, ...(email ? { subject: subject.trim() } : {}), body: body.trim() }, edited);
        toast?.toast({ tone: 'success', title: `${label} sent to ${candidate}` });
      } else {
        await onSkip(message);
        toast?.toast({ title: `${label} not sent` });
      }
      onDone();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      size="md"
      preventClose={busy !== null}
      onOpenChange={(o) => !o && void run('skip')}
      title={`Send the ${label} message to ${candidate}?`}
      description={`${candidate} moved to ${stage}. This stage's ${label} message is set to ask before sending. Words in {{ }} are filled in when it is sent.`}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button loading={busy === 'skip'} onClick={() => void run('skip')}>
            Don't send
          </Button>
          {!editing && <Button onClick={() => setEditing(true)}>Edit first</Button>}
          <Button variant="primary" loading={busy === 'send'} onClick={() => void run('send')}>
            {editing ? 'Send edited message' : 'Send'}
          </Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        <div>
          <Badge tone="info">{label}</Badge>
        </div>
        {editing ? (
          <>
            {email && (
              <FormField id="smp-subject" label="Subject" required error={tried && !subject.trim() ? 'Enter the subject.' : null}>
                <TextField value={subject} onChange={setSubject} maxLength={300} />
              </FormField>
            )}
            <FormField
              id="smp-body"
              label="Message"
              required
              helper={`${body.length} of ${MAX[message.channel]} characters.`}
              error={tried && !body.trim() ? 'Enter the message.' : tried && body.length > MAX[message.channel] ? `Keep it to ${MAX[message.channel]} characters.` : null}
            >
              <TextArea value={body} onChange={setBody} rows={email ? 8 : 5} />
            </FormField>
          </>
        ) : (
          <>
            {email && (
              <Text as="p" size="sm">
                <strong>{subject}</strong>
              </Text>
            )}
            <Text as="p" size="sm" tone="secondary" className="yx-hire-prewrap">
              {body}
            </Text>
          </>
        )}
      </div>
    </Dialog>
  );
}

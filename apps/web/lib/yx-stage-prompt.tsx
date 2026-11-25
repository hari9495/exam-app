'use client';

import { useState } from 'react';
import { StageMessagePrompt, type PendingStageMessage } from '@yukthix/ui/hiring';

// Answer 2434 follow-up: a stage move's "ask before sending" messages (POST /hiring/entries/:id/move returns them as
// pendingMessage, pendingSmsMessage and pendingWhatsappMessage). The recruiter sends each as written or edited through the
// channel's own send (audited there), or chooses not to send (recorded by POST .../stage-message/skip).
export type MoveResult = {
  pendingMessage?: { templateId: string | null; subject: string; body: string };
  pendingSmsMessage?: { templateId: string | null; body: string };
  pendingWhatsappMessage?: { templateId: string | null; body: string };
};
type Write = <T = unknown>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => Promise<T>;
const enc = encodeURIComponent;

export function pendingOf(r: MoveResult | null | undefined): PendingStageMessage[] {
  const out: PendingStageMessage[] = [];
  if (r?.pendingMessage) out.push({ channel: 'email', ...r.pendingMessage });
  if (r?.pendingSmsMessage) out.push({ channel: 'sms', ...r.pendingSmsMessage });
  if (r?.pendingWhatsappMessage) out.push({ channel: 'whatsapp', ...r.pendingWhatsappMessage });
  return out;
}

export function useStagePrompt(write: Write) {
  const [ask, setAsk] = useState<{ entryId: string; candidate: string; stage: string; messages: PendingStageMessage[] } | null>(null);
  const offer = (entryId: string, candidate: string, stage: string, result: MoveResult | null | undefined) => {
    const messages = pendingOf(result);
    if (messages.length) setAsk({ entryId, candidate, stage, messages });
  };
  const element = ask ? (
    <StageMessagePrompt
      candidate={ask.candidate}
      stage={ask.stage}
      messages={ask.messages}
      onSend={(m) => {
        const tpl = m.templateId ? { templateId: m.templateId } : {};
        if (m.channel === 'email') return write('POST', `/pipeline/entries/${enc(ask.entryId)}/messages`, { ...tpl, subject: m.subject ?? '', body: m.body });
        return write('POST', `/${m.channel === 'sms' ? 'candidate-sms' : 'candidate-whatsapp'}/${enc(ask.entryId)}`, { ...tpl, body: m.body });
      }}
      onSkip={(m) => write('POST', `/hiring/entries/${enc(ask.entryId)}/stage-message/skip`, { channel: m.channel, templateId: m.templateId })}
      onDone={() => setAsk((a) => (a && a.messages.length > 1 ? { ...a, messages: a.messages.slice(1) } : null))}
    />
  ) : null;
  return { offer, element };
}

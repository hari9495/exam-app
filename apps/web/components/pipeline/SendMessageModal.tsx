'use client';

import { useState } from 'react';
import { Modal, Button, Select, Input, useToast } from '../ui';
import { useMessageTemplates, useSendMessage } from '../../lib/hooks/useCandidateMessages';
import { CandidateEmailTemplate } from '../../lib/types';

// Readable stand-ins for the tokens the server would otherwise fill from live data (see
// apps/api/src/candidate-emails/candidate-email-render.ts MergeContext) -- candidateName is the
// one exception, filled from this modal's own candidateName prop since the recruiter already
// knows who they're writing to.
const SAMPLE_TOKENS: Record<string, string> = {
  jobTitle: 'the role',
  orgName: 'your organization',
  recruiterName: 'the recruiting team',
  statusLink: 'https://example.com/application/sample',
};

const TOKEN = /\{\{(candidateName|jobTitle|orgName|recruiterName|statusLink)\}\}/g;

function renderPreview(text: string, candidateName: string): string {
  return text.replace(TOKEN, (match, key: string) => (key === 'candidateName' ? candidateName : (SAMPLE_TOKENS[key] ?? match)));
}

// Default templates share id: null, so the raw id can't key a <Select> option -- fall back to a
// positional key for those. Real (saved) templates keep their own id.
function templateValue(template: CandidateEmailTemplate, index: number): string {
  return template.id ?? `default-${index}`;
}

export interface SendMessageInitial {
  templateId: string | null;
  subject: string;
  body: string;
}

interface SendMessageModalProps {
  entryId: string;
  candidateId: string;
  candidateName: string;
  onClose: () => void;
  /** Pre-fills subject/body (e.g. from a stage-move pendingMessage) without requiring a template
   *  pick. Task 7 wires this up from PipelineBoard's patch-entry response. */
  initial?: SendMessageInitial | null;
}

export function SendMessageModal({ entryId, candidateId, candidateName, onClose, initial }: SendMessageModalProps) {
  const { data: templates } = useMessageTemplates();
  const sendMessage = useSendMessage(entryId, candidateId);
  const { toast } = useToast();
  const [selectValue, setSelectValue] = useState(initial?.templateId ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');

  function handleTemplateChange(value: string) {
    const template = (templates ?? []).find((t, i) => templateValue(t, i) === value);
    if (!template) return;
    setSelectValue(value);
    setSubject(template.subject);
    setBody(template.body);
  }

  function resolveTemplateId(): string | null {
    const template = (templates ?? []).find((t, i) => templateValue(t, i) === selectValue);
    return template ? template.id : (initial?.templateId ?? null);
  }

  function handleSend() {
    sendMessage.mutate(
      { templateId: resolveTemplateId(), subject: subject.trim(), body: body.trim() },
      {
        onSuccess: () => {
          toast('Message sent.');
          onClose();
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to send message.', 'error'),
      },
    );
  }

  const canSend = Boolean(subject.trim() && body.trim());

  return (
    <Modal
      open
      title="Send message"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSend} loading={sendMessage.isPending} disabled={!canSend}>
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Template"
          value={selectValue}
          onChange={handleTemplateChange}
          options={(templates ?? []).map((t, i) => ({ value: templateValue(t, i), label: t.name }))}
        />
        <Input label="Subject" value={subject} onChange={setSubject} required />
        <div className="flex flex-col gap-1">
          <label htmlFor="message-body" className="text-sm font-medium text-gray-700">
            Body
          </label>
          <textarea
            id="message-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Use {{candidateName}}, {{jobTitle}}, {{orgName}}, {{recruiterName}}, {{statusLink}}…"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Preview</h3>
          <div className="rounded border border-recruiter-border bg-recruiter-bg-subtle p-3 text-sm">
            <p className="font-medium text-recruiter-text">{renderPreview(subject, candidateName)}</p>
            <p className="mt-2 whitespace-pre-wrap text-recruiter-text-secondary">{renderPreview(body, candidateName)}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

'use client';

// v2 Send-message modal — re-skin of components/pipeline/SendMessageModal on the v2 Dialog +
// primitives. All hooks, state, handlers, validation, constants (SAMPLE_TOKENS, TOKEN,
// renderPreview, templateValue), the SendMessageInitial interface, and the mutation payload are
// verbatim from the old file (format only).
import { useState } from 'react';
import { Dialog, TextField, Combobox, Button, dt } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useMessageTemplates, useSendMessage } from '../../../../lib/hooks/useCandidateMessages';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';
import { CandidateEmailTemplate } from '../../../../lib/types';

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
  // Best-effort, same as the templates admin page: a plain recruiter gets a 403 on this org-admin
  // endpoint, so isSuccess just stays false and the banner quietly doesn't render.
  const { data: integrations, isSuccess: integrationsLoaded } = useIntegrations();
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
    <Dialog open onClose={onClose} title="Send message" width={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {integrationsLoaded && integrations?.smtpConfigured === false && (
          <div style={{ borderRadius: 8, border: '1px solid color-mix(in srgb, #a16207 30%, var(--hair))', background: 'color-mix(in srgb, #a16207 8%, var(--paper))', padding: '10px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
            Candidate emails won&apos;t send until SMTP is configured in Organization settings.
          </div>
        )}
        <div>
          <label className="v2-label">Template</label>
          <Combobox
            width="100%"
            value={selectValue}
            onChange={handleTemplateChange}
            options={(templates ?? []).map((t, i) => ({ value: templateValue(t, i), label: t.name }))}
          />
        </div>
        <TextField id="msg-subject" label="Subject" value={subject} onChange={setSubject} required />
        <div>
          <label htmlFor="message-body" className="v2-label">Body</label>
          <textarea
            id="message-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Use {{candidateName}}, {{jobTitle}}, {{orgName}}, {{recruiterName}}, {{statusLink}}…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>
        <div>
          <h3 className="v2-label" style={{ marginBottom: 8 }}>Preview</h3>
          <div style={{ borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', padding: 12, fontSize: 13 }}>
            <p style={{ color: 'var(--ink)', fontWeight: 500 }}>{renderPreview(subject, candidateName)}</p>
            <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'color-mix(in srgb, var(--ink) 70%, transparent)' }}>{renderPreview(body, candidateName)}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
        <Button onClick={handleSend} loading={sendMessage.isPending} disabled={!canSend}>Send</Button>
      </div>
    </Dialog>
  );
}

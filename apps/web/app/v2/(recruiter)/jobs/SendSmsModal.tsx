'use client';

// SMS counterpart of SendMessageModal (Zoho #16) -- body-only (no subject, no From picker: a
// single org from-number). New file: deep-imports ui-v2 (no barrel), unlike the email modal it
// mirrors.
import { useState } from 'react';
import { Dialog } from '../../../../components/ui-v2/Dialog';
import { TextField } from '../../../../components/ui-v2/TextField';
import { Combobox } from '../../../../components/ui-v2/Combobox';
import { Button } from '../../../../components/ui-v2/Button';
import { useToast } from '../../../../components/ui';
import { useSmsTemplates } from '../../../../lib/hooks/useSmsTemplates';
import { useSendSms } from '../../../../lib/hooks/useCandidateSms';
import { useSmsConfig } from '../../../../lib/hooks/useSmsConfig';
import { CandidateSmsTemplate } from '../../../../lib/types';

// Same secondary-button look as ui-v2/DataTable.tsx's `dt.toolBtn`, inlined rather than imported:
// DataTable.tsx pulls in @tanstack/react-table, which isn't transformed under ts-jest and would
// break this file's tests.
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' };

// Same readable stand-ins as SendMessageModal's SAMPLE_TOKENS, minus statusLink (SMS bodies
// never carry the candidate status link).
const SAMPLE_TOKENS: Record<string, string> = {
  jobTitle: 'the role',
  orgName: 'your organization',
  recruiterName: 'the recruiting team',
};

const TOKEN = /\{\{(candidateName|jobTitle|orgName|recruiterName)\}\}/g;

function renderPreview(text: string, candidateName: string): string {
  return text.replace(TOKEN, (match, key: string) => (key === 'candidateName' ? candidateName : (SAMPLE_TOKENS[key] ?? match)));
}

// Default templates share id: null, so the raw id can't key a <Combobox> option -- fall back to
// a positional key for those, same as SendMessageModal's templateValue.
function templateValue(template: CandidateSmsTemplate, index: number): string {
  return template.id ?? `default-${index}`;
}

export interface SendSmsInitial {
  templateId: string | null;
  body: string;
}

interface SendSmsModalProps {
  entryId: string;
  candidateId: string;
  candidateName: string;
  onClose: () => void;
  /** Pre-fills body from a stage-move pendingSmsMessage without requiring a template pick. */
  initial?: SendSmsInitial | null;
}

export function SendSmsModal({ entryId, candidateId, candidateName, onClose, initial }: SendSmsModalProps) {
  const { data: templates } = useSmsTemplates();
  const sendSms = useSendSms(entryId, candidateId);
  // Best-effort like SendMessageModal's SMTP banner: a plain recruiter without org:manage_settings
  // just never sees this, and the banner quietly doesn't render.
  const { data: smsConfig, isSuccess: smsConfigLoaded } = useSmsConfig();
  const { toast } = useToast();
  const [selectValue, setSelectValue] = useState(initial?.templateId ?? '');
  const [body, setBody] = useState(initial?.body ?? '');

  function handleTemplateChange(value: string) {
    const template = (templates ?? []).find((t, i) => templateValue(t, i) === value);
    if (!template) return;
    setSelectValue(value);
    setBody(template.body);
  }

  function resolveTemplateId(): string | null {
    const template = (templates ?? []).find((t, i) => templateValue(t, i) === selectValue);
    return template ? template.id : (initial?.templateId ?? null);
  }

  function handleSend() {
    sendSms.mutate(
      { templateId: resolveTemplateId(), body: body.trim() },
      {
        onSuccess: () => {
          toast('SMS sent.');
          onClose();
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to send SMS.', 'error'),
      },
    );
  }

  const canSend = Boolean(body.trim());

  return (
    <Dialog open onClose={onClose} title="Send SMS" width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {smsConfigLoaded && (smsConfig?.configured === false || smsConfig?.smsEnabled === false) && (
          <div style={{ borderRadius: 8, border: '1px solid color-mix(in srgb, #a16207 30%, var(--hair))', background: 'color-mix(in srgb, #a16207 8%, var(--paper))', padding: '10px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
            Candidate SMS won&apos;t send until Twilio is configured and enabled in Organization settings.
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
        <div>
          <label htmlFor="sms-body" className="v2-label">Body</label>
          <textarea
            id="sms-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={1600}
            placeholder="Use {{candidateName}}, {{jobTitle}}, {{orgName}}, {{recruiterName}}…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>
        <div>
          <h3 className="v2-label" style={{ marginBottom: 8 }}>Preview</h3>
          <div style={{ borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', padding: 12, fontSize: 13 }}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'color-mix(in srgb, var(--ink) 70%, transparent)' }}>{renderPreview(body, candidateName)}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={toolBtn}>Cancel</button>
        <Button onClick={handleSend} loading={sendSms.isPending} disabled={!canSend}>Send</Button>
      </div>
    </Dialog>
  );
}

'use client';

// WhatsApp counterpart of SendMessageModal -- same structure, minus subject/sender-address (no
// From picker; WhatsApp sends from the org's single configured number) and body-only templates.
import { useState } from 'react';
import { Dialog } from '../../../../components/ui-v2/Dialog';
import { Combobox } from '../../../../components/ui-v2/Combobox';
import { Button } from '../../../../components/ui-v2/Button';
import { useToast } from '../../../../components/ui';
import { useWhatsappTemplates, useSendWhatsapp } from '../../../../lib/hooks/useCandidateWhatsapp';
import { WhatsappTemplate } from '../../../../lib/types';

const toolBtn: React.CSSProperties = { fontSize: 12.5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' };
const textarea: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };

// Same readable stand-ins as SendMessageModal's SAMPLE_TOKENS/renderPreview, minus statusLink
// (not part of the WhatsApp merge-token set per the templates default copy).
const SAMPLE_TOKENS: Record<string, string> = { jobTitle: 'the role', orgName: 'your organization', recruiterName: 'the recruiting team' };
const TOKEN = /\{\{(candidateName|jobTitle|orgName|recruiterName)\}\}/g;
function renderPreview(text: string, candidateName: string): string {
  return text.replace(TOKEN, (match, key: string) => (key === 'candidateName' ? candidateName : (SAMPLE_TOKENS[key] ?? match)));
}

// Default templates share id: null, so the raw id can't key a <Combobox> option -- fall back to a
// positional key for those, same convention as SendMessageModal's templateValue.
function templateValue(template: WhatsappTemplate, index: number): string {
  return template.id ?? `default-${index}`;
}

export interface SendWhatsappInitial {
  templateId: string | null;
  body: string;
}

interface SendWhatsappModalProps {
  entryId: string;
  candidateId: string;
  candidateName: string;
  onClose: () => void;
  /** Pre-fills body from a stage-move pendingWhatsappMessage without requiring a template pick. */
  initial?: SendWhatsappInitial | null;
}

export function SendWhatsappModal({ entryId, candidateId, candidateName, onClose, initial }: SendWhatsappModalProps) {
  const { data: templates } = useWhatsappTemplates();
  const sendWhatsapp = useSendWhatsapp(entryId, candidateId);
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
    sendWhatsapp.mutate(
      { templateId: resolveTemplateId(), body: body.trim() },
      {
        onSuccess: () => { toast('WhatsApp message sent.'); onClose(); },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to send WhatsApp message.', 'error'),
      },
    );
  }

  const canSend = Boolean(body.trim());

  return (
    <Dialog open onClose={onClose} title="Send WhatsApp message" width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          <label htmlFor="wa-message-body" className="v2-label">Message</label>
          <textarea
            id="wa-message-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="Use {{candidateName}}, {{jobTitle}}, {{orgName}}, {{recruiterName}}…"
            style={textarea}
          />
        </div>
        <div>
          <h3 className="v2-label" style={{ marginBottom: 8 }}>Preview</h3>
          <div style={{ borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', padding: 12, fontSize: 13 }}>
            <p style={{ whiteSpace: 'pre-wrap', color: 'color-mix(in srgb, var(--ink) 70%, transparent)', margin: 0 }}>{renderPreview(body, candidateName)}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onClose} className="v2-hoverbtn" style={toolBtn}>Cancel</button>
        <Button onClick={handleSend} loading={sendWhatsapp.isPending} disabled={!canSend}>Send</Button>
      </div>
    </Dialog>
  );
}

'use client';

// Bulk email to selected candidates. A re-skin of SendMessageModal for a batch: same template / from
// / subject / body / preview, but instead of one synchronous send it enqueues a background batch
// (BullMQ) and polls the batch for live {sent, skipped, failed} progress. Used from both the pipeline
// board (mode 'entries', selected entryIds) and the candidates list (mode 'candidates', candidateIds).
import { useEffect, useMemo, useState } from 'react';
import { Dialog, TextField, Combobox, Button, dt } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useMessageTemplates } from '../../../../lib/hooks/useCandidateMessages';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';
import { useOrgSenderAddresses } from '../../../../lib/hooks/useOrgSenderAddresses';
import {
  useSendBulkEmailByEntries,
  useSendBulkEmailByCandidates,
  useBulkEmailBatch,
} from '../../../../lib/hooks/useBulkCandidateEmail';
import { CandidateEmailTemplate } from '../../../../lib/types';

// Readable stand-ins for the tokens the server fills per-recipient. candidateName can't preview one
// name across many recipients, so it shows a generic stand-in.
const SAMPLE_TOKENS: Record<string, string> = {
  candidateName: 'the candidate',
  jobTitle: 'the role',
  orgName: 'your organization',
  recruiterName: 'the recruiting team',
  statusLink: 'https://example.com/application/sample',
};
const TOKEN = /\{\{(candidateName|jobTitle|orgName|recruiterName|statusLink)\}\}/g;
function renderPreview(text: string): string {
  return text.replace(TOKEN, (match, key: string) => SAMPLE_TOKENS[key] ?? match);
}

function templateValue(template: CandidateEmailTemplate, index: number): string {
  return template.id ?? `default-${index}`;
}

interface BulkEmailModalProps {
  mode: 'entries' | 'candidates';
  ids: string[];
  onClose: () => void;
  /** Called once the batch is enqueued so the host can clear its selection. */
  onEnqueued?: () => void;
}

export function BulkEmailModal({ mode, ids, onClose, onEnqueued }: BulkEmailModalProps) {
  const { data: templates } = useMessageTemplates();
  const { data: integrations, isSuccess: integrationsLoaded } = useIntegrations();
  const { data: senders } = useOrgSenderAddresses();
  const { toast } = useToast();
  const sendByEntries = useSendBulkEmailByEntries();
  const sendByCandidates = useSendBulkEmailByCandidates();

  const [selectValue, setSelectValue] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [senderAddressId, setSenderAddressId] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);

  const { data: batch } = useBulkEmailBatch(batchId);

  useEffect(() => {
    if (senderAddressId || !senders) return;
    const defaultSender = senders.find((s) => s.isDefault);
    if (defaultSender) setSenderAddressId(defaultSender.id);
  }, [senders, senderAddressId]);

  const pending = sendByEntries.isPending || sendByCandidates.isPending;

  function handleTemplateChange(value: string) {
    const template = (templates ?? []).find((t, i) => templateValue(t, i) === value);
    if (!template) return;
    setSelectValue(value);
    setSubject(template.subject);
    setBody(template.body);
  }

  function resolveTemplateId(): string | null {
    const template = (templates ?? []).find((t, i) => templateValue(t, i) === selectValue);
    return template ? template.id : null;
  }

  function handleSend() {
    const compose = {
      templateId: resolveTemplateId(),
      subject: subject.trim(),
      body: body.trim(),
      ...(senderAddressId ? { senderAddressId } : {}),
    };
    const onSuccess = (result: { batchId: string; total: number; unresolvedCandidateIds: string[] }) => {
      setBatchId(result.batchId);
      if (result.unresolvedCandidateIds.length > 0) {
        toast(`${result.unresolvedCandidateIds.length} candidate(s) had no application to email and were skipped.`);
      }
      onEnqueued?.();
    };
    const onError = (error: unknown) => toast(error instanceof Error ? error.message : 'Failed to queue emails.', 'error');

    if (mode === 'entries') sendByEntries.mutate({ ...compose, entryIds: ids }, { onSuccess, onError });
    else sendByCandidates.mutate({ ...compose, candidateIds: ids }, { onSuccess, onError });
  }

  const canSend = Boolean(subject.trim() && body.trim());
  const done = batch?.status === 'completed';

  // Once enqueued, the compose form is replaced by a live progress panel.
  const progress = useMemo(() => {
    if (!batchId) return null;
    if (!batch) return { headline: 'Queuing…', detail: '' };
    const processed = batch.sent + batch.skipped + batch.failed;
    return {
      headline: done ? 'Done' : `Sending… ${processed} of ${batch.total}`,
      detail: `${batch.sent} sent · ${batch.skipped} skipped · ${batch.failed} failed`,
    };
  }, [batchId, batch, done]);

  return (
    <Dialog open onClose={onClose} title={`Email ${ids.length} candidate${ids.length === 1 ? '' : 's'}`} width={680}>
      {progress ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{progress.headline}</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{progress.detail}</p>
          {!done && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>You can close this — sending continues in the background.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button onClick={onClose}>{done ? 'Close' : 'Close (keep sending)'}</Button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {integrationsLoaded && integrations?.smtpConfigured === false && (
              <div style={{ borderRadius: 8, border: '1px solid color-mix(in srgb, #a16207 30%, var(--hair))', background: 'color-mix(in srgb, #a16207 8%, var(--paper))', padding: '10px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
                Candidate emails won&apos;t send until SMTP is configured in Organization settings.
              </div>
            )}
            <div>
              <label className="v2-label">Template</label>
              <Combobox width="100%" value={selectValue} onChange={handleTemplateChange} options={(templates ?? []).map((t, i) => ({ value: templateValue(t, i), label: t.name }))} />
            </div>
            {senders && senders.length > 0 && (
              <div>
                <label className="v2-label">From</label>
                <Combobox width="100%" value={senderAddressId} onChange={setSenderAddressId} options={senders.map((s) => ({ value: s.id, label: s.isDefault ? `${s.label} (default)` : s.label }))} />
              </div>
            )}
            <TextField id="bulk-msg-subject" label="Subject" value={subject} onChange={setSubject} required />
            <div>
              <label htmlFor="bulk-message-body" className="v2-label">Body</label>
              <textarea
                id="bulk-message-body"
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
                <p style={{ color: 'var(--ink)', fontWeight: 500 }}>{renderPreview(subject)}</p>
                <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'color-mix(in srgb, var(--ink) 70%, transparent)' }}>{renderPreview(body)}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
            <Button onClick={handleSend} loading={pending} disabled={!canSend}>{`Send to ${ids.length} candidate${ids.length === 1 ? '' : 's'}`}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

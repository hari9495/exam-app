'use client';

// v2 Create-offer modal — re-skin of components/pipeline/CreateOfferModal on the v2 Dialog +
// primitives. All hooks, state, handlers (ensureOffer/handlePreview/handleSend), the offerId reuse
// logic, the template-seeding useEffect, and the mutation payloads are verbatim (format only).
import { useEffect, useState } from 'react';
import { Dialog, TextField, Button, dt } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useCreateOffer, useSendOffer, useOfferTemplate, usePreviewOfferPdf } from '../../../../lib/hooks/useOffers';
import { useIntegrations } from '../../../../lib/hooks/useIntegrations';

interface CreateOfferModalProps {
  entryId: string;
  candidateId: string;
  onClose: () => void;
}

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))',
  background: 'var(--paper)',
  color: 'var(--ink)',
  outline: 'none',
};

export function CreateOfferModal({ entryId, candidateId, onClose }: CreateOfferModalProps) {
  const { data: template } = useOfferTemplate();
  const createOffer = useCreateOffer(entryId, candidateId);
  const sendOffer = useSendOffer(candidateId);
  const previewPdf = usePreviewOfferPdf();
  // Best-effort, same as SendMessageModal: a plain recruiter gets a 403 on this org-admin
  // endpoint, so isSuccess just stays false and the banner quietly doesn't render.
  const { data: integrations, isSuccess: integrationsLoaded } = useIntegrations();
  const { toast } = useToast();

  const [compensation, setCompensation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // The draft Offer, once created -- reused across Preview/Send clicks so a second click doesn't
  // create a duplicate Offer row.
  const [offerId, setOfferId] = useState<string | null>(null);

  useEffect(() => {
    if (!template) return;
    setSubject((current) => current || template.subject);
    setBody((current) => current || template.body);
  }, [template]);

  const canSubmit = Boolean(compensation.trim() && startDate && expiresAt);

  async function ensureOffer(): Promise<string> {
    if (offerId) return offerId;
    const created = await createOffer.mutateAsync({
      compensation: compensation.trim(),
      startDate: new Date(startDate).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      subject: subject.trim() || undefined,
      body: body.trim() || undefined,
    });
    setOfferId(created.id);
    return created.id;
  }

  async function handlePreview() {
    try {
      const id = await ensureOffer();
      await previewPdf.mutateAsync(id);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to preview offer.', 'error');
    }
  }

  async function handleSend() {
    try {
      const id = await ensureOffer();
      await sendOffer.mutateAsync(id);
      toast('Offer sent.');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to send offer.', 'error');
    }
  }

  const busy = createOffer.isPending || sendOffer.isPending || previewPdf.isPending;

  return (
    <Dialog open onClose={onClose} title="Create offer" width={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {integrationsLoaded && integrations?.smtpConfigured === false && (
          <div style={{ borderRadius: 8, border: '1px solid color-mix(in srgb, #a16207 30%, var(--hair))', background: 'color-mix(in srgb, #a16207 8%, var(--paper))', padding: '10px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
            Candidate emails won&apos;t send until SMTP is configured in Organization settings.
          </div>
        )}
        <TextField id="offer-comp" label="Compensation" value={compensation} onChange={setCompensation} placeholder="e.g. $120,000/yr" required />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label htmlFor="offer-start-date" className="v2-label">Start date</label>
            <input id="offer-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={input} />
          </div>
          <div>
            <label htmlFor="offer-expires-at" className="v2-label">Expires</label>
            <input id="offer-expires-at" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required style={input} />
          </div>
        </div>
        <TextField id="offer-subject" label="Subject" value={subject} onChange={setSubject} />
        <div>
          <label htmlFor="offer-body" className="v2-label">Letter body</label>
          <textarea id="offer-body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onClose} style={dt.toolBtn}>Cancel</button>
        <button type="button" onClick={handlePreview} disabled={!canSubmit || busy} style={{ ...dt.toolBtn, opacity: (!canSubmit || busy) ? 0.5 : 1, cursor: (!canSubmit || busy) ? 'not-allowed' : 'pointer' }}>{previewPdf.isPending ? 'Preparing…' : 'Preview PDF'}</button>
        <Button onClick={handleSend} loading={sendOffer.isPending} disabled={!canSubmit || busy}>Send</Button>
      </div>
    </Dialog>
  );
}

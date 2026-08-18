'use client';

import { useEffect, useState } from 'react';
import { Modal, Button, Input, useToast } from '../ui';
import { useCreateOffer, useSendOffer, useOfferTemplate, usePreviewOfferPdf } from '../../lib/hooks/useOffers';
import { useIntegrations } from '../../lib/hooks/useIntegrations';

interface CreateOfferModalProps {
  entryId: string;
  candidateId: string;
  onClose: () => void;
}

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
    <Modal
      open
      title="Create offer"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handlePreview} loading={previewPdf.isPending} disabled={!canSubmit || busy}>
            Preview PDF
          </Button>
          <Button onClick={handleSend} loading={sendOffer.isPending} disabled={!canSubmit || busy}>
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {integrationsLoaded && integrations?.smtpConfigured === false && (
          <div className="rounded-md bg-status-warning-bg p-3 text-sm text-status-warning">
            Candidate emails won&apos;t send until SMTP is configured in Organization settings.
          </div>
        )}
        <Input label="Compensation" value={compensation} onChange={setCompensation} placeholder="e.g. $120,000/yr" required />
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="offer-start-date" className="text-sm font-medium text-gray-700">
              Start date
            </label>
            <input
              id="offer-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="offer-expires-at" className="text-sm font-medium text-gray-700">
              Expires
            </label>
            <input
              id="offer-expires-at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <Input label="Subject" value={subject} onChange={setSubject} />
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-body" className="text-sm font-medium text-gray-700">
            Letter body
          </label>
          <textarea
            id="offer-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}

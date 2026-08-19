'use client';

import { useEffect, useState } from 'react';
import { Button, Input, useToast } from '../../../components/ui';
import { PageHeader, PageSurface } from '../../../components/PageChrome';
import { useAuth } from '../../../lib/auth-context';
import { useOfferTemplate, useUpdateOfferTemplate } from '../../../lib/hooks/useOffers';

const OFFER_TOKENS = ['candidateName', 'jobTitle', 'orgName', 'recruiterName', 'compensation', 'startDate', 'offerExpiry', 'offerLink'];

export default function OfferTemplatePage() {
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { data: template, isLoading } = useOfferTemplate();
  const update = useUpdateOfferTemplate();
  const { toast } = useToast();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  }, [template]);

  function insertToken(token: string) {
    setBody((current) => `${current}{{${token}}}`);
  }

  function handleSave() {
    update.mutate(
      { subject: subject.trim(), body: body.trim() },
      {
        onSuccess: () => toast('Offer template saved.'),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save template.', 'error'),
      },
    );
  }

  const canSave = Boolean(subject.trim() && body.trim());

  if (!canManage) {
    return <p className="text-sm text-muted">You don&apos;t have access to this page.</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-muted">Loading&hellip;</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="OFFERS"
        title="Offer Template"
        subtitle="Control the subject and body of the offer letter email sent to candidates."
      />

      <PageSurface className="flex flex-col gap-4 p-6">
        <Input label="Subject" value={subject} onChange={setSubject} required />

        <div className="flex flex-col gap-1">
          <label htmlFor="offer-template-body" className="text-sm font-medium text-gray-700">
            Body
          </label>
          <div className="flex flex-wrap gap-1.5">
            {OFFER_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertToken(token)}
                className="rounded border border-rule px-2 py-0.5 text-xs text-ink hover:bg-ground"
              >
                {`{{${token}}}`}
              </button>
            ))}
          </div>
          <textarea
            id="offer-template-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={update.isPending} disabled={!canSave}>
            Save
          </Button>
        </div>
      </PageSurface>
    </div>
  );
}

'use client';

// v2 Offer Template — single editor form (not a table). Format only, existing hooks
// (useOfferTemplate / useUpdateOfferTemplate). Subject + body with merge-token buttons.
import { useEffect, useState } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { useOfferTemplate, useUpdateOfferTemplate } from '../../../../lib/hooks/useOffers';
import { Card, TextField, Button, dt } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const OFFER_TOKENS = ['candidateName', 'jobTitle', 'orgName', 'recruiterName', 'compensation', 'startDate', 'offerExpiry', 'offerLink'];

export default function V2OfferTemplatePage() {
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { data: template, isLoading } = useOfferTemplate();
  const update = useUpdateOfferTemplate();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => { if (template) { setSubject(template.subject); setBody(template.body); } }, [template]);

  const canSave = Boolean(subject.trim() && body.trim());
  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    update.mutate({ subject: subject.trim(), body: body.trim() }, {
      onSuccess: () => notify('success', 'Offer template saved.'),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save template.'),
    });
  }

  if (!canManage) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>You don&apos;t have access to this page.</p>;

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Offer Template</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Control the subject and body of the offer letter email sent to candidates.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <Card style={{ padding: 22 }}>
        {isLoading ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
        ) : (
          <form onSubmit={handleSave}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TextField id="offer-subject" label="Subject" value={subject} onChange={setSubject} required autoComplete="off" />
              <div>
                <label htmlFor="offer-body" className="v2-label">Body</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 8px' }}>
                  {OFFER_TOKENS.map((t) => (
                    <button key={t} type="button" onClick={() => setBody((c) => `${c}{{${t}}}`)} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{`{{${t}}}`}</button>
                  ))}
                </div>
                <textarea id="offer-body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <Button type="submit" loading={update.isPending} disabled={!canSave}>Save</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

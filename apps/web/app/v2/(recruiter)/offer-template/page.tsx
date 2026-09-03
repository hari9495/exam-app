'use client';

// v2 Offer Template — editor + live email preview (design A). Format only, existing hooks
// (useOfferTemplate / useUpdateOfferTemplate). Merge tokens insert via a dropdown; the preview
// renders subject/body with sample values substituted so recruiters see the real email.
import { useEffect, useState } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { useOfferTemplate, useUpdateOfferTemplate } from '../../../../lib/hooks/useOffers';
import { TextField, Button, Dropdown, DropdownItem } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const OFFER_TOKENS = ['candidateName', 'jobTitle', 'orgName', 'recruiterName', 'compensation', 'startDate', 'offerExpiry', 'offerLink'];

// Readable sample values for the live preview — the server fills these from real data at send time.
const SAMPLE: Record<string, string> = {
  candidateName: 'Ada Chen', jobTitle: 'Senior Engineer', orgName: 'Acme Inc.', recruiterName: 'Jordan from Recruiting',
  compensation: '$145,000 / year', startDate: 'March 3, 2026', offerExpiry: 'March 10, 2026', offerLink: 'acme.com/offer/a1b2',
};
const TOKEN_RE = /\{\{(\w+)\}\}/g;
const render = (text: string) => text.replace(TOKEN_RE, (m, k: string) => SAMPLE[k] ?? m);

const editorCard: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const bodyInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };

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
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Offer Template</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Control the subject and body of the offer letter email sent to candidates.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <div className="wf-editor">
        <div className="wf-editor-grid">
          <div style={editorCard}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Offer email</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, marginBottom: 16, lineHeight: 1.5 }}>The email candidates receive with their offer letter.</div>
            {isLoading ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
            ) : (
              <form onSubmit={handleSave}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <TextField id="offer-subject" label="Subject" value={subject} onChange={setSubject} required autoComplete="off" />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label htmlFor="offer-body" className="v2-label" style={{ marginBottom: 0 }}>Body</label>
                      <Dropdown align="end" menuWidth={190} trigger={
                        <span className="v2-hoverbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--org-primary)', color: 'var(--org-primary)', background: 'var(--paper)', cursor: 'pointer' }}>Insert token</span>
                      }>
                        {(close) => OFFER_TOKENS.map((t) => (
                          <DropdownItem key={t} onClick={() => { close(); setBody((c) => `${c}{{${t}}}`); }}>
                            <span className="v2-mono" style={{ fontSize: 12 }}>{`{{${t}}}`}</span>
                          </DropdownItem>
                        ))}
                      </Dropdown>
                    </div>
                    <textarea id="offer-body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} style={bodyInput} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <Button type="submit" loading={update.isPending} disabled={!canSave}>Save</Button>
                </div>
              </form>
            )}
          </div>

          <div style={{ position: 'sticky', top: 20, background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 10 }}>Preview</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hair)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', background: 'var(--paper)' }}>
                {render(subject).trim() || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Subject…</span>}
              </div>
              <div style={{ padding: 14, fontSize: 13, color: 'color-mix(in srgb, var(--ink) 78%, transparent)', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 160 }}>
                {render(body).trim() || <span style={{ color: 'var(--muted)' }}>The email body will appear here…</span>}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 0' }}>Sample values shown; real candidate data is filled in when the offer is sent.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

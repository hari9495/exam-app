'use client';

// Candidate nurture / drip campaigns: build an ordered email sequence, target a talent-pool stage
// (auto-enrol) or enrol manually, enable it, and the hourly drip sweep sends due steps. Workfox Azure
// tokens only. Backend: apps/api/src/drip/*.
import { useState } from 'react';
import { Button, Combobox } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useCampaigns, useCreateCampaign, useUpdateCampaign, useSetCampaignEnabled, useDeleteCampaign, CampaignInput } from '../../../../lib/hooks/useCampaigns';
import type { DripCampaign, DripStep } from '../../../../lib/types';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 500, color: ink, marginBottom: 6 };
const textInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, outline: 'none' };
const ghostBtn: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 16%, var(--hair))', background: 'var(--paper)', color: ink, cursor: 'pointer' };

// Duplicated web-side (the web bundle can't import shared runtime VALUES). Mirrors GLOBAL_STAGES;
// 'hired' is intentionally omitted (a hired candidate should never be nurtured). '' = manual only.
const STAGE_OPTIONS = [
  { value: '', label: 'Manual enrolment only' },
  { value: 'available', label: 'Available (re-engageable pool)' },
  { value: 'new', label: 'New' },
  { value: 'in_review', label: 'In review' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
];
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGE_OPTIONS.map((o) => [o.value, o.label]));

const emptyStep = (): DripStep => ({ subject: '', body: '', delayDays: 0 });

interface Draft { id: string | null; name: string; targetGlobalStage: string; steps: DripStep[] }

function StepEditor({ index, step, onChange, onRemove }: { index: number; step: DripStep; onChange: (s: DripStep) => void; onRemove: () => void }) {
  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>Step {index + 1}</span>
        <button type="button" style={ghostBtn} onClick={onRemove}>Remove</button>
      </div>
      <label>
        <span style={label}>{index === 0 ? 'Send this many days after enrolment' : 'Days after the previous step'}</span>
        <input type="number" min={0} max={365} value={step.delayDays} onChange={(e) => onChange({ ...step, delayDays: Math.max(0, Number(e.target.value) || 0) })} style={{ ...textInput, maxWidth: 160 }} />
      </label>
      <label>
        <span style={label}>Subject</span>
        <input value={step.subject} onChange={(e) => onChange({ ...step, subject: e.target.value })} style={textInput} placeholder="e.g. A role that fits you at {{orgName}}" />
      </label>
      <label>
        <span style={label}>Body</span>
        <textarea value={step.body} onChange={(e) => onChange({ ...step, body: e.target.value })} rows={5} style={{ ...textInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} placeholder="Hi {{candidateName}}, ..." />
      </label>
    </div>
  );
}

export default function CampaignsPage() {
  const { data: campaigns } = useCampaigns();
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const setEnabled = useSetCampaignEnabled();
  const remove = useDeleteCampaign();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  function startNew() { setError(null); setDraft({ id: null, name: '', targetGlobalStage: '', steps: [emptyStep()] }); }
  function startEdit(c: DripCampaign) {
    setError(null);
    setDraft({ id: c.id, name: c.name, targetGlobalStage: c.targetGlobalStage ?? '', steps: c.steps.length ? c.steps : [emptyStep()] });
  }

  function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setError('Give the campaign a name.'); return; }
    if (draft.steps.length === 0) { setError('Add at least one step.'); return; }
    for (const [i, s] of draft.steps.entries()) {
      if (!s.subject.trim() || !s.body.trim()) { setError(`Step ${i + 1}: subject and body are required.`); return; }
    }
    setError(null);
    const input: CampaignInput = { name: draft.name.trim(), targetGlobalStage: draft.targetGlobalStage || undefined, steps: draft.steps };
    const onDone = { onSuccess: () => { toast('Campaign saved.'); setDraft(null); }, onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save.') };
    if (draft.id) update.mutate({ id: draft.id, input }, onDone);
    else create.mutate(input, onDone);
  }

  function updateStep(i: number, s: DripStep) { setDraft((d) => (d ? { ...d, steps: d.steps.map((x, j) => (j === i ? s : x)) } : d)); }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Campaigns</h1>
          <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>Nurture the talent pool with scheduled email sequences. Candidates auto-enrol when they reach a target stage, or add them manually; a hired or unsubscribed candidate exits automatically.</p>
        </div>
        {!draft && <Button onClick={startNew}>New campaign</Button>}
      </div>

      {draft ? (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="wf-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label>
              <span style={label}>Campaign name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={textInput} placeholder="e.g. Re-engage past candidates" />
            </label>
            <div>
              <span style={label}>Auto-enrol trigger</span>
              <Combobox options={STAGE_OPTIONS} value={draft.targetGlobalStage} onChange={(v) => setDraft({ ...draft, targetGlobalStage: v })} width="100%" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {draft.steps.map((s, i) => (
              <StepEditor key={i} index={i} step={s} onChange={(st) => updateStep(i, st)} onRemove={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} />
            ))}
            <button type="button" style={{ ...ghostBtn, alignSelf: 'flex-start' }} onClick={() => setDraft({ ...draft, steps: [...draft.steps, emptyStep()] })}>Add step</button>
          </div>

          <p style={{ fontSize: 12, color: muted, margin: 0 }}>Placeholders: {'{{candidateName}}, {{jobTitle}}, {{orgName}}, {{recruiterName}}, {{statusLink}}'}. Every email carries your org branding + an unsubscribe link.</p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button onClick={save} loading={saving}>{draft.id ? 'Save changes' : 'Create campaign'}</Button>
            <button type="button" style={ghostBtn} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
            {error && <span role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>{error}</span>}
          </div>
        </div>
      ) : !campaigns ? (
        <div style={card} aria-busy="true"><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div>
      ) : campaigns.length === 0 ? (
        <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>No campaigns yet. Create one to start nurturing your talent pool.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campaigns.map((c) => (
            <div key={c.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: ink }}>{c.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: c.enabled ? 'var(--org-primary)' : muted, background: c.enabled ? 'color-mix(in srgb, var(--org-primary) 12%, transparent)' : 'var(--surface)', borderRadius: 99, padding: '2px 9px' }}>{c.enabled ? 'Active' : 'Off'}</span>
                </div>
                <div style={{ fontSize: 12.5, color: muted, marginTop: 3 }}>
                  {c.steps.length} step{c.steps.length === 1 ? '' : 's'} · {c.targetGlobalStage ? `Auto: ${STAGE_LABEL[c.targetGlobalStage] ?? c.targetGlobalStage}` : 'Manual enrolment'}
                  {typeof c.activeEnrolments === 'number' ? ` · ${c.activeEnrolments} active` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" style={ghostBtn} disabled={setEnabled.isPending} onClick={() => setEnabled.mutate({ id: c.id, enabled: !c.enabled }, { onError: (e) => toast(e instanceof Error ? e.message : 'Failed.', 'error') })}>
                  {c.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" style={ghostBtn} onClick={() => startEdit(c)}>Edit</button>
                <button type="button" style={ghostBtn} onClick={() => { if (confirm(`Delete campaign "${c.name}"? Active enrolments will stop.`)) remove.mutate(c.id, { onSuccess: () => toast('Campaign deleted.'), onError: (e) => toast(e instanceof Error ? e.message : 'Failed.', 'error') }); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

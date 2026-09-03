'use client';

// v2 Settings -> Approvals (org-admin). Config surface for the approval chains the backend
// approvals engine reads: one card per gate (requisition, offer) with an enable toggle and a
// step-list editor (ChainEditor). Same shape as the sso/billing settings pages: title+description
// header, static cards, inline notice for save feedback.
import { useEffect, useState } from 'react';
import { useApprovalChains, useUpsertApprovalChain } from '../../../../../lib/hooks/useApprovals';
import { Button } from '../../../../../components/ui-v2/Button';
import { Cb } from '../../../../../components/ui-v2/DataTable';
import { STATUS } from '../../../../../components/ui-v2/viz';
import type { ApprovalChain, ApprovalGate, ApprovalChainStep } from '../../../../../lib/types';
import { ChainEditor, chainReducer, type EditorStep } from './ChainEditor';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };

type Notice = { type: 'success' | 'error'; text: string } | null;

function toEditorStep(step: ApprovalChainStep): EditorStep {
  return { name: step.name, approverType: step.approverType, approverUserIds: step.approverUserIds, managerLevel: step.managerLevel };
}

function GateCard({ gate, title, description, initial }: { gate: ApprovalGate; title: string; description: string; initial: ApprovalChain | undefined }) {
  const upsert = useUpsertApprovalChain();
  const [enabled, setEnabled] = useState(false);
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  // Saving one gate invalidates the shared ['approvals','chains'] query, which refetches
  // {requisition,offer} together — changing `initial`'s reference for BOTH cards. Without this
  // guard that would re-run this effect and clobber unsaved edits on whichever card the admin
  // didn't just save. Only re-seed while pristine; a save clears dirty once its own edits are
  // the saved truth, so the next (matching) refetch re-seeds harmlessly.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!initial || dirty) return;
    setEnabled(initial.enabled);
    setSteps(initial.steps.map(toEditorStep));
  }, [initial, dirty]);

  function handleEnabledChange(v: boolean) {
    setEnabled(v);
    setDirty(true);
  }

  function dispatch(action: Parameters<typeof chainReducer>[1]) {
    setSteps((s) => chainReducer(s, action));
    setDirty(true);
  }

  function handleSave() {
    setNotice(null);
    upsert.mutate(
      {
        gate,
        enabled,
        steps: steps.map((s) => ({
          name: s.name,
          approverType: s.approverType,
          approverUserIds: s.approverType === 'users' ? s.approverUserIds : undefined,
          managerLevel: s.approverType === 'reporting_manager' ? s.managerLevel ?? undefined : undefined,
        })),
      },
      {
        onSuccess: () => { setDirty(false); setNotice({ type: 'success', text: `${title} chain saved.` }); },
        onError: (err) => setNotice({ type: 'error', text: err instanceof Error ? err.message : `Failed to save the ${title.toLowerCase()} chain.` }),
      },
    );
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={sectionTitle}>{title}</h2>
          <p style={desc}>{description}</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ink, cursor: 'pointer' }}>
          <Cb checked={enabled} onChange={handleEnabledChange} />
          Require approval
        </label>
      </div>

      {enabled && (
        <div style={{ marginTop: 16 }}>
          <ChainEditor steps={steps} dispatch={dispatch} />
        </div>
      )}

      {notice && (
        <div role="status" style={{ marginTop: 14, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Button onClick={handleSave} loading={upsert.isPending}>Save {title.toLowerCase()} chain</Button>
      </div>
    </section>
  );
}

export default function V2ApprovalsSettingsPage() {
  const { data } = useApprovalChains();

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Approvals</h1>
        <p style={{ ...desc, marginTop: 6 }}>Configure who must sign off before a requisition opens or an offer goes out.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <GateCard gate="requisition" title="Requisition approval" description="Runs before a new job requisition can open." initial={data?.requisition} />
        <GateCard gate="offer" title="Offer approval" description="Runs before an offer can be sent to a candidate." initial={data?.offer} />
      </div>
    </div>
  );
}

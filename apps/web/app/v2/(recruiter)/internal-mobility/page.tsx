'use client';

// Internal mobility: any staff member can apply to an open internal role themselves and track their
// own applications. Applying lands them in the role's pipeline (enteredVia='internal'), credited to
// their own account. Workfox Azure tokens only. Backend: apps/api/src/internal-applications/*.
import { useState } from 'react';
import { useInternalJobs, useMyApplications, useApplyInternal } from '../../../../lib/hooks/useInternalApplications';
import { useToast } from '../../../../components/ui';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px' };
const tabBtn = (active: boolean): React.CSSProperties => ({ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: 'none', background: active ? 'color-mix(in srgb, var(--org-primary) 12%, transparent)' : 'transparent', color: active ? 'var(--org-primary)' : muted, cursor: 'pointer' });
const applyBtn = (busy: boolean): React.CSSProperties => ({ fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--org-primary)', background: 'var(--org-primary)', color: 'var(--org-on-primary, #fff)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' });

function StatusPill({ text, tone }: { text: string; tone: 'primary' | 'muted' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--danger)' : tone === 'primary' ? 'var(--org-primary)' : muted;
  return <span style={{ fontSize: 11, fontWeight: 500, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, borderRadius: 99, padding: '2px 9px' }}>{text}</span>;
}

export default function InternalMobilityPage() {
  const [tab, setTab] = useState<'roles' | 'mine'>('roles');
  const { data: jobs } = useInternalJobs();
  const { data: mine } = useMyApplications();
  const apply = useApplyInternal();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleApply(jobId: string, title: string) {
    setPendingId(jobId);
    apply.mutate(jobId, {
      onSuccess: () => { toast(`Applied to ${title}.`); setTab('mine'); },
      onError: (e) => toast(e instanceof Error ? e.message : 'Could not apply.', 'error'),
      onSettled: () => setPendingId(null),
    });
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Internal mobility</h1>
        <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>Apply to open roles inside the company and track where your applications get to. Applying adds you to the role&apos;s pipeline under your own name.</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--hair)', paddingBottom: 8 }}>
        <button type="button" style={tabBtn(tab === 'roles')} onClick={() => setTab('roles')}>Open roles</button>
        <button type="button" style={tabBtn(tab === 'mine')} onClick={() => setTab('mine')}>My applications</button>
      </div>

      {tab === 'roles' && (
        !jobs ? (
          <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div>
        ) : jobs.length === 0 ? (
          <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>No open roles right now.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jobs.map((j) => (
              <div key={j.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>{j.title}</div>
                  <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>
                    {[j.department, j.location].filter(Boolean).join(' · ') || 'Open role'}
                  </div>
                </div>
                <button type="button" style={applyBtn(pendingId === j.id)} disabled={pendingId === j.id} onClick={() => handleApply(j.id, j.title)}>
                  {pendingId === j.id ? 'Applying…' : 'Apply'}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'mine' && (
        !mine ? (
          <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div>
        ) : mine.length === 0 ? (
          <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>You haven&apos;t applied to any internal roles yet.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mine.map((a) => (
              <div key={a.entryId} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>{a.jobTitle}</div>
                  <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>Applied {new Date(a.appliedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                </div>
                <StatusPill text={a.status} tone={a.status === 'Not selected' ? 'bad' : a.status === 'Archived' ? 'muted' : 'primary'} />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

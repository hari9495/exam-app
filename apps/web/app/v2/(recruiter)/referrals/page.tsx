'use client';

// Employee referral portal. Any staffer can refer someone to an open role + track their own
// referrals; recruiters (candidate:view) also see all referrals and manage the reward status.
// Workfox Azure tokens only. Backend: apps/api/src/referrals/*.
import { useState } from 'react';
import { Button, Combobox } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useAuth } from '../../../../lib/auth-context';
import { useReferableJobs, useMyReferrals, useAllReferrals, useSubmitReferral, useSetReferralReward } from '../../../../lib/hooks/useReferrals';
import type { ReferralRow } from '../../../../lib/types';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 500, color: ink, marginBottom: 6 };
const textInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, outline: 'none' };
const tabBtn = (active: boolean): React.CSSProperties => ({ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: 'none', background: active ? 'color-mix(in srgb, var(--org-primary) 12%, transparent)' : 'transparent', color: active ? 'var(--org-primary)' : muted, cursor: 'pointer' });

const REWARD_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
];
const REWARD_LABEL: Record<string, string> = Object.fromEntries(REWARD_OPTIONS.map((o) => [o.value, o.label]));
const MANAGE_ROLES = ['recruiter', 'org_admin', 'hiring_manager', 'super_admin'];
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function StatusPill({ text, tone }: { text: string; tone: 'primary' | 'muted' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'var(--org-primary)' : tone === 'bad' ? 'var(--danger)' : tone === 'primary' ? 'var(--org-primary)' : muted;
  return <span style={{ fontSize: 11, fontWeight: 500, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, borderRadius: 99, padding: '2px 9px' }}>{text}</span>;
}

function ReferralList({ rows, showReferrer, manage }: { rows: ReferralRow[]; showReferrer: boolean; manage?: (id: string, rewardStatus: string) => void }) {
  if (rows.length === 0) return <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>No referrals yet.</p></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>{r.candidateName} <span style={{ fontSize: 12.5, fontWeight: 400, color: muted }}>· {r.jobTitle}</span></div>
            <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>
              {r.candidateEmail}{showReferrer && r.referrerName ? ` · referred by ${r.referrerName}` : ''} · {new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusPill text={r.status} tone={r.status === 'Rejected' ? 'bad' : r.status === 'Archived' ? 'muted' : 'primary'} />
            {manage ? (
              <Combobox options={REWARD_OPTIONS} value={r.rewardStatus} onChange={(v) => manage(r.id, v)} width={130} />
            ) : (
              <StatusPill text={`Reward: ${REWARD_LABEL[r.rewardStatus] ?? r.rewardStatus}`} tone={r.rewardStatus === 'paid' ? 'good' : r.rewardStatus === 'rejected' ? 'bad' : 'muted'} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReferralsPage() {
  const { role } = useAuth();
  const canManage = MANAGE_ROLES.includes(role ?? '');
  const [tab, setTab] = useState<'refer' | 'mine' | 'all'>('refer');

  const { data: jobs } = useReferableJobs();
  const { data: mine } = useMyReferrals();
  const { data: all } = useAllReferrals(canManage && tab === 'all');
  const submit = useSubmitReferral();
  const setReward = useSetReferralReward();
  const { toast } = useToast();

  const [jobId, setJobId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const jobOptions = (jobs ?? []).map((j) => ({ value: j.id, label: j.department ? `${j.title} · ${j.department}` : j.title }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId) { setError('Pick a role.'); return; }
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return; }
    if (resume && resume.size > MAX_RESUME_BYTES) { setError('Résumé must be a PDF under 5 MB.'); return; }
    setError(null);
    try {
      const resumeBase64 = resume ? await readFileAsBase64(resume) : undefined;
      await submit.mutateAsync({ jobId, name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, note: note.trim() || undefined, resumeBase64 });
      toast('Referral submitted.');
      setName(''); setEmail(''); setPhone(''); setNote(''); setResume(null); setJobId('');
      setTab('mine');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit.');
    }
  }

  function updateReward(id: string, rewardStatus: string) {
    setReward.mutate({ id, rewardStatus }, { onSuccess: () => toast('Reward updated.'), onError: (e) => toast(e instanceof Error ? e.message : 'Failed.', 'error') });
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Referrals</h1>
        <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>Refer someone for an open role and track where they get to. Referred candidates enter the pipeline credited to you.</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--hair)', paddingBottom: 8 }}>
        <button type="button" style={tabBtn(tab === 'refer')} onClick={() => setTab('refer')}>Refer someone</button>
        <button type="button" style={tabBtn(tab === 'mine')} onClick={() => setTab('mine')}>My referrals</button>
        {canManage && <button type="button" style={tabBtn(tab === 'all')} onClick={() => setTab('all')}>All referrals</button>}
      </div>

      {tab === 'refer' && (
        <form onSubmit={handleSubmit} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span style={label}>Open role</span>
            <Combobox options={jobOptions} value={jobId} onChange={setJobId} width="100%" placeholder={jobOptions.length ? 'Choose a role…' : 'No open roles'} />
          </div>
          <div className="wf-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label><span style={label}>Their name</span><input value={name} onChange={(e) => setName(e.target.value)} style={textInput} /></label>
            <label><span style={label}>Their email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={textInput} /></label>
          </div>
          <label><span style={label}>Their phone (optional)</span><input value={phone} onChange={(e) => setPhone(e.target.value)} style={textInput} /></label>
          <label><span style={label}>Résumé PDF (optional)</span>
            <input type="file" accept="application/pdf" onChange={(e) => setResume(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: muted }} />
          </label>
          <label><span style={label}>Why you&apos;re referring them (optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ ...textInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} /></label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button type="submit" loading={submit.isPending}>Submit referral</Button>
            {error && <span role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>{error}</span>}
          </div>
        </form>
      )}

      {tab === 'mine' && (!mine ? <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div> : <ReferralList rows={mine} showReferrer={false} />)}
      {tab === 'all' && canManage && (!all ? <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div> : <ReferralList rows={all} showReferrer manage={updateReward} />)}
    </div>
  );
}

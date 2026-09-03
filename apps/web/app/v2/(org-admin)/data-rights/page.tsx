'use client';

// v2 Candidate Data Rights — format-only re-skin of the old (org-admin)/data-rights page. Same hooks
// (useLookupCandidate/useExportCandidate/useEraseCandidate) and identical logic: look up by email,
// export the full record (JSON download), or erase with type-to-confirm. Old Card/Table/Modal/Input
// → v2 card styling + shared DataTable + v2 Dialog + TextField; useToast → inline notice banner.
import { useState } from 'react';
import { Download, ShieldAlert, Trash2, UserSearch } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useLookupCandidate, useExportCandidate, useEraseCandidate } from '../../../../lib/hooks/useCandidateDataRights';
import type { Candidate, CandidateDataExport } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, Pill, Dialog, TextField, Button } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

type ExportInvitation = CandidateDataExport['invitations'][number];
type ExportAttempt = CandidateDataExport['attempts'][number];

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '20px 22px' };
const RISK_COLOR: Record<string, string> = { low: STATUS.ok, medium: STATUS.warn, high: STATUS.bad };
const summaryLink: React.CSSProperties = { cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--org-primary)' };

const INVITATION_COLUMNS: ColumnDef<typeof DT_FEATURES, ExportInvitation>[] = [
  { id: 'index', enableSorting: false, header: () => <span style={dt.muted}>#</span>, cell: ({ row }) => <span style={dt.muted}>{row.index + 1}</span> },
  { accessorKey: 'examTitle', enableSorting: false, header: () => <span style={dt.muted}>Exam</span>, cell: ({ row }) => <span style={{ color: 'var(--ink)' }}>{row.original.examTitle}</span> },
  { accessorKey: 'status', enableSorting: false, header: () => <span style={dt.muted}>Status</span>, cell: ({ row }) => <span style={dt.muted}>{row.original.status}</span> },
  { accessorKey: 'invitedAt', enableSorting: false, header: () => <span style={dt.muted}>Invited</span>, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.invitedAt).toLocaleDateString()}</span> },
  { accessorKey: 'expiresAt', enableSorting: false, header: () => <span style={dt.muted}>Expires</span>, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.expiresAt).toLocaleDateString()}</span> },
  { accessorKey: 'revokedAt', enableSorting: false, header: () => <span style={dt.muted}>Revoked</span>, cell: ({ row }) => <span style={dt.muted}>{row.original.revokedAt ? new Date(row.original.revokedAt).toLocaleDateString() : '—'}</span> },
];

// The export payload carries far more than a recruiter can scan at once -- <details> keeps each
// attempt compact by default while still making the full record reachable on screen.
function AttemptRecord({ attempt }: { attempt: ExportAttempt }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{attempt.examTitle}</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
            Started {new Date(attempt.startedAt).toLocaleString()}
            {attempt.submittedAt ? ` · Submitted ${new Date(attempt.submittedAt).toLocaleString()}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <Pill c="var(--muted)" label={attempt.status} />
          {attempt.result && <Pill c={attempt.result.passFail === 'pass' ? STATUS.ok : STATUS.bad} label={`${attempt.result.score}/${attempt.result.maxScore} (${attempt.result.percentage.toFixed(1)}%)`} />}
        </div>
      </div>

      {attempt.proctoringAnalysis?.riskLevel && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
          <Pill c={RISK_COLOR[attempt.proctoringAnalysis.riskLevel] ?? 'var(--muted)'} label={`Proctoring risk: ${attempt.proctoringAnalysis.riskLevel}`} />
          {attempt.proctoringAnalysis.summary && <span>{attempt.proctoringAnalysis.summary}</span>}
        </div>
      )}

      {attempt.insight?.summary && <p style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}><span style={{ fontWeight: 500, color: 'var(--ink)' }}>AI insight: </span>{attempt.insight.summary}</p>}

      {attempt.deviceFingerprint && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>Device: {attempt.deviceFingerprint}</p>}

      {attempt.answers.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={summaryLink}>Answers ({attempt.answers.length})</summary>
          <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '2px solid var(--hair)', paddingLeft: 12, listStyle: 'none' }}>
            {attempt.answers.map((answer, index) => (
              <li key={index} style={{ fontSize: 13 }}>
                <p style={{ color: 'var(--ink)', margin: 0 }}>{answer.questionText}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                  {answer.selectedOptions.join(', ') || '—'}
                  {answer.isCorrect !== null ? (answer.isCorrect ? ' · Correct' : ' · Incorrect') : ''}
                  {answer.marksAwarded !== null ? ` · ${answer.marksAwarded} marks` : ''}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {attempt.proctoringEvents.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={summaryLink}>Proctoring events ({attempt.proctoringEvents.length})</summary>
          <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '2px solid var(--hair)', paddingLeft: 12, fontSize: 12, color: 'var(--muted)', listStyle: 'none' }}>
            {attempt.proctoringEvents.map((event, index) => <li key={index}>{new Date(event.occurredAt).toLocaleString()} · {event.eventType} ({event.severity})</li>)}
          </ul>
        </details>
      )}

      {attempt.messages.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={summaryLink}>Messages ({attempt.messages.length})</summary>
          <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '2px solid var(--hair)', paddingLeft: 12, fontSize: 12, color: 'var(--muted)', listStyle: 'none' }}>
            {attempt.messages.map((message, index) => <li key={index}>{new Date(message.sentAt).toLocaleString()}: {message.body}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function V2DataRightsPage() {
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [exportData, setExportData] = useState<CandidateDataExport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lookupCandidate = useLookupCandidate();
  const exportCandidate = useExportCandidate();
  const eraseCandidate = useEraseCandidate();

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCandidate(null);
    setExportData(null);
    lookupCandidate.mutate(email, {
      onSuccess: (result) => setCandidate(result),
      onError: (err) => setError(err instanceof Error ? err.message : 'Candidate not found'),
    });
  }

  function handleExport() {
    if (!candidate) return;
    exportCandidate.mutate(candidate.id, {
      onSuccess: (result) => { setError(null); setExportData(result); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to export candidate data'),
    });
  }

  function handleDownload() {
    if (!exportData || !candidate) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `candidate-${candidate.id}-export.json`; link.click();
    URL.revokeObjectURL(url);
  }

  function handleOpenConfirm() { setConfirmEmail(''); setConfirmOpen(true); }
  function handleCloseConfirm() { setConfirmOpen(false); setConfirmEmail(''); }

  function handleErase() {
    if (!candidate) return;
    eraseCandidate.mutate(candidate.id, {
      onSuccess: (result) => {
        setError(null);
        setCandidate({ ...candidate, erasedAt: result.erasedAt });
        setConfirmOpen(false);
        setConfirmEmail('');
        setNotice('Candidate data erased.');
        setTimeout(() => setNotice(null), 4000);
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to erase candidate'),
    });
  }

  const eraseConfirmed = candidate !== null && confirmEmail.trim() === candidate.email;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Privacy</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Candidate Data Rights</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 640 }}>Look up a candidate by email to export their full record or permanently erase their personal data, for a data subject access or deletion request (e.g. GDPR Article 15/17).</p>
      </div>

      {notice && <div role="status" style={{ fontSize: 13, padding: '9px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, #15803d 30%, transparent)', background: 'color-mix(in srgb, #15803d 8%, transparent)', color: STATUS.ok }}>{notice}</div>}

      <div style={card}>
        <form onSubmit={handleLookup} style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ maxWidth: 360, flex: 1 }}>
            <TextField id="dr-email" label="Candidate email" type="email" value={email} onChange={setEmail} required autoComplete="off" />
          </div>
          <Button type="submit" loading={lookupCandidate.isPending}>Look up</Button>
        </form>
        {error && !confirmOpen && <p role="alert" style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)' }}>{error}</p>}
      </div>

      {!candidate && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>
          <UserSearch size={28} />
          <p style={{ fontSize: 13, margin: 0 }}>Look up a candidate above to view or manage their data.</p>
        </div>
      )}

      {candidate && (
        <div style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{candidate.name}</p>
                {candidate.erasedAt && <Pill c="var(--muted)" label="Erased" />}
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>{candidate.email}</p>
              {candidate.phone && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>{candidate.phone}</p>}
            </div>
            {candidate.erasedAt ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={handleExport} loading={exportCandidate.isPending}><Download size={14} /> Export data</Button>
                <button type="button" className="v2-hoverbtn" style={{ ...dt.toolBtn, borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={handleOpenConfirm}><Trash2 size={14} /> Erase candidate</button>
              </div>
            )}
          </div>
        </div>
      )}

      {exportData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Export Data</h2>
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={handleDownload}><Download size={14} /> Download JSON</button>
            </div>
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Profile</h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>{exportData.candidate.name} — {exportData.candidate.email}</p>
            </section>
            <section>
              <h3 style={{ fontWeight: 500, color: 'var(--ink)', margin: '0 0 8px' }}>Invitations ({exportData.invitations.length})</h3>
              <DataTable columns={INVITATION_COLUMNS} data={exportData.invitations} getRowId={(i) => i.id} hideToolbar emptyMessage="No invitations." />
            </section>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Attempts ({exportData.attempts.length})</h3>
            {exportData.attempts.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>No attempts.</p>
            ) : (
              exportData.attempts.map((attempt) => <AttemptRecord key={attempt.id} attempt={attempt} />)
            )}
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onClose={handleCloseConfirm} title="Erase Candidate Data?" width={480}>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 9, background: 'color-mix(in srgb, var(--danger) 8%, transparent)', padding: 12, fontSize: 13, color: 'var(--danger)' }}>
          <ShieldAlert size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ margin: 0 }}>
            This permanently redacts {candidate?.name}&apos;s personal data
            {exportData ? ` across ${exportData.invitations.length} invitation(s) and ${exportData.attempts.length} attempt(s)` : ''}.
            This cannot be undone.
          </p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <TextField id="dr-confirm" label="Type the candidate's email to confirm" value={confirmEmail} onChange={setConfirmEmail} placeholder={candidate?.email} autoComplete="off" />
        </div>
        {error && <p role="alert" style={{ marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={handleCloseConfirm} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleErase} disabled={!eraseConfirmed || eraseCandidate.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: !eraseConfirmed || eraseCandidate.isPending ? 'not-allowed' : 'pointer', opacity: !eraseConfirmed || eraseCandidate.isPending ? 0.5 : 1 }}>Confirm erase</button>
        </div>
      </Dialog>
    </div>
  );
}

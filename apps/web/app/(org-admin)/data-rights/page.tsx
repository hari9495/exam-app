'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ShieldAlert, Trash2, UserSearch } from 'lucide-react';
import { useLookupCandidate, useExportCandidate, useEraseCandidate } from '../../../lib/hooks/useCandidateDataRights';
import { Button, Input, Card, Modal, Table, StatusBadge, useToast, type Column, type StatusTone } from '../../../components/ui';
import { Candidate, CandidateDataExport } from '../../../lib/types';

type ExportInvitation = CandidateDataExport['invitations'][number];
type ExportAttempt = CandidateDataExport['attempts'][number];

const INVITATION_COLUMNS: Column<ExportInvitation>[] = [
  { key: 'examTitle', header: 'Exam', render: (invitation) => invitation.examTitle, sortValue: (invitation) => invitation.examTitle },
  { key: 'status', header: 'Status', render: (invitation) => invitation.status, sortValue: (invitation) => invitation.status },
  {
    key: 'invitedAt',
    header: 'Invited',
    render: (invitation) => new Date(invitation.invitedAt).toLocaleDateString(),
    sortValue: (invitation) => invitation.invitedAt,
  },
  {
    key: 'expiresAt',
    header: 'Expires',
    render: (invitation) => new Date(invitation.expiresAt).toLocaleDateString(),
    sortValue: (invitation) => invitation.expiresAt,
  },
  {
    key: 'revokedAt',
    header: 'Revoked',
    render: (invitation) => (invitation.revokedAt ? new Date(invitation.revokedAt).toLocaleDateString() : '—'),
  },
];

const RISK_TONE: Record<string, StatusTone> = { low: 'success', medium: 'warning', high: 'danger' };

// The export payload carries far more than a recruiter can scan at once (every
// answer, every proctoring event, every message) -- <details> keeps each
// attempt compact by default while still making the full record reachable on
// screen, not just inside the downloaded JSON.
function AttemptRecord({ attempt }: { attempt: ExportAttempt }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-recruiter-text">{attempt.examTitle}</p>
          <p className="text-xs text-recruiter-text-tertiary">
            Started {new Date(attempt.startedAt).toLocaleString()}
            {attempt.submittedAt ? ` · Submitted ${new Date(attempt.submittedAt).toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <StatusBadge tone="neutral">{attempt.status}</StatusBadge>
          {attempt.result && (
            <StatusBadge tone={attempt.result.passFail === 'pass' ? 'success' : 'danger'}>
              {attempt.result.score}/{attempt.result.maxScore} ({attempt.result.percentage.toFixed(1)}%)
            </StatusBadge>
          )}
        </div>
      </div>

      {attempt.proctoringAnalysis?.riskLevel && (
        <div className="mt-2.5 flex items-start gap-1.5 text-sm text-recruiter-text-secondary">
          <StatusBadge tone={RISK_TONE[attempt.proctoringAnalysis.riskLevel] ?? 'neutral'}>
            Proctoring risk: {attempt.proctoringAnalysis.riskLevel}
          </StatusBadge>
          {attempt.proctoringAnalysis.summary && <span>{attempt.proctoringAnalysis.summary}</span>}
        </div>
      )}

      {attempt.insight?.summary && (
        <p className="mt-2 text-sm text-recruiter-text-secondary">
          <span className="font-medium text-recruiter-text">AI insight: </span>
          {attempt.insight.summary}
        </p>
      )}

      {attempt.deviceFingerprint && <p className="mt-2 text-xs text-recruiter-text-tertiary">Device: {attempt.deviceFingerprint}</p>}

      {attempt.answers.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">Answers ({attempt.answers.length})</summary>
          <ul className="mt-2 flex flex-col gap-2 border-l-2 border-recruiter-border pl-3">
            {attempt.answers.map((answer, index) => (
              <li key={index} className="text-sm">
                <p className="text-recruiter-text">{answer.questionText}</p>
                <p className="text-xs text-recruiter-text-secondary">
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
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Proctoring events ({attempt.proctoringEvents.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 border-l-2 border-recruiter-border pl-3 text-xs text-recruiter-text-secondary">
            {attempt.proctoringEvents.map((event, index) => (
              <li key={index}>
                {new Date(event.occurredAt).toLocaleString()} · {event.eventType} ({event.severity})
              </li>
            ))}
          </ul>
        </details>
      )}

      {attempt.messages.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-primary">Messages ({attempt.messages.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 border-l-2 border-recruiter-border pl-3 text-xs text-recruiter-text-secondary">
            {attempt.messages.map((message, index) => (
              <li key={index}>
                {new Date(message.sentAt).toLocaleString()}: {message.body}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export default function DataRightsPage() {
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [exportData, setExportData] = useState<CandidateDataExport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lookupCandidate = useLookupCandidate();
  const exportCandidate = useExportCandidate();
  const eraseCandidate = useEraseCandidate();
  const { toast } = useToast();

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
      onSuccess: (result) => {
        setError(null);
        setExportData(result);
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to export candidate data'),
    });
  }

  function handleDownload() {
    if (!exportData || !candidate) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `candidate-${candidate.id}-export.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleOpenConfirm() {
    setConfirmEmail('');
    setConfirmOpen(true);
  }

  function handleCloseConfirm() {
    setConfirmOpen(false);
    setConfirmEmail('');
  }

  function handleErase() {
    if (!candidate) return;
    eraseCandidate.mutate(candidate.id, {
      onSuccess: (result) => {
        setError(null);
        setCandidate({ ...candidate, erasedAt: result.erasedAt });
        setConfirmOpen(false);
        setConfirmEmail('');
        toast('Candidate data erased.');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to erase candidate'),
    });
  }

  const eraseConfirmed = candidate !== null && confirmEmail.trim() === candidate.email;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-recruiter-text">Candidate Data Rights</h1>
        <p className="mt-1 text-sm text-recruiter-text-secondary">
          Look up a candidate by email to export their full record or permanently erase their personal data, for a data
          subject access or deletion request (e.g. GDPR Article 15/17).
        </p>
      </div>

      <Card>
        <form onSubmit={handleLookup} className="flex items-end gap-2">
          <div className="max-w-sm flex-1">
            <Input label="Candidate Email" type="email" value={email} onChange={setEmail} required />
          </div>
          <Button type="submit" loading={lookupCandidate.isPending}>
            Look up
          </Button>
        </form>
        {error && !confirmOpen && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>

      {!candidate && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-recruiter-text-tertiary">
          <UserSearch size={28} />
          <p className="text-sm">Look up a candidate above to view or manage their data.</p>
        </div>
      )}

      {candidate && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-recruiter-text">{candidate.name}</p>
                  {candidate.erasedAt && <StatusBadge tone="neutral">Erased</StatusBadge>}
                </div>
                <p className="text-sm text-recruiter-text-secondary">{candidate.email}</p>
                {candidate.phone && <p className="text-sm text-recruiter-text-secondary">{candidate.phone}</p>}
              </div>
              {candidate.erasedAt ? (
                <p className="text-sm text-recruiter-text-tertiary">Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={handleExport} loading={exportCandidate.isPending} className="inline-flex items-center gap-1.5">
                    <Download size={14} />
                    Export data
                  </Button>
                  <Button variant="secondary" onClick={handleOpenConfirm} className="inline-flex items-center gap-1.5 text-status-danger">
                    <Trash2 size={14} />
                    Erase candidate
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {exportData && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
          <div className="flex flex-col gap-4">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-recruiter-text">Export data</h2>
                <Button variant="secondary" onClick={handleDownload} className="inline-flex items-center gap-1.5">
                  <Download size={14} />
                  Download JSON
                </Button>
              </div>
              <section className="mb-4">
                <h3 className="font-medium text-recruiter-text">Profile</h3>
                <p className="text-sm text-recruiter-text-secondary">
                  {exportData.candidate.name} — {exportData.candidate.email}
                </p>
              </section>
              <section>
                <h3 className="mb-1.5 font-medium text-recruiter-text">Invitations ({exportData.invitations.length})</h3>
                <Table
                  columns={INVITATION_COLUMNS}
                  rows={exportData.invitations}
                  rowKey={(invitation) => invitation.id}
                  emptyMessage="No invitations."
                />
              </section>
            </Card>

            <div className="flex flex-col gap-3">
              <h3 className="font-medium text-recruiter-text">Attempts ({exportData.attempts.length})</h3>
              {exportData.attempts.length === 0 ? (
                <p className="text-sm text-recruiter-text-tertiary">No attempts.</p>
              ) : (
                exportData.attempts.map((attempt) => <AttemptRecord key={attempt.id} attempt={attempt} />)
              )}
            </div>
          </div>
        </motion.div>
      )}

      <Modal open={confirmOpen} title="Erase candidate data?" onClose={handleCloseConfirm}>
        <div className="mb-4 flex items-start gap-2 rounded-md bg-status-danger-bg p-3 text-sm text-status-danger">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            This permanently redacts {candidate?.name}&apos;s personal data
            {exportData ? ` across ${exportData.invitations.length} invitation(s) and ${exportData.attempts.length} attempt(s)` : ''}.
            This cannot be undone.
          </p>
        </div>
        <div className="mb-4">
          <Input
            label="Type The Candidate's Email To Confirm"
            value={confirmEmail}
            onChange={setConfirmEmail}
            placeholder={candidate?.email}
          />
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-status-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleCloseConfirm}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleErase} loading={eraseCandidate.isPending} disabled={!eraseConfirmed}>
            Confirm erase
          </Button>
        </div>
      </Modal>
    </div>
  );
}

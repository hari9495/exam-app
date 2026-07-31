'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLookupCandidate, useExportCandidate, useEraseCandidate } from '../../../lib/hooks/useCandidateDataRights';
import { Button, Input, Card, Modal, Table, useToast, type Column } from '../../../components/ui';
import { Candidate, CandidateDataExport } from '../../../lib/types';

type ExportInvitation = CandidateDataExport['invitations'][number];
type ExportAttempt = CandidateDataExport['attempts'][number];

const INVITATION_COLUMNS: Column<ExportInvitation>[] = [
  { key: 'examTitle', header: 'Exam', render: (invitation) => invitation.examTitle, sortValue: (invitation) => invitation.examTitle },
  { key: 'status', header: 'Status', render: (invitation) => invitation.status, sortValue: (invitation) => invitation.status },
];

const ATTEMPT_COLUMNS: Column<ExportAttempt>[] = [
  { key: 'examTitle', header: 'Exam', render: (attempt) => attempt.examTitle, sortValue: (attempt) => attempt.examTitle },
  {
    key: 'result',
    header: 'Result',
    render: (attempt) =>
      attempt.result ? `${attempt.result.score}/${attempt.result.maxScore} (${attempt.result.passFail})` : attempt.status,
  },
];

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
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Candidate Data Rights</h1>
      <form onSubmit={handleLookup} className="mb-6 flex items-end gap-2">
        <Input label="Candidate email" type="email" value={email} onChange={setEmail} required />
        <Button type="submit">Look up</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-status-danger">
          {error}
        </p>
      )}
      {candidate && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
          <Card className="mb-6">
            <p className="font-medium text-recruiter-text">{candidate.name}</p>
            <p className="text-sm text-recruiter-text-secondary">{candidate.email}</p>
            {candidate.phone && <p className="text-sm text-recruiter-text-secondary">{candidate.phone}</p>}
            {candidate.erasedAt ? (
              <p className="mt-2 text-sm text-recruiter-text-tertiary">Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button onClick={handleExport}>Export data</Button>
                <Button variant="secondary" onClick={handleOpenConfirm}>
                  Erase candidate
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      )}
      {exportData && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-recruiter-text">Export data</h2>
              <Button variant="secondary" onClick={handleDownload}>
                Download JSON
              </Button>
            </div>
            <section className="mb-4">
              <h3 className="font-medium text-recruiter-text">Profile</h3>
              <p className="text-sm text-recruiter-text-secondary">
                {exportData.candidate.name} — {exportData.candidate.email}
              </p>
            </section>
            <section className="mb-4">
              <h3 className="mb-1.5 font-medium text-recruiter-text">Invitations ({exportData.invitations.length})</h3>
              <Table
                columns={INVITATION_COLUMNS}
                rows={exportData.invitations}
                rowKey={(invitation) => invitation.id}
                emptyMessage="No invitations."
              />
            </section>
            <section>
              <h3 className="mb-1.5 font-medium text-recruiter-text">Attempts ({exportData.attempts.length})</h3>
              <Table
                columns={ATTEMPT_COLUMNS}
                rows={exportData.attempts}
                rowKey={(attempt) => attempt.id}
                emptyMessage="No attempts."
              />
            </section>
          </Card>
        </motion.div>
      )}
      <Modal open={confirmOpen} title="Erase candidate data?" onClose={handleCloseConfirm}>
        <p className="mb-4 text-sm text-recruiter-text-secondary">
          This permanently redacts {candidate?.name}&apos;s personal data. This cannot be undone.
        </p>
        <div className="mb-4">
          <Input
            label="Type the candidate's email to confirm"
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
          <Button variant="danger" onClick={handleErase} disabled={!eraseConfirmed}>
            Confirm erase
          </Button>
        </div>
      </Modal>
    </div>
  );
}

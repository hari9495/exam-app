'use client';

import { useState } from 'react';
import { useLookupCandidate, useExportCandidate, useEraseCandidate } from '../../../lib/hooks/useCandidateDataRights';
import { Button, Input, Card, Modal, useToast } from '../../../components/ui';
import { Candidate, CandidateDataExport } from '../../../lib/types';

export default function DataRightsPage() {
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [exportData, setExportData] = useState<CandidateDataExport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  function handleErase() {
    if (!candidate) return;
    eraseCandidate.mutate(candidate.id, {
      onSuccess: (result) => {
        setError(null);
        setCandidate({ ...candidate, erasedAt: result.erasedAt });
        setConfirmOpen(false);
        toast('Candidate data erased.');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to erase candidate'),
    });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Candidate Data Rights</h1>
      <form onSubmit={handleLookup} className="mb-6 flex items-end gap-2">
        <Input label="Candidate email" type="email" value={email} onChange={setEmail} required />
        <Button type="submit">Look up</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {candidate && (
        <Card className="mb-6">
          <p className="font-medium">{candidate.name}</p>
          <p className="text-sm text-gray-600">{candidate.email}</p>
          {candidate.phone && <p className="text-sm text-gray-600">{candidate.phone}</p>}
          {candidate.erasedAt ? (
            <p className="mt-2 text-sm text-gray-500">Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleExport}>Export data</Button>
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
                Erase candidate
              </Button>
            </div>
          )}
        </Card>
      )}
      {exportData && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Export data</h2>
            <Button variant="secondary" onClick={handleDownload}>
              Download JSON
            </Button>
          </div>
          <section className="mb-4">
            <h3 className="font-medium">Profile</h3>
            <p className="text-sm text-gray-600">
              {exportData.candidate.name} — {exportData.candidate.email}
            </p>
          </section>
          <section className="mb-4">
            <h3 className="font-medium">Invitations ({exportData.invitations.length})</h3>
            <ul className="text-sm text-gray-600">
              {exportData.invitations.map((invitation) => (
                <li key={invitation.id}>
                  {invitation.examTitle} — {invitation.status}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-medium">Attempts ({exportData.attempts.length})</h3>
            <ul className="text-sm text-gray-600">
              {exportData.attempts.map((attempt) => (
                <li key={attempt.id}>
                  {attempt.examTitle} —{' '}
                  {attempt.result ? `${attempt.result.score}/${attempt.result.maxScore} (${attempt.result.passFail})` : attempt.status}
                </li>
              ))}
            </ul>
          </section>
        </Card>
      )}
      <Modal open={confirmOpen} title="Erase candidate data?" onClose={() => setConfirmOpen(false)}>
        <p className="mb-4 text-sm text-gray-600">This permanently redacts {candidate?.name}&apos;s personal data. This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleErase}>
            Confirm erase
          </Button>
        </div>
      </Modal>
    </div>
  );
}

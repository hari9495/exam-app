'use client';

import { useState } from 'react';
import { useExams } from '../lib/hooks/useExams';
import { useBulkInvite } from '../lib/hooks/useInvitations';
import { Modal, Select, Button, useToast } from './ui';

interface AdvanceToNextRoundModalProps {
  /** The exam candidates are currently being viewed from -- excluded from the target list. */
  examId: string;
  candidateIds: string[];
  open: boolean;
  onClose: () => void;
  /** Called once the invite call succeeds, so the caller can clear its selection. */
  onAdvanced: () => void;
}

export function AdvanceToNextRoundModal({ examId, candidateIds, open, onClose, onAdvanced }: AdvanceToNextRoundModalProps) {
  const [targetExamId, setTargetExamId] = useState('');
  // Bulk-invite 400s against a non-published exam, so only published exams are
  // valid targets. ponytail: pageSize:100 is the server's max -- an org with
  // >100 published exams won't see #101+ here, same cap the exam switcher lives with.
  const { data: examsResponse } = useExams('published', { pageSize: 100 });
  const targetOptions = [
    { value: '', label: 'Choose an exam…' },
    ...(examsResponse?.data ?? []).filter((exam) => exam.id !== examId).map((exam) => ({ value: exam.id, label: exam.title })),
  ];
  const bulkInvite = useBulkInvite(targetExamId);
  const { toast } = useToast();

  function handleAdvance() {
    if (!targetExamId) return;
    bulkInvite.mutate(candidateIds, {
      onSuccess: (result) => {
        toast(
          `Advanced ${result.created.length} candidate${result.created.length === 1 ? '' : 's'}.${
            result.skipped.length ? ` ${result.skipped.length} already invited to that exam.` : ''
          }`,
        );
        onAdvanced();
        onClose();
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to advance candidates.', 'error'),
    });
  }

  const noPublishedTargets = targetOptions.length === 1;

  return (
    <Modal open={open} title={`Advance ${candidateIds.length} candidate${candidateIds.length === 1 ? '' : 's'}`} onClose={onClose}>
      {noPublishedTargets ? (
        <p className="text-sm text-recruiter-text-secondary">No other published exams to advance candidates into — publish one first.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-recruiter-text-secondary">
            Invite the selected candidates to a different exam, e.g. the next interview round. This doesn&apos;t change
            anything about their result here.
          </p>
          <Select label="Move to exam" value={targetExamId} onChange={setTargetExamId} options={targetOptions} />
        </>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleAdvance} disabled={!targetExamId} loading={bulkInvite.isPending}>
          Advance
        </Button>
      </div>
    </Modal>
  );
}

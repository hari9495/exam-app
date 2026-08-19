'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Select, useToast } from '../ui';
import { useLinkExam, useUnlinkExam } from '../../lib/hooks/usePipeline';
import { useExams } from '../../lib/hooks/useExams';
import { JobDetail } from '../../lib/types';

export function LinkedExams({
  jobId,
  linkedExams,
  canManage,
}: {
  jobId: string;
  linkedExams: JobDetail['linkedExams'];
  canManage: boolean;
}) {
  const { data: exams } = useExams();
  const linkExam = useLinkExam(jobId);
  const unlinkExam = useUnlinkExam(jobId);
  const { toast } = useToast();
  const [pickerExamId, setPickerExamId] = useState('');

  const linkedIds = new Set(linkedExams.map((exam) => exam.examId));
  const attachableExams = (exams?.data ?? []).filter((exam) => !linkedIds.has(exam.id));

  function handleAttach() {
    if (!pickerExamId) return;
    linkExam.mutate(pickerExamId, {
      onSuccess: () => setPickerExamId(''),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to attach exam.', 'error'),
    });
  }

  function handleUnlink(examId: string) {
    unlinkExam.mutate(examId, {
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to unlink exam.', 'error'),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Linked exams</h3>
      <div className="flex flex-wrap gap-2">
        {linkedExams.length === 0 && <p className="text-xs text-muted">No exams linked.</p>}
        {linkedExams.map((exam) => (
          <span
            key={exam.examId}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-3 py-1 text-xs font-medium text-ink"
          >
            {exam.title}
            {canManage && (
              <button
                type="button"
                aria-label={`Unlink ${exam.title}`}
                onClick={() => handleUnlink(exam.examId)}
                className="text-muted hover:text-red-600"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      {canManage && (
        <div className="flex items-end gap-2">
          <div className="min-w-[14rem]">
            <Select
              label="Attach exam"
              value={pickerExamId}
              onChange={setPickerExamId}
              options={[
                { value: '', label: 'Select an exam…' },
                ...attachableExams.map((exam) => ({ value: exam.id, label: exam.title })),
              ]}
            />
          </div>
          <Button size="sm" onClick={handleAttach} disabled={!pickerExamId} loading={linkExam.isPending}>
            Attach
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';

// v2 LinkedExams — attach/detach exams to a job. Re-skin on v2 primitives; hooks/logic verbatim.
import { useState } from 'react';
import { X } from 'lucide-react';
import { useLinkExam, useUnlinkExam } from '../../../../lib/hooks/usePipeline';
import { useExams } from '../../../../lib/hooks/useExams';
import { JobDetail } from '../../../../lib/types';
import { useToast } from '../../../../components/ui';
import { Combobox, dt } from '../../../../components/ui-v2';

export function LinkedExams({ jobId, linkedExams, canManage }: { jobId: string; linkedExams: JobDetail['linkedExams']; canManage: boolean }) {
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
    unlinkExam.mutate(examId, { onError: (error) => toast(error instanceof Error ? error.message : 'Failed to unlink exam.', 'error') });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {linkedExams.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No exams linked.</p>}
        {linkedExams.map((exam) => (
          <span key={exam.examId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, border: '1px solid var(--hair)', background: 'var(--paper)', padding: '4px 10px', fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>
            {exam.title}
            {canManage && <button type="button" aria-label={`Unlink ${exam.title}`} onClick={() => handleUnlink(exam.examId)} style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 0, color: 'var(--muted)', cursor: 'pointer' }}><X size={13} /></button>}
          </span>
        ))}
      </div>
      {canManage && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 240 }}>
            <label className="v2-label">Attach exam</label>
            <Combobox width="100%" value={pickerExamId} onChange={setPickerExamId}
              options={[{ value: '', label: 'Select an exam…' }, ...attachableExams.map((exam) => ({ value: exam.id, label: exam.title }))]} />
          </div>
          <button type="button" onClick={handleAttach} disabled={!pickerExamId || linkExam.isPending} style={{ ...dt.primaryBtn, opacity: !pickerExamId || linkExam.isPending ? 0.5 : 1, cursor: !pickerExamId || linkExam.isPending ? 'not-allowed' : 'pointer' }}>Attach</button>
        </div>
      )}
    </div>
  );
}

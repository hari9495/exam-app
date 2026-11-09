'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { JobWorkspaceScreen, type BoardRowView, type BoardStageView } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../../../../lib/yx-org';
import { apiFetchBlob } from '../../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../../lib/auth-context';
import { useApiWrite, useHiring } from '../../../../../../../../lib/yx-hiring';
import { templateChoices } from '../../../../../../../../lib/yx-candidates';
import { saveBlob } from '../../../../../../../../lib/yx-pay';
import { useJob } from '../../../../../../../../lib/hooks/usePipeline';
import { useExams } from '../../../../../../../../lib/hooks/useExams';
import { useJobBoards } from '../../../../../../../../lib/hooks/useJobBoards';
import { useCandidates } from '../../../../../../../../lib/hooks/useCandidates';
import { useMessageTemplates } from '../../../../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../../../../lib/hooks/useOrgSenderAddresses';
import type { BoardEntryRow } from '../../../../../../../../lib/types';
import { Application, type Board } from '../application-panel';

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
const test = (r: BoardEntryRow) => r.examResults.map((e) => `${e.examTitle}${e.score != null ? ` ${e.score}%` : ''}${e.passFail ? ` · ${e.passFail === 'pass' ? 'passed' : 'not passed'}` : ''}`).join(', ') || null;

// Hiring › Jobs › one job › Pipeline › Candidates list (M10 batch AT5 stand-in): the list with bulk move, test, email and
// reject, Add candidate, Export CSV and the job settings. The board is the designed HIR-04 screen on /pipeline; its
// "Bulk actions" opens this page and its "Add candidate" opens it with ?add=1 (founder question 261).
export default function YxHiringJobListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const canManage = perms.has('pipeline:manage');
  const job = useJob(id);
  const board = useHiring<Board>(`/jobs/${id}/board`);
  const settings = useHiring<{ scorecardTemplateId: string | null; exams: { examId: string; title: string; sendOnStageId: string | null }[] }>(`/jobs/${id}/interview-settings`);
  const scorecards = useHiring<{ id: string; name: string }[]>(canManage ? '/scorecard-templates' : null);
  const exams = useExams(undefined, { pageSize: 100 });
  const boards = useJobBoards();
  const [q, setQ] = useState('');
  const candidates = useCandidates({ search: q.trim() || undefined, pageSize: 20 });
  const templates = useMessageTemplates();
  const senders = useOrgSenderAddresses();
  const write = useApiWrite();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(params.get('entry'));

  const stages: BoardStageView[] = (board.data?.pipeline.stages ?? []).map((s) => ({ id: s.id, name: s.name, category: s.category, statuses: s.statuses.map((x) => ({ id: x.id, name: x.name })) }));
  const statusName = (statusId: string) => stages.flatMap((s) => s.statuses.map((x) => ({ ...x, stage: s.name }))).find((x) => x.id === statusId);
  const raw = Object.values(board.data?.columns ?? {}).flat();
  const rows: BoardRowView[] = raw.map((r) => ({
    entryId: r.entryId, candidateId: r.candidateId, name: r.candidateName, email: r.candidateEmail, stageId: r.stageId, statusId: r.statusId,
    statusName: statusName(r.statusId)?.stage ?? '', category: r.category, daysInStage: days(r.stageEnteredAt), testSummary: test(r), scorecards: r.scorecards,
    nextInterviewAt: r.nextInterviewAt, rejectionPendingUntil: r.rejectionPendingUntil, assignee: r.assigneeName ?? r.assignedGroupName, fitScore: r.fitScore, internal: r.enteredVia === 'internal',
  }));
  const j = job.data;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const tpl = templateChoices(templates.data);
  const sendersChoices = (senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` }));
  const bulk = (body: unknown) => write<{ succeeded: number; skipped: unknown[] }>('POST', '/hiring/entries/bulk', body);
  const selectedRow = raw.find((r) => r.entryId === open) ?? null;

  return (
    <>
      <JobWorkspaceScreen
        state={loadState(job, board)}
        onRetry={() => void Promise.all([job.refetch(), board.refetch()])}
        job={j ? {
          id: j.id, title: j.title, status: j.status, description: j.description,
          summary: [j.department, j.headcount ? `${j.headcount} opening${j.headcount === 1 ? '' : 's'}` : null, j.salaryMin ? `${j.salaryCurrency ?? ''} ${j.salaryMin.toLocaleString('en-IN')}${j.salaryMax ? `–${j.salaryMax.toLocaleString('en-IN')}` : ''}` : null].filter(Boolean).join(' · '),
          publicApplyEnabled: j.publicApplyEnabled, listOnCareers: j.listOnCareers, applyUrl: j.applyToken ? `${origin}/apply/${j.applyToken}` : null,
          fitCriteria: j.fitCriteria ?? null, fitRubric: j.fitRubric ? (JSON.parse(j.fitRubric) as { label: string; weight: number }[]) : [],
          customFields: j.customFields.filter((f) => f.value != null).map((f) => ({ label: f.label, value: String(f.value) })), boardIds: j.jobBoardIds ?? [],
        } : null}
        canManage={canManage}
        stages={stages}
        rows={rows}
        settings={settings.data ?? null}
        exams={(exams.data?.data ?? []).map((e) => ({ value: e.id, label: e.title }))}
        scorecardTemplates={(scorecards.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
        jobBoards={(boards.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
        candidateChoices={(candidates.data?.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.email ?? ''}` }))}
        onCandidateSearch={setQ}
        templates={tpl}
        senders={sendersChoices}
        onBack={() => router.push(`/yx/hiring/jobs/${encodeURIComponent(id)}/pipeline`)}
        startAdding={params.get('add') === '1'}
        onOpenEntry={setOpen}
        onReject={async (ids, input) => {
          const body = { reason: input.reason, delayHours: input.delayHours, ...(input.message ? { message: input.message } : {}) };
          if (ids.length === 1) await write('POST', `/hiring/entries/${ids[0]}/reject`, body);
          else await bulk({ entryIds: ids, action: 'reject', ...body });
        }}
        onUndo={(entryId) => write('POST', `/hiring/entries/${entryId}/reject/undo`)}
        onBulkMove={(ids, statusId) => bulk({ entryIds: ids, action: 'move', statusId })}
        onBulkTest={(ids, examId) => bulk({ entryIds: ids, action: 'assessment', examId })}
        onBulkEmail={(ids, c) => write('POST', '/bulk-candidate-email/by-entries', { ...c, entryIds: ids })}
        onAdd={(input) => write('POST', `/jobs/${id}/entries`, input)}
        onExport={async () => {
          const { blob, filename } = await apiFetchBlob(`/jobs/${id}/candidates.csv`, {}, accessToken ?? undefined);
          saveBlob(blob, filename ?? 'candidates.csv');
        }}
        onLinkExam={(examId) => write('POST', `/jobs/${id}/exams`, { examId })}
        onUnlinkExam={(examId) => write('DELETE', `/jobs/${id}/exams/${examId}`)}
        onSendOn={(examId, stageId) => write('PUT', `/hiring/jobs/${id}/exams/${examId}/send-on`, { stageId })}
        onScorecard={(templateId) => write('PUT', `/hiring/jobs/${id}/scorecard`, { templateId })}
        onUpdateJob={(patch) => write('PATCH', `/jobs/${id}`, patch)}
        onScreenAll={canManage ? () => write<{ queued: number }>('POST', `/jobs/${id}/fit-assessments/score`) : undefined}
        onCopy={(text) => navigator.clipboard.writeText(text)}
      />
      {selectedRow && (
        <Application
          key={selectedRow.entryId}
          row={selectedRow}
          jobId={id}
          stages={board.data?.pipeline.stages ?? []}
          canManage={canManage}
          templates={tpl}
          senders={sendersChoices}
          scorecardTemplates={(scorecards.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          defaultScorecardId={settings.data?.scorecardTemplateId ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}


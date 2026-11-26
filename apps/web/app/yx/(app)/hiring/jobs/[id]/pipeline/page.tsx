'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { PipelineBoardScreen, type BulkRow } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../../../lib/yx-org';
import { apiFetchBlob } from '../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../lib/auth-context';
import { useApiWrite, useHiring } from '../../../../../../../lib/yx-hiring';
import { templateChoices } from '../../../../../../../lib/yx-candidates';
import { jobCode, type ApiJob } from '../../../../../../../lib/yx-jobs';
import { saveBlob } from '../../../../../../../lib/yx-pay';
import { useJob, useJobs } from '../../../../../../../lib/hooks/usePipeline';
import { useExams } from '../../../../../../../lib/hooks/useExams';
import { useCandidates } from '../../../../../../../lib/hooks/useCandidates';
import { useMessageTemplates } from '../../../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../../../lib/hooks/useOrgSenderAddresses';
import { cardOf, istDateTime } from '../../../../../../../lib/yx-pipeline';
import type { Board } from '../../../../../../../lib/yx-application';
import { useStagePrompt, type MoveResult } from '../../../../../../../lib/yx-stage-prompt';
import type { BoardEntryRow } from '../../../../../../../lib/types';

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
const test = (r: BoardEntryRow) => r.examResults.map((e) => `${e.examTitle}${e.score != null ? ` ${e.score}%` : ''}${e.passFail ? ` · ${e.passFail === 'pass' ? 'passed' : 'not passed'}` : ''}`).join(', ') || null;

// Hiring › Jobs › one job › Pipeline: the designed HIR-04 board (PipelineBoardScreen with `live`) on GET hiring/jobs/:id/board.
// Moving and rejecting are real actions: the API checks the job-manage key (pipeline:manage), the stage rules, a repeat and
// an out-of-date card (fromStatusId), refuses them while acting for someone else, and audits them. A hiring manager with
// results:view reads the board (decision 11). Founder answer 261: "Bulk actions" and "Add candidate" are designed sheets
// on the board (the old candidates list is gone); a card opens the HIR-05 candidate record with that application; the job
// settings are on the job workspace. Answer 263: each stage's optional days target and limit show on the board.
// ?entry= (links from the recruiter Home) opens that application on the candidate record.
export default function YxHiringPipelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin, accessToken } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const canManage = perms.has('pipeline:manage');
  const canMove = canManage && !acting;
  const job = useJob(id);
  const jobs = useJobs();
  const board = useHiring<Board>(`/jobs/${id}/board`);
  // AS-0: the tests list only for people who may read tests (the Interview coordinator sees the job without them).
  const exams = useExams(undefined, { pageSize: 100 }, perms.has('exam:manage') || perms.has('results:view'));
  const [q, setQ] = useState('');
  const candidates = useCandidates({ search: q.trim() || undefined, pageSize: 20 });
  const templates = useMessageTemplates(perms.has('pipeline:manage'));
  const senders = useOrgSenderAddresses(perms.has('pipeline:manage'));
  const write = useApiWrite();
  // Answer 2434 follow-up: a stage message set to "Ask before sending" is asked after the move.
  const prompt = useStagePrompt(write);
  const enc = encodeURIComponent;

  const allStages = board.data?.pipeline.stages ?? [];
  const stages = allStages.filter((s) => s.category !== 'archived');
  const rows = Object.values(board.data?.columns ?? {}).flat();
  const rowOf = (entryId: string) => rows.find((r) => r.entryId === entryId);
  const record = (entryId: string) => {
    const r = rowOf(entryId);
    if (r) router.push(`/yx/hiring/candidates/${enc(r.candidateId)}?entry=${enc(entryId)}`);
  };
  const entry = useSearchParams().get('entry');
  const linked = entry ? rowOf(entry) : undefined;
  useEffect(() => {
    if (entry && linked) router.replace(`/yx/hiring/candidates/${enc(linked.candidateId)}?entry=${enc(entry)}`);
  }, [entry, linked, router, enc]);
  const firstStatus = (stageId: string) => stages.find((s) => s.id === stageId)?.statuses[0]?.id;
  const j = job.data as (typeof job.data & Pick<ApiJob, 'jobNumber'>) | undefined;
  const label = (x: { title: string; jobNumber?: number | null }) => [x.title, jobCode(x.jobNumber)].filter(Boolean).join(' · ');
  const others = ((jobs.data ?? []) as (NonNullable<typeof jobs.data>[number] & { jobNumber?: number | null })[]).filter((x) => x.status === 'open' || x.status === 'on_hold' || x.id === id);
  const choices = others.some((x) => x.id === id) || !j ? others.map((x) => ({ value: x.id, label: label(x) })) : [{ value: id, label: label(j) }, ...others.map((x) => ({ value: x.id, label: label(x) }))];
  const stageName = (stageId: string) => allStages.find((s) => s.id === stageId)?.name ?? '';
  const bulkRows: BulkRow[] = rows.map((r) => ({ entryId: r.entryId, name: r.candidateName, stage: stageName(r.stageId), daysInStage: days(r.stageEnteredAt), test: test(r), scorecards: r.scorecards, owner: r.assigneeName ?? r.assignedGroupName ?? null, rejectionPendingUntil: r.rejectionPendingUntil }));
  const bulk = async (body: unknown) => {
    try {
      return await write<{ succeeded: number; skipped: unknown[] }>('POST', '/hiring/entries/bulk', body);
    } finally {
      await board.refetch();
    }
  };

  return (
    <>
      <PipelineBoardScreen
      live={{
        state: (() => {
          const s = loadState(job, board);
          return s === 'ready' || s === 'loading' ? s : 'error';
        })(),
        onRetry: () => void Promise.all([job.refetch(), board.refetch()]),
        job: j?.title ?? 'Job',
        jobId: id,
        jobs: choices,
        onJob: (to) => router.push(`/yx/hiring/jobs/${enc(to)}/pipeline`),
        canMove,
        readOnlyNote: acting ? 'Read-only while acting for someone else.' : canManage ? undefined : 'Read-only: moving candidates needs the job-manage key.',
        stages: stages.map((s) => ({ id: s.id, title: s.name, rejected: s.category === 'rejected', collapsed: s.category === 'hired', daysTarget: s.daysTarget ?? null, limit: s.stageLimit ?? null })),
        cards: rows.map((r) => cardOf(r)),
        onMove: async (entryId, toStageId) => {
          const r = rowOf(entryId);
          const statusId = firstStatus(toStageId);
          if (!r || !statusId) return;
          try {
            const moved = await write<MoveResult>('POST', `/hiring/entries/${enc(entryId)}/move`, { statusId, fromStatusId: r.statusId });
            prompt.offer(entryId, r.candidateName, stages.find((s) => s.id === toStageId)?.name ?? 'the next stage', moved);
          } finally {
            await board.refetch();
          }
        },
        onReject: async (entryId, reason) => {
          const r = rowOf(entryId);
          if (!r) throw new Error('This card was out of date. The board now shows where the candidate is.');
          try {
            const res = await write<{ messageSentAt: string | null; undoUntil: string | null; emailing?: boolean }>('POST', `/hiring/entries/${enc(entryId)}/reject`, { reason, fromStatusId: r.statusId });
            return {
              description: res.undoUntil ? `You can undo until ${istDateTime(res.undoUntil)}.${res.emailing ? ' The candidate is emailed then.' : ' The candidate is not emailed.'}` : 'The candidate is not emailed.',
              undo: res.undoUntil ? () => write('POST', `/hiring/entries/${enc(entryId)}/reject/undo`).then(() => undefined) : null,
            };
          } finally {
            await board.refetch();
          }
        },
        onOpen: record,
        bulk: {
          rows: bulkRows,
          statuses: stages.filter((s) => s.category !== 'rejected').flatMap((s) => s.statuses.map((x) => ({ value: x.id, label: s.statuses.length > 1 ? `${s.name} · ${x.name}` : s.name }))),
          exams: (exams.data?.data ?? []).map((e) => ({ value: e.id, label: e.title })),
          templates: templateChoices(templates.data),
          senders: (senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` })),
          onOpen: record,
          onMove: (ids, statusId) => bulk({ entryIds: ids, action: 'move', statusId }),
          onTest: (ids, examId) => bulk({ entryIds: ids, action: 'assessment', examId }),
          onEmail: (ids, c) => write('POST', '/bulk-candidate-email/by-entries', { ...c, entryIds: ids }),
          onReject: async (ids, input) => {
            const body = { reason: input.reason, delayHours: input.delayHours, ...(input.message ? { message: input.message } : {}) };
            try {
              if (ids.length === 1) await write('POST', `/hiring/entries/${enc(ids[0]!)}/reject`, body);
              else await write('POST', '/hiring/entries/bulk', { entryIds: ids, action: 'reject', ...body });
            } finally {
              await board.refetch();
            }
          },
          onUndo: async (entryId) => {
            await write('POST', `/hiring/entries/${enc(entryId)}/reject/undo`);
            await board.refetch();
          },
          onExport: async () => {
            const { blob, filename } = await apiFetchBlob(`/jobs/${enc(id)}/candidates.csv`, {}, accessToken ?? undefined);
            saveBlob(blob, filename ?? 'candidates.csv');
          },
          // Offers answer 402: the ticked candidates go to Make bulk offers (offer-pay key only).
          onBulkOffers: perms.has('ats.offer.compensation.view') ? (ids) => router.push(`/yx/hiring/jobs/${enc(id)}/bulk-offers?entries=${ids.map(enc).join(',')}`) : undefined,
        },
        add: {
          candidates: (candidates.data?.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.email ?? ''}` })),
          onSearch: setQ,
          onAdd: async (input) => {
            await write('POST', `/jobs/${enc(id)}/entries`, input);
            await board.refetch();
          },
        },
      }}
    />
      {prompt.element}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { PipelineBoardScreen } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../../../lib/yx-org';
import { useAuth } from '../../../../../../../lib/auth-context';
import { useApiWrite, useHiring } from '../../../../../../../lib/yx-hiring';
import { templateChoices } from '../../../../../../../lib/yx-candidates';
import { jobCode, type ApiJob } from '../../../../../../../lib/yx-jobs';
import { useJob, useJobs } from '../../../../../../../lib/hooks/usePipeline';
import { useMessageTemplates } from '../../../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../../../lib/hooks/useOrgSenderAddresses';
import { cardOf, istDateTime } from '../../../../../../../lib/yx-pipeline';
import { Application, type Board } from './application-panel';

// Hiring › Jobs › one job › Pipeline: the designed HIR-04 board (PipelineBoardScreen with `live`) on GET hiring/jobs/:id/board.
// Moving and rejecting are real actions: the API checks the job-manage key (pipeline:manage), the stage rules, a repeat and
// an out-of-date card (fromStatusId), refuses them while acting for someone else, and audits them. A hiring manager with
// results:view reads the board (decision 11). A card opens the application (interviews, offers, notes: stand-in until
// HIR-05 / HIR-09); "Bulk actions" and "Add candidate" open the candidates list (/pipeline/list), which also has the job
// settings (founder question 261). ?entry= opens one application straight away (links from the recruiter Home).

export default function YxHiringPipelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const canManage = perms.has('pipeline:manage');
  const canMove = canManage && !acting;
  const job = useJob(id);
  const jobs = useJobs();
  const board = useHiring<Board>(`/jobs/${id}/board`);
  const settings = useHiring<{ scorecardTemplateId: string | null }>(`/jobs/${id}/interview-settings`);
  const scorecards = useHiring<{ id: string; name: string }[]>(canManage ? '/scorecard-templates' : null);
  const templates = useMessageTemplates();
  const senders = useOrgSenderAddresses();
  const write = useApiWrite();
  const [open, setOpen] = useState<string | null>(useSearchParams().get('entry'));
  const enc = encodeURIComponent;

  const stages = (board.data?.pipeline.stages ?? []).filter((s) => s.category !== 'archived');
  const rows = Object.values(board.data?.columns ?? {}).flat();
  const rowOf = (entryId: string) => rows.find((r) => r.entryId === entryId);
  const firstStatus = (stageId: string) => stages.find((s) => s.id === stageId)?.statuses[0]?.id;
  const j = job.data as (typeof job.data & Pick<ApiJob, 'jobNumber'>) | undefined;
  const label = (x: { title: string; jobNumber?: number | null }) => [x.title, jobCode(x.jobNumber)].filter(Boolean).join(' · ');
  const others = ((jobs.data ?? []) as (NonNullable<typeof jobs.data>[number] & { jobNumber?: number | null })[]).filter((x) => x.status === 'open' || x.status === 'on_hold' || x.id === id);
  const choices = others.some((x) => x.id === id) || !j ? others.map((x) => ({ value: x.id, label: label(x) })) : [{ value: id, label: label(j) }, ...others.map((x) => ({ value: x.id, label: label(x) }))];
  const selected = open ? (rowOf(open) ?? null) : null;

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
          stages: stages.map((s) => ({ id: s.id, title: s.name, rejected: s.category === 'rejected', collapsed: s.category === 'hired' })),
          cards: rows.map((r) => cardOf(r)),
          onMove: async (entryId, toStageId) => {
            const r = rowOf(entryId);
            const statusId = firstStatus(toStageId);
            if (!r || !statusId) return;
            try {
              await write('POST', `/hiring/entries/${enc(entryId)}/move`, { statusId, fromStatusId: r.statusId });
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
          onOpen: setOpen,
          onBulk: () => router.push(`/yx/hiring/jobs/${enc(id)}/pipeline/list`),
          onAdd: () => router.push(`/yx/hiring/jobs/${enc(id)}/pipeline/list?add=1`),
        }}
      />
      {selected && (
        <Application
          key={selected.entryId}
          row={selected}
          jobId={id}
          stages={board.data?.pipeline.stages ?? []}
          canManage={canManage}
          templates={templateChoices(templates.data)}
          senders={(senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` }))}
          scorecardTemplates={(scorecards.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          defaultScorecardId={settings.data?.scorecardTemplateId ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

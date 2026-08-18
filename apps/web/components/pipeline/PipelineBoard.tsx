'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, Tabs, TabsList, TabsTrigger, TabsContent, useToast } from '../ui';
import { useJobPipeline, usePatchEntry } from '../../lib/hooks/usePipeline';
import { BoardRow, EntryExamResult, PatchEntryResult, PIPELINE_STAGES, PipelineStage, STAGE_LABEL } from '../../lib/types';
import { useAuth } from '../../lib/auth-context';
import { CandidateDrawer } from './CandidateDrawer';
import { SendMessageModal, SendMessageInitial } from './SendMessageModal';

function chipLabel(result: EntryExamResult): string {
  if (result.passFail === null) return `${result.examTitle} · Pending`;
  const label = result.passFail === 'pass' ? 'Passed' : 'Failed';
  return `${result.examTitle} · ${label}${result.score !== null ? ` ${result.score}%` : ''}`;
}

function RatingStars({ avgRating }: { avgRating: number | null }) {
  if (avgRating === null) {
    return <span className="text-xs text-recruiter-text-tertiary">No ratings</span>;
  }
  const rounded = Math.round(avgRating);
  return (
    <span className="text-sm text-amber-500">
      {'★'.repeat(rounded)}
      {'☆'.repeat(5 - rounded)} <span className="text-xs text-recruiter-text-tertiary">{avgRating.toFixed(1)}</span>
    </span>
  );
}

interface PipelineCardProps {
  row: BoardRow;
  canManage: boolean;
  onOpen: (row: BoardRow) => void;
  onStageChange: (entryId: string, stage: PipelineStage) => void;
  onReject: (entryId: string) => void;
}

function PipelineCard({ row, canManage, onOpen, onStageChange, onReject }: PipelineCardProps) {
  return (
    <Card className="flex flex-col gap-2">
      <button type="button" onClick={() => onOpen(row)} className="text-left text-sm font-semibold text-primary hover:underline">
        {row.candidateName}
      </button>
      {row.examResults.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.examResults.map((result) => (
            <Link
              key={result.examId}
              href={`/reports/${result.examId}/candidates/${row.candidateId}`}
              className="inline-flex items-center rounded-full border border-recruiter-border bg-white px-2 py-0.5 text-xs text-recruiter-text hover:bg-recruiter-bg-subtle hover:underline"
            >
              {chipLabel(result)}
            </Link>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <RatingStars avgRating={row.avgRating} />
        <span className="text-xs text-recruiter-text-tertiary">
          {row.feedbackCount} {row.feedbackCount === 1 ? 'note' : 'notes'}
        </span>
      </div>
      <p className="text-xs text-recruiter-text-tertiary">Added via {row.enteredVia}</p>
      {canManage && (
        <div className="flex items-center justify-between gap-2 border-t border-recruiter-border pt-2">
          <select
            aria-label={`Stage for ${row.candidateName}`}
            value={row.stage}
            onChange={(e) => onStageChange(row.entryId, e.target.value as PipelineStage)}
            className="rounded border border-recruiter-border px-2 py-1 text-xs"
          >
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABEL[stage]}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => onReject(row.entryId)} className="text-xs font-medium text-status-danger hover:underline">
            Reject
          </button>
        </div>
      )}
    </Card>
  );
}

export function PipelineBoard({ jobId }: { jobId: string }) {
  const { data: board, isLoading, isError } = useJobPipeline(jobId);
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const patchEntry = usePatchEntry(jobId);
  const { toast } = useToast();
  const [tab, setTab] = useState<'board' | 'rejected'>('board');
  const [openRow, setOpenRow] = useState<BoardRow | null>(null);
  const [composeFor, setComposeFor] = useState<{ entryId: string; candidateId: string; candidateName: string; initial: SendMessageInitial } | null>(
    null,
  );

  // A stage move (or reject/un-reject) can carry back a pendingMessage -- the recruiter reviews
  // it in SendMessageModal before it actually sends. Row lookup happens here (not passed in by
  // the caller) so all three move paths share one place that knows how to open the composer.
  function openComposeIfPending(entryId: string, result: PatchEntryResult) {
    if (!result.pendingMessage || !board) return;
    const row = PIPELINE_STAGES.flatMap((stage) => board.stages[stage]).find((r) => r.entryId === entryId) ??
      board.rejected.find((r) => r.entryId === entryId);
    if (!row) return;
    setComposeFor({ entryId, candidateId: row.candidateId, candidateName: row.candidateName, initial: result.pendingMessage });
  }

  function handleStageChange(entryId: string, stage: PipelineStage) {
    patchEntry.mutate(
      { entryId, stage },
      {
        onSuccess: (result) => openComposeIfPending(entryId, result),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to move candidate.', 'error'),
      },
    );
  }

  function handleReject(entryId: string) {
    const reason = window.prompt('Reason for rejecting (optional)');
    if (reason === null) return;
    patchEntry.mutate(
      { entryId, rejected: true, reason: reason.trim() || undefined },
      {
        onSuccess: (result) => openComposeIfPending(entryId, result),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to reject candidate.', 'error'),
      },
    );
  }

  function handleMoveBack(entryId: string) {
    patchEntry.mutate(
      { entryId, stage: 'applied' },
      {
        onSuccess: (result) => openComposeIfPending(entryId, result),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to move candidate back.', 'error'),
      },
    );
  }

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
      </Card>
    );
  }

  if (isError || !board) {
    return (
      <Card>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load the pipeline.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as 'board' | 'rejected')}>
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({board.rejected.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage} className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">
                  {STAGE_LABEL[stage]} ({board.stages[stage].length})
                </h3>
                <div className="flex flex-col gap-3">
                  {board.stages[stage].map((row) => (
                    <PipelineCard
                      key={row.entryId}
                      row={row}
                      canManage={canManage}
                      onOpen={setOpenRow}
                      onStageChange={handleStageChange}
                      onReject={handleReject}
                    />
                  ))}
                  {board.stages[stage].length === 0 && <p className="text-xs text-recruiter-text-tertiary">No candidates.</p>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="rejected">
          <div className="flex flex-col gap-3">
            {board.rejected.length === 0 && <p className="text-sm text-recruiter-text-tertiary">No rejected candidates.</p>}
            {board.rejected.map((row) => (
              <Card key={row.entryId} className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => setOpenRow(row)} className="text-left text-sm font-semibold text-primary hover:underline">
                    {row.candidateName}
                  </button>
                  {row.rejectedReason && (
                    <p className="text-xs text-recruiter-text-tertiary">Reason: {row.rejectedReason}</p>
                  )}
                </div>
                {canManage && (
                  <button type="button" onClick={() => handleMoveBack(row.entryId)} className="text-xs font-medium text-primary hover:underline">
                    Move back
                  </button>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {openRow && <CandidateDrawer jobId={jobId} row={openRow} onClose={() => setOpenRow(null)} />}

      {composeFor && (
        <SendMessageModal
          entryId={composeFor.entryId}
          candidateId={composeFor.candidateId}
          candidateName={composeFor.candidateName}
          initial={composeFor.initial}
          onClose={() => setComposeFor(null)}
        />
      )}
    </div>
  );
}

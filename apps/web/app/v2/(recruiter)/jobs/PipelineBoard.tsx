'use client';

// v2 PipelineBoard — kanban of pipeline stages + rejected tab. Re-skin on v2 primitives; all
// pipeline hooks, stage-move/reject/score logic and the pending-message compose flow are verbatim.
// Uses the v2 CandidateDrawer + SendMessageModal (siblings in this folder).
import { useState } from 'react';
import Link from 'next/link';
import { useJobPipeline, usePatchEntry, useScoreJob } from '../../../../lib/hooks/usePipeline';
import { BoardRow, EntryExamResult, PatchEntryResult, PIPELINE_STAGES, PipelineStage, STAGE_LABEL } from '../../../../lib/types';
import { useAuth } from '../../../../lib/auth-context';
import { useToast } from '../../../../components/ui';
import { CandidateDrawer } from './CandidateDrawer';
import { SendMessageModal, SendMessageInitial } from './SendMessageModal';
import { Tabs, Cb, dt } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 99, border: '1px solid var(--hair)', background: 'var(--paper)', padding: '2px 8px', fontSize: 11.5, color: 'var(--ink)', textDecoration: 'none' };
const stageSelect: React.CSSProperties = { fontSize: 12, padding: '5px 8px', borderRadius: 7, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', cursor: 'pointer' };

function chipLabel(result: EntryExamResult): string {
  if (result.passFail === null) return `${result.examTitle} · Pending`;
  const label = result.passFail === 'pass' ? 'Passed' : 'Failed';
  return `${result.examTitle} · ${label}${result.score !== null ? ` ${result.score}%` : ''}`;
}
// ponytail: fixed thresholds, no config — revisit if recruiters want the bands tuned per org.
function chipColor(score: number): string {
  if (score >= 75) return STATUS.ok;
  if (score >= 50) return STATUS.warn;
  return 'var(--muted)';
}
function sortByFitScore(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => {
    if (a.fitScore == null && b.fitScore == null) return 0;
    if (a.fitScore == null) return 1;
    if (b.fitScore == null) return -1;
    return b.fitScore - a.fitScore;
  });
}
function RatingStars({ avgRating }: { avgRating: number | null }) {
  if (avgRating === null) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>No ratings</span>;
  const rounded = Math.round(avgRating);
  return <span style={{ fontSize: 13, color: VIZ.amber }}>{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)} <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{avgRating.toFixed(1)}</span></span>;
}

interface PipelineCardProps { row: BoardRow; canManage: boolean; onOpen: (row: BoardRow) => void; onStageChange: (entryId: string, stage: PipelineStage) => void; onReject: (entryId: string) => void }

function PipelineCard({ row, canManage, onOpen, onStageChange, onReject }: PipelineCardProps) {
  return (
    <div style={card}>
      <button type="button" onClick={() => onOpen(row)} style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--org-primary)', cursor: 'pointer' }}>{row.candidateName}</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {row.examResults.map((result) => (
          <Link key={result.examId} href={`/v2/reports/${result.examId}/candidates/${row.candidateId}`} style={chip}>{chipLabel(result)}</Link>
        ))}
        {row.fitScore != null ? (
          <span style={{ ...chip, fontWeight: 600, color: chipColor(row.fitScore) }}>{row.fitScore}{row.fitStale && <span title="Stale — candidate updated since last score">⚠</span>}</span>
        ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <RatingStars avgRating={row.avgRating} />
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{row.feedbackCount} {row.feedbackCount === 1 ? 'note' : 'notes'}</span>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Added via {row.enteredVia}</p>
      {canManage && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--hair)', paddingTop: 8 }}>
          <select aria-label={`Stage for ${row.candidateName}`} value={row.stage} onChange={(e) => onStageChange(row.entryId, e.target.value as PipelineStage)} style={stageSelect}>
            {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>)}
          </select>
          <button type="button" onClick={() => onReject(row.entryId)} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 500, color: 'var(--danger)', cursor: 'pointer' }}>Reject</button>
        </div>
      )}
    </div>
  );
}

export function PipelineBoard({ jobId }: { jobId: string }) {
  const { data: board, isLoading, isError } = useJobPipeline(jobId);
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const patchEntry = usePatchEntry(jobId);
  const scoreJob = useScoreJob(jobId);
  const { toast } = useToast();
  const [tab, setTab] = useState<'board' | 'rejected'>('board');
  const [sortByFit, setSortByFit] = useState(false);
  const [openRow, setOpenRow] = useState<BoardRow | null>(null);
  const [composeFor, setComposeFor] = useState<{ entryId: string; candidateId: string; candidateName: string; initial: SendMessageInitial } | null>(null);

  // A stage move (or reject/un-reject) can carry back a pendingMessage — reviewed in SendMessageModal
  // before it sends. Row lookup lives here so all three move paths share one composer opener.
  function openComposeIfPending(entryId: string, result: PatchEntryResult) {
    if (!result.pendingMessage || !board) return;
    const row = PIPELINE_STAGES.flatMap((stage) => board.stages[stage]).find((r) => r.entryId === entryId) ?? board.rejected.find((r) => r.entryId === entryId);
    if (!row) return;
    setComposeFor({ entryId, candidateId: row.candidateId, candidateName: row.candidateName, initial: result.pendingMessage });
  }
  function handleStageChange(entryId: string, stage: PipelineStage) {
    patchEntry.mutate({ entryId, stage }, { onSuccess: (result) => openComposeIfPending(entryId, result), onError: (error) => toast(error instanceof Error ? error.message : 'Failed to move candidate.', 'error') });
  }
  function handleReject(entryId: string) {
    const reason = window.prompt('Reason for rejecting (optional)');
    if (reason === null) return;
    patchEntry.mutate({ entryId, rejected: true, reason: reason.trim() || undefined }, { onSuccess: (result) => openComposeIfPending(entryId, result), onError: (error) => toast(error instanceof Error ? error.message : 'Failed to reject candidate.', 'error') });
  }
  function handleMoveBack(entryId: string) {
    patchEntry.mutate({ entryId, stage: 'applied' }, { onSuccess: (result) => openComposeIfPending(entryId, result), onError: (error) => toast(error instanceof Error ? error.message : 'Failed to move candidate back.', 'error') });
  }

  if (isLoading) return <div style={card}><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Loading…</p></div>;
  if (isError || !board) return <div style={card}><p role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>Failed to load the pipeline.</p></div>;

  return (
    <div>
      <Tabs tabs={[{ value: 'board', label: 'Board' }, { value: 'rejected', label: `Rejected (${board.rejected.length})` }]} value={tab} onChange={(v) => setTab(v as 'board' | 'rejected')} />
      {tab === 'board' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}><Cb checked={sortByFit} onChange={setSortByFit} /> Sort by fit</label>
            <button type="button" onClick={() => scoreJob.mutate()} disabled={scoreJob.isPending} className="v2-hoverbtn" style={{ ...dt.toolBtn, opacity: scoreJob.isPending ? 0.5 : 1 }}>{scoreJob.isPending ? 'Scoring…' : 'Score candidates'}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', margin: 0 }}>{STAGE_LABEL[stage]} ({board.stages[stage].length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(sortByFit ? sortByFitScore(board.stages[stage]) : board.stages[stage]).map((row) => (
                    <PipelineCard key={row.entryId} row={row} canManage={canManage} onOpen={setOpenRow} onStageChange={handleStageChange} onReject={handleReject} />
                  ))}
                  {board.stages[stage].length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>No candidates.</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'rejected' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {board.rejected.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No rejected candidates.</p>}
          {board.rejected.map((row) => (
            <div key={row.entryId} style={{ ...card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" onClick={() => setOpenRow(row)} style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--org-primary)', cursor: 'pointer' }}>{row.candidateName}</button>
                {row.rejectedReason && <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Reason: {row.rejectedReason}</p>}
              </div>
              {canManage && <button type="button" onClick={() => handleMoveBack(row.entryId)} style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 500, color: 'var(--org-primary)', cursor: 'pointer' }}>Move back</button>}
            </div>
          ))}
        </div>
      )}

      {openRow && <CandidateDrawer jobId={jobId} row={openRow} onClose={() => setOpenRow(null)} />}
      {composeFor && <SendMessageModal entryId={composeFor.entryId} candidateId={composeFor.candidateId} candidateName={composeFor.candidateName} initial={composeFor.initial} onClose={() => setComposeFor(null)} />}
    </div>
  );
}

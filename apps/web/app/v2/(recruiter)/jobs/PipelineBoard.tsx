'use client';

// v2 PipelineBoard — kanban of a job's configurable pipeline stages. Re-skin on v2 primitives;
// all pipeline hooks, status-move/reject/score logic and the pending-message compose flow are
// verbatim. Uses the v2 CandidateDrawer + SendMessageModal (siblings in this folder).
//
// Task 11: columns are now driven by board.pipeline.stages (dynamic, org-configured) instead of
// the old fixed 5-stage enum, and board.columns is keyed by stageId instead of a stage name.
// There's no separate "Rejected" tab anymore -- rejected is just a StageCategory a pipeline's
// stages can carry, so a rejected-category stage (if the org's pipeline has one) simply renders
// as one more column, same as active/offer/hired ones. The per-card status control is a single
// <select> spanning every status across every stage of the pipeline (grouped by stage), which is
// the direct generalization of the old select's "any of the 5 fixed stages" behavior -- there's
// no drag-and-drop here (never was), so this dropdown is still the only way to move a card.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useJobPipeline, usePatchEntry, useScoreJob } from '../../../../lib/hooks/usePipeline';
import { BoardEntryRow, EntryExamResult, PatchEntryResult, PipelineStageConfig } from '../../../../lib/types';
import { useAuth } from '../../../../lib/auth-context';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useToast } from '../../../../components/ui';
import { CandidateDrawer } from './CandidateDrawer';
import { SendMessageModal, SendMessageInitial } from './SendMessageModal';
import { Cb, dt } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 99, border: '1px solid var(--hair)', background: 'var(--paper)', padding: '2px 8px', fontSize: 11.5, color: 'var(--ink)', textDecoration: 'none' };
const stageSelect: React.CSSProperties = { fontSize: 12, padding: '5px 8px', borderRadius: 7, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', cursor: 'pointer', minWidth: 0, maxWidth: '100%' };

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
function sortByFitScore(rows: BoardEntryRow[]): BoardEntryRow[] {
  return [...rows].sort((a, b) => {
    if (a.fitScore == null && b.fitScore == null) return 0;
    if (a.fitScore == null) return 1;
    if (b.fitScore == null) return -1;
    return b.fitScore - a.fitScore;
  });
}
// Flattens the pipeline's stages/statuses into one grouped option list, ordered by stage then
// status position (both already ordered by the API) -- lets a card move to any status in any
// stage from one dropdown, same reach the old flat 5-stage select had.
function buildStatusOptions(stages: PipelineStageConfig[]): { id: string; name: string; options: { value: string; label: string }[] }[] {
  return [...stages]
    .sort((a, b) => a.position - b.position)
    .map((stage) => ({ id: stage.id, name: stage.name, options: stage.statuses.map((status) => ({ value: status.id, label: status.name })) }));
}
function RatingStars({ avgRating }: { avgRating: number | null }) {
  if (avgRating === null) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>No ratings</span>;
  const rounded = Math.round(avgRating);
  return <span style={{ fontSize: 13, color: VIZ.amber }}>{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)} <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{avgRating.toFixed(1)}</span></span>;
}

interface PipelineCardProps {
  row: BoardEntryRow;
  canManage: boolean;
  statusGroups: { id: string; name: string; options: { value: string; label: string }[] }[];
  onOpen: (row: BoardEntryRow) => void;
  onStatusChange: (entryId: string, statusId: string) => void;
  onReject: (entryId: string) => void;
}

function PipelineCard({ row, canManage, statusGroups, onOpen, onStatusChange, onReject }: PipelineCardProps) {
  return (
    <div style={card}>
      <button type="button" onClick={() => onOpen(row)} style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--org-primary)', cursor: 'pointer' }}>{row.candidateName}</button>
      {/* Chips row only when there's something to show — no orphan "—" placeholder. */}
      {(row.examResults.length > 0 || row.fitScore != null) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {row.examResults.map((result) => (
            <Link key={result.examId} href={`/v2/reports/${result.examId}/candidates/${row.candidateId}`} style={chip}>{chipLabel(result)}</Link>
          ))}
          {row.fitScore != null && (
            <span style={{ ...chip, fontWeight: 600, color: chipColor(row.fitScore) }}>{row.fitScore}{row.fitStale && <span title="Stale — candidate updated since last score">⚠</span>}</span>
          )}
        </div>
      )}
      {/* One compact meta line: rating + notes (or a single empty-state), then source. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 10px', fontSize: 11.5, color: 'var(--muted)' }}>
        {row.avgRating !== null && <RatingStars avgRating={row.avgRating} />}
        {row.feedbackCount > 0 && <span>{row.feedbackCount} {row.feedbackCount === 1 ? 'note' : 'notes'}</span>}
        {row.avgRating === null && row.feedbackCount === 0 && <span>No feedback yet</span>}
        <span>Added via {row.enteredVia}</span>
      </div>
      {row.assigneeName && <p style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--org-primary)', margin: 0 }}>Assigned to {row.assigneeName}</p>}
      {canManage && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--hair)', paddingTop: 8 }}>
          <select aria-label={`Status for ${row.candidateName}`} value={row.statusId} onChange={(e) => onStatusChange(row.entryId, e.target.value)} style={stageSelect}>
            {statusGroups.map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
          {row.category !== 'rejected' && <button type="button" onClick={() => onReject(row.entryId)} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 500, color: 'var(--danger)', cursor: 'pointer' }}>Reject</button>}
        </div>
      )}
    </div>
  );
}

export function PipelineBoard({ jobId }: { jobId: string }) {
  const { data: board, isLoading, isError } = useJobPipeline(jobId);
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { data: currentUser } = useCurrentUser();
  const patchEntry = usePatchEntry(jobId);
  const scoreJob = useScoreJob(jobId);
  const { toast } = useToast();
  const [sortByFit, setSortByFit] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const visible = (rows: BoardEntryRow[]) => (mineOnly ? rows.filter((r) => r.assignedUserId === currentUser?.id) : rows);
  const [openRow, setOpenRow] = useState<BoardEntryRow | null>(null);
  const [composeFor, setComposeFor] = useState<{ entryId: string; candidateId: string; candidateName: string; initial: SendMessageInitial } | null>(null);

  const stages = useMemo(() => (board ? [...board.pipeline.stages].sort((a, b) => a.position - b.position) : []), [board]);
  const statusGroups = useMemo(() => buildStatusOptions(stages), [stages]);

  // A status move (or reject/un-reject) can carry back a pendingMessage — reviewed in
  // SendMessageModal before it sends. Row lookup lives here so all move paths share one opener.
  function openComposeIfPending(entryId: string, result: PatchEntryResult) {
    if (!result.pendingMessage || !board) return;
    const row = Object.values(board.columns).flat().find((r) => r.entryId === entryId);
    if (!row) return;
    setComposeFor({ entryId, candidateId: row.candidateId, candidateName: row.candidateName, initial: result.pendingMessage });
  }
  function handleStatusChange(entryId: string, statusId: string) {
    patchEntry.mutate({ entryId, statusId }, { onSuccess: (result) => openComposeIfPending(entryId, result), onError: (error) => toast(error instanceof Error ? error.message : 'Failed to move candidate.', 'error') });
  }
  function handleReject(entryId: string) {
    const reason = window.prompt('Reason for rejecting (optional)');
    if (reason === null) return;
    patchEntry.mutate({ entryId, rejected: true, reason: reason.trim() || undefined }, { onSuccess: (result) => openComposeIfPending(entryId, result), onError: (error) => toast(error instanceof Error ? error.message : 'Failed to reject candidate.', 'error') });
  }

  if (isLoading) return <div style={card}><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Loading…</p></div>;
  if (isError || !board) return <div style={card}><p role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>Failed to load the pipeline.</p></div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}><Cb checked={sortByFit} onChange={setSortByFit} /> Sort by fit</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}><Cb checked={mineOnly} onChange={setMineOnly} /> My candidates</label>
        </div>
        <button type="button" onClick={() => scoreJob.mutate()} disabled={scoreJob.isPending} className="v2-hoverbtn" style={{ ...dt.toolBtn, opacity: scoreJob.isPending ? 0.5 : 1 }}>{scoreJob.isPending ? 'Scoring…' : 'Score candidates'}</button>
      </div>
      {/* Kanban scrolls horizontally instead of crushing the stage columns below ~200px each
          (which spilled the card footer controls out of the card on narrow/minimized screens). */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length}, minmax(200px, 1fr))`, gap: 16 }}>
          {stages.map((stage) => {
            const rows = board.columns[stage.id] ?? [];
            const shown = visible(rows);
            return (
              <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', margin: 0 }}>{stage.name} ({shown.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(sortByFit ? sortByFitScore(shown) : shown).map((row) => (
                    <PipelineCard key={row.entryId} row={row} canManage={canManage} statusGroups={statusGroups} onOpen={setOpenRow} onStatusChange={handleStatusChange} onReject={handleReject} />
                  ))}
                  {shown.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>No candidates.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openRow && <CandidateDrawer jobId={jobId} row={openRow} onClose={() => setOpenRow(null)} />}
      {composeFor && <SendMessageModal entryId={composeFor.entryId} candidateId={composeFor.candidateId} candidateName={composeFor.candidateName} initial={composeFor.initial} onClose={() => setComposeFor(null)} />}
    </div>
  );
}

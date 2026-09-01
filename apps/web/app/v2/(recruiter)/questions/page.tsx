'use client';

// v2 Question Bank — full parity on the shared DataTable (with grouping): search, status filter in
// header, Group By (topic/category/difficulty/tag, collapsible), Needs-review toggle, draft bulk
// publish/discard, per-row Publish/Discard/Restore/Delete, Generate-AI + Bulk upload. Format only —
// same hooks/behavior as the old /questions (useQuestions widen-when-grouped, useFlaggedQuestions,
// archive/restore). The Generate-AI modal is the existing component (v2 restyle is a later slice).
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, MoreHorizontal, ListFilter, Check, Trash2, CircleCheck, CircleX, RotateCcw } from 'lucide-react';
import { useQuestions, useArchiveQuestion, useRestoreQuestion, useFlaggedQuestions } from '../../../../lib/hooks/useQuestions';
import { TYPE_LABEL, DIFFICULTY_LABEL, DIFFICULTY_LEVEL } from '../../../../lib/question-display';
import type { GroupBy, GroupByField } from '../../../../lib/question-grouping';
import type { Question, QuestionType } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Combobox, Dropdown, DropdownItem, Dialog } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';
import { GenerateQuestionsModal } from '../../../../components/GenerateQuestionsModal';

const STATUS_OPTS = [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Drafts' }, { value: 'archived', label: 'Archived' }];
const GROUP_BY_OPTS = [{ value: 'none', label: 'No grouping' }, { value: 'topic', label: 'Topic' }, { value: 'category', label: 'Category' }, { value: 'difficulty', label: 'Difficulty' }, { value: 'tag', label: 'Tag' }];
const COLUMN_LABELS: Record<string, string> = { type: 'Type', difficulty: 'Difficulty', marks: 'Marks', topic: 'Topic', category: 'Category' };
const STATUS_PILL: Record<string, { c: string; label: string }> = { active: { c: STATUS.ok, label: 'Active' }, draft: { c: VIZ.amber, label: 'Draft' }, archived: { c: 'var(--muted)', label: 'Archived' } };
const TYPE_COLOR: Record<QuestionType, string> = { single_mcq: VIZ.azure, multi_mcq: VIZ.azure, true_false: VIZ.azure, code: VIZ.violet };
const PLACEHOLDER: Record<GroupByField, string> = { topic: 'No topic', category: 'No category', difficulty: 'No difficulty', tag: 'No tags' };
const DIFF_ORDER = ['Easy', 'Medium', 'Hard'];
const truncCell: React.CSSProperties = { display: 'block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export default function V2QuestionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  // Grouped/needs-review widen to the server max on page 1 so counts reflect the whole set (matches old).
  const widen = groupBy !== 'none' || needsReviewOnly;
  const { data: questions, isLoading, isError } = useQuestions({ page: widen ? 1 : page, pageSize: widen ? 100 : 20, search: search || undefined, status });
  const { data: draftCount } = useQuestions({ status: 'draft', pageSize: 1 });
  const pendingDrafts = draftCount?.total ?? 0;
  const { data: flagged } = useFlaggedQuestions();
  const archiveQuestion = useArchiveQuestion();
  const restoreQuestion = useRestoreQuestion();

  const fetchedRows = questions?.data ?? [];
  const rows = needsReviewOnly
    ? (flagged ?? []).map((f) => fetchedRows.find((q) => q.id === f.questionId)).filter((q): q is Question => Boolean(q))
    : fetchedRows;
  const hiddenFlaggedCount = needsReviewOnly ? Math.max(0, (flagged?.length ?? 0) - rows.length) : 0;

  function handleRestore(q: Question) {
    const isDraft = q.status === 'draft';
    restoreQuestion.mutate(q.id, {
      onSuccess: () => notify('success', isDraft ? 'Question published.' : 'Question restored.'),
      onError: (e) => notify('error', e instanceof Error ? e.message : isDraft ? 'Failed to publish question.' : 'Failed to restore question.'),
    });
  }
  function handleDiscard(q: Question) {
    archiveQuestion.mutate(q.id, { onSuccess: () => notify('success', 'Question discarded.'), onError: (e) => notify('error', e instanceof Error ? e.message : 'Failed to discard question.') });
  }
  function handleConfirmDelete() {
    if (!pendingDelete) return;
    archiveQuestion.mutate(pendingDelete.id, {
      onSuccess: () => { notify('success', 'Question deleted.'); setPendingDelete(null); },
      onError: (e) => { notify('error', e instanceof Error ? e.message : 'Failed to delete question.'); setPendingDelete(null); },
    });
  }
  async function handleBulk(action: 'publish' | 'discard', ids: string[], clear: () => void) {
    const mutation = action === 'publish' ? restoreQuestion : archiveQuestion;
    const verb = action === 'publish' ? 'published' : 'discarded';
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => mutation.mutateAsync(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) notify('success', `${ids.length} question${ids.length === 1 ? '' : 's'} ${verb}.`);
      else notify('error', `${ids.length - failed} of ${ids.length} ${verb} — ${failed} failed.`);
      clear();
    } finally { setBulkPending(false); }
  }

  const columns: ColumnDef<typeof DT_FEATURES, Question>[] = [
    {
      accessorKey: 'text', enableHiding: false,
      header: ({ column }) => <SortHead label="Question" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => <Link href={`/questions/${row.original.id}/edit`} title={row.original.text} style={{ ...truncCell, fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.text}</Link>,
    },
    {
      accessorKey: 'status', enableSorting: false, enableHiding: false,
      header: () => (
        <Dropdown align="start" menuWidth={150} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: status !== 'active' ? 'var(--org-primary)' : 'var(--muted)' }}>Status <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
          {(close) => STATUS_OPTS.map((o) => <DropdownItem key={o.value} onClick={() => { close(); setStatus(o.value); setPage(1); }}><span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{status === o.value && <Check size={15} />}</span>{o.label}</DropdownItem>)}
        </Dropdown>
      ),
      cell: ({ row }) => <Pill c={STATUS_PILL[row.original.status].c} label={STATUS_PILL[row.original.status].label} />,
    },
    { id: 'type', accessorFn: (q) => TYPE_LABEL[q.type] ?? q.type, header: ({ column }) => <SortHead label="Type" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Pill c={TYPE_COLOR[row.original.type] ?? VIZ.azure} label={TYPE_LABEL[row.original.type] ?? row.original.type} /> },
    { id: 'difficulty', accessorFn: (q) => DIFFICULTY_LEVEL[q.difficulty] ?? 0, header: ({ column }) => <SortHead label="Difficulty" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{DIFFICULTY_LABEL[row.original.difficulty] ?? row.original.difficulty}</span> },
    { accessorKey: 'marks', header: ({ column }) => <SortHead label="Marks" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono">{row.original.marks}</span> },
    { accessorKey: 'topic', header: ({ column }) => <SortHead label="Topic" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ ...truncCell, ...dt.muted, maxWidth: 160 }} title={row.original.topic ?? undefined}>{row.original.topic ?? '—'}</span> },
    { accessorKey: 'category', header: ({ column }) => <SortHead label="Category" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ ...truncCell, ...dt.muted, maxWidth: 160 }} title={row.original.category ?? undefined}>{row.original.category ?? '—'}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => {
        const q = row.original;
        return (
          <Dropdown align="end" menuWidth={150} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
            {(close) => (
              q.status === 'draft' ? (<>
                <DropdownItem onClick={() => { close(); handleRestore(q); }}><CircleCheck size={15} /> Publish</DropdownItem>
                <DropdownItem danger onClick={() => { close(); handleDiscard(q); }}><CircleX size={15} /> Discard</DropdownItem>
              </>) : q.status === 'archived' ? (
                <DropdownItem onClick={() => { close(); handleRestore(q); }}><RotateCcw size={15} /> Restore</DropdownItem>
              ) : (
                <DropdownItem danger onClick={() => { close(); setPendingDelete(q); }}><Trash2 size={15} /> Delete</DropdownItem>
              )
            )}
          </Dropdown>
        );
      },
    },
  ];

  const groupOf = groupBy === 'none' ? undefined : (q: Question) => {
    if (groupBy === 'tag') { const tags = q.tags ?? []; return tags.length ? tags.map((t) => t.name) : ['No tags']; }
    if (groupBy === 'difficulty') return DIFFICULTY_LABEL[q.difficulty] ?? PLACEHOLDER.difficulty;
    const v = groupBy === 'topic' ? q.topic : q.category;
    return v?.trim() ? v : PLACEHOLDER[groupBy as GroupByField];
  };
  const ph = groupBy === 'none' ? '' : PLACEHOLDER[groupBy as GroupByField];
  const groupSort = groupBy === 'none' ? undefined : (a: string, b: string) => {
    if (groupBy === 'difficulty') { const r = (x: string) => (DIFF_ORDER.indexOf(x) === -1 ? DIFF_ORDER.length : DIFF_ORDER.indexOf(x)); return r(a) - r(b); }
    if (a === ph) return 1; if (b === ph) return -1; return a.localeCompare(b);
  };
  const groupMeta = (_label: string, gr: Question[]) => {
    const marks = gr.reduce((s, q) => s + (q.marks ?? 0), 0);
    return `${gr.length} ${gr.length === 1 ? 'question' : 'questions'} · ${marks} ${marks === 1 ? 'mark' : 'marks'}`;
  };

  const emptyMessage = needsReviewOnly ? 'No flagged questions in this view.' : status === 'archived' ? 'No archived questions.' : status === 'draft' ? 'No drafts to review.' : 'No questions yet.';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Question Bank</h1>
        <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/questions/bulk-upload" style={dt.toolBtn}>Bulk upload</Link>
          <button type="button" style={dt.toolBtn} onClick={() => setGenerateOpen(true)}>Generate with AI</button>
          <Link href="/questions/new" style={dt.primaryBtn}><Plus size={14} /> New question</Link>
        </span>
      </div>

      {pendingDrafts > 0 && status !== 'draft' && (
        <button type="button" onClick={() => { setStatus('draft'); setPage(1); }} style={{ display: 'block', marginBottom: 12, fontSize: 13, fontWeight: 500, color: 'var(--org-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {pendingDrafts} {pendingDrafts === 1 ? 'draft' : 'drafts'} awaiting review →
        </button>
      )}

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      {hiddenFlaggedCount > 0 && rows.length > 0 && (
        <p style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--muted)' }}>Showing {rows.length} of {flagged?.length ?? 0} flagged — the rest sit outside this view (a different status, or beyond the first 100).</p>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search questions…"
        page={widen ? undefined : questions?.page ?? 1} totalPages={widen ? undefined : questions?.totalPages ?? 1} onPageChange={widen ? undefined : setPage}
        isLoading={isLoading} isError={isError} errorMessage="Failed to load questions." emptyMessage={emptyMessage}
        columnLabels={COLUMN_LABELS}
        enableSelection={status === 'draft'}
        renderBulkBar={status === 'draft' ? (ids, clear) => (
          <div style={dt.bulkBar}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--org-primary)' }}>{ids.length} selected</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
              <button type="button" disabled={bulkPending} onClick={() => handleBulk('publish', ids, clear)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 13px', borderRadius: 8, border: 'none', background: 'var(--org-primary)', color: '#fff', cursor: 'pointer' }}><CircleCheck size={14} /> Publish</button>
              <button type="button" disabled={bulkPending} onClick={() => handleBulk('discard', ids, clear)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 13px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer' }}><CircleX size={14} /> Discard</button>
              <button type="button" onClick={clear} style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}>Clear</button>
            </span>
          </div>
        ) : undefined}
        groupOf={groupOf} groupSort={groupSort} groupMeta={groupMeta}
        toolbarExtra={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Combobox options={GROUP_BY_OPTS} value={groupBy} onChange={(v) => { setGroupBy(v as GroupBy); setPage(1); }} width={150} active={groupBy !== 'none'} />
            {((flagged && flagged.length > 0) || needsReviewOnly) && (
              <button type="button" aria-pressed={needsReviewOnly} onClick={() => { setNeedsReviewOnly((c) => !c); setPage(1); }} style={{ ...dt.toolBtn, ...(needsReviewOnly ? { background: 'color-mix(in srgb, var(--org-primary) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--org-primary) 30%, transparent)', color: 'var(--org-primary)', fontWeight: 600 } : {}) }}>Needs review ({flagged?.length ?? 0})</button>
            )}
          </span>
        }
      />

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete question">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 8px' }}>Delete this question? It will be removed from the question bank. Exams that already use it keep their copy.</p>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: '0 0 18px', ...truncCell, maxWidth: '100%' }} title={pendingDelete?.text}>{pendingDelete?.text}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={archiveQuestion.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>

      <GenerateQuestionsModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onCompleted={() => { queryClient.invalidateQueries({ queryKey: ['questions'] }); setStatus('draft'); setPage(1); setGenerateOpen(false); }}
      />
    </>
  );
}

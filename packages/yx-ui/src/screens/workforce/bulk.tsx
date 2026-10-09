import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Breadcrumbs, Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FileUpload } from '../../components/upload';
import { dayKey } from '../../lib/dates';
import { ChangeStatusBadge, TYPE_LABEL } from '../history/history-kit';
import type { ChangeType, PersonOption } from '../history/types';
import { dateLabel, useRun } from '../org/org-kit';
import { csvText, downloadText } from './workforce-kit';
import type { BatchStatus, BulkResult, BulkRowResult, ChangeBatch, LoadState } from './types';

// People › Bulk changes (PPL-06 / PPL-07; M01 §3.3, §3.2): many job changes from a CSV file, or "move all of
// a manager's reports", checked row by row first (each row as if approved in turn) and sent as one batch that
// is approved once, all or nothing, by someone outside it (YX-SEC-11). Pay columns need pay access (R1).

export const BULK_TEMPLATE_COLUMNS = ['employee_code', 'legal_entity', 'change_type', 'effective_date', 'location', 'department', 'designation', 'grade', 'employment_type', 'manager', 'dotted_line_managers', 'cost_centre', 'annual_ctc', 'increase_percent', 'reason'];

export interface BulkChangesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  batches: ChangeBatch[];
  /** People who can be picked when moving a team. */
  people: PersonOption[];
  canManage: boolean;
  canApprove: boolean;
  /** employee.salary.manage: the template has the pay columns. */
  canPay: boolean;
  /** Opens one batch from a link (e.g. from Job changes). */
  defaultBatchId?: string | null;
  onCheckFile: (input: { csv: string; fileName: string; reason: string; dryRun: boolean }) => Promise<BulkResult>;
  onCheckReassign: (input: { fromManagerId: string; toManagerId: string; effectiveDate: string; reason: string; dryRun: boolean }) => Promise<BulkResult>;
  loadBatch: (id: string) => Promise<ChangeBatch>;
  /** Rejects with an error whose `code` is REBASE_CONFIRMATION_REQUIRED when later changes would be recalculated. */
  onApprove: (id: string, confirmRebase: boolean) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onCancel: (id: string, reason: string) => Promise<void>;
}

type Tab = 'file' | 'team' | 'batches';
const BATCH_STATUS: Record<BatchStatus, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const typeLabel = (t: string | null) => (t && t in TYPE_LABEL ? TYPE_LABEL[t as ChangeType] : (t ?? '—'));

/** The dry-run rows: each with its person, change, date and what happens, or what to fix. */
function ResultTable({ result }: { result: BulkResult }) {
  const columns: TableColumn<BulkRowResult>[] = [
    { key: 'line', header: 'Row', value: (r) => r.line, width: 70, hideable: false },
    {
      key: 'who',
      header: 'Person and change',
      value: (r) => r.name ?? r.employeeCode ?? '',
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{r.name ?? r.employeeCode ?? 'Unknown'}</Text>
          <Text tone="secondary" size="sm">{`${typeLabel(r.changeType)}${r.effectiveDate ? ` · ${dateLabel(r.effectiveDate)}` : ''}`}</Text>
        </span>
      ),
      width: 240,
    },
    {
      key: 'result',
      header: 'Result',
      value: (r) => (r.ok ? 'ok' : 'error'),
      render: (r) =>
        r.ok ? (
          <span className="yx-auth__item-main">
            <Badge tone="success">Ready</Badge>
            <Text tone="secondary" size="sm">
              {[...(r.impact?.facts ?? []).map((f) => `${f.fact}: ${f.from ?? '—'} → ${f.to ?? '—'}`), ...(r.impact?.pay === 'hidden' ? ['Pay changes too'] : (r.impact?.pay ?? []).map(() => 'Pay changes'))].join(' · ') || 'Nothing changes on that date'}
            </Text>
          </span>
        ) : (
          <span className="yx-auth__item-main">
            <Badge tone="danger">Fix this row</Badge>
            <Text tone="danger" size="sm">{r.error}</Text>
          </span>
        ),
      width: 380,
    },
  ];
  return (
    <>
      {result.errors > 0 ? (
        <InlineAlert tone="danger" title={`${result.errors} of ${result.rows.length} rows need fixing`}>Fix them in the file and check it again. Nothing is sent until every row is ready.</InlineAlert>
      ) : (
        <InlineAlert tone="success" title={`All ${result.rows.length} rows are ready`}>They go for approval together, and are approved together.</InlineAlert>
      )}
      <DataTable label="Rows checked" columns={columns} rows={result.rows} getRowId={(r) => String(r.line)} rowNoun={['row', 'rows']} cardSummary pageSize={50} />
    </>
  );
}

function BatchDrawer({ id, canApprove, canManage, loadBatch, onApprove, onReject, onCancel, onClose }: { id: string } & Pick<BulkChangesScreenProps, 'canApprove' | 'canManage' | 'loadBatch' | 'onApprove' | 'onReject' | 'onCancel'> & { onClose: () => void }) {
  const [batch, setBatch] = useState<ChangeBatch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rebase, setRebase] = useState(false);
  const [ask, setAsk] = useState<'reject' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  useEffect(() => {
    loadBatch(id).then(setBatch, (e: Error) => setLoadError(e.message));
  }, [id, loadBatch]);
  const approve = () =>
    void run('approve', async () => {
      try {
        await onApprove(id, rebase);
        onClose();
      } catch (e) {
        if ((e as { code?: string }).code === 'REBASE_CONFIRMATION_REQUIRED') setRebase(true);
        throw e;
      }
    });
  const pending = batch?.status === 'pending';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={batch ? batch.fileName ?? (batch.source === 'reassign' ? 'Team move' : 'Bulk change') : 'Bulk change'}
      subtitle={batch ? `${batch.rowCount} change${batch.rowCount === 1 ? '' : 's'} · raised ${dateLabel(batch.requestedAt.slice(0, 10))}` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy !== null}>Close</Button>
          {pending && canManage && <Button onClick={() => setAsk('cancel')} disabled={busy !== null}>Cancel batch</Button>}
          {pending && canApprove && <Button variant="danger" onClick={() => setAsk('reject')} disabled={busy !== null}>Reject</Button>}
          {pending && canApprove && (
            <Button variant="approve" loading={busy === 'approve'} disabled={!batch} onClick={approve}>
              {rebase ? 'Approve and recalculate' : 'Approve all'}
            </Button>
          )}
        </>
      }
    >
      <div className="yx-org__editor">
        {loadError && <ErrorState title="We couldn't load this batch." description={loadError} />}
        {!batch && !loadError && <Skeleton height={160} />}
        {batch && (
          <>
            <Text as="p">{batch.reason}</Text>
            {batch.touchesPay && <Text as="p" tone="secondary" size="sm">Pay changes are part of this batch. Only people with pay access see the amounts.</Text>}
            {batch.decisionNote && <InlineAlert tone="info" title={BATCH_STATUS[batch.status].label}>{batch.decisionNote}</InlineAlert>}
            <ul className="yx-ppl2__roles" aria-label="Changes in this batch">
              {(batch.changes ?? []).map((c) => (
                <li key={c.id}>
                  <Text weight="medium">{c.employeeName ?? 'Employee'}</Text>
                  <Text size="sm">{`${TYPE_LABEL[c.changeType]} · ${dateLabel(c.effectiveDate)} · ${c.reason}`}</Text>
                  <ChangeStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </>
        )}
        {rebase && <InlineAlert tone="warning" title="Later changes will be recalculated">Some people have changes scheduled after these dates. Approving recalculates them on the new values.</InlineAlert>}
        {error && !rebase && <InlineAlert tone="danger" title="Nothing was approved">{error}</InlineAlert>}
      </div>
      {ask && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAsk(null)}
          size="md"
          title={ask === 'reject' ? 'Reject every change in this batch?' : 'Cancel this batch?'}
          consequence={ask === 'reject' ? 'None of the changes go ahead. The person who raised it sees your reason.' : 'None of the changes go ahead.'}
          confirmLabel={ask === 'reject' ? 'Reject batch' : 'Cancel batch'}
          destructive
          confirmDisabled={reason.trim().length < 3}
          onConfirm={async () => {
            await (ask === 'reject' ? onReject(id, reason.trim()) : onCancel(id, reason.trim()));
            setAsk(null);
            onClose();
          }}
        >
          <FormField id="bt-reason" label="Reason" required helper="At least 3 characters.">
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={1000} />
          </FormField>
        </ConfirmDialog>
      )}
    </Drawer>
  );
}

export function BulkChangesScreen(props: BulkChangesScreenProps) {
  const { state, onRetry, batches, people, canManage, canApprove, canPay, defaultBatchId, onCheckFile, onCheckReassign } = props;
  const [tab, setTab] = useState<Tab>(defaultBatchId || !canManage ? 'batches' : 'file');
  const [openId, setOpenId] = useState<string | null>(defaultBatchId ?? null);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [reason, setReason] = useState('');
  const [team, setTeam] = useState<{ from: string | null; to: string | null; date: Date | null }>({ from: null, to: null, date: null });
  const [result, setResult] = useState<BulkResult | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const { busy, error, run, clearError } = useRun();
  const reset = () => {
    setResult(null);
    setSent(null);
    clearError();
  };
  const teamReady = Boolean(team.from && team.to && team.date && team.from !== team.to);
  const ready = reason.trim().length >= 3 && (tab === 'file' ? Boolean(file) : teamReady);
  const check = (dryRun: boolean) =>
    void run(dryRun ? 'check' : 'send', async () => {
      const r = tab === 'file' ? await onCheckFile({ csv: file!.csv, fileName: file!.name, reason: reason.trim(), dryRun }) : await onCheckReassign({ fromManagerId: team.from!, toManagerId: team.to!, effectiveDate: dayKey(team.date!), reason: reason.trim(), dryRun });
      setResult(r);
      if (!dryRun && r.batch) {
        setSent(r.batch.id);
        setFile(null);
        setReason('');
        setTeam({ from: null, to: null, date: null });
      }
    });
  const template = () => {
    const columns = canPay ? BULK_TEMPLATE_COLUMNS : BULK_TEMPLATE_COLUMNS.filter((c) => c !== 'annual_ctc' && c !== 'increase_percent');
    const example: Record<string, string> = { employee_code: 'KF-0142', change_type: 'transfer', effective_date: '2026-11-01', location: 'MYS', reason: 'Team moves to Mysuru' };
    downloadText('bulk-changes-template.csv', csvText([columns, columns.map((c) => example[c] ?? '')]));
  };
  const personOptions = people.map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` }));
  const shownBatches = batches.filter((b) => (showDone ? b.status !== 'pending' : b.status === 'pending'));
  const batchColumns: TableColumn<ChangeBatch>[] = [
    {
      key: 'batch',
      header: 'Batch',
      value: (b) => b.fileName ?? b.reason,
      render: (b) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{b.fileName ?? (b.source === 'reassign' ? 'Team move' : 'Bulk change')}</Text>
          <Text tone="secondary" size="sm">{`${b.rowCount} change${b.rowCount === 1 ? '' : 's'} · ${b.reason}`}</Text>
        </span>
      ),
      hideable: false,
    },
    { key: 'raised', header: 'Raised', value: (b) => b.requestedAt, render: (b) => dateLabel(b.requestedAt.slice(0, 10)), width: 130 },
    { key: 'status', header: 'Status', value: (b) => b.status, render: (b) => <Badge tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</Badge>, width: 190, optional: true },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'Bulk changes' }]} />}
        title="Bulk changes"
        description="Change many people at once, from a file or by moving a manager's team. Every row is checked first; the batch is approved as a whole."
        actions={canManage && state === 'ready' ? <Button icon={Download} onClick={template}>Download template</Button> : undefined}
      />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load bulk changes." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="bulk changes" />}
      {state === 'ready' && (
        <>
          <Segment
            label="Show"
            value={tab}
            onChange={(t) => {
              setTab(t);
              reset();
            }}
            options={[...(canManage ? [{ value: 'file' as const, label: 'From a file' }, { value: 'team' as const, label: 'Move a team' }] : []), { value: 'batches' as const, label: 'Batches' }]}
          />
          {tab !== 'batches' && (
            <Card title={tab === 'file' ? 'The file' : 'The team'}>
              <form
                className="yx-org__editor"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (ready) check(true);
                }}
              >
                {tab === 'file' ? (
                  <FormField id="bk-file" label="CSV file" required helper="One change per row, at most 500 rows. Codes are the ones on your structure pages.">
                    <FileUpload
                      accept={['.csv']}
                      maxSize={512 * 1024}
                      multiple={false}
                      upload={async (f) => {
                        setFile({ name: f.name, csv: await f.text() });
                        reset();
                      }}
                      onItemsChange={(items) => items.length === 0 && setFile(null)}
                    />
                  </FormField>
                ) : (
                  <>
                    <FormField id="bk-from" label="Everyone who reports to" required>
                      <Select aria-label="Everyone who reports to" searchable options={personOptions} value={team.from} onChange={(from) => (setTeam({ ...team, from }), reset())} />
                    </FormField>
                    <FormField id="bk-to" label="Moves to" required error={team.from && team.from === team.to ? 'Pick a different manager' : undefined}>
                      <Select aria-label="Moves to" searchable options={personOptions} value={team.to} onChange={(to) => (setTeam({ ...team, to }), reset())} />
                    </FormField>
                    <FormField id="bk-date" label="From" required>
                      <DatePicker aria-label="From" value={team.date} onChange={(date) => (setTeam({ ...team, date }), reset())} />
                    </FormField>
                  </>
                )}
                <FormField id="bk-reason" label="Reason" required helper="Used for rows without their own reason, and shown to the approver.">
                  <TextArea value={reason} onChange={(r) => (setReason(r), reset())} rows={2} maxLength={1000} />
                </FormField>
                <div className="yx-ppl2__row">
                  <Button type="submit" loading={busy === 'check'} disabled={!ready || busy !== null}>
                    Check every row
                  </Button>
                  <Button variant="primary" loading={busy === 'send'} disabled={!result || result.errors > 0 || Boolean(sent) || busy !== null} onClick={() => check(false)}>
                    Send for approval
                  </Button>
                  {!result && <Text tone="secondary" size="sm">Check the rows first; nothing is saved until you send.</Text>}
                </div>
              </form>
            </Card>
          )}
          {tab !== 'batches' && error && <InlineAlert tone="danger" title="Not checked">{error}</InlineAlert>}
          {tab !== 'batches' && sent && (
            <InlineAlert tone="success" title="Sent for approval" actions={<Button size="sm" onClick={() => (setTab('batches'), setOpenId(sent))}>Open the batch</Button>}>
              Someone with approval rights approves it as a whole.
            </InlineAlert>
          )}
          {tab !== 'batches' && result && !sent && <ResultTable result={result} />}
          {tab === 'batches' && (
            <>
              <Segment label="Batches" value={showDone ? 'done' : 'pending'} onChange={(v) => setShowDone(v === 'done')} options={[{ value: 'pending', label: 'Waiting for approval' }, { value: 'done', label: 'Decided' }]} />
              <DataTable
                label="Batches"
                columns={batchColumns}
                rows={shownBatches}
                getRowId={(b) => b.id}
                rowNoun={['batch', 'batches']}
                cardSummary
                empty={<EmptyState compact title={showDone ? 'No batch has been decided yet.' : 'Nothing is waiting for approval.'} />}
                rowButtons={(b) => (
                  <Button size="sm" variant={b.status === 'pending' && canApprove ? 'review' : 'secondary'} onClick={() => setOpenId(b.id)}>
                    {b.status === 'pending' && canApprove ? 'Review' : 'Open'}
                  </Button>
                )}
              />
            </>
          )}
        </>
      )}
      {openId && <BatchDrawer id={openId} canApprove={canApprove} canManage={canManage} loadBatch={props.loadBatch} onApprove={props.onApprove} onReject={props.onReject} onCancel={props.onCancel} onClose={() => setOpenId(null)} />}
    </div>
  );
}

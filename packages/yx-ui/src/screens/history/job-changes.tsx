import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { dateLabel, errorText, useRun } from '../org/org-kit';
import { ChangeDrawer, ChangeStatusBadge, ImpactPanel, TYPE_LABEL, WhenBadge } from './history-kit';
import type { ChangeInput, ChangeOptions, ChangeRecord, Impact, LoadState } from './types';

// People › Job changes (P06 §7, PPL-05): changes waiting for approval, scheduled ones (edit or cancel until
// they take effect, Q7) and those done. Approving needs someone other than the requester (YX-SEC-11) and
// shows the impact first, including later changes it recalculates (YX-HIS-06, YX-HIS-11).

export type ChangesView = 'pending' | 'scheduled' | 'done';

export interface JobChangesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  today: string;
  rows: ChangeRecord[];
  defaultView?: ChangesView;
  canApprove: boolean;
  canManage: boolean;
  personHref: (employeeId: string) => string;
  /** A change raised in a bulk batch is decided with its batch (M01 §3.3). */
  batchHref?: (batchId: string) => string;
  onPreview: (id: string) => Promise<Impact>;
  /** confirmRebase: the approver has seen the recalculated later changes. */
  onApprove: (id: string, confirmRebase: boolean) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onCancel: (id: string, reason: string) => Promise<void>;
  /** Moving the date sends it back for approval. */
  onReschedule: (id: string, effectiveDate: string) => Promise<void>;
  newChange?: { options: ChangeOptions; onPreview: (input: ChangeInput) => Promise<Impact>; onSubmit: (input: ChangeInput) => Promise<void> };
}

type Ask = { kind: 'reject' | 'cancel' | 'reschedule'; row: ChangeRecord };

function Review({ row, onPreview, onApprove, onReject, onClose }: { row: ChangeRecord; onPreview: (id: string) => Promise<Impact>; onApprove: (confirm: boolean) => Promise<void>; onReject: () => void; onClose: () => void }) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  useEffect(() => {
    onPreview(row.id).then(setImpact, (e) => setLoadError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);
  const rebased = impact?.rebased.length ?? 0;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`${TYPE_LABEL[row.changeType]} · ${row.employeeName ?? 'Employee'}`}
      subtitle={`Takes effect on ${dateLabel(row.effectiveDate)}`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy !== null}>Close</Button>
          <Button variant="danger" onClick={onReject} disabled={busy !== null}>Reject</Button>
          <Button variant="approve" loading={busy === 'approve'} disabled={!impact} onClick={() => void run('approve', () => onApprove(rebased > 0)).then((ok) => ok && onClose())}>
            {rebased ? 'Approve and recalculate' : 'Approve'}
          </Button>
        </>
      }
    >
      <div className="yx-org__editor">
        <Text as="p">{row.reason}</Text>
        {row.overrideReason && <InlineAlert tone="warning" title="Goes back before the limit">{row.overrideReason}</InlineAlert>}
        {loadError && <ErrorState title="We couldn't work out the impact." description={loadError} />}
        {!impact && !loadError && <Skeleton height={160} />}
        {impact && <ImpactPanel impact={impact} />}
        {error && <InlineAlert tone="danger" title="Not approved">{error}</InlineAlert>}
      </div>
    </Drawer>
  );
}

function ReasonDialog({ ask, onDone, onClose, act }: { ask: Ask; onDone: () => void; onClose: () => void; act: (reason: string, date: string | null) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const copy = {
    reject: { title: `Reject the ${TYPE_LABEL[ask.row.changeType].toLowerCase()} for ${ask.row.employeeName ?? 'this person'}?`, consequence: 'The person who raised it sees your reason.', label: 'Reject change' },
    cancel: { title: `Cancel the ${TYPE_LABEL[ask.row.changeType].toLowerCase()} for ${ask.row.employeeName ?? 'this person'}?`, consequence: ask.row.status === 'scheduled' ? 'It will not take effect. Later changes fall back on the values before it.' : 'It will not go ahead.', label: 'Cancel change' },
    reschedule: { title: `Move the ${TYPE_LABEL[ask.row.changeType].toLowerCase()} to another date?`, consequence: 'A new date goes back for approval; until then the change does not take effect.', label: 'Move and send for approval' },
  }[ask.kind];
  const ready = ask.kind === 'reschedule' ? Boolean(date) : reason.trim().length >= 3;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={copy.title}
      consequence={copy.consequence}
      confirmLabel={copy.label}
      destructive={ask.kind !== 'reschedule'}
      confirmDisabled={!ready}
      onConfirm={async () => {
        await act(reason.trim(), date ? dayKey(date) : null);
        onDone();
      }}
    >
      {ask.kind === 'reschedule' ? (
        <FormField id="rs-date" label="New date" required>
          <DatePicker value={date} onChange={setDate} aria-label="New date" />
        </FormField>
      ) : (
        <FormField id="rs-reason" label="Reason" required helper="At least 3 characters.">
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={1000} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}

const VIEWS: { value: ChangesView; label: string }[] = [
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'done', label: 'Done' },
];

export function JobChangesScreen({ state, onRetry, today, rows, defaultView = 'pending', canApprove, canManage, personHref, batchHref, onPreview, onApprove, onReject, onCancel, onReschedule, newChange }: JobChangesScreenProps) {
  const [view, setView] = useState<ChangesView>(defaultView);
  const [reviewing, setReviewing] = useState<ChangeRecord | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [raising, setRaising] = useState(false);
  const shown = rows.filter((r) => (view === 'done' ? r.status === 'effective' || r.status === 'rejected' || r.status === 'cancelled' : r.status === view));
  const columns: TableColumn<ChangeRecord>[] = [
    {
      key: 'person',
      header: 'Person and change',
      value: (r) => r.employeeName ?? '',
      render: (r) => (
        <span className="yx-auth__item-main">
          <a className="yx-hist__link" href={personHref(r.employeeId)}>{r.employeeName ?? 'Employee'}</a>
          <Text tone="secondary" size="sm">{`${TYPE_LABEL[r.changeType]} · ${r.reason}`}</Text>
        </span>
      ),
      hideable: false,
    },
    {
      key: 'when',
      header: 'Takes effect',
      value: (r) => r.effectiveDate,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{dateLabel(r.effectiveDate)}</Text>
          {view !== 'done' && <WhenBadge date={r.effectiveDate} today={today} />}
        </span>
      ),
      width: 150,
    },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <ChangeStatusBadge status={r.status} />, width: 170, optional: true },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'Job changes' }]} />}
        title="Job changes"
        description="Promotions, transfers, pay revisions and corrections. Each takes effect at midnight on its date where the person works."
        actions={state === 'ready' && newChange ? <Button variant="primary" onClick={() => setRaising(true)}>New change</Button> : undefined}
      />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load the job changes." description="Nothing has changed. Try again in a moment." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="job changes" />}
      {state === 'ready' && (
        <>
          <Segment label="Show" options={VIEWS} value={view} onChange={setView} />
          <DataTable
            label="Job changes"
            columns={columns}
            rows={shown}
            getRowId={(r) => r.id}
            rowNoun={['change', 'changes']}
            cardSummary
            empty={
              <EmptyState
                compact
                title={view === 'pending' ? 'Nothing is waiting for approval.' : view === 'scheduled' ? 'No change is scheduled.' : 'No change has been completed yet.'}
                description={newChange ? 'Raise a promotion, transfer or correction with New change.' : undefined}
              />
            }
            rowButtons={
              canApprove
                ? (r) =>
                    r.status !== 'pending' ? null : r.batchId && batchHref ? (
                      <Button size="sm" variant="review" asChild>
                        <a href={batchHref(r.batchId)}>Review batch</a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="review" onClick={() => setReviewing(r)}>Review</Button>
                    )
                : undefined
            }
            rowActions={
              canManage
                ? (r) =>
                    (r.status === 'pending' && !r.batchId) || r.status === 'scheduled' ? (
                      <>
                        <MenuItem onSelect={() => setAsk({ kind: 'reschedule', row: r })}>Move to another date</MenuItem>
                        {/* Undoing an approved change is a decision too (YX-SEC-11): approvers only. */}
                        {(r.status === 'pending' || canApprove) && <MenuItem destructive onSelect={() => setAsk({ kind: 'cancel', row: r })}>Cancel change</MenuItem>}
                      </>
                    ) : null
                : undefined
            }
          />
        </>
      )}
      {reviewing && (
        <Review
          row={reviewing}
          onPreview={onPreview}
          onApprove={(confirm) => onApprove(reviewing.id, confirm)}
          onReject={() => {
            setAsk({ kind: 'reject', row: reviewing });
            setReviewing(null);
          }}
          onClose={() => setReviewing(null)}
        />
      )}
      {ask && (
        <ReasonDialog
          ask={ask}
          onClose={() => setAsk(null)}
          onDone={() => setAsk(null)}
          act={(reason, date) => (ask.kind === 'reject' ? onReject(ask.row.id, reason) : ask.kind === 'cancel' ? onCancel(ask.row.id, reason) : onReschedule(ask.row.id, date!))}
        />
      )}
      {raising && newChange && <ChangeDrawer options={newChange.options} onPreview={newChange.onPreview} onSubmit={newChange.onSubmit} onClose={() => setRaising(false)} />}
    </div>
  );
}

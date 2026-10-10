import { useState } from 'react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { EmptyState, ErrorState, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { WhenBadge } from '../history/history-kit';
import { dateLabel, daysBetweenIso } from '../org/org-kit';
import { StageBadge } from './workforce-kit';
import type { LoadState, ProbationRow } from './types';

// People › Probation (PPL-16; M01 §3.4, Q3; YX-LC-01): who is on probation, when each ends and the review is
// due, and where it stands. HR confirms (a P06 confirmation change that someone else approves) or extends
// within the company maximum, with a reason. Managers see their team's probations.

export interface ProbationScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: ProbationRow[];
  today: string;
  /** employee.change.manage: confirm and extend. */
  canManage: boolean;
  onConfirm: (employeeId: string, effectiveDate: string, reason: string) => Promise<void>;
  onExtend: (employeeId: string, months: number, reason: string) => Promise<void>;
  onOpenHistory: (employeeId: string) => void;
  /** Where waiting confirmations are approved. */
  changesHref: string;
  /** LIFE-3.01: the direct manager's review (confirm for approval, extend, or end the probation after HR). */
  onReview?: (employeeId: string, review: { outcome: 'confirm' | 'extend' | 'terminate'; months: number | null; comments: string; rating: number | null }) => Promise<void>;
}

type Ask = { kind: 'confirm' | 'extend'; row: ProbationRow };
type Show = 'open' | 'confirmed';

/** Months a probation runs, start to planned end inclusive (the server checks the exact limit). */
const monthsRun = (r: ProbationRow) => Math.round((daysBetweenIso(r.startOn, r.plannedEndOn) + 1) / 30.44);
const dayAfter = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
};

function AskDialog({ ask, onClose, onConfirm, onExtend }: { ask: Ask; onClose: () => void; onConfirm: ProbationScreenProps['onConfirm']; onExtend: ProbationScreenProps['onExtend'] }) {
  const r = ask.row;
  const left = Math.max(0, r.maxTotalMonths - monthsRun(r));
  const [date, setDate] = useState<Date | null>(dayAfter(r.plannedEndOn));
  const [months, setMonths] = useState<string | null>(left ? String(Math.min(3, left)) : null);
  const [reason, setReason] = useState('');
  const ready = reason.trim().length >= 3 && (ask.kind === 'confirm' ? Boolean(date) : Boolean(months));
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={ask.kind === 'confirm' ? `Confirm ${r.name}?` : `Extend ${r.name}'s probation?`}
      consequence={ask.kind === 'confirm' ? 'This sends a confirmation for approval. The person stays on probation until it is approved.' : `The probation now ends on ${dateLabel(r.plannedEndOn)}. The review reminder is sent again before the new end date.`}
      confirmLabel={ask.kind === 'confirm' ? 'Send for approval' : 'Extend probation'}
      confirmDisabled={!ready}
      onConfirm={async () => {
        if (ask.kind === 'confirm') await onConfirm(r.employeeId, dayKey(date!), reason.trim());
        else await onExtend(r.employeeId, Number(months), reason.trim());
        onClose();
      }}
    >
      {ask.kind === 'confirm' ? (
        <FormField id="pb-date" label="Confirmed from" required helper="Usually the day after the probation ends.">
          <DatePicker value={date} onChange={setDate} aria-label="Confirmed from" />
        </FormField>
      ) : left === 0 ? (
        <Text as="p" tone="danger">{`The probation already runs the company maximum of ${r.maxTotalMonths} months.`}</Text>
      ) : (
        <FormField id="pb-months" label="Extend by" required helper={`Up to ${left} more month${left === 1 ? '' : 's'} (company maximum ${r.maxTotalMonths} months in total).`}>
          <Select aria-label="Extend by" value={months} onChange={setMonths} options={Array.from({ length: Math.min(12, left) }, (_, i) => ({ value: String(i + 1), label: `${i + 1} month${i ? 's' : ''}` }))} />
        </FormField>
      )}
      <FormField id="pb-reason" label="Reason" required helper="Kept on the record.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

function ReviewDialog({ row: r, onClose, onReview }: { row: ProbationRow; onClose: () => void; onReview: NonNullable<ProbationScreenProps['onReview']> }) {
  const left = Math.max(0, r.maxTotalMonths - monthsRun(r));
  const [outcome, setOutcome] = useState<'confirm' | 'extend' | 'terminate'>('confirm');
  const [months, setMonths] = useState<string | null>(left ? String(Math.min(3, left)) : null);
  const [comments, setComments] = useState('');
  const [rating, setRating] = useState<string | null>(null);
  const ready = comments.trim().length >= 3 && (outcome !== 'extend' || Boolean(months));
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Review ${r.name}'s probation`}
      consequence={outcome === 'confirm' ? 'HR approves the confirmation; until then they stay on probation.' : outcome === 'extend' ? 'The probation runs longer and the review reminder comes again before the new end.' : 'HR reviews it first. If HR agrees, the exit starts with the notice for probation.'}
      confirmLabel={outcome === 'confirm' ? 'Send for approval' : outcome === 'extend' ? 'Extend probation' : 'Send to HR'}
      confirmDisabled={!ready}
      destructive={outcome === 'terminate'}
      onConfirm={async () => {
        await onReview(r.employeeId, { outcome, months: outcome === 'extend' ? Number(months) : null, comments: comments.trim(), rating: rating ? Number(rating) : null });
        onClose();
      }}
    >
      <Segment label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: 'confirm', label: 'Confirm' }, { value: 'extend', label: 'Extend' }, { value: 'terminate', label: 'Do not confirm' }]} />
      {outcome === 'extend' &&
        (left === 0 ? (
          <Text as="p" tone="danger">{`The probation already runs the company maximum of ${r.maxTotalMonths} months.`}</Text>
        ) : (
          <FormField id="rv-months" label="Extend by" required helper={`Up to ${left} more month${left === 1 ? '' : 's'}.`}>
            <Select aria-label="Extend by" value={months} onChange={setMonths} options={Array.from({ length: Math.min(12, left) }, (_, i) => ({ value: String(i + 1), label: `${i + 1} month${i ? 's' : ''}` }))} />
          </FormField>
        ))}
      <FormField id="rv-rating" label="Overall rating" optional>
        <Select aria-label="Overall rating" value={rating} onChange={setRating} clearable options={[['1', '1 · Below what the job needs'], ['2', '2 · Partly meets it'], ['3', '3 · Meets it'], ['4', '4 · Above it'], ['5', '5 · Well above it']].map(([value, label]) => ({ value, label }))} />
      </FormField>
      <FormField id="rv-comments" label="Comments" required helper="HR reads them; they are kept on the record.">
        <TextArea value={comments} onChange={setComments} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

export function ProbationScreen({ state, onRetry, rows, today, canManage, onConfirm, onExtend, onOpenHistory, changesHref, onReview }: ProbationScreenProps) {
  const [show, setShow] = useState<Show>('open');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [reviewing, setReviewing] = useState<ProbationRow | null>(null);
  const shown = rows.filter((r) => (show === 'confirmed' ? r.stage === 'confirmed' : r.stage !== 'confirmed'));
  const columns: TableColumn<ProbationRow>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.employeeCode }), width: 240, hideable: false },
    {
      key: 'ends',
      header: 'Probation ends',
      value: (r) => r.plannedEndOn,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{dateLabel(r.plannedEndOn)}</Text>
          {r.stage !== 'confirmed' && <WhenBadge date={r.plannedEndOn} today={today} />}
        </span>
      ),
      width: 170,
    },
    {
      key: 'stage',
      header: 'Where it stands',
      value: (r) => r.stage,
      render: (r) => (
        <span className="yx-auth__item-main">
          <StageBadge stage={r.stage} />
          <Text tone="secondary" size="sm">
            {r.stage === 'confirmed' && r.confirmedFrom
              ? `From ${dateLabel(r.confirmedFrom)}`
              : r.stage === 'review_due'
                ? `Review was due ${dateLabel(r.reviewDueOn)}`
                : r.stage === 'overdue'
                  ? `${daysBetweenIso(r.plannedEndOn, today)} days past the end${r.escalatedOn ? ', sent to HR' : ''}`
                  : r.extendedMonths
                    ? `Extended by ${r.extendedMonths} month${r.extendedMonths === 1 ? '' : 's'} from ${dateLabel(r.originalEndOn)}`
                    : `Review due ${dateLabel(r.reviewDueOn)}`}
          </Text>
        </span>
      ),
      width: 230,
    },
    { key: 'start', header: 'Started', value: (r) => r.startOn, render: (r) => dateLabel(r.startOn), width: 120, optional: true },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'Probation' }]} />} title="Probation" description="When each probation ends and where it stands. Nobody is confirmed automatically unless your company switched that on." />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load probations." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="probations" />}
      {state === 'ready' && (
        <>
          <Segment label="Show" value={show} onChange={setShow} options={[{ value: 'open', label: 'On probation' }, { value: 'confirmed', label: 'Recently confirmed' }]} />
          <DataTable
            label="Probations"
            columns={columns}
            rows={shown}
            getRowId={(r) => r.employeeId}
            rowNoun={['person', 'people']}
            cardSummary
            empty={<EmptyState compact title={show === 'open' ? 'No one is on probation.' : 'No one was confirmed in the last 30 days.'} />}
            rowButtons={(r) =>
              r.stage === 'awaiting_approval' ? (
                <Button size="sm" variant="review" asChild>
                  <a href={changesHref}>Review</a>
                </Button>
              ) : onReview && r.canReview ? (
                <Button size="sm" variant="primary" onClick={() => setReviewing(r)}>
                  Review
                </Button>
              ) : canManage && r.stage !== 'confirmed' ? (
                <>
                  <Button size="sm" onClick={() => setAsk({ kind: 'confirm', row: r })}>
                    Confirm
                  </Button>
                  <Button size="sm" onClick={() => setAsk({ kind: 'extend', row: r })}>
                    Extend
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => onOpenHistory(r.employeeId)}>
                  Job history
                </Button>
              )
            }
          />
        </>
      )}
      {ask && <AskDialog ask={ask} onClose={() => setAsk(null)} onConfirm={onConfirm} onExtend={onExtend} />}
      {reviewing && onReview && <ReviewDialog row={reviewing} onClose={() => setReviewing(null)} onReview={onReview} />}
    </div>
  );
}

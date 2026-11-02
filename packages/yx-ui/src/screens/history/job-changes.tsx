import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { dayKey } from '../../lib/dates';
import { dateLabel, errorText, useRun } from '../org/org-kit';
import { ImpactPanel, TYPE_LABEL } from './history-kit';
import type { ChangeRecord, Impact } from './types';

// Deciding a job change (P06 §7, PPL-04 / PPL-05 pages): the review shows the impact first, including later changes it
// recalculates (YX-HIS-06, YX-HIS-11), and approving needs someone other than the requester (YX-SEC-11); reject,
// cancel and a new date each ask for what they need.

export type ChangeAsk = { kind: 'reject' | 'cancel' | 'reschedule'; row: ChangeRecord };

export function Review({ row, onPreview, onApprove, onReject, onClose }: { row: ChangeRecord; onPreview: (id: string) => Promise<Impact>; onApprove: (confirm: boolean) => Promise<void>; onReject: () => void; onClose: () => void }) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [early, setEarly] = useState(false);
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
          <Button variant="approve" loading={busy === 'approve'} onClick={() => (impact ? void run('approve', () => onApprove(rebased > 0)).then((ok) => ok && onClose()) : setEarly(true))}>
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
        {early && !impact && <InlineAlert tone="warning" title="Approve once the impact shows">{loadError ? 'Close this and open the change again to work out its impact.' : 'It is still being worked out.'}</InlineAlert>}
        {error && <InlineAlert tone="danger" title="Not approved">{error}</InlineAlert>}
      </div>
    </Drawer>
  );
}

/** PPL-04 Review "Reject" and PPL-05 "Edit" (move to a new date): what each step needs, the field error and focus when
 * pressed too early; a refusal from the server shows in the dialog and nothing closes. */
export function ReasonDialog({ ask, onDone, onClose, act }: { ask: ChangeAsk; onDone: () => void; onClose: () => void; act: (reason: string, date: string | null) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  // "Joined" is a past-tense label; as the thing being moved or cancelled it reads "joining".
  const what = ask.row.changeType === 'join' ? 'joining' : TYPE_LABEL[ask.row.changeType].toLowerCase();
  const who = ask.row.employeeName ?? 'this person';
  const copy = {
    reject: { title: `Reject the ${what} for ${who}?`, consequence: 'It will not take effect. The person who raised it sees your reason.', label: 'Reject change', helper: 'Shown to the person who raised it.' },
    cancel: { title: `Cancel the ${what} for ${who}?`, consequence: ask.row.status === 'scheduled' ? 'It will not take effect. Later changes fall back on the values before it.' : 'It will not go ahead.', label: 'Cancel change', helper: 'Shown on the timeline with the cancelled change.' },
    reschedule: { title: `Move the ${what} for ${who} to another date?`, consequence: `Now on ${dateLabel(ask.row.effectiveDate)}. The new date goes back for approval; until then the change does not take effect.`, label: 'Move and send for approval', helper: '' },
  }[ask.kind];
  const early = useTooEarly(
    ask.kind === 'reschedule'
      ? !date
        ? [{ fieldId: 'rs-date', message: 'Choose the new date.' }]
        : dayKey(date) === ask.row.effectiveDate.slice(0, 10)
          ? [{ fieldId: 'rs-date', message: 'Choose a date other than the one it has now.' }]
          : []
      : reason.trim().length < 3
        ? [{ fieldId: 'rs-reason', message: 'Enter a reason of at least 3 characters.' }]
        : [],
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={copy.title}
      consequence={copy.consequence}
      confirmLabel={copy.label}
      cancelLabel={ask.kind === 'reschedule' ? 'Keep the date' : 'Back'}
      destructive={ask.kind !== 'reschedule'}
      onConfirm={async () => {
        if (early.stop()) return false;
        await act(reason.trim(), date ? dayKey(date) : null);
        onDone();
      }}
    >
      {ask.kind === 'reschedule' ? (
        <FormField id="rs-date" label="New date" required error={early.errorOf('rs-date')}>
          <DatePicker value={date} onChange={setDate} aria-label="New date" />
        </FormField>
      ) : (
        <FormField id="rs-reason" label="Reason" required rule="At least 3 characters." helper={copy.helper} error={early.errorOf('rs-reason')}>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={1000} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}

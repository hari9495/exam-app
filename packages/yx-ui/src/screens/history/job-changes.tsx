import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
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

export function ReasonDialog({ ask, onDone, onClose, act }: { ask: ChangeAsk; onDone: () => void; onClose: () => void; act: (reason: string, date: string | null) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  // "Joined" is a past-tense label; as the thing being moved or cancelled it reads "joining".
  const what = ask.row.changeType === 'join' ? 'joining' : TYPE_LABEL[ask.row.changeType].toLowerCase();
  const copy = {
    reject: { title: `Reject the ${what} for ${ask.row.employeeName ?? 'this person'}?`, consequence: 'The person who raised it sees your reason.', label: 'Reject change' },
    cancel: { title: `Cancel the ${what} for ${ask.row.employeeName ?? 'this person'}?`, consequence: ask.row.status === 'scheduled' ? 'It will not take effect. Later changes fall back on the values before it.' : 'It will not go ahead.', label: 'Cancel change' },
    reschedule: { title: `Move the ${what} for ${ask.row.employeeName ?? 'this person'} to another date?`, consequence: 'A new date goes back for approval; until then the change does not take effect.', label: 'Move and send for approval' },
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

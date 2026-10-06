import { useState } from 'react';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Badge } from '../../components/display';
import { dateLabel, errorText } from '../org/org-kit';
import { codeOf, shown } from './access-kit';
import type { LoadState, ProfileRequest } from './types';

// People › Identity and bank changes (PPL-32; P02 §4.5, YX-SEC-11/13, M01 YX-EMP-02): changes raised by
// employees or by HR, old and new side by side (masked). Approved by someone who is neither the requester nor
// the person; a value another active employee already has needs a reason to approve.

export interface ProfileRequestsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: ProfileRequest[];
  /** employee.identity.approve somewhere: the Approve and Reject buttons. The API checks each person. */
  canDecide: boolean;
  onApprove: (id: string, overrideReason?: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onOpenProfile: (employeeId: string) => void;
}

type Show = 'waiting' | 'done';
type Ask = { kind: 'approve' | 'reject'; row: ProfileRequest };
const STATUS_TONE = { approved: 'success', rejected: 'neutral', cancelled: 'neutral', pending: 'warning' } as const;
const STATUS_LABEL = { approved: 'Approved', rejected: 'Rejected', cancelled: 'Withdrawn', pending: 'Waiting' } as const;

function DecideDialog({ ask, onApprove, onReject, onClose }: { ask: Ask; onApprove: ProfileRequestsScreenProps['onApprove']; onReject: ProfileRequestsScreenProps['onReject']; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = ask.row;
  const approving = ask.kind === 'approve';
  const needsReason = !approving || Boolean(duplicate);
  const decide = async () => {
    setBusy(true);
    setError(null);
    try {
      await (approving ? onApprove(r.id, duplicate ? reason.trim() : undefined) : onReject(r.id, reason.trim()));
      onClose();
    } catch (e) {
      // YX-EMP-02: the value is on another active record; approving needs a reason.
      if (approving && !duplicate && codeOf(e) === 'DUPLICATE_IDENTIFIER') setDuplicate(errorText(e));
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={approving ? `Approve ${r.label.toLowerCase()} for ${r.employeeName}?` : `Reject ${r.label.toLowerCase()} for ${r.employeeName}?`}
      description={approving ? 'The new value goes on file now and the person is told by email. A new bank account is used for pay after the waiting period.' : 'Nothing changes on the record. The person sees your reason.'}
      preventClose={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={approving ? 'approve' : 'danger'} loading={busy} disabled={needsReason && !reason.trim()} onClick={decide}>
            {approving ? (duplicate ? 'Approve anyway' : 'Approve') : 'Reject'}
          </Button>
        </>
      }
    >
      <Text as="p">{`${shown(r.current)} → ${shown(r.proposed)}`}</Text>
      <Text as="p" tone="secondary" size="sm">{`Reason given: ${r.reason}`}</Text>
      {duplicate && <InlineAlert tone="warning" title="This value is already on another record">{duplicate}</InlineAlert>}
      {needsReason && (
        <FormField id="pr-reason" label={approving ? 'Why approve it anyway' : 'Reason'} required>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
        </FormField>
      )}
      {error && <InlineAlert tone="danger" title={error} />}
    </Dialog>
  );
}

export function ProfileRequestsScreen({ state, onRetry, rows, canDecide, onApprove, onReject, onOpenProfile }: ProfileRequestsScreenProps) {
  const [show, setShow] = useState<Show>('waiting');
  const [ask, setAsk] = useState<Ask | null>(null);
  const shownRows = rows.filter((r) => (show === 'waiting' ? r.status === 'pending' : r.status !== 'pending'));
  const columns: TableColumn<ProfileRequest>[] = [
    { key: 'who', header: 'Person', type: 'person', value: (r) => r.employeeName, person: (r) => ({ name: r.employeeName ?? 'Unknown', secondary: r.label }), width: 240, hideable: false },
    {
      key: 'change',
      header: 'Change',
      value: (r) => r.label,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{shown(r.proposed)}</Text>
          <Text tone="secondary" size="sm">{`Was: ${shown(r.current)}`}</Text>
        </span>
      ),
      width: 280,
    },
    {
      key: 'asked',
      header: 'Asked',
      value: (r) => r.requestedAt,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{`${r.requestedBy ?? '—'} · ${dateLabel(r.requestedAt.slice(0, 10))}`}</Text>
          <Text tone="secondary" size="sm">{r.reason}</Text>
        </span>
      ),
      width: 260,
      optional: true,
    },
    ...(show === 'done' ? [{ key: 'status', header: 'Outcome', value: (r: ProfileRequest) => r.status, render: (r: ProfileRequest) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>, width: 140 }] : []),
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'Identity and bank changes' }]} />} title="Identity and bank changes" description="PAN, Aadhaar, UAN, ESIC, legal name and bank account changes waiting for a second person." />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load the changes." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR or payroll" what="identity and bank changes" />}
      {state === 'ready' && (
        <>
          <Segment label="Show" value={show} onChange={setShow} options={[{ value: 'waiting', label: 'Waiting' }, { value: 'done', label: 'Decided' }]} />
          <DataTable
            label="Identity and bank changes"
            columns={columns}
            rows={shownRows}
            getRowId={(r) => r.id}
            rowNoun={['change', 'changes']}
            cardSummary
            empty={<EmptyState compact title={show === 'waiting' ? 'Nothing is waiting.' : 'No decided changes yet.'} />}
            rowButtons={(r) =>
              r.status === 'pending' && canDecide && !r.mine ? (
                <>
                  <Button size="sm" variant="approve" onClick={() => setAsk({ kind: 'approve', row: r })}>
                    Approve
                  </Button>
                  <Button size="sm" onClick={() => setAsk({ kind: 'reject', row: r })}>
                    Reject
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => onOpenProfile(r.employeeId)}>
                  Profile
                </Button>
              )
            }
          />
        </>
      )}
      {ask && <DecideDialog key={ask.row.id} ask={ask} onApprove={onApprove} onReject={onReject} onClose={() => setAsk(null)} />}
    </div>
  );
}

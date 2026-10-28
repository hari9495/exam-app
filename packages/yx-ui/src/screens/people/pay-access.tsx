// PPL-50 Team pay access (founder decisions 28 Oct 2026): a manager asks to see the pay of their whole team or of one
// person in it, with a reason. Two different HR people approve; the company sets how long it lasts and who it covers by
// default, and the approving HR person may change both on the request. Access ends by itself on the last day.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { ListSkeleton, PeopleFrame } from './people-kit';

export type PayAccessState = 'first' | 'second' | 'active' | 'ended' | 'refused';
type Who = { id: string; name: string };

/** A request as the API returns it (GET /people/pay-access and /people/pay-access/mine). */
export interface PayAccessRow {
  id: string;
  manager: Who;
  scope: 'team' | 'person';
  person: Who | null;
  /** "Arjun Kulkarni", or "their whole team (6 people)". */
  covers: string;
  reason: string;
  days: number;
  state: PayAccessState;
  askedAt: string;
  first: { by: string | null; at: string; note: string | null } | null;
  decided: { by: string | null; at: string; note: string | null } | null;
  /** The last day access lasts (approved requests). */
  validTo: string | null;
  /** This HR person may approve or refuse it now (the API decides: never the manager, never both approvals). */
  canDecide: boolean;
  /** The manager's team today, to narrow a request to one person (only when canDecide). */
  team?: Who[];
}

export interface PayAccessDecision {
  decision: 'approve' | 'refuse';
  days?: string;
  scope?: 'team' | 'person';
  employeeId?: string;
  note?: string;
}

/** The lengths HR may choose (the company setting's values). */
export const PAY_ACCESS_DAYS = ['7', '15', '30', '60', '90'] as const;

const day = (iso: string) => formatDate(new Date(`${iso.slice(0, 10)}T00:00:00`));

const STATE: Record<PayAccessState, { label: (r: PayAccessRow) => string; tone: BadgeTone }> = {
  first: { label: () => 'Approval 1 of 2', tone: 'warning' },
  second: { label: () => 'Approval 2 of 2', tone: 'warning' },
  active: { label: (r) => `Active until ${day(r.validTo!)}`, tone: 'success' },
  ended: { label: (r) => `Ended ${day(r.validTo!)}`, tone: 'neutral' },
  refused: { label: () => 'Refused', tone: 'danger' },
};
export const PayAccessBadge = ({ row }: { row: PayAccessRow }) => <Badge tone={STATE[row.state].tone}>{STATE[row.state].label(row)}</Badge>;

/* ------------------------------------------------------------------ the manager asks (from the Pay tab) */

export interface PayAccessAskInput {
  scope: 'team' | 'person';
  employeeId?: string;
  reason: string;
}

export interface PayAccessDialogProps {
  /** The person whose record it was opened from. */
  person: Who;
  teamSize: number;
  /** The company's default (pay_access.scope) and length (pay_access.days). */
  defaultScope: 'team' | 'person';
  days: number;
  onSubmit: (input: PayAccessAskInput) => Promise<void>;
  onClose: () => void;
}

export function PayAccessDialog({ person, teamSize, defaultScope, days, onSubmit, onClose }: PayAccessDialogProps) {
  const { toast } = useToast();
  const [scope, setScope] = useState<'team' | 'person'>(defaultScope);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = person.name.split(' ')[0];
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ scope, ...(scope === 'person' ? { employeeId: person.id } : {}), reason: reason.trim() });
      toast({ tone: 'success', title: 'Request sent to HR', description: 'You will hear when two HR people have decided.' });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Ask HR for access to pay"
      description={`Two HR people approve it. Access lasts ${days} days unless HR changes it, and ends by itself.`}
      preventClose={busy}
      notice={error ? <InlineAlert tone="danger" title={error} /> : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={reason.trim().length < 3} onClick={() => void send()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        <FormField label="Whose pay" required>
          <Segment
            label="Whose pay"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'person', label: `Only ${first}` },
              { value: 'team', label: `My whole team (${teamSize})` },
            ]}
          />
        </FormField>
        <FormField id="pa-reason" label="Why you need it" required helper="HR reads this before deciding.">
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** What the manager sees on the Pay tab about their access: waiting, open until a day, ended or refused. */
export function PayAccessNote({ latest: row, onRequest }: { latest: PayAccessRow | null; onRequest?: () => void }) {
  // The API words `covers` for HR ("their whole team"); the manager reads it about their own team.
  const latest = row && { ...row, covers: row.covers.replace(/^their /, 'your ') };
  const again = onRequest ? (
    <div>
      <Button onClick={onRequest}>{latest ? 'Ask again' : 'Request access'}</Button>
    </div>
  ) : null;
  if (!latest) return again;
  if (latest.state === 'first' || latest.state === 'second')
    return (
      <InlineAlert tone="info" title={`Your request waits for HR · approval ${latest.state === 'first' ? 1 : 2} of 2`}>
        {`You asked on ${day(latest.askedAt)} to see the pay of ${latest.covers}.`}
      </InlineAlert>
    );
  if (latest.state === 'active')
    return (
      <InlineAlert tone="info" title={`You can see the pay of ${latest.covers} until ${day(latest.validTo!)}`}>
        Access ends by itself after that day.
      </InlineAlert>
    );
  return (
    <div className="yx-ppl__stack">
      {latest.state === 'ended' ? (
        <InlineAlert tone="info" title={`Your access to the pay of ${latest.covers} ended on ${day(latest.validTo!)}`} />
      ) : (
        <InlineAlert tone="warning" title={`HR refused your request on ${day(latest.decided?.at ?? latest.askedAt)}`}>
          {latest.decided?.note ?? ''}
        </InlineAlert>
      )}
      {again}
    </div>
  );
}

/* ------------------------------------------------------------------ HR decides (step 1 and step 2) */

export function PayAccessDecide({ row, onDecide, onClose }: { row: PayAccessRow; onDecide: (id: string, d: PayAccessDecision) => Promise<void>; onClose: () => void }) {
  const { toast } = useToast();
  const team = row.team ?? [];
  const [scope, setScope] = useState<'team' | 'person'>(row.scope);
  const [personId, setPersonId] = useState<string | null>(row.person?.id ?? null);
  const [days, setDays] = useState<string | null>(String(row.days));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'refuse' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const second = row.state === 'second';
  const changed = scope !== row.scope || (scope === 'person' && personId !== row.person?.id) || days !== String(row.days);
  const go = async (decision: 'approve' | 'refuse') => {
    if (decision === 'refuse' && !note.trim()) return setError('Say why you refuse it. The manager reads this.');
    if (decision === 'approve' && scope === 'person' && !personId) return setError('Choose the person it covers.');
    setBusy(decision);
    setError(null);
    try {
      await onDecide(row.id, decision === 'refuse' ? { decision, note: note.trim() } : { decision, days: days ?? undefined, scope, ...(scope === 'person' ? { employeeId: personId! } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      toast(
        decision === 'refuse'
          ? { tone: 'success', title: 'Request refused', description: `${row.manager.name} is told why.` }
          : second
            ? { tone: 'success', title: `Access given to ${row.manager.name}`, description: `For ${days} days. It ends by itself.` }
            : { tone: 'success', title: 'First approval given', description: 'It now waits for a second HR person.' },
      );
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Team pay access for ${row.manager.name}`}
      subtitle={second ? 'Approval 2 of 2' : 'Approval 1 of 2'}
      dirty={changed || Boolean(note.trim())}
      notice={error ? <InlineAlert tone="danger" title={error} /> : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={Boolean(busy)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy === 'refuse'} disabled={Boolean(busy)} onClick={() => void go('refuse')}>
            Refuse
          </Button>
          <Button variant="approve" loading={busy === 'approve'} disabled={Boolean(busy)} onClick={() => void go('approve')}>
            {second ? 'Approve and give access' : 'Approve'}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        <div className="yx-ppl__fields">
          <Text as="p">{`${row.manager.name} asks to see the pay of ${row.covers}.`}</Text>
          <Text as="p" tone="secondary" size="sm">{`Reason: ${row.reason}`}</Text>
          <Text as="p" tone="secondary" size="sm">{`Asked on ${day(row.askedAt)}`}</Text>
        </div>
        {second && row.first ? (
          <InlineAlert tone="info" title={`First approval by ${row.first.by ?? 'another HR person'} on ${day(row.first.at)}`}>
            {`${row.days} days, ${row.covers}.${row.first.note ? ` Note: ${row.first.note}` : ''} Access starts when you approve.`}
          </InlineAlert>
        ) : (
          <InlineAlert tone="info" title="Two different HR people approve">
            Access starts after the second approval and ends by itself on the last day.
          </InlineAlert>
        )}
        <FormField label="Who it covers" required helper="Never more than the people who report to this manager.">
          <Segment
            label="Who it covers"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'team', label: `Whole team (${team.length})` },
              { value: 'person', label: 'One person' },
            ]}
          />
        </FormField>
        {scope === 'person' && (
          <FormField id="pa-person" label="Person" required>
            <Select aria-label="Person" value={personId} onChange={setPersonId} searchable options={team.map((p) => ({ value: p.id, label: p.name }))} />
          </FormField>
        )}
        <FormField id="pa-days" label="How long" required helper="From today. Access ends by itself after the last day.">
          <Select aria-label="How long" value={days} onChange={setDays} options={PAY_ACCESS_DAYS.map((d) => ({ value: d, label: `${d} days` }))} />
        </FormField>
        <FormField id="pa-note" label="Note" helper="Needed to refuse; the manager reads it.">
          <TextArea value={note} onChange={setNote} rows={2} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ PPL-50 the HR list */

export interface PayAccessRequestsProps {
  rows: PayAccessRow[];
  state?: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  /** employee.pay_access.approve: decide a request. Stories without it show the list only. */
  onDecide?: (id: string, d: PayAccessDecision) => Promise<void>;
  /** Stories: open this request's decision at once. */
  defaultOpenId?: string;
}

type Show = 'waiting' | 'active' | 'closed';
const SHOWN: Record<Show, PayAccessState[]> = { waiting: ['first', 'second'], active: ['active'], closed: ['ended', 'refused'] };

export function PayAccessRequests({ rows, state = 'ready', onRetry, onDecide, defaultOpenId }: PayAccessRequestsProps) {
  const [show, setShow] = useState<Show>('waiting');
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const open = rows.find((r) => r.id === openId && r.canDecide) ?? null;
  const count = (s: Show) => rows.filter((r) => SHOWN[s].includes(r.state)).length;
  const cols: TableColumn<PayAccessRow>[] = [
    { key: 'manager', header: 'Manager', type: 'person', value: (r) => r.manager.name, person: (r) => ({ name: r.manager.name }), width: 220, hideable: false },
    { key: 'covers', header: 'Pay of', value: (r) => r.covers, render: (r) => <span className="yx-ppl__cell-two"><span>{r.person ? r.person.name : 'Whole team'}</span><span className="yx-ppl__sub">{`${r.days} days`}</span></span>, width: 180 },
    { key: 'reason', header: 'Reason', value: (r) => r.reason, width: 260 },
    { key: 'state', header: 'Status', value: (r) => r.state, render: (r) => <PayAccessBadge row={r} />, width: 190 },
    { key: 'asked', header: 'Asked', type: 'date', value: (r) => new Date(r.askedAt), width: 130, optional: true },
  ];
  return (
    <PeopleFrame active="Team pay access">
      <PageHeader title="Team pay access" description="Managers asking to see their team's pay. Two different HR people approve each request; access ends by itself on the last day." />
      {state === 'no-access' ? (
        <NoAccessState what="team pay access requests" grantedBy="your HR admin" />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load the requests" description="Check your connection and try again." onRetry={onRetry} />
      ) : state === 'loading' ? (
        <ListSkeleton label="Loading the requests" />
      ) : (
        <>
          <Segment
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'waiting', label: `Waiting (${count('waiting')})` },
              { value: 'active', label: `Active (${count('active')})` },
              { value: 'closed', label: `Ended or refused (${count('closed')})` },
            ]}
          />
          <DataTable
            label="Team pay access requests"
            columns={cols}
            rows={rows.filter((r) => SHOWN[show].includes(r.state))}
            getRowId={(r) => r.id}
            rowNoun={['request', 'requests']}
            cardSummary
            empty={<EmptyState compact title={show === 'waiting' ? 'Nothing is waiting.' : show === 'active' ? 'No manager has access now.' : 'No ended or refused requests yet.'} />}
            rowButtons={(r) =>
              !onDecide ? null : r.canDecide ? (
                <Button size="sm" variant="primary" onClick={() => setOpenId(r.id)}>
                  Decide
                </Button>
              ) : SHOWN.waiting.includes(r.state) ? (
                // e.g. this HR person gave approval 1 or asked for it: say why there is no Decide.
                <span className="yx-ppl__sub">Waiting for another HR person</span>
              ) : null
            }
          />
        </>
      )}
      {open && onDecide && <PayAccessDecide key={open.id} row={open} onDecide={onDecide} onClose={() => setOpenId(null)} />}
    </PeopleFrame>
  );
}

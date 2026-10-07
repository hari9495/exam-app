import { useState } from 'react';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, FormSection, type FormErrorItem } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { Segment } from '../../components/segment';
import { Breadcrumbs, Card, ObjectHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Timeline } from '../../components/timeline';
import { EditorDrawer, useRun } from '../org/org-kit';
import { ConsolePage, LifecycleBadge, SupportBadge, actionWords, day, daysLeft, productNames, useReasonDialog, when, LIFECYCLE_LABEL } from './console-kit';
import type { CompanyDetail, LifecycleAction, LoadState, SupportRequestInput, SupportSession } from './types';

const HOURS = [
  { value: 4, label: '4 hours' },
  { value: 24, label: '24 hours' },
  { value: 72, label: '72 hours' },
];
const TICKET = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;

/** The request body, or what to fix. Mirrors the API's checks; the API checks again. */
export function supportInput(d: { reason: string; ticket: string; hours: number }): { input: SupportRequestInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (d.reason.trim().length < 10) errors.push({ fieldId: 'sr-reason', message: 'Say why you need to look, in at least 10 characters' });
  if (d.ticket.trim() && !TICKET.test(d.ticket.trim())) errors.push({ fieldId: 'sr-ticket', message: 'A ticket number is letters, digits and hyphens' });
  return errors.length ? { input: null, errors } : { input: { reason: d.reason.trim(), hours: d.hours, ...(d.ticket.trim() ? { ticket: d.ticket.trim() } : {}) }, errors };
}

function SupportRequestDrawer({ company, onClose, onSend }: { company: string; onClose: () => void; onSend: (input: SupportRequestInput) => Promise<void> }) {
  const [draft, setDraft] = useState({ reason: '', ticket: '', hours: 24 });
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = supportInput(draft);
  const errorOf = (id: string) => (showErrors ? errors.find((e) => e.fieldId === id)?.message : undefined);
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title="Ask for support access"
      subtitle={company}
      errors={errors}
      showErrors={showErrors}
      saving={busy === 'send'}
      failed={error}
      saveLabel="Send request to the company"
      onSave={() => {
        if (!input) return setShowErrors(true);
        void run('send', () => onSend(input)).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Request" description="The company's System Admins get an email. Nothing is visible until one of them approves.">
        <FormField id="sr-reason" label="Why you need to look" required helper="The company's admins read this." error={errorOf('sr-reason')}>
          <TextArea value={draft.reason} onChange={(reason) => set({ reason })} rows={3} maxLength={500} />
        </FormField>
        <FormField id="sr-ticket" label="Ticket number" optional error={errorOf('sr-ticket')}>
          <TextField value={draft.ticket} onChange={(ticket) => set({ ticket })} maxLength={40} />
        </FormField>
        <FormField label="How long" helper="The admin can make it shorter, never longer. The session ends on its own.">
          <Segment label="How long" options={HOURS} value={draft.hours} onChange={(hours) => set({ hours })} />
        </FormField>
      </FormSection>
      <InlineAlert tone="info" title="What you will not see">
        Pay, identity and bank details, and POSH, disciplinary, grievance, whistleblower and medical records. The session is read-only, and the company sees every page you open.
      </InlineAlert>
    </EditorDrawer>
  );
}

export interface CompanyScreenProps {
  state: LoadState;
  onRetry?: () => void;
  company: CompanyDetail | null;
  /** This company's support sessions, newest first. */
  sessions: SupportSession[];
  canManage: boolean;
  canSupport: boolean;
  onBack: () => void;
  onLifecycle: (action: LifecycleAction, reason: string) => Promise<void>;
  onExtendTrial: (days: number, reason: string) => Promise<void>;
  onRequestSupport: (input: SupportRequestInput) => Promise<void>;
  /** Opens the company inside the staff member's own approved session. */
  onOpenSession: (session: SupportSession) => Promise<void>;
  onEndSession: (id: string) => Promise<void>;
  onWithdrawRequest: (id: string) => Promise<void>;
  now?: Date;
}

const MOVE: Record<LifecycleAction, { title: (n: string) => string; consequence: string; label: string; destructive?: boolean }> = {
  activate: { title: (n) => `Switch ${n} on?`, consequence: 'The trial ends and the company becomes a paying customer.', label: 'Switch on' },
  suspend: { title: (n) => `Suspend ${n}?`, consequence: 'Nobody at the company can sign in until you reinstate it. Their data stays.', label: 'Suspend company', destructive: true },
  reinstate: { title: (n) => `Reinstate ${n}?`, consequence: 'People can sign in again. The company goes back to the state it had before.', label: 'Reinstate' },
  close: { title: (n) => `Close ${n}?`, consequence: 'Nobody can sign in, and a closed company cannot be opened again from here.', label: 'Close company', destructive: true },
};

/** Console › Companies › one company: lifecycle with reasons, support access (P02 Q8), admins and history. */
export function CompanyScreen(props: CompanyScreenProps) {
  const c = props.company;
  const [requesting, setRequesting] = useState<number | null>(null);
  const [reasonDialog, askReason] = useReasonDialog();
  const [days, setDays] = useState(14);
  const { busy, error, run } = useRun();
  const now = props.now ?? new Date();

  const move = (action: LifecycleAction) => () =>
    c && askReason({ title: MOVE[action].title(c.name), consequence: MOVE[action].consequence, confirmLabel: MOVE[action].label, destructive: MOVE[action].destructive, action: (reason) => props.onLifecycle(action, reason) });
  const extend = () =>
    c &&
    askReason({
      title: `Extend the trial of ${c.name} by ${days} days?`,
      consequence: 'A trial can be extended once, by up to 14 days.',
      confirmLabel: 'Extend trial',
      action: (reason) => props.onExtendTrial(days, reason),
    });

  const mine = props.sessions.filter((s) => s.mine);
  const open = mine.find((s) => s.status === 'approved' && s.endsAt && new Date(s.endsAt) > now);
  const waiting = mine.find((s) => s.status === 'requested');
  const columns: TableColumn<SupportSession>[] = [
    { key: 'status', header: 'State', value: (s) => s.status, render: (s) => <SupportBadge status={s.status} />, width: 190, hideable: false },
    { key: 'by', header: 'Asked by', value: (s) => s.requestedBy, width: 170 },
    { key: 'reason', header: 'Reason', value: (s) => s.reason, render: (s) => (s.ticket ? `${s.ticket} · ${s.reason}` : s.reason), width: 300, optional: true },
    { key: 'window', header: 'Window', value: (s) => s.endsAt ?? s.createdAt, render: (s) => (s.startsAt ? `${when(s.startsAt)} to ${when(s.endsAt)}` : `${s.hours} hours asked ${when(s.createdAt)}`), width: 300, optional: true },
  ];

  return (
    <ConsolePage crumb="Companies" title={props.state === 'ready' ? undefined : 'Company'} state={props.state} onRetry={props.onRetry} what="this company">
      {c && (
        <>
          <div>
            <Button icon={ArrowLeft} size="sm" onClick={props.onBack}>
              All companies
            </Button>
          </div>
          <ObjectHeader
            breadcrumbs={<Breadcrumbs items={[{ label: 'Console' }, { label: 'Companies' }, { label: c.name }]} />}
            name={c.name}
            icon={Building2}
            secondary={`Company code ${c.slug} · created ${day(c.createdAt)}`}
            status={
              <>
                <LifecycleBadge lifecycle={c.lifecycle} />
                {!c.signInAllowed && <Badge tone="danger">Sign-in blocked</Badge>}
              </>
            }
            facts={[
              { label: 'Products', value: productNames(c.products) },
              { label: 'Employee records', value: c.employees.toLocaleString('en-IN') },
              ...(c.lifecycle === 'trial' && c.trialEndsAt ? [{ label: 'Trial ends', value: `${day(c.trialEndsAt)} (${Math.max(0, daysLeft(c.trialEndsAt, now.getTime()))} days left)` }] : []),
              { label: `${LIFECYCLE_LABEL[c.lifecycle]} since`, value: day(c.lifecycleChangedAt) },
            ]}
            actions={
              <>
                {props.canSupport && c.signInAllowed && !open && !waiting && <Button onClick={() => setRequesting(Date.now())}>Ask for support access</Button>}
                {props.canManage && c.lifecycle === 'trial' && <Button variant="primary" onClick={move('activate')}>Switch on</Button>}
                {props.canManage && c.lifecycle === 'suspended' && <Button variant="primary" onClick={move('reinstate')}>Reinstate</Button>}
              </>
            }
            menu={
              props.canManage && c.lifecycle !== 'closed' ? (
                <>
                  {(c.lifecycle === 'trial' || c.lifecycle === 'active') && <MenuItem destructive onSelect={move('suspend')}>Suspend company</MenuItem>}
                  <MenuItem destructive onSelect={move('close')}>Close company</MenuItem>
                </>
              ) : undefined
            }
          />

          {open && (
            <InlineAlert
              tone="success"
              title={`Your support session is open until ${when(open.endsAt)}`}
              actions={
                <>
                  <Button size="sm" variant="primary" loading={busy === 'open'} onClick={() => void run('open', () => props.onOpenSession(open))}>
                    Open company
                  </Button>
                  <Button size="sm" loading={busy === 'end'} onClick={() => void run('end', () => props.onEndSession(open.id))}>
                    End session
                  </Button>
                </>
              }
            >
              Approved by {open.decidedBy}. Read-only; the company sees every page you open.
            </InlineAlert>
          )}
          {waiting && (
            <InlineAlert
              tone="info"
              title="Waiting for the company to approve"
              actions={
                <Button size="sm" loading={busy === 'withdraw'} onClick={() => void run('withdraw', () => props.onWithdrawRequest(waiting.id))}>
                  Withdraw request
                </Button>
              }
            >
              Sent {when(waiting.createdAt)}. The request lapses if nobody answers within a day.
            </InlineAlert>
          )}
          {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}

          <div className="yx-console__split">
            <div className="yx-auth__stack">
              <Card title="Support sessions">
                <DataTable
                  label="Support sessions"
                  columns={columns}
                  rows={props.sessions}
                  getRowId={(s) => s.id}
                  rowNoun={['session', 'sessions']}
                  cardSummary
                  empty={<EmptyState compact title="No support sessions yet." description="Ask for access only when a ticket needs it. The company approves every session." />}
                />
              </Card>
              <Card title="History">
                {c.history.length ? (
                  <Timeline
                    aria-label="Company history"
                    items={c.history.map((h) => ({ id: h.id, actor: { name: h.by }, action: `${actionWords(h.action, h.details)}${typeof h.details?.reason === 'string' ? ` · “${h.details.reason}”` : ''}`, at: new Date(h.at) }))}
                  />
                ) : (
                  <Text tone="secondary">No staff actions yet.</Text>
                )}
              </Card>
            </div>
            <div className="yx-auth__stack">
              <Card title="System Admins">
                {c.admins.length ? (
                  <ul className="yx-console__list">
                    {c.admins.map((a) => (
                      <li key={a.email}>
                        <span className="yx-auth__item-main">
                          <Text weight="medium">{a.name ?? a.email}</Text>
                          <Text tone="secondary" size="sm">{a.email}</Text>
                        </span>
                        {a.status !== 'active' && <Badge tone="neutral">Inactive</Badge>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Text tone="secondary">No System Admin yet.</Text>
                )}
              </Card>
              {props.canManage && c.lifecycle === 'trial' && !c.trialExtended && (
                <Card title="Extend the trial">
                  <div className="yx-auth__stack">
                    <FormField label="Extra days" helper="Once only, up to 14 days.">
                      <Segment label="Extra days" options={[{ value: 7, label: '7 days' }, { value: 14, label: '14 days' }]} value={days} onChange={setDays} />
                    </FormField>
                    <div>
                      <Button onClick={extend}>Extend trial</Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
          {reasonDialog}
          {requesting && <SupportRequestDrawer key={requesting} company={c.name} onClose={() => setRequesting(null)} onSend={props.onRequestSupport} />}
        </>
      )}
    </ConsolePage>
  );
}

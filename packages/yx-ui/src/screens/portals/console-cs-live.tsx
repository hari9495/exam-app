// YX-04 Customer success, live (YukthiX console C-2, answers 1047, 1048): the designed CustomerSuccessScreen with the API's
// tenant health, churn alerts (from the platform settings) and messages to company System Admins. Rendered through
// `CustomerSuccessScreen live={…}`; the console layout around it is the live ConsoleShell.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { MultiSelect } from '../../components/select';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { ConsolePage } from '../console/console-kit';
import type { LoadState } from '../console/types';
import { HEALTH_LABEL, healthBand } from './portals-logic';
import { Fact, FactRow } from './portals-kit';
import { FilteredTable, opts } from './list-kit';

export interface CsHealthRow {
  id: string;
  name: string;
  slug: string;
  lifecycle: string;
  products: string[];
  health: number;
  factors: string[];
  adminLastSignIn: string | null;
  openTickets: number;
  alerts: string[];
}
export interface CsMessageRow {
  id: string;
  subject: string;
  body: string;
  companyIds: string[];
  status: 'pending_approval' | 'sent' | 'rejected' | 'withdrawn';
  writtenBy: string;
  mine: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  sentAt: string | null;
  createdAt: string;
  version: number;
}
export interface CsSettingRow {
  key: string;
  label: string;
  value: number;
  default: number;
  min: number;
  max: number;
}
export interface LiveCustomerSuccess {
  state: LoadState;
  onRetry: () => void;
  rows: CsHealthRow[];
  messages: CsMessageRow[];
  settings: CsSettingRow[];
  /** Staff may change the alert thresholds (the Customer success key). */
  canManage: boolean;
  onWrite: (input: { companyIds: string[]; subject: string; body: string }) => Promise<unknown>;
  onApprove: (id: string, version: number) => Promise<unknown>;
  onReject: (id: string, version: number, note: string) => Promise<unknown>;
  /** Answer 1087: the writer takes back their own message while it waits. */
  onWithdraw?: (id: string, version: number) => Promise<unknown>;
  onSaveSettings: (values: Record<string, number>) => Promise<unknown>;
  /** Stories: the tab shown first, the composer open with these companies. */
  tab?: 'health' | 'alerts' | 'messages';
  composerFor?: string[];
}

const LIFE: Record<string, string> = { trial: 'Trial', active: 'Active', suspended: 'Suspended', closed: 'Closed' };
const STATUS: Record<CsMessageRow['status'], { label: string; tone: 'warning' | 'success' | 'neutral' }> = { pending_approval: { label: 'Waiting for approval', tone: 'warning' }, sent: { label: 'Sent', tone: 'success' }, rejected: { label: 'Sent back', tone: 'neutral' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } };
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');

/** YX-04 live: tenant health, churn-risk alerts and the admin message composer (second approval for more than one company). */
export function LiveCustomerSuccessScreen({ live }: { live: LiveCustomerSuccess }) {
  const [composer, setComposer] = useState<string[] | null>(live.composerFor ?? null);
  const names = new Map(live.rows.map((r) => [r.id, r.name]));
  const alerting = live.rows.filter((r) => r.alerts.length);
  const waiting = live.messages.filter((m) => m.status === 'pending_approval');
  return (
    <ConsolePage
      crumb="Customer success"
      title="Customer success"
      description="Health from account signals only: admin sign-ins, open support tickets, ratings and billing. Never employee names or HR data."
      state={live.state}
      onRetry={live.onRetry}
      what="customer health"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setComposer([])}>
          Message admins
        </Button>
      }
    >
      <FactRow label="Health">
        <Fact label="Companies" value={live.rows.length} />
        <Fact label="At risk" value={live.rows.filter((r) => healthBand(r.health) === 'at-risk').length} tone="danger" />
        <Fact label="With alerts" value={alerting.length} tone="warning" />
      </FactRow>
      <Tabs defaultValue={live.tab ?? 'health'}>
        <TabsList aria-label="Customer success">
          <TabsTrigger value="health">Tenant health</TabsTrigger>
          <TabsTrigger value="alerts" count={alerting.length}>
            Churn-risk alerts
          </TabsTrigger>
          <TabsTrigger value="messages" count={waiting.length}>
            Messages
          </TabsTrigger>
        </TabsList>
        <TabsContent value="health">
          <FilteredTable
            label="Tenant health"
            rows={live.rows}
            getRowId={(r) => r.id}
            searchText={(r) => `${r.name} ${r.slug}`}
            fields={[
              { key: 'band', label: 'Band', type: 'multi', options: opts(['Healthy', 'Watch', 'At risk']) },
              { key: 'lifecycle', label: 'Lifecycle', type: 'multi', options: opts(['Trial', 'Active', 'Suspended']) },
            ]}
            views={[{ id: 'all', name: 'All companies' }, { id: 'risk', name: 'At risk', shared: true }]}
            viewFilters={{ risk: [{ key: 'band', type: 'multi', values: ['At risk'] }] }}
            columns={[
              { key: 'name', header: 'Company', value: (r) => r.name, width: 220 },
              { key: 'health', header: 'Score', type: 'number', value: (r) => r.health, width: 80 },
              { key: 'band', header: 'Band', type: 'status', value: (r) => HEALTH_LABEL[healthBand(r.health)], statusTone: (v) => (v === 'Healthy' ? 'success' : v === 'Watch' ? 'warning' : 'danger'), width: 100 },
              { key: 'factors', header: 'Main factor', value: (r) => r.factors[0] ?? 'No issues', width: 260 },
              { key: 'lifecycle', header: 'Lifecycle', type: 'status', value: (r) => LIFE[r.lifecycle] ?? r.lifecycle, statusTone: (v) => (v === 'Active' ? 'success' : v === 'Trial' ? 'info' : 'danger'), width: 110 },
              { key: 'signin', header: 'Last admin sign-in', value: (r) => r.adminLastSignIn ?? '', render: (r) => (r.adminLastSignIn ? formatDate(new Date(r.adminLastSignIn)) : 'Never'), width: 150 },
              { key: 'tickets', header: 'Open tickets', type: 'number', value: (r) => r.openTickets, width: 110 },
            ]}
            empty={<EmptyState title="No customer companies yet." />}
            bulkActions={(ids) => (
              <Button size="sm" onClick={() => setComposer(ids)}>
                Message admins
              </Button>
            )}
          />
        </TabsContent>
        <TabsContent value="alerts">
          <div className="yx-ps-stack">
            <Card title="Companies with alerts">
              {alerting.length ? (
                <ul className="yx-ps-list" aria-label="Churn-risk alerts">
                  {alerting.map((r) => (
                    <li key={r.id}>
                      <div className="yx-ps-list__main">
                        <span className="yx-ps-list__title">{r.name}</span>
                        <span className="yx-ps-list__meta">
                          {r.alerts.join(' · ')} · score {r.health}
                        </span>
                      </div>
                      <Button size="sm" onClick={() => setComposer([r.id])}>
                        Message admins
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="No churn-risk alerts." description="Alerts appear here when a company crosses one of the rules below." />
              )}
            </Card>
            <AlertRules settings={live.settings} canManage={live.canManage} onSave={live.onSaveSettings} />
          </div>
        </TabsContent>
        <TabsContent value="messages">
          <MessageList messages={live.messages} names={names} onApprove={live.onApprove} onReject={live.onReject} onWithdraw={live.onWithdraw} />
        </TabsContent>
      </Tabs>
      {composer && <LiveComposer rows={live.rows} initial={composer} onClose={() => setComposer(null)} onWrite={live.onWrite} />}
    </ConsolePage>
  );
}

/** Answer 1047: the churn alert rules are platform settings with defaults. */
function AlertRules({ settings, canManage, onSave }: { settings: CsSettingRow[]; canManage: boolean; onSave: LiveCustomerSuccess['onSaveSettings'] }) {
  const [draft, setDraft] = useState<Record<string, number | null>>(Object.fromEntries(settings.map((s) => [s.key, s.value])));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const bad = settings.flatMap((s) => {
    const v = draft[s.key];
    return v === null || v === undefined || !Number.isInteger(v) || v < s.min || v > s.max ? [{ fieldId: `cs-${s.key}`, message: `Give a whole number from ${s.min} to ${s.max}.` }] : [];
  });
  const early = useTooEarly(bad);
  const save = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSave(Object.fromEntries(settings.map((s) => [s.key, draft[s.key]!])));
      toast({ tone: 'success', title: 'Alert rules saved' });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Alert rules" actions={canManage ? <Button size="sm" loading={busy} onClick={() => void save()}>Save rules</Button> : undefined}>
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FieldRow>
          {settings.map((s) => (
            <FormField key={s.key} id={`cs-${s.key}`} label={s.label} helper={`Default ${s.default}.`} error={early.errorOf(`cs-${s.key}`)}>
              <NumberField value={draft[s.key] ?? null} onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))} min={s.min} max={s.max} disabled={!canManage} />
            </FormField>
          ))}
        </FieldRow>
      </div>
    </Card>
  );
}

/** Answer 1048: messages written by staff; one to more than one company waits for a second staff member. */
function MessageList({ messages, names, onApprove, onReject, onWithdraw }: { messages: CsMessageRow[]; names: Map<string, string>; onApprove: LiveCustomerSuccess['onApprove']; onReject: LiveCustomerSuccess['onReject']; onWithdraw?: LiveCustomerSuccess['onWithdraw'] }) {
  const [approving, setApproving] = useState<CsMessageRow | null>(null);
  const [withdrawing, setWithdrawing] = useState<CsMessageRow | null>(null);
  const [rejecting, setRejecting] = useState<CsMessageRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const noteEarly = useTooEarly(note.trim() ? [] : [{ fieldId: 'cs-reject-note', message: 'Say why you are sending it back.' }]);
  const who = (m: CsMessageRow) => (m.companyIds.length === 1 ? (names.get(m.companyIds[0]!) ?? '1 company') : `${m.companyIds.length} companies`);
  if (!messages.length) return <EmptyState title="No messages yet." description="Use Message admins to write to the System Admins of one or more companies." />;
  return (
    <Card>
      {failed && <InlineAlert tone="danger" title={failed} />}
      <ul className="yx-ps-list" aria-label="Messages">
        {messages.map((m) => (
          <li key={m.id}>
            <div className="yx-ps-list__main">
              <span className="yx-ps-list__title">{m.subject}</span>
              <span className="yx-ps-list__meta">
                To the System Admins of {who(m)} · written by {m.mine ? 'you' : m.writtenBy} on {formatDate(new Date(m.createdAt))}
                {m.decidedBy ? ` · ${m.status === 'rejected' ? 'sent back' : 'approved'} by ${m.decidedBy}` : ''}
                {m.decisionNote ? ` · “${m.decisionNote}”` : ''}
              </span>
            </div>
            <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
            {m.status === 'pending_approval' &&
              (m.mine ? (
                <>
                  <span className="yx-ps-muted">Another staff member approves it</span>
                  {onWithdraw && (
                    <Button size="sm" onClick={() => setWithdrawing(m)}>
                      Withdraw
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => (setNote(''), setRejecting(m))}>
                    Send back
                  </Button>
                  <Button size="sm" variant="approve" onClick={() => setApproving(m)}>
                    Approve and send
                  </Button>
                </>
              ))}
          </li>
        ))}
      </ul>
      {approving && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setApproving(null)}
          title={`Send “${approving.subject}” to ${who(approving)}?`}
          consequence="Their System Admins get it in the bell and by email (as they chose). It cannot be taken back."
          confirmLabel="Approve and send"
          onConfirm={async () => {
            setFailed(null);
            try {
              await onApprove(approving.id, approving.version);
              toast({ tone: 'success', title: 'Message sent', description: `To the System Admins of ${who(approving)}.` });
            } catch (e) {
              setFailed(errorText(e));
            }
          }}
        />
      )}
      {withdrawing && onWithdraw && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setWithdrawing(null)}
          title={`Withdraw “${withdrawing.subject}”?`}
          consequence="Nothing is sent, and it can no longer be approved. You can write it again."
          confirmLabel="Withdraw"
          onConfirm={async () => {
            setFailed(null);
            try {
              await onWithdraw(withdrawing.id, withdrawing.version);
              toast({ tone: 'success', title: 'Message withdrawn' });
            } catch (e) {
              setFailed(errorText(e));
            }
          }}
        />
      )}
      {rejecting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRejecting(null)}
          size="sm"
          title="Send the message back?"
          description="The writer sees your reason. Nothing is sent."
          footer={
            <>
              <Button onClick={() => setRejecting(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  if (noteEarly.stop()) return;
                  setBusy(true);
                  setFailed(null);
                  try {
                    await onReject(rejecting.id, rejecting.version, note.trim());
                    setRejecting(null);
                    toast({ tone: 'success', title: 'Message sent back' });
                  } catch (e) {
                    setFailed(errorText(e));
                    setRejecting(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send back
              </Button>
            </>
          }
        >
          <FormField id="cs-reject-note" label="Reason" required error={noteEarly.errorOf('cs-reject-note')}>
            <TextArea rows={3} value={note} onChange={setNote} maxLength={500} />
          </FormField>
        </Dialog>
      )}
    </Card>
  );
}

/** The live composer: companies, subject and message; more than one company waits for a second staff member. */
function LiveComposer({ rows, initial, onClose, onWrite }: { rows: CsHealthRow[]; initial: string[]; onClose: () => void; onWrite: LiveCustomerSuccess['onWrite'] }) {
  const [companies, setCompanies] = useState<string[]>(initial);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const many = companies.length > 1;
  const early = useTooEarly(
    [
      !companies.length && { fieldId: 'cs-companies', message: 'Choose at least one company.' },
      subject.trim().length < 3 && { fieldId: 'cs-subject', message: 'Write a subject of at least 3 characters.' },
      /[<>]/.test(subject) && { fieldId: 'cs-subject', message: 'Write the subject without < or >.' },
      !body.trim() && { fieldId: 'cs-body', message: 'Write the message.' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await onWrite({ companyIds: companies, subject: subject.trim(), body: body.trim() });
      onClose();
      toast(many ? { tone: 'success', title: 'Sent for approval', description: 'Another staff member approves it before it goes.' } : { tone: 'success', title: 'Message sent', description: `To the System Admins of ${rows.find((r) => r.id === companies[0])?.name ?? 'the company'}.` });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Message company admins"
      subtitle="Goes to the companies' System Admins only, in the bell and by email (as each chose); never to employees."
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void send()}>
            {many ? 'Send for approval' : 'Send'}
          </Button>
        </>
      }
    >
      <div className="yx-ps-stack">
        <FormField id="cs-companies" label="Companies" required error={early.errorOf('cs-companies')} helper={many ? 'More than one company: another staff member approves the message before it is sent.' : undefined}>
          <MultiSelect value={companies} onChange={setCompanies} options={rows.map((r) => ({ value: r.id, label: r.name }))} searchable placeholder="Choose companies" />
        </FormField>
        <FormField id="cs-subject" label="Subject" required error={early.errorOf('cs-subject')}>
          <TextField value={subject} onChange={setSubject} maxLength={120} />
        </FormField>
        <FormField id="cs-body" label="Message" required helper="Plain text, up to 4,000 characters. The company also finds it in Settings › Support access." error={early.errorOf('cs-body')}>
          <TextArea rows={6} value={body} onChange={setBody} maxLength={4000} />
        </FormField>
      </div>
    </Drawer>
  );
}

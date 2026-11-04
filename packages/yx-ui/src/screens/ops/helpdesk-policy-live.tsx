// HLP-10 Policy library + acknowledgement and HLP-11 Policy admin, live (Helpdesk design wiring): the designed
// PolicyLibraryScreen and PolicyAdminScreen in helpdesk.tsx render these when the page passes `live`. Same layout as the
// design: the employee's list with "To acknowledge" / "All policies", the reader drawer (or the phone screen) with "What
// changed", the text, the attachments and the acknowledgement step; HR's policy header with the facts, the four tabs and
// the publish dialog. States only the real records have (the policy list, writing a version, waiting for a second
// person, sent back, the department drill-down, typed name, a newer version) are drawn in the same look. The server
// checks every rule again (docs/yukthix/helpdesk-design-map.md 4d).
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, FileText, Plus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { CodeField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { DataTable } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { BarChart } from '../../components/charts';
import { RichTextEditor } from '../../components/editor';
import { Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { Breadcrumbs, Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useNarrow } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { FileList } from '../desk/help';
import { MessageBody } from '../desk/desk-kit';
import type { LoadState } from '../desk/types';
import type { MyAckInput, MyPolicy, MyPolicyRow, MyPolicyStatus, PendingPerson, PolicyAdmin, PolicyChange, PolicyFile, PolicyMethod, PolicyOptions, PolicyRowAdmin, PolicyVersionStatus } from '../desk/policy-types';
import { Actions, OpsDesk, useSay } from './ops-kit';
import { ackPercent } from './ops-rules';

const day = (iso: string | null | undefined) => (iso ? formatDate(new Date(`${iso.slice(0, 10)}T00:00:00`)) : '—');
const STATUS_TONE: Record<MyPolicyStatus, BadgeTone> = { pending: 'warning', overdue: 'danger', acknowledged: 'success' };
const STATUS_LABEL: Record<MyPolicyStatus, string> = { pending: 'Pending acknowledgement', overdue: 'Overdue', acknowledged: 'Acknowledged' };
export const METHOD_LABEL: Record<PolicyMethod, string> = { click: 'confirmation', otp: 'one-time code' };
export const VERSION_LABEL: Record<PolicyVersionStatus, string> = { draft: 'Draft', waiting: 'Waiting to be published', sent_back: 'Sent back', published: 'Published' };
const VERSION_TONE: Record<PolicyVersionStatus, BadgeTone> = { draft: 'neutral', waiting: 'warning', sent_back: 'danger', published: 'success' };
const asAttachments = (files: PolicyFile[]) =>
  files.map((f) => ({ id: f.id, fileName: f.name, contentType: f.type, sizeBytes: f.size, scanStatus: (f.scan === 'clean' ? 'clean' : f.scan === 'infected' ? 'infected' : 'pending') as 'clean' | 'infected' | 'pending', side: 'agent' as const, messageId: null, createdAt: '' }));
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code;

/* =========================================================================================
 * HLP-10 · Policy library + acknowledgement (live)
 * ======================================================================================= */

export interface LivePolicyLibrary {
  state: LoadState;
  onRetry?: () => void;
  policies: MyPolicyRow[];
  /** The company's "tell the manager after N days overdue" (null: off). */
  managerAfterDays: number | null;
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** The open policy (the exact current version). */
  policy: MyPolicy | null;
  policyState?: LoadState;
  onAcknowledge: (id: string, input: MyAckInput) => Promise<void>;
  onSendCode: (id: string, versionId: string) => Promise<{ to: string; minutes: number }>;
  onOpenFile: (policyId: string, fileId: string) => void;
  /** Phone: back to Me. */
  onBack?: () => void;
  /** Stories and tests only. */
  start?: { tab?: 'pending' | 'all'; codeSentTo?: string; newer?: string };
}

function LiveAcknowledge({ live, policy }: { live: LivePolicyLibrary; policy: MyPolicy }) {
  const [read, setRead] = useState(false);
  const [typed, setTyped] = useState('');
  const [sent, setSent] = useState<{ to: string; minutes: number } | null>(live.start?.codeSentTo ? { to: live.start.codeSentTo, minutes: 5 } : null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ newer: boolean; text: string } | null>(live.start?.newer ? { newer: true, text: live.start.newer } : null);
  const { toast } = useSay();
  const readEarly = useTooEarly([...(read ? [] : [{ fieldId: 'pa-read', message: 'Tick that you have read and understood the policy.' }]), ...(policy.typedName && !typed.trim() ? [{ fieldId: 'pa-name', message: `Type your name as on your record: ${policy.myName}.` }] : [])]);
  const otpEarly = useTooEarly(policy.method === 'otp' && !/^\d{6}$/.test(otp) ? [{ fieldId: 'pa-otp', message: 'Enter the 6-digit code from the email.' }] : []);
  if (policy.acknowledged && policy.status === 'acknowledged')
    return (
      <InlineAlert tone="info" title="Acknowledged">
        You acknowledged {policy.acknowledged.version} on {formatDate(new Date(policy.acknowledged.at))} by {METHOD_LABEL[policy.acknowledged.method]}
        {policy.acknowledged.typedName ? `, typing your name as “${policy.acknowledged.typedName}”` : ''}. The record keeps the version and time.
      </InlineAlert>
    );
  const fail = (e: unknown) => setProblem({ newer: codeOf(e) === 'POLICY_NEWER_VERSION', text: errorText(e) });
  const acknowledge = async () => {
    if (readEarly.stop() || otpEarly.stop()) return;
    setBusy('ack');
    setProblem(null);
    try {
      await live.onAcknowledge(policy.id, { versionId: policy.versionId, read: true, ...(policy.typedName ? { typedName: typed.trim() } : {}), ...(policy.method === 'otp' ? { code: otp } : {}) });
      toast({ tone: 'success', title: `${policy.title} acknowledged`, description: `${policy.version} is on your record.` });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  const sendCode = async () => {
    if (readEarly.stop()) return;
    setBusy('code');
    setProblem(null);
    try {
      setSent(await live.onSendCode(policy.id, policy.versionId));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="yx-ops-stack" aria-label="Acknowledge this policy">
      {problem &&
        (problem.newer ? (
          <InlineAlert tone="warning" title="A newer version was published" actions={<Button size="sm" onClick={() => (setProblem(null), live.onOpen(policy.id))}>Read the new version</Button>}>
            {problem.text}
          </InlineAlert>
        ) : (
          <InlineAlert tone="danger" title="That didn't work">
            {problem.text}
          </InlineAlert>
        ))}
      <Checkbox id="pa-read" checked={read} onChange={setRead} label={`I have read and understood the ${policy.title} (${policy.version})`} />
      {readEarly.errorOf('pa-read') && <p className="yx-field__error">{readEarly.errorOf('pa-read')}</p>}
      {policy.typedName && (
        <FormField id="pa-name" label="Type your full name" required helper={`As on your record: ${policy.myName}`} error={readEarly.errorOf('pa-name')}>
          <TextField value={typed} onChange={setTyped} maxLength={200} />
        </FormField>
      )}
      {policy.method === 'otp' && sent && (
        <FormField id="pa-otp" error={otpEarly.errorOf('pa-otp')} label="One-time code" helper={`Sent by email to ${sent.to}. It expires in ${sent.minutes} minutes.`}>
          <CodeField value={otp} onChange={setOtp} />
        </FormField>
      )}
      <Actions>
        {policy.method === 'otp' && !sent ? (
          <Button variant="primary" loading={busy === 'code'} onClick={() => void sendCode()}>
            Send code to acknowledge
          </Button>
        ) : (
          <>
            {policy.method === 'otp' && (
              <Button loading={busy === 'code'} onClick={() => void sendCode()}>
                Send a new code
              </Button>
            )}
            <Button variant="primary" loading={busy === 'ack'} onClick={() => void acknowledge()}>
              Acknowledge
            </Button>
          </>
        )}
      </Actions>
    </section>
  );
}

export function LivePolicyLibrary({ live }: { live: LivePolicyLibrary }) {
  const phone = useNarrow();
  const [tab, setTab] = useState<'pending' | 'all'>(live.start?.tab ?? 'pending');
  const pending = live.policies.filter((p) => p.status !== 'acknowledged');
  const overdue = pending.filter((p) => p.status === 'overdue').length;
  const shown = tab === 'pending' ? pending : live.policies;
  const policy = live.openId && live.policy?.id === live.openId ? live.policy : null;

  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Policies" member={false}>
        <PageHeader title="Policies" />
        <NoAccessState what="your policies" grantedBy="the person you act for to sign in themselves" note="An acknowledgement is your own act, so this page is closed while you act for someone else." />
      </OpsDesk>
    );

  const reader = live.openId && (
    <div className="yx-ops-stack">
      {!policy ? (
        live.policyState === 'error' ? (
          <ErrorState title="We couldn't open this policy." description="It may no longer apply to you. Try again in a moment." onRetry={() => live.onOpen(live.openId)} />
        ) : (
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Opening the policy">
            <Skeleton height={24} />
            <Skeleton height={160} />
          </div>
        )
      ) : (
        <>
          <p className="yx-ops-muted">
            {policy.version} · effective {day(policy.effectiveOn)}
            {policy.owner ? ` · owner ${policy.owner}` : ''}
            {policy.dueOn ? ` · acknowledge by ${day(policy.dueOn)}` : ''}
          </p>
          {policy.changeSummary && (
            <InlineAlert tone="info" title="What changed">
              {policy.changeSummary}
            </InlineAlert>
          )}
          <article className="yx-ops-stack" aria-label={`${policy.title} text`}>
            <MessageBody html={policy.bodyHtml} />
          </article>
          <FileList files={asAttachments(policy.files)} title="Attachments" onOpen={(f) => live.onOpenFile(policy.id, f)} />
          <LiveAcknowledge key={policy.versionId} live={live} policy={policy} />
        </>
      )}
    </div>
  );

  const list =
    live.state === 'loading' ? (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading policies">
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    ) : live.state === 'error' ? (
      <ErrorState title="We couldn't load policies." description="Try again in a moment." onRetry={live.onRetry} />
    ) : shown.length === 0 ? (
      <EmptyState compact title={tab === 'pending' ? 'Nothing to acknowledge.' : 'No policies published for you yet.'} description={tab === 'pending' ? "You're up to date with every policy that applies to you." : undefined} />
    ) : (
      <ul className="yx-ops-list" aria-label="Policies">
        {shown.map((p) => (
          <li key={p.id} className="yx-ops-list__item">
            <span className="yx-ops-list__main">
              <a
                href={`?policy=${p.id}`}
                className="yx-ops-list__title"
                onClick={(e) => {
                  e.preventDefault();
                  live.onOpen(p.id);
                }}
              >
                {p.title}
              </a>
              <span className="yx-ops-list__sub">
                {p.version} · {p.category}
                {p.dueOn ? ` · due ${day(p.dueOn)}` : ''}
                {p.method === 'otp' ? ' · needs a one-time code' : ''}
              </span>
            </span>
            <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
          </li>
        ))}
      </ul>
    );

  const tabs = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'all')}>
      <TabsList aria-label="Policy lists">
        <TabsTrigger value="pending" count={pending.length}>
          To acknowledge
        </TabsTrigger>
        <TabsTrigger value="all">All policies</TabsTrigger>
      </TabsList>
      <TabsContent value={tab}>{list}</TabsContent>
    </Tabs>
  );

  if (phone)
    return (
      <PhoneFrame tab="me" title={live.openId ? (policy?.title ?? 'Policy') : 'Policies'} back={<IconButton icon={ArrowLeft} label={live.openId ? 'Back to policies' : 'Back to Me'} onClick={() => (live.openId ? live.onOpen(null) : live.onBack?.())} />}>
        {live.openId ? reader : tabs}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Policies" member={false} counts={{ Policies: pending.length }}>
      <PageHeader title="Policies" description="Company policies that apply to you. Acknowledge new versions by the due date." facts={`${pending.length} to acknowledge`} />
      {overdue > 0 && (
        <PageBanner tone="warning">
          {overdue === 1 ? 'One policy is overdue.' : `${overdue} policies are overdue.`}
          {live.managerAfterDays ? ` Your manager gets a reminder after ${live.managerAfterDays} days.` : ''}
        </PageBanner>
      )}
      <Card>{tabs}</Card>
      <Drawer open={Boolean(live.openId)} onOpenChange={(o) => !o && live.onOpen(null)} title={policy?.title ?? 'Policy'} subtitle={policy ? `${policy.version} · ${policy.category}` : ''} size="lg">
        {reader}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-11 · Policy admin (live)
 * ======================================================================================= */

export type PolicyAdminTab = 'overview' | 'pending' | 'versions' | 'audience' | 'write';
export interface LivePolicyAdmin {
  state: LoadState;
  onRetry?: () => void;
  /** policy.manage: write, audience, reminders, evidence. */
  canManage: boolean;
  /** policy.publish: publish or send back a version someone else wrote. */
  canPublish: boolean;
  policies: PolicyRowAdmin[];
  policyId: string | null;
  onOpen: (id: string | null) => void;
  policy: PolicyAdmin | null;
  policyState?: LoadState;
  pending: PendingPerson[];
  pendingState?: 'ready' | 'loading' | 'error';
  /** The department drill-down (null: everyone). */
  deptFilter: string | null;
  onDeptFilter: (id: string | null) => void;
  options: PolicyOptions | null;
  onCreate: (input: { title: string; category: string; method: PolicyMethod }) => Promise<{ id: string; code: string }>;
  onUpdate: (id: string, version: number, change: PolicyChange) => Promise<void>;
  onSaveDraft: (id: string, input: { version?: number; bodyHtml: string; changeSummary?: string; reack?: boolean }) => Promise<{ version: number }>;
  onUpload: (id: string, file: File) => Promise<PolicyFile>;
  onRemoveFile: (id: string, fileId: string) => Promise<void>;
  onSubmit: (id: string, version: number) => Promise<void>;
  /** counselSeen: the publisher ticked the version's counsel note (HLP-14). */
  onPublish: (id: string, version: number, counselSeen?: boolean) => Promise<{ notified: number }>;
  onSendBack: (id: string, version: number, note: string) => Promise<void>;
  onRemind: (id: string, employeeIds?: string[]) => Promise<{ sent: number; skipped: number }>;
  onExport: (id: string) => Promise<void>;
  onOpenFile: (id: string, fileId: string) => void;
  /** Stories and tests only. */
  start?: { tab?: PolicyAdminTab; dialog?: 'new' | 'publish' | 'send-back'; tooEarly?: boolean };
}

function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <OpsDesk area="helpdesk" active="Policies">
      {children}
    </OpsDesk>
  );
}

function NewPolicyDialog({ open, onOpenChange, onCreate, tooEarly }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (input: { title: string; category: string; method: PolicyMethod }) => Promise<void>; tooEarly?: boolean }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState<PolicyMethod>('click');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const early = useTooEarly([...(title.trim().length < 3 ? [{ fieldId: 'np-title', message: 'Give the policy a title (3 letters or more).' }] : []), ...(category.trim().length < 2 ? [{ fieldId: 'np-category', message: 'Say which kind of policy it is, for example Conduct.' }] : [])]);
  useEffect(() => {
    if (tooEarly && open) early.stop();
    // Stories only: show the pressed-too-early state once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const create = async () => {
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), category: category.trim(), method });
      early.reset();
      setTitle('');
      setCategory('');
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="New policy"
      description="You write the text next. It goes live only when it is published."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void create()}>
            Make the policy
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField id="np-title" label="Title" required error={early.errorOf('np-title')}>
          <TextField value={title} onChange={setTitle} maxLength={150} />
        </FormField>
        <FormField id="np-category" label="Kind of policy" required helper="For example Conduct, Time off, IT, Money" error={early.errorOf('np-category')}>
          <TextField value={category} onChange={setCategory} maxLength={60} />
        </FormField>
        <MethodChoice value={method} onChange={setMethod} />
      </div>
    </Dialog>
  );
}

function MethodChoice({ value, onChange }: { value: PolicyMethod; onChange: (m: PolicyMethod) => void }) {
  return (
    <FormField label="How people acknowledge">
      <RadioGroup
        value={value}
        onChange={(v) => onChange(v as PolicyMethod)}
        options={[
          { value: 'click', label: 'Confirmation click', description: 'Default for most policies' },
          { value: 'otp', label: 'One-time code', description: 'For critical policies; keeps stronger evidence' },
        ]}
      />
    </FormField>
  );
}

function PolicyList({ live, onNew }: { live: LivePolicyAdmin; onNew: () => void }) {
  const loading = live.state === 'loading';
  return (
    <>
      <PageHeader
        title="Policy admin"
        description="Write company policies, publish new versions and see who has acknowledged them."
        facts={loading ? undefined : `${live.policies.length} ${live.policies.length === 1 ? 'policy' : 'policies'}`}
        actions={
          live.canManage && (
            <Button variant="primary" icon={Plus} onClick={onNew}>
              New policy
            </Button>
          )
        }
      />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the policies." description="Try again in a moment." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Company policies"
          state={loading ? 'loading' : 'ready'}
          columns={[
            { key: 'title', header: 'Policy', value: (r: PolicyRowAdmin) => `${r.code} · ${r.title}`, width: 320 },
            { key: 'category', header: 'Kind', value: (r) => r.category },
            { key: 'version', header: 'Live version', value: (r) => (r.version ? `${r.version} · ${day(r.effectiveOn)}` : 'Not published yet') },
            { key: 'ack', header: 'Acknowledged', value: (r) => (r.version ? `${r.acknowledged} of ${r.audience} (${ackPercent(r.acknowledged, r.audience)}%)` : '—') },
            { key: 'overdue', header: 'Overdue', type: 'number', value: (r) => r.overdue },
            { key: 'open', header: 'Being written', type: 'status', value: (r) => (r.open ? `v${r.open.number}: ${VERSION_LABEL[r.open.status]}` : 'None'), statusTone: (v) => (String(v).includes('Waiting') ? 'warning' : String(v).includes('Sent back') ? 'danger' : 'neutral') },
          ]}
          rows={live.policies}
          getRowId={(r) => r.id}
          onRowClick={(r) => live.onOpen(r.id)}
          empty={<EmptyState compact title="No policies yet." description={live.canManage ? 'Make the first one: a code of conduct or a POSH policy is a good start.' : 'HR has not written any policies yet.'} />}
        />
      )}
    </>
  );
}

function WriteTab({ live, p }: { live: LivePolicyAdmin; p: PolicyAdmin }) {
  const open = p.open;
  const number = open?.number ?? (p.current ? p.current.number + 1 : 1);
  const [body, setBody] = useState(open?.bodyHtml ?? p.current?.bodyHtml ?? '');
  const [summary, setSummary] = useState(open?.changeSummary ?? '');
  const [reack, setReack] = useState(open ? open.reack : p.settings.reackDefault);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useSay();
  const empty = !body.replace(/<[^>]*>/g, '').trim();
  const early = useTooEarly([...(empty ? [{ fieldId: 'pw-body', message: 'Write the policy text first.' }] : []), ...(number > 1 && summary.trim().length < 3 ? [{ fieldId: 'pw-summary', message: 'Say what changed (3 letters or more). People see it at the top of the policy.' }] : [])]);
  useEffect(() => {
    if (live.start?.tooEarly) early.stop();
    // Stories only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (open?.status === 'waiting')
    return (
      <Card>
        <div className="yx-ops-stack">
          <InlineAlert tone="info" title={`v${open.number} is waiting to be published`}>
            It can't change while it waits. A publisher can send it back to you.
          </InlineAlert>
          <MessageBody html={open.bodyHtml} />
        </div>
      </Card>
    );
  const save = async (andSend: boolean) => {
    if (andSend && early.stop()) return;
    setBusy(andSend ? 'send' : 'save');
    setError(null);
    try {
      const saved = await live.onSaveDraft(p.id, { ...(open ? { version: open.version } : {}), bodyHtml: body, ...(number > 1 ? { changeSummary: summary.trim(), reack } : {}) });
      if (andSend) {
        await live.onSubmit(p.id, saved.version);
        toast({ tone: 'success', title: `v${number} sent to be published`, description: p.settings.secondPerson ? 'Someone other than you publishes it.' : 'A publisher can publish it now.' });
      } else toast({ tone: 'success', title: `v${number} saved as a draft` });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        {open?.status === 'sent_back' && (
          <InlineAlert tone="warning" title={`v${open.number} was sent back`}>
            “{open.sentBackNote}” Change it, then send it again.
          </InlineAlert>
        )}
        <p className="yx-ops-muted">{open ? `v${open.number} · ${VERSION_LABEL[open.status]}${open.writtenBy ? ` · last saved by ${open.writtenBy}` : ''}` : `v${number} starts from the text in force now.`}</p>
        <FormField id="pw-body" label="Policy text" required error={early.errorOf('pw-body')}>
          <RichTextEditor value={body} onChange={setBody} mergeFields={[]} />
        </FormField>
        {number > 1 && (
          <>
            <FormField id="pw-summary" label="What changed" required helper="Shown to employees at the top of the policy" error={early.errorOf('pw-summary')}>
              <TextArea value={summary} onChange={setSummary} rows={3} maxLength={500} />
            </FormField>
            <Switch checked={reack} onChange={setReack} label="Ask everyone to acknowledge again" description="Use for major changes." />
            <InlineAlert tone={reack ? 'warning' : 'info'}>{reack ? `${p.audience} people move to pending and get a reminder when it is published.` : 'Nobody is asked again. The new text shows from the day it is published.'}</InlineAlert>
          </>
        )}
        <FormField label="Attachments" helper="PDF, Word or an image, up to 10 MB each. Each file is checked for viruses.">
          <FileUpload
            accept={['.pdf', '.docx', '.png', '.jpg']}
            upload={async (file) => {
              if (!open) await live.onSaveDraft(p.id, { bodyHtml: body, ...(number > 1 ? { changeSummary: summary.trim(), reack } : {}) });
              await live.onUpload(p.id, file);
            }}
          />
        </FormField>
        {open && open.files.length > 0 && (
          <ul className="yx-ops-list" aria-label="Attached files">
            {open.files.map((f) => (
              <li key={f.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{f.name}</span>
                  <span className="yx-ops-list__sub">{f.scan === 'clean' ? 'Checked' : f.scan === 'infected' ? 'Failed the virus check' : 'Being checked for viruses'}</span>
                </span>
                <Button size="sm" onClick={() => void live.onRemoveFile(p.id, f.id).then(() => toast({ tone: 'success', title: `${f.name} removed` }), (e) => setError(errorText(e)))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Actions>
          <Button loading={busy === 'save'} onClick={() => void save(false)}>
            Save draft
          </Button>
          <Button variant="primary" loading={busy === 'send'} onClick={() => void save(true)}>
            Send to be published
          </Button>
        </Actions>
      </div>
    </Card>
  );
}

function AudienceTab({ live, p }: { live: LivePolicyAdmin; p: PolicyAdmin }) {
  const o = live.options;
  const [le, setLe] = useState(p.legalEntityIds);
  const [loc, setLoc] = useState(p.locationIds);
  const [dep, setDep] = useState(p.departmentIds);
  const [gr, setGr] = useState(p.gradeIds);
  const [method, setMethod] = useState<PolicyMethod>(p.method);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useSay();
  const names = (ids: string[], list: { id: string; name: string }[] | undefined, all: string) => (ids.length ? ids.map((id) => list?.find((x) => x.id === id)?.name ?? 'Removed').join(', ') : all);
  const s = p.settings;
  const rules = [
    { label: 'New joiners', value: 'Included from their joining day' },
    { label: 'Acknowledge within', value: `${s.dueDays} days` },
    { label: 'Reminders', value: `${s.everyDays ? `Every ${s.everyDays} ${s.everyDays === 1 ? 'day' : 'days'}` : 'Off'}; ${s.managerAfterDays ? `manager told after ${s.managerAfterDays} days overdue` : 'manager not told'}` },
    { label: 'Publishing', value: s.secondPerson ? 'A second person publishes each version' : 'The writer may publish' },
    { label: 'Typed name', value: s.typedName ? 'People type their name to acknowledge' : 'Not asked' },
  ];
  if (!live.canManage || !o)
    return (
      <Card>
        <DescriptionList
          columns={2}
          items={[
            { label: 'Entities', value: names(p.legalEntityIds, o?.legalEntities, 'All entities') },
            { label: 'Locations', value: names(p.locationIds, o?.locations, 'All locations') },
            { label: 'Departments', value: names(p.departmentIds, o?.departments, 'All departments') },
            { label: 'Grades', value: names(p.gradeIds, o?.grades, 'All grades') },
            { label: 'How people acknowledge', value: p.method === 'otp' ? 'One-time code' : 'Confirmation click' },
            ...rules,
          ]}
        />
      </Card>
    );
  const opt = (list: { id: string; name: string }[]) => list.map((x) => ({ value: x.id, label: x.name }));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await live.onUpdate(p.id, p.version, { legalEntityIds: le, locationIds: loc, departmentIds: dep, gradeIds: gr, method });
      toast({ tone: 'success', title: 'Audience and method saved', description: 'Who must acknowledge is worked out again from today.' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        <p className="yx-ops-muted">Leave a list empty for everyone. A department includes the departments under it.</p>
        <div className="yx-ops-grid">
          <FormField label="Entities">
            <MultiSelect value={le} onChange={setLe} options={opt(o.legalEntities)} placeholder="All entities" />
          </FormField>
          <FormField label="Locations">
            <MultiSelect value={loc} onChange={setLoc} options={opt(o.locations)} placeholder="All locations" />
          </FormField>
          <FormField label="Departments">
            <MultiSelect value={dep} onChange={setDep} options={opt(o.departments)} placeholder="All departments" />
          </FormField>
          <FormField label="Grades">
            <MultiSelect value={gr} onChange={setGr} options={opt(o.grades)} placeholder="All grades" />
          </FormField>
        </div>
        <MethodChoice value={method} onChange={setMethod} />
        <DescriptionList columns={2} items={rules} />
        <p className="yx-ops-muted">These rules are company settings (Settings › Company rules, Company policies).</p>
        <Actions>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save audience and method
          </Button>
        </Actions>
      </div>
    </Card>
  );
}

function PublishDialog({ live, p, open, onOpenChange }: { live: LivePolicyAdmin; p: PolicyAdmin; open: boolean; onOpenChange: (o: boolean) => void }) {
  const v = p.open;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const { toast } = useSay();
  const early = useTooEarly(v?.counselNote && !seen ? [{ fieldId: 'pp-counsel', message: 'Tick that you have read the counsel note.' }] : []);
  if (!v) return null;
  const today = formatDate(new Date());
  const publish = async () => {
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      const r = v.counselNote ? await live.onPublish(p.id, v.version, seen) : await live.onPublish(p.id, v.version);
      toast({ tone: 'success', title: `${p.title} v${v.number} published`, description: r.notified ? `${r.notified} ${r.notified === 1 ? 'person was' : 'people were'} asked to acknowledge it.` : 'Nobody needed to acknowledge it again.' });
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={`Publish ${p.title} v${v.number}?`}
      description={`Effective ${today}. Earlier acknowledgements stay on record.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void publish()}>
            Publish version
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <DescriptionList
          columns={1}
          items={[
            { label: 'What changed', value: v.changeSummary ?? (v.number === 1 ? 'First version' : '—') },
            { label: 'Written by', value: v.writtenBy ?? '—' },
          ]}
        />
        {v.counselNote && (
          <>
            <InlineAlert tone="warning" title="Counsel note">
              {v.counselNote}.
            </InlineAlert>
            <Checkbox id="pp-counsel" checked={seen} onChange={setSeen} label="I have read this note; counsel will review the policy" />
            {early.errorOf('pp-counsel') && <p className="yx-field__error">{early.errorOf('pp-counsel')}</p>}
          </>
        )}
        <InlineAlert tone={v.reack ? 'warning' : 'info'}>{v.reack ? `${p.audience} people move to pending and get a reminder. Reminders respect quiet hours.` : 'Nobody is asked again. The new text shows from the effective date.'}</InlineAlert>
      </div>
    </Dialog>
  );
}

function SendBackDialog({ live, p, open, onOpenChange, tooEarly }: { live: LivePolicyAdmin; p: PolicyAdmin; open: boolean; onOpenChange: (o: boolean) => void; tooEarly?: boolean }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useSay();
  const early = useTooEarly(note.trim().length < 3 ? [{ fieldId: 'pb-note', message: 'Say what to change (3 letters or more).' }] : []);
  useEffect(() => {
    if (tooEarly && open) early.stop();
    // Stories only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const v = p.open;
  if (!v) return null;
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      await live.onSendBack(p.id, v.version, note.trim());
      toast({ tone: 'success', title: `v${v.number} sent back`, description: `${v.writtenBy ?? 'The writer'} sees your note.` });
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={`Send v${v.number} back?`}
      description="The writer changes it and sends it again."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void send()}>
            Send back
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField id="pb-note" label="What to change" required error={early.errorOf('pb-note')}>
          <TextArea value={note} onChange={setNote} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}

export function LivePolicyAdmin({ live }: { live: LivePolicyAdmin }) {
  const [dialog, setDialog] = useState<'new' | 'publish' | 'send-back' | null>(live.start?.dialog ?? null);
  const [tab, setTab] = useState<PolicyAdminTab>(live.start?.tab ?? 'overview');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useSay();
  useEffect(() => setTab(live.start?.tab ?? 'overview'), [live.policyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (live.state === 'no-access')
    return (
      <AdminFrame>
        <PageHeader title="Policy admin" />
        <NoAccessState what="policy admin" grantedBy="your HR admin" note="HR with policy rights for the whole company write, publish and track company policies." />
      </AdminFrame>
    );
  const create = async (input: { title: string; category: string; method: PolicyMethod }) => {
    const r = await live.onCreate(input);
    toast({ tone: 'success', title: `${r.code} made`, description: 'Write its text, then send it to be published.' });
    live.onOpen(r.id);
    setTab('write');
  };
  if (!live.policyId || live.state !== 'ready')
    return (
      <AdminFrame>
        <PolicyList live={live} onNew={() => setDialog('new')} />
        <NewPolicyDialog open={dialog === 'new'} onOpenChange={(o) => setDialog(o ? 'new' : null)} onCreate={create} tooEarly={live.start?.tooEarly} />
      </AdminFrame>
    );

  const p = live.policy;
  const crumbs = <Breadcrumbs items={[{ label: 'Policy admin', href: '/yx/desk/policy-admin', onClick: () => live.onOpen(null) }, { label: p?.title ?? 'Policy' }]} />;
  if (!p || live.policyState === 'error' || live.policy?.id !== live.policyId)
    return (
      <AdminFrame>
        <PageHeader title="Policy" breadcrumbs={crumbs} />
        {live.policyState === 'error' ? (
          <ErrorState title="We couldn't open this policy." description="Try again in a moment." onRetry={() => live.onOpen(live.policyId)} />
        ) : (
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Opening the policy">
            <Skeleton height={64} />
            <Skeleton height={240} />
          </div>
        )}
      </AdminFrame>
    );

  const pct = ackPercent(p.acknowledged, p.audience);
  const waiting = p.open?.status === 'waiting' ? p.open : null;
  const mayPublish = Boolean(waiting && live.canPublish && (!waiting.needsSecondPerson || !waiting.writtenByMe));
  const pendingCount = p.audience - p.acknowledged;
  const remind = async (ids?: string[]) => {
    setBusy('remind');
    try {
      const r = await live.onRemind(p.id, ids);
      toast({ tone: 'success', title: r.sent ? `Reminder sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}` : 'Nobody needed a reminder now', description: r.skipped ? `${r.skipped} already got one today.` : undefined });
      setChosen([]);
    } catch (e) {
      toast({ title: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const deptOptions = p.byDept.filter((d) => d.departmentId).map((d) => ({ value: d.departmentId!, label: d.dept }));

  return (
    <AdminFrame>
      <ObjectHeader
        breadcrumbs={crumbs}
        name={p.title}
        icon={FileText}
        secondary={p.current ? `${p.current.label} · effective ${day(p.current.effectiveOn)}${p.owner ? ` · owner ${p.owner}` : ''}` : `${p.code} · not published yet${p.owner ? ` · owner ${p.owner}` : ''}`}
        status={
          <>
            {p.current ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Not published</Badge>}
            {p.open && <Badge tone={VERSION_TONE[p.open.status]}>{`v${p.open.number}: ${VERSION_LABEL[p.open.status]}`}</Badge>}
            {p.method === 'otp' && <Badge tone="info">Critical: one-time code</Badge>}
          </>
        }
        facts={[
          { label: 'Acknowledged', value: p.current ? `${pct}%` : '—' },
          { label: 'Audience', value: `${p.audience} people` },
          { label: 'Pending', value: pendingCount },
          { label: 'Due', value: p.dueOn ? day(p.dueOn) : '—' },
        ]}
        actions={
          <>
            {live.canManage && p.current && (
              <Button loading={busy === 'remind'} onClick={() => void remind()}>
                Send reminder
              </Button>
            )}
            {mayPublish ? (
              <Button variant="primary" onClick={() => setDialog('publish')}>
                Publish version
              </Button>
            ) : (
              live.canManage &&
              !waiting && (
                <Button variant="primary" onClick={() => setTab('write')}>
                  {p.open ? `Write v${p.open.number}` : 'Publish new version'}
                </Button>
              )
            )}
          </>
        }
        menu={
          live.canManage && (
            <MenuItem icon={Download} onSelect={() => void live.onExport(p.id).then(() => toast({ tone: 'success', title: 'Evidence downloaded', description: 'Every acknowledgement of every version, with its time and fingerprint.' }), (e) => toast({ title: errorText(e) }))}>
              Export evidence (CSV)
            </MenuItem>
          )
        }
      />
      {waiting &&
        (mayPublish ? (
          <PageBanner
            tone="info"
            action={
              <>
                <Button size="sm" onClick={() => setTab('write')}>
                  Read it
                </Button>
                <Button size="sm" onClick={() => setDialog('send-back')}>
                  Send back
                </Button>
              </>
            }
          >
            v{waiting.number} by {waiting.writtenBy ?? 'someone'} is waiting for you to publish it.
          </PageBanner>
        ) : (
          <PageBanner tone="info">{waiting.writtenByMe && waiting.needsSecondPerson ? `You wrote v${waiting.number}, so another publisher publishes it.` : `v${waiting.number} is waiting for a publisher.`}</PageBanner>
        ))}
      {p.open?.status === 'sent_back' && (
        <PageBanner tone="warning" action={live.canManage && <Button size="sm" onClick={() => setTab('write')}>Change it</Button>}>
          v{p.open.number} was sent back: “{p.open.sentBackNote}”
        </PageBanner>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as PolicyAdminTab)}>
        <TabsList aria-label="Policy sections">
          <TabsTrigger value="overview">Acknowledgement</TabsTrigger>
          <TabsTrigger value="pending" count={pendingCount}>
            Pending people
          </TabsTrigger>
          <TabsTrigger value="versions" count={p.versions.length}>
            Versions
          </TabsTrigger>
          <TabsTrigger value="audience">Audience & method</TabsTrigger>
          {(live.canManage || waiting) && <TabsTrigger value="write">{p.open ? `v${p.open.number}` : 'New version'}</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          {!p.current ? (
            <EmptyState compact title="Not published yet." description="Once a version is published, you see here who has acknowledged it." />
          ) : (
            <div className="yx-ops-stack">
              <Meter label={`Acknowledged ${p.ackVersion ?? ''}`.trim()} value={p.acknowledged} max={Math.max(1, p.audience)} valueText={`${p.acknowledged} of ${p.audience} (${pct}%)`} />
              <BarChart
                title="Acknowledged by department"
                xLabel="Department"
                orientation="horizontal"
                categories={p.byDept.map((d) => d.dept)}
                series={[{ name: 'Acknowledged %', values: p.byDept.map((d) => ackPercent(d.acknowledged, d.audience)) }]}
                groupSizes={p.byDept.map((d) => d.audience)}
                minGroupSize={5}
              />
              <FormField label="See who is pending in" helper="Opens Pending people for that department">
                <Select value={null} onChange={(d) => d && (live.onDeptFilter(d), setTab('pending'))} options={p.byDept.filter((d) => d.departmentId).map((d) => ({ value: d.departmentId!, label: `${d.dept} · ${d.audience - d.acknowledged} pending` }))} placeholder="Choose a department" />
              </FormField>
            </div>
          )}
        </TabsContent>
        <TabsContent value="pending">
          <div className="yx-ops-stack">
            <FormField label="Department">
              <Select value={live.deptFilter} onChange={live.onDeptFilter} options={deptOptions} placeholder="All departments" clearable />
            </FormField>
            <DataTable
              label="People who haven't acknowledged"
              state={live.pendingState ?? 'ready'}
              columns={[
                { key: 'name', header: 'Employee', type: 'person', value: (r: PendingPerson) => r.name, person: (r) => ({ name: r.name, secondary: [r.code, r.dept].filter(Boolean).join(' · ') }) },
                { key: 'manager', header: 'Manager', value: (r) => r.manager ?? '—' },
                { key: 'due', header: 'Due', value: (r) => day(r.dueOn) },
                { key: 'days', header: 'Days overdue', type: 'number', value: (r) => r.daysOverdue },
                { key: 'esc', header: 'Escalation', type: 'status', value: (r) => (r.managerTold ? 'Manager told' : r.lastRemindedOn ? `Reminded ${day(r.lastRemindedOn)}` : 'Not reminded'), statusTone: (v) => (v === 'Manager told' ? 'danger' : String(v).startsWith('Reminded') ? 'warning' : 'neutral') },
              ]}
              rows={live.pending}
              getRowId={(r) => r.employeeId}
              selectable={live.canManage && Boolean(p.current)}
              selectedIds={chosen}
              onSelectedChange={setChosen}
              bulkActions={(ids) => (
                <Button size="sm" loading={busy === 'remind'} onClick={() => void remind(ids)}>
                  Remind {ids.length}
                </Button>
              )}
              empty={<EmptyState compact title={p.current ? 'Everyone has acknowledged.' : 'Not published yet.'} />}
            />
          </div>
        </TabsContent>
        <TabsContent value="versions">
          <DataTable
            label="Versions"
            columns={[
              { key: 'v', header: 'Version', type: 'id', value: (r: PolicyAdmin['versions'][number]) => r.label },
              { key: 'eff', header: 'Effective', value: (r) => day(r.effectiveOn) },
              { key: 'sum', header: 'What changed', value: (r) => r.changeSummary ?? (r.number === 1 ? 'First version' : '—'), width: 360 },
              { key: 'reack', header: 'Asked to acknowledge again', value: (r) => (r.reack ? 'Yes' : 'No') },
              { key: 'by', header: 'Written / published by', value: (r) => `${r.writtenBy ?? '—'} / ${r.publishedBy ?? '—'}` },
              { key: 'ack', header: 'Acknowledged', value: (r) => `${r.acknowledged} (${ackPercent(r.acknowledged, p.audience)}%)` },
            ]}
            rows={p.versions}
            getRowId={(r) => r.id}
            empty={<EmptyState compact title="No version published yet." />}
          />
        </TabsContent>
        <TabsContent value="audience">
          <AudienceTab key={p.version} live={live} p={p} />
        </TabsContent>
        <TabsContent value="write">
          <WriteTab key={`${p.open?.id ?? 'new'}-${p.open?.version ?? 0}`} live={live} p={p} />
        </TabsContent>
      </Tabs>
      <PublishDialog live={live} p={p} open={dialog === 'publish'} onOpenChange={(o) => setDialog(o ? 'publish' : null)} />
      <SendBackDialog live={live} p={p} open={dialog === 'send-back'} onOpenChange={(o) => setDialog(o ? 'send-back' : null)} tooEarly={live.start?.tooEarly} />
    </AdminFrame>
  );
}

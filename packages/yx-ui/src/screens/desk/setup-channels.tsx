import { useEffect, useState } from 'react';
import { Mail, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, PasswordField, TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { CopyValue, DeskPage, PRIORITY_LABEL, STATE_LABEL, when } from './desk-kit';
import type { Banner, BannerAudience, BannerInput, BannerSeverity, Bounce, DeskDetail, DeskSummary, InboundEmail, InboundEmailDetail, InboundVerdict, LoadState, Mailbox, MailboxInput, MailboxKind, MailRule, MailRuleInput, PortalInput, PortalSignUp, PortalView, RuleAction, RuleField, RuleOp, SendingDomain, WebhookSecret } from './types';

// Desk set-up, batch 3 (SD-1.18 to SD-1.23): the Email tab (mailboxes, rules, held mail, sending domains, the bounce
// list), the Portal tab (outside help pages) and the Banners tab (known issues). Every change is checked and audited
// on the server; secrets are shown once and never read back.

// ---------------------------------------------------------------------------------------------- email

export const KIND_LABEL: Record<MailboxKind, string> = {
  hosted: 'YukthiX address (we receive it)',
  forward: 'Forward from your address',
  m365_oauth: 'Microsoft 365',
  gmail_oauth: 'Gmail',
  imap: 'Your mail server (IMAP)',
};
const KIND_HELP: Record<MailboxKind, string> = {
  hosted: 'An address on a domain whose mail comes straight to YukthiX.',
  forward: 'Your own address. You set it to pass its mail on to the web address we show next.',
  m365_oauth: 'We read this mailbox with an app your Microsoft 365 admin sets up.',
  gmail_oauth: 'We read this mailbox with an app your Google admin sets up.',
  imap: 'We sign in to your mail server and read new mail every few minutes.',
};
const CREDENTIALS: Partial<Record<MailboxKind, { key: string; label: string; secret?: boolean; number?: boolean }[]>> = {
  imap: [
    { key: 'host', label: 'Server name' },
    { key: 'port', label: 'Port', number: true },
    { key: 'user', label: 'User name' },
    { key: 'password', label: 'Password', secret: true },
  ],
  m365_oauth: [
    { key: 'tenantId', label: 'Directory (tenant) ID' },
    { key: 'clientId', label: 'App (client) ID' },
    { key: 'clientSecret', label: 'App secret', secret: true },
    { key: 'user', label: 'Mailbox user' },
  ],
  gmail_oauth: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client secret', secret: true },
    { key: 'refreshToken', label: 'Refresh token', secret: true },
  ],
};
const VERDICTS: { value: InboundVerdict | 'all'; label: string }[] = [
  { value: 'held', label: 'Held' },
  { value: 'spam', label: 'Spam' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'loop', label: 'Automatic (loop)' },
  { value: 'bounce', label: 'Bounces' },
  { value: 'all', label: 'All' },
];
const VERDICT_WORD: Record<InboundVerdict, string> = { held: 'Held', spam: 'Spam', rejected: 'Rejected', loop: 'Automatic (loop)', bounce: 'Bounce', accepted: 'Let in' };
const FLAG_WORD: Record<string, string> = { sender_not_verified: 'Sender not proven', display_name_lookalike: 'Name looks like a known sender' };
const FIELD_LABEL: Record<RuleField, string> = { from: 'Sender address', domain: 'Sender’s domain', to: 'To address', subject: 'Subject', body: 'Email text', header: 'A header' };
const OP_LABEL: Record<RuleOp, string> = { contains: 'Contains', equals: 'Is', starts_with: 'Starts with', ends_with: 'Ends with' };
const ACTION_LABEL: Record<RuleAction, string> = { route: 'Send to a category', tag: 'Add a tag', priority: 'Set the priority', reject: 'Refuse it', spam: 'Mark as spam', parse_field: 'Read a value from the text' };
const list = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export interface EmailSetupProps {
  state: LoadState;
  mailboxes: Mailbox[];
  domains: SendingDomain[];
  bounces: Bounce[];
  inbound: InboundEmail[];
  verdict: InboundVerdict | 'all';
  onVerdict: (v: InboundVerdict | 'all') => void;
  /** Hosted and forward mailboxes come back with their webhook address and signing secret, shown once. */
  onCreateMailbox: (input: MailboxInput) => Promise<Mailbox & Partial<WebhookSecret>>;
  onUpdateMailbox: (mailbox: Mailbox, change: MailboxInput) => Promise<void>;
  onRotate: (mailbox: Mailbox) => Promise<WebhookSecret>;
  onLoadRules: (mailbox: Mailbox) => Promise<MailRule[]>;
  onSaveRule: (mailbox: Mailbox, id: string | null, input: MailRuleInput) => Promise<void>;
  onDeleteRule: (mailbox: Mailbox, id: string) => Promise<void>;
  onOpenOriginal: (id: string) => Promise<InboundEmailDetail>;
  onRelease: (id: string) => Promise<unknown>;
  onAddDomain: (domain: string) => Promise<void>;
  onCheckDomain: (id: string) => Promise<void>;
  onClearBounce: (id: string) => Promise<void>;
}

/** The signing secret is never shown again: copy it now. */
export function SecretBox({ secret, onDone }: { secret: WebhookSecret; onDone: () => void }) {
  return (
    <InlineAlert tone="warning" title="Copy now, shown once" actions={<Button size="sm" onClick={onDone}>I have copied them</Button>}>
      <span className="yx-ops-stack" data-gap="sm">
        <span>Send this mailbox’s mail to the web address below and sign it with the secret. We cannot show the secret again; make a new web address if it is lost.</span>
        <CopyValue label="Webhook address" value={secret.webhookUrl} />
        <CopyValue label="Signing secret" value={secret.signingSecret} />
      </span>
    </InlineAlert>
  );
}

export function EmailTab(props: EmailSetupProps & { detail: DeskDetail }) {
  const [edit, setEdit] = useState<Mailbox | 'new' | null>(null);
  const [rules, setRules] = useState<Mailbox | null>(null);
  const [secret, setSecret] = useState<WebhookSecret | null>(null);
  const [original, setOriginal] = useState<InboundEmailDetail | null>(null);
  const [domain, setDomain] = useState('');
  const { busy, error, run } = useRun();
  return (
    <DeskPage state={props.state} onRetry={undefined} what="the email set-up">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        {secret && <SecretBox secret={secret} onDone={() => setSecret(null)} />}
        <Card title="Mailboxes" actions={<Button size="sm" icon={Plus} onClick={() => setEdit('new')}>Add a mailbox</Button>}>
          {props.mailboxes.length === 0 ? (
            <EmptyState compact title="No mailboxes yet." description="Add an address and each email to it becomes a ticket on this desk." />
          ) : (
            <ul className="yx-ops-list" aria-label="Mailboxes">
              {props.mailboxes.map((m) => (
                <li key={m.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <span className="yx-ops-list__title">{m.address}</span>
                    <span className="yx-ops-list__sub">
                      {KIND_LABEL[m.kind]}
                      {m.displayName ? ` · sends as ${m.displayName}` : ''}
                      {m.autoAck ? ' · automatic reply on' : ''}
                      {m.lastPolledAt ? ` · last read ${when(m.lastPolledAt)}` : ''}
                    </span>
                    {m.lastError && <span className="yx-ops-list__sub">Last problem: {m.lastError}</span>}
                  </span>
                  <span className="yx-ops-row">
                    <Badge tone={m.status === 'active' ? 'success' : 'neutral'}>{m.status === 'active' ? 'Taking mail' : 'Paused'}</Badge>
                    <Button size="sm" aria-label={`Settings for ${m.address}`} onClick={() => setEdit(m)}>
                      Settings
                    </Button>
                    <Button size="sm" aria-label={`Rules for ${m.address}`} onClick={() => setRules(m)}>
                      Rules
                    </Button>
                    {(m.kind === 'hosted' || m.kind === 'forward') && (
                      <Button size="sm" aria-label={`New webhook address for ${m.address}`} loading={busy === `rot-${m.id}`} onClick={() => void run(`rot-${m.id}`, async () => setSecret(await props.onRotate(m)))}>
                        New webhook address
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Held mail" actions={<Segment label="Which mail" options={VERDICTS} value={props.verdict} onChange={props.onVerdict} />}>
          <p className="yx-ops-muted">Mail we did not turn into a ticket, and why. Let a held email through when you know the sender.</p>
          {props.inbound.length === 0 ? (
            <EmptyState compact title="Nothing here." />
          ) : (
            <ul className="yx-ops-list" aria-label="Held mail">
              {props.inbound.map((e) => (
                <li key={e.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <span className="yx-ops-list__title">
                      {e.fromName ? `${e.fromName} <${e.from}>` : e.from}
                      {e.subject ? ` · ${e.subject}` : ''}
                    </span>
                    <span className="yx-ops-list__sub">
                      {VERDICT_WORD[e.verdict]} · {when(e.receivedAt)}
                      {e.reason ? ` · ${e.reason}` : ''}
                      {e.released ? ' · let through' : ''}
                    </span>
                    <span className="yx-ops-list__sub">{checksText(e.checks)}</span>
                    {e.flags.length > 0 && (
                      <span className="yx-ops-row">
                        {e.flags.map((f) => (
                          <Badge key={f} tone="warning">
                            {FLAG_WORD[f] ?? f}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="yx-ops-row">
                    <Button size="sm" loading={busy === `orig-${e.id}`} onClick={() => void run(`orig-${e.id}`, async () => setOriginal(await props.onOpenOriginal(e.id)))}>
                      Show original
                    </Button>
                    {(e.verdict === 'held' || e.verdict === 'spam') && !e.released && (
                      <Button size="sm" loading={busy === `rel-${e.id}`} onClick={() => void run(`rel-${e.id}`, () => props.onRelease(e.id))}>
                        Let it through
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Sending from your own domain">
          <div className="yx-ops-stack">
            <p className="yx-ops-muted">Until all checks pass, desk email goes from YukthiX’s address with your desk name. Add these records at your domain provider, then check.</p>
            {props.domains.map((d) => (
              <div key={d.id} className="yx-ops-stack" data-gap="sm">
                <span className="yx-ops-row">
                  <strong>{d.domain}</strong>
                  <Badge tone={d.status === 'verified' ? 'success' : d.status === 'failed' ? 'danger' : 'neutral'}>{d.status === 'verified' ? 'All checks pass' : d.status === 'failed' ? 'Checks failed' : 'Waiting for checks'}</Badge>
                  {d.lastCheckedAt && <span className="yx-ops-muted">Checked {when(d.lastCheckedAt)}</span>}
                  <Button size="sm" aria-label={`Check now: ${d.domain}`} loading={busy === `dns-${d.id}`} onClick={() => void run(`dns-${d.id}`, () => props.onCheckDomain(d.id))}>
                    Check now
                  </Button>
                </span>
                <ol className="yx-ops-list" aria-label={`Records for ${d.domain}`}>
                  {d.records.map((r, i) => (
                    <li key={r.host} className="yx-ops-list__item">
                      <span className="yx-ops-list__main">
                        <span className="yx-ops-row">
                          <span className="yx-ops-list__title">
                            {i + 1}. {r.what} ({r.type})
                          </span>
                          <Badge tone={r.ok ? 'success' : 'warning'}>{r.ok ? 'Found' : 'Not found yet'}</Badge>
                        </span>
                        <CopyValue label={`Record ${i + 1} name`} value={r.host} />
                        <CopyValue label={`Record ${i + 1} value`} value={r.value} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <span className="yx-ops-row">
              <TextField size="sm" aria-label="Your domain" placeholder="Your domain" value={domain} onChange={setDomain} maxLength={253} />
              <Button size="sm" disabled={!domain.includes('.')} loading={busy === 'domain'} onClick={() => void run('domain', async () => { await props.onAddDomain(domain.trim().toLowerCase()); setDomain(''); })}>
                Add domain
              </Button>
            </span>
          </div>
        </Card>

        <Card title="Addresses we no longer email">
          <p className="yx-ops-muted">Mail to these bounced or was marked as spam, so we stopped. Remove one when it works again.</p>
          {props.bounces.length === 0 ? (
            <EmptyState compact title="Nobody is on the list." />
          ) : (
            <ul className="yx-ops-list" aria-label="Bounce list">
              {props.bounces.map((b) => (
                <li key={b.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    <span className="yx-ops-list__title">{b.address}</span>
                    <span className="yx-ops-list__sub">
                      {b.kind === 'bounce' ? 'Bounced' : 'Marked as spam'} · {when(b.createdAt)}
                      {b.reason ? ` · ${b.reason}` : ''}
                    </span>
                  </span>
                  <Button size="sm" aria-label={`Remove ${b.address} from list`} loading={busy === `b-${b.id}`} onClick={() => void run(`b-${b.id}`, () => props.onClearBounce(b.id))}>
                    Remove from list
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {edit && (
        <MailboxDrawer
          mailbox={edit === 'new' ? null : edit}
          detail={props.detail}
          domains={props.domains}
          onClose={() => setEdit(null)}
          onSave={async (input) => {
            if (edit === 'new') {
              const m = await props.onCreateMailbox(input);
              if (m.webhookUrl && m.signingSecret) setSecret({ webhookUrl: m.webhookUrl, signingSecret: m.signingSecret });
            } else await props.onUpdateMailbox(edit, input);
            setEdit(null);
          }}
        />
      )}
      {rules && <RulesDrawer mailbox={rules} detail={props.detail} onClose={() => setRules(null)} onLoad={props.onLoadRules} onSave={props.onSaveRule} onDelete={props.onDeleteRule} />}
      <Drawer open={Boolean(original)} onOpenChange={(o) => !o && setOriginal(null)} title={original?.subject ?? '(no subject)'} subtitle={original ? `From ${original.fromName ? `${original.fromName} <${original.from}>` : original.from} to ${original.to} · ${when(original.receivedAt)}` : undefined} size="lg" footer={<Button onClick={() => setOriginal(null)}>Close</Button>}>
        {original && (
          <div className="yx-ops-stack">
            <p className="yx-ops-muted">
              {VERDICT_WORD[original.verdict]}
              {original.reason ? `: ${original.reason}` : ''}. Shown as plain text: links and pictures do not open here.
            </p>
            <pre className="yx-desk-plain" aria-label="Email text">
              {original.text}
            </pre>
            {original.files.length > 0 && <p>Files: {original.files.join(', ')}</p>}
          </div>
        )}
      </Drawer>
    </DeskPage>
  );
}

/** The sender checks in words. */
export function checksText(c: InboundEmail['checks']): string {
  if (!c) return 'No sender checks.';
  const yes = (b?: boolean) => (b ? 'yes' : 'no');
  return `Sender proven: ${yes(c.verified)} · Signed by their domain: ${yes(c.signed)} · Server allowed (SPF): ${c.spf ?? 'none'} · Domain policy (DMARC): ${c.dmarc ?? 'none'}`;
}

function MailboxDrawer({ mailbox, detail, domains, onClose, onSave }: { mailbox: Mailbox | null; detail: DeskDetail; domains: SendingDomain[]; onClose: () => void; onSave: (input: MailboxInput) => Promise<void> }) {
  const [address, setAddress] = useState(mailbox?.address ?? '');
  const [kind, setKind] = useState<MailboxKind | null>(mailbox?.kind ?? 'forward');
  const [name, setName] = useState(mailbox?.displayName ?? detail.desk.name);
  const [cred, setCred] = useState<Record<string, string>>({});
  const [autoAck, setAutoAck] = useState(mailbox?.autoAck ?? true);
  const [ack, setAck] = useState(mailbox?.ackText ?? 'Thanks, we have your email. Your ticket number is {{ticket.number}}. Reply to this email to add more.');
  const [categoryId, setCategoryId] = useState<string | null>(mailbox?.defaultCategoryId ?? null);
  const [typeId, setTypeId] = useState<string | null>(mailbox?.defaultTypeId ?? null);
  const [domainId, setDomainId] = useState<string | null>(mailbox?.sendingDomainId ?? null);
  const [forwarders, setForwarders] = useState((mailbox?.trustedForwarders ?? []).join(', '));
  const [status, setStatus] = useState(mailbox?.status ?? 'active');
  const { busy, error, run } = useRun();
  const fields = kind ? (CREDENTIALS[kind] ?? []) : [];
  const credsFilled = fields.every((f) => cred[f.key]?.trim());
  const credsTouched = fields.some((f) => cred[f.key]?.trim());
  const ready = Boolean(kind && address.includes('@') && (mailbox ? !credsTouched || credsFilled : credsFilled));
  const save = () =>
    run('save', () =>
      onSave({
        ...(mailbox ? { status } : { address: address.trim().toLowerCase(), kind: kind! }),
        displayName: name.trim() || undefined,
        autoAck,
        ackText: ack.trim(),
        defaultCategoryId: categoryId,
        defaultTypeId: typeId,
        sendingDomainId: domainId,
        trustedForwarders: list(forwarders),
        ...(credsTouched ? { config: Object.fromEntries(fields.map((f) => [f.key, f.number ? Number(cred[f.key]) : cred[f.key].trim()])) } : {}),
      }),
    );
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={mailbox ? `Settings for ${mailbox.address}` : 'Add a mailbox'}
      subtitle="Each email to this address becomes a ticket on this desk; replies to it join the same ticket."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Mail} disabled={!ready} loading={busy === 'save'} onClick={() => void save()}>
            {mailbox ? 'Save mailbox' : 'Add mailbox'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The mailbox was not saved">{error}</InlineAlert>}
        {!mailbox && (
          <>
            <FormField label="How mail reaches us" required helper={kind ? KIND_HELP[kind] : undefined}>
              <Select value={kind} onChange={setKind} options={(Object.keys(KIND_LABEL) as MailboxKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            </FormField>
            <FormField label="Email address" required>
              <TextField type="email" value={address} onChange={setAddress} maxLength={254} placeholder="support@yourcompany.com" />
            </FormField>
          </>
        )}
        {fields.length > 0 && (
          <>
            {mailbox && <p className="yx-ops-muted">Sign-in details are kept locked and never shown. Fill these in only to change them.</p>}
            {fields.map((f) =>
              f.secret ? (
                <FormField key={f.key} label={f.label} required={!mailbox}>
                  <PasswordField value={cred[f.key] ?? ''} onChange={(v) => setCred((c) => ({ ...c, [f.key]: v }))} autoComplete="new-password" />
                </FormField>
              ) : f.number ? (
                <FormField key={f.key} label={f.label} required={!mailbox}>
                  <NumberField value={cred[f.key] ? Number(cred[f.key]) : null} onChange={(v) => setCred((c) => ({ ...c, [f.key]: v === null ? '' : String(v) }))} min={1} max={65535} />
                </FormField>
              ) : (
                <FormField key={f.key} label={f.label} required={!mailbox}>
                  <TextField value={cred[f.key] ?? ''} onChange={(v) => setCred((c) => ({ ...c, [f.key]: v }))} maxLength={254} />
                </FormField>
              ),
            )}
            <p className="yx-ops-muted">Saving sign-in details asks you to confirm it is you first.</p>
          </>
        )}
        <FormField label="Name people see on our replies">
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <Checkbox checked={autoAck} onChange={setAutoAck} label="Send an automatic reply" description="Tells the sender we have their email and gives the ticket number." />
        {autoAck && (
          <FormField label="Automatic reply words" helper="{{ticket.number}} becomes the ticket number.">
            <TextArea value={ack} onChange={setAck} rows={4} maxLength={2000} />
          </FormField>
        )}
        <FormField label="Category for new tickets" optional>
          <Select value={categoryId} onChange={setCategoryId} clearable options={detail.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} placeholder="No category" />
        </FormField>
        <FormField label="Type for new tickets" optional>
          <Select value={typeId} onChange={setTypeId} clearable options={detail.types.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))} placeholder="The desk’s first type" />
        </FormField>
        <FormField label="Send replies from" helper="Your own domain once all its checks pass; until then YukthiX’s address with your desk name.">
          <Select value={domainId} onChange={setDomainId} clearable options={domains.map((d) => ({ value: d.id, label: d.domain, description: d.status === 'verified' ? 'All checks pass' : 'Checks not passed yet' }))} placeholder="YukthiX’s address" />
        </FormField>
        <FormField label="Trusted forwarders" optional helper="Domains that may pass mail on to this address for someone else, separated by commas.">
          <TextField value={forwarders} onChange={setForwarders} maxLength={1000} />
        </FormField>
        {mailbox && (
          <FormField label="Mailbox">
            <Segment label="Mailbox" options={[{ value: 'active', label: 'Taking mail' }, { value: 'paused', label: 'Paused' }]} value={status} onChange={setStatus} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

function ruleText(r: MailRuleInput, detail: DeskDetail): string {
  const v = r.actionValue ?? {};
  const then =
    r.action === 'route' ? `send to ${detail.categories.find((c) => c.id === v.categoryId)?.name ?? 'a category'}` : r.action === 'tag' ? `add the tag ${v.tag}` : r.action === 'priority' ? `set ${PRIORITY_LABEL[v.priority ?? 3]}` : r.action === 'parse_field' ? `save the value after “${v.key}” as ${v.field}` : ACTION_LABEL[r.action].toLowerCase();
  return `If ${r.field === 'header' ? `header ${r.headerName}` : FIELD_LABEL[r.field].toLowerCase()} ${OP_LABEL[r.op].toLowerCase()} “${r.value}”, ${then}${r.stop ? ', then stop' : ''}.`;
}

function RulesDrawer({ mailbox, detail, onClose, onLoad, onSave, onDelete }: { mailbox: Mailbox; detail: DeskDetail; onClose: () => void; onLoad: EmailSetupProps['onLoadRules']; onSave: EmailSetupProps['onSaveRule']; onDelete: EmailSetupProps['onDeleteRule'] }) {
  const [rules, setRules] = useState<MailRule[] | null>(null);
  const [edit, setEdit] = useState<MailRule | 'new' | null>(null);
  const { busy, error, run } = useRun();
  const reload = () => run('load', async () => setRules(await onLoad(mailbox)));
  useEffect(() => {
    void reload();
  }, [mailbox.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={`Rules for ${mailbox.address}`} subtitle="Rules run from the top on each new email. The first one that says stop ends the run." size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        {rules && rules.length === 0 && <EmptyState compact title="No rules yet." description="Without rules, every email becomes a ticket with the mailbox’s category." />}
        {rules && rules.length > 0 && (
          <ul className="yx-ops-list" aria-label="Rules">
            {rules.map((r) => (
              <li key={r.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">
                    {r.name}
                    {r.active === false ? ' · off' : ''}
                  </span>
                  <span className="yx-ops-list__sub">{ruleText(r, detail)}</span>
                </span>
                <span className="yx-ops-row">
                  <Button size="sm" aria-label={`Edit rule ${r.name}`} onClick={() => setEdit(r)}>
                    Edit
                  </Button>
                  <Button size="sm" aria-label={`Delete rule ${r.name}`} loading={busy === `del-${r.id}`} onClick={() => void run(`del-${r.id}`, async () => { await onDelete(mailbox, r.id); setRules(await onLoad(mailbox)); })}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {edit ? (
          <RuleForm
            key={edit === 'new' ? 'new' : edit.id}
            rule={edit === 'new' ? null : edit}
            detail={detail}
            onCancel={() => setEdit(null)}
            onSave={async (input) => {
              await onSave(mailbox, edit === 'new' ? null : edit.id, input);
              setEdit(null);
              setRules(await onLoad(mailbox));
            }}
          />
        ) : (
          <div className="yx-ops-row">
            <Button icon={Plus} onClick={() => setEdit('new')}>
              Add a rule
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function RuleForm({ rule, detail, onCancel, onSave }: { rule: MailRule | null; detail: DeskDetail; onCancel: () => void; onSave: (input: MailRuleInput) => Promise<void> }) {
  const [name, setName] = useState(rule?.name ?? '');
  const [field, setField] = useState<RuleField | null>(rule?.field ?? 'subject');
  const [headerName, setHeaderName] = useState(rule?.headerName ?? '');
  const [op, setOp] = useState<RuleOp>(rule?.op ?? 'contains');
  const [value, setValue] = useState(rule?.value ?? '');
  const [action, setAction] = useState<RuleAction | null>(rule?.action ?? 'route');
  const [categoryId, setCategoryId] = useState<string | null>(rule?.actionValue?.categoryId ?? null);
  const [tag, setTag] = useState(rule?.actionValue?.tag ?? '');
  const [priority, setPriority] = useState(rule?.actionValue?.priority ?? 2);
  const [key, setKey] = useState(rule?.actionValue?.key ?? '');
  const [saveAs, setSaveAs] = useState(rule?.actionValue?.field ?? '');
  const [stop, setStop] = useState(rule?.stop ?? false);
  const [active, setActive] = useState(rule?.active ?? true);
  const { busy, error, run } = useRun();
  const actionValue = action === 'route' ? (categoryId ? { categoryId } : null) : action === 'tag' ? (tag.trim() ? { tag: tag.trim().toLowerCase() } : null) : action === 'priority' ? { priority } : action === 'parse_field' ? (key.trim() && /^[a-z][a-z0-9_]{0,39}$/.test(saveAs) ? { key: key.trim(), field: saveAs } : null) : {};
  const ready = Boolean(name.trim() && field && action && value.trim() && actionValue && (field !== 'header' || /^[A-Za-z0-9-]{1,100}$/.test(headerName)));
  return (
    <Card title={rule ? `Edit ${rule.name}` : 'New rule'}>
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The rule was not saved">{error}</InlineAlert>}
        <FormField label="Rule name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="Look at" required>
          <Select value={field} onChange={setField} options={(Object.keys(FIELD_LABEL) as RuleField[]).map((f) => ({ value: f, label: FIELD_LABEL[f] }))} />
        </FormField>
        {field === 'header' && (
          <FormField label="Header name" required helper="Like X-Priority">
            <TextField value={headerName} onChange={setHeaderName} maxLength={100} />
          </FormField>
        )}
        <FormField label="Match">
          <Segment label="Match" options={(Object.keys(OP_LABEL) as RuleOp[]).map((o) => ({ value: o, label: OP_LABEL[o] }))} value={op} onChange={setOp} />
        </FormField>
        <FormField label="Words to match" required>
          <TextField value={value} onChange={setValue} maxLength={200} />
        </FormField>
        <FormField label="Then" required>
          <Select value={action} onChange={setAction} options={(Object.keys(ACTION_LABEL) as RuleAction[]).map((a) => ({ value: a, label: ACTION_LABEL[a] }))} />
        </FormField>
        {action === 'route' && (
          <FormField label="Category" required>
            <Select value={categoryId} onChange={setCategoryId} options={detail.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} />
          </FormField>
        )}
        {action === 'tag' && (
          <FormField label="Tag" required>
            <TextField value={tag} onChange={setTag} maxLength={40} />
          </FormField>
        )}
        {action === 'priority' && (
          <FormField label="Priority">
            <Segment label="Priority" options={[1, 2, 3, 4].map((p) => ({ value: p, label: `P${p}` }))} value={priority} onChange={setPriority} />
          </FormField>
        )}
        {action === 'parse_field' && (
          <>
            <FormField label="Words just before the value" required helper="Like “Order number:”">
              <TextField value={key} onChange={setKey} maxLength={100} />
            </FormField>
            <FormField label="Save it as" required helper="Small letters, digits and _ , like order_number">
              <TextField value={saveAs} onChange={setSaveAs} maxLength={40} />
            </FormField>
          </>
        )}
        <Checkbox checked={stop} onChange={setStop} label="Stop here" description="Rules below this one do not run when it matches." />
        <Checkbox checked={active} onChange={setActive} label="Rule is on" />
        <span className="yx-ops-row">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!ready} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ name: name.trim(), field: field!, ...(field === 'header' ? { headerName } : {}), op, value: value.trim(), action: action!, actionValue: actionValue ?? {}, stop, active }))}>
            Save rule
          </Button>
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- portals

const SIGN_UP: { value: PortalSignUp; label: string }[] = [
  { value: 'closed', label: 'Only people we add' },
  { value: 'allowed_domains', label: 'People from these email domains' },
  { value: 'open', label: 'Anyone' },
];

export interface PortalSetupProps {
  state: LoadState;
  portals: PortalView[];
  onSave: (portal: PortalView | null, input: PortalInput) => Promise<void>;
}

export function PortalTab(props: PortalSetupProps & { desks: DeskSummary[] }) {
  const [edit, setEdit] = useState<PortalView | 'new' | null>(null);
  const customerDesks = props.desks.filter((d) => d.audience === 'customer' && d.status === 'active');
  return (
    <DeskPage state={props.state} what="the help pages">
      <div className="yx-ops-stack">
        <p className="yx-ops-muted">A help page lets your customers sign in with an email code, follow their tickets and raise new ones. It is for Customer support desks only.</p>
        {props.portals.length === 0 ? (
          <EmptyState compact title="No help pages yet." />
        ) : (
          <ul className="yx-ops-list" aria-label="Help pages">
            {props.portals.map((p) => (
              <li key={p.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{p.name}</span>
                  <a className="yx-desk-link" href={p.address} target="_blank" rel="noopener noreferrer">
                    {p.address}
                  </a>
                  <span className="yx-ops-list__sub">
                    Who can sign in: {SIGN_UP.find((s) => s.value === p.signUp)?.label}
                    {p.openRequests ? ' · requests without an account' : ''}
                    {` · ${p.deskIds.length} desk${p.deskIds.length === 1 ? '' : 's'}`}
                  </span>
                </span>
                <span className="yx-ops-row">
                  <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status === 'active' ? 'On' : 'Off'}</Badge>
                  <Button size="sm" aria-label={`Edit ${p.name}`} onClick={() => setEdit(p)}>
                    Edit
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="yx-ops-row">
          <Button icon={Plus} disabled={!customerDesks.length} onClick={() => setEdit('new')}>
            New help page
          </Button>
          {!customerDesks.length && <span className="yx-ops-muted">Create a Customer support desk first.</span>}
        </div>
      </div>
      {edit && <PortalDrawer portal={edit === 'new' ? null : edit} desks={customerDesks} onClose={() => setEdit(null)} onSave={async (input) => { await props.onSave(edit === 'new' ? null : edit, input); setEdit(null); }} />}
    </DeskPage>
  );
}

function PortalDrawer({ portal, desks, onClose, onSave }: { portal: PortalView | null; desks: DeskSummary[]; onClose: () => void; onSave: (input: PortalInput) => Promise<void> }) {
  const [name, setName] = useState(portal?.name ?? '');
  const [slug, setSlug] = useState(portal?.slug ?? '');
  const [deskIds, setDeskIds] = useState<string[]>(portal?.deskIds ?? (desks.length === 1 ? [desks[0].id] : []));
  const [signUp, setSignUp] = useState<PortalSignUp>(portal?.signUp ?? 'closed');
  const [domains, setDomains] = useState((portal?.allowedDomains ?? []).join(', '));
  const [openRequests, setOpenRequests] = useState(portal?.openRequests ?? false);
  const [accent, setAccent] = useState(portal?.accentColour ?? '');
  const [title, setTitle] = useState(portal?.loginTitle ?? '');
  const [text, setText] = useState(portal?.loginText ?? '');
  const [aids, setAids] = useState(portal?.readingAids ?? true);
  const [status, setStatus] = useState<'active' | 'off'>(portal?.status ?? 'active');
  const { busy, error, run } = useRun();
  const slugOk = /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug);
  const accentOk = !accent || /^#[0-9a-fA-F]{6}$/.test(accent);
  const ready = Boolean(name.trim() && slugOk && deskIds.length && accentOk && (signUp !== 'allowed_domains' || list(domains).length));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={portal ? `Edit ${portal.name}` : 'New help page'}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={busy === 'save'}
            onClick={() =>
              void run('save', () =>
                onSave({ name: name.trim(), slug, deskIds, signUp, allowedDomains: signUp === 'allowed_domains' ? list(domains) : [], openRequests, ...(accent ? { accentColour: accent } : {}), loginTitle: title.trim(), loginText: text.trim(), readingAids: aids, status }),
              )
            }
          >
            Save help page
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The help page was not saved">{error}</InlineAlert>}
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} placeholder="Customer help" />
        </FormField>
        <FormField label="Web address part" required helper={`2 to 40 small letters, digits or dashes. The page lives at …/yx/portal/<company>/${slug || 'help'}`} error={slug && !slugOk ? 'Use small letters, digits and dashes' : null}>
          <TextField value={slug} onChange={(v) => setSlug(v.toLowerCase())} maxLength={40} />
        </FormField>
        <FormField label="Desks on this page" required helper="Customer support desks only.">
          <MultiSelect value={deskIds} onChange={setDeskIds} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose desks" />
        </FormField>
        <FormField label="Who can sign in">
          <Segment label="Who can sign in" options={SIGN_UP} value={signUp} onChange={setSignUp} />
        </FormField>
        {signUp === 'allowed_domains' && (
          <FormField label="Email domains" required helper="Separated by commas, like acme.com, acme.in">
            <TextField value={domains} onChange={setDomains} maxLength={1000} />
          </FormField>
        )}
        <Checkbox checked={openRequests} onChange={setOpenRequests} label="Let people send a request without an account" description="They confirm their email address by opening a link before the ticket is made." />
        <FormField label="Brand colour" optional helper="A web colour code: # and six letters or digits." error={accentOk ? null : 'Use # and six letters or digits'}>
          <TextField value={accent} onChange={setAccent} maxLength={7} />
        </FormField>
        <FormField label="Sign-in title" optional>
          <TextField value={title} onChange={setTitle} maxLength={100} placeholder="Get help from us" />
        </FormField>
        <FormField label="Sign-in words" optional>
          <TextArea value={text} onChange={setText} rows={3} maxLength={1000} />
        </FormField>
        <Checkbox checked={aids} onChange={setAids} label="Offer reading aids" description="Easy-read font, reading mask, larger text and a clear focus highlight." />
        <FormField label="Help page">
          <Segment label="Help page" options={[{ value: 'active', label: 'On' }, { value: 'off', label: 'Off' }]} value={status} onChange={setStatus} />
        </FormField>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------- banners

const SEVERITY_LABEL: Record<BannerSeverity, string> = { info: 'Info', warning: 'Warning', outage: 'Outage' };
const AUDIENCE_LABEL: Record<BannerAudience, string> = { everyone: 'Everyone', employees: 'Employees', customers: 'Customers' };
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export interface BannerSetupProps {
  state: LoadState;
  banners: Banner[];
  /** The desk's open tickets a banner may point at. */
  openTickets: { id: string; number: string; subject: string }[];
  onSave: (banner: Banner | null, input: BannerInput) => Promise<void>;
  onEnd: (banner: Banner) => Promise<void>;
}

export function BannersTab(props: BannerSetupProps) {
  const [edit, setEdit] = useState<Banner | 'new' | null>(null);
  const { busy, error, run } = useRun();
  return (
    <DeskPage state={props.state} what="the banners">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        <p className="yx-ops-muted">A banner tells people about a known issue at the top of their help page. Linked to a ticket, people press “Me too” to follow it instead of raising a new one.</p>
        {props.banners.length === 0 ? (
          <EmptyState compact title="No banners." />
        ) : (
          <ul className="yx-ops-list" aria-label="Banners">
            {props.banners.map((b) => (
              <li key={b.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{b.text}</span>
                  <span className="yx-ops-list__sub">
                    {SEVERITY_LABEL[b.severity]} · for {AUDIENCE_LABEL[b.audience].toLowerCase()} · {b.meToo} {b.meToo === 1 ? 'person' : 'people'} said me too
                    {b.ticket ? ` · linked to ${b.ticket.number} (${STATE_LABEL[b.ticket.systemState]})` : ''}
                    {b.endedAt ? ` · ended ${when(b.endedAt)}` : b.endsAt ? ` · ends ${when(b.endsAt)}` : ''}
                    {!b.live && !b.endedAt && b.startsAt ? ` · starts ${when(b.startsAt)}` : ''}
                  </span>
                </span>
                <span className="yx-ops-row">
                  <Badge tone={b.live ? (b.severity === 'outage' ? 'danger' : 'warning') : 'neutral'}>{b.live ? 'Showing' : b.endedAt ? 'Ended' : 'Not showing'}</Badge>
                  {!b.endedAt && (
                    <>
                      <Button size="sm" aria-label={`Edit banner: ${b.text}`} onClick={() => setEdit(b)}>
                        Edit
                      </Button>
                      <Button size="sm" aria-label={`End banner: ${b.text}`} loading={busy === `end-${b.id}`} onClick={() => void run(`end-${b.id}`, () => props.onEnd(b))}>
                        End now
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="yx-ops-row">
          <Button icon={Plus} onClick={() => setEdit('new')}>
            Post a banner
          </Button>
        </div>
      </div>
      {edit && <BannerDrawer banner={edit === 'new' ? null : edit} openTickets={props.openTickets} onClose={() => setEdit(null)} onSave={async (input) => { await props.onSave(edit === 'new' ? null : edit, input); setEdit(null); }} />}
    </DeskPage>
  );
}

function BannerDrawer({ banner, openTickets, onClose, onSave }: { banner: Banner | null; openTickets: BannerSetupProps['openTickets']; onClose: () => void; onSave: (input: BannerInput) => Promise<void> }) {
  const [text, setText] = useState(banner?.text ?? '');
  const [severity, setSeverity] = useState<BannerSeverity>(banner?.severity ?? 'warning');
  const [audience, setAudience] = useState<BannerAudience>(banner?.audience ?? 'everyone');
  const [ticketId, setTicketId] = useState<string | null>(banner?.ticketId ?? null);
  const [starts, setStarts] = useState(toLocal(banner?.startsAt ?? null));
  const [ends, setEnds] = useState(toLocal(banner?.endsAt ?? null));
  const { busy, error, run } = useRun();
  const tickets = banner?.ticket && !openTickets.some((t) => t.id === banner.ticket!.id) ? [...openTickets, { id: banner.ticket.id, number: banner.ticket.number, subject: '' }] : openTickets;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={banner ? 'Edit banner' : 'Post a banner'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!text.trim() || Boolean(starts && ends && ends <= starts)} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ text: text.trim(), severity, audience, ticketId, startsAt: fromLocal(starts), endsAt: fromLocal(ends) }))}>
            {banner ? 'Save banner' : 'Post banner'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The banner was not saved">{error}</InlineAlert>}
        <FormField label="What people see" required helper="Say what is wrong and what to do, in one or two lines.">
          <TextArea value={text} onChange={setText} rows={3} maxLength={300} />
        </FormField>
        <FormField label="How serious">
          <Segment label="How serious" options={(Object.keys(SEVERITY_LABEL) as BannerSeverity[]).map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} value={severity} onChange={setSeverity} />
        </FormField>
        <FormField label="Who sees it">
          <Segment label="Who sees it" options={(Object.keys(AUDIENCE_LABEL) as BannerAudience[]).map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))} value={audience} onChange={setAudience} />
        </FormField>
        <FormField label="Linked ticket" optional helper="People who press “Me too” follow this ticket. Type its number to find it.">
          <Select value={ticketId} onChange={setTicketId} clearable searchable options={tickets.map((t) => ({ value: t.id, label: t.subject ? `${t.number} · ${t.subject}` : t.number }))} placeholder="No ticket" />
        </FormField>
        <FormField label="Show from" optional helper="Empty: from now.">
          <TextField type="datetime-local" value={starts} onChange={setStarts} />
        </FormField>
        <FormField label="Show until" optional helper="Empty: until you end it." error={starts && ends && ends <= starts ? 'Pick a time after the start' : null}>
          <TextField type="datetime-local" value={ends} onChange={setEnds} />
        </FormField>
      </div>
    </Drawer>
  );
}

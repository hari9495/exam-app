import { useMemo, useState } from 'react';
import { Badge, type BadgeTone } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FormField, FormSection } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, PasswordField, TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatPhone } from '../../lib/format';
import type { SmsAccount, SmsAccountInput, SmsDeliveryRow, SmsDeliveryStatus, SmsOverview, SmsProvider, SmsTemplate, SmsTemplateVariable, SmsTestResult } from './types';

/* ---------- words ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const monthName = (yyyyMm01: string) => {
  const [y, m] = yyyyMm01.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

const PROVIDERS: Record<SmsProvider, string> = { http: 'Any gateway (HTTP)', twilio: 'Twilio', dev: 'Development (never sends)' };
const STATUS: Record<SmsDeliveryStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Sending', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Not delivered', tone: 'danger' },
  fallback: { label: 'Not sent by SMS', tone: 'warning' },
  unknown: { label: 'Outcome unknown', tone: 'warning' },
  opted_out: { label: 'Opted out', tone: 'neutral' },
};
const REASONS: Record<string, string> = {
  no_channel_consent: 'No SMS opt-in for this number',
  no_sms_account: 'No SMS account to send from',
  no_approved_template: 'No approved DLT template',
  over_monthly_cap: 'Monthly SMS limit reached',
  all_providers_failed: 'Every gateway refused it',
};
const TEMPLATE_STATUS: Record<SmsTemplate['status'], { label: string; tone: BadgeTone }> = {
  approved: { label: 'Template approved', tone: 'success' },
  pending: { label: 'Template pending', tone: 'warning' },
  rejected: { label: 'Template rejected', tone: 'danger' },
};
const VARIABLES: { value: SmsTemplateVariable; label: string }[] = [
  { value: 'code', label: 'The code' },
  { value: 'purpose', label: 'What the code is for' },
  { value: 'minutes', label: 'Minutes it is valid' },
  { value: 'app', label: 'YukthiX' },
];
const SECRET_KEYS = ['secrets', 'callbackSecret', 'authToken', 'authHeader'];

/** "Every gateway refused it. Kaveri DLT: gateway refused the message (HTTP 400)" from the API's "reason: detail". */
export function deliveryDetail(row: Pick<SmsDeliveryRow, 'status' | 'error'>): string | null {
  if (!row.error) return null;
  const [reason, ...rest] = row.error.split(': ');
  const detail = rest.join(': ');
  const label = REASONS[reason];
  if (label) return detail ? `${label}. ${detail}` : label;
  return row.error;
}

/** How many {#var#} the DLT text has. */
export const placeholderCount = (body: string) => body.split('{#var#}').length - 1;
/** {secret.x} names an http config uses. */
export const secretNames = (configText: string) => [...new Set([...configText.matchAll(/\{secret\.([A-Za-z0-9_-]{1,40})\}/g)].map((m) => m[1]))];

/** A random callback secret, made in the browser (the server never shows one). */
export function newCallbackSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ---------- editor ---------- */

interface Draft {
  name: string;
  provider: SmsProvider;
  sender: string;
  dltEntityId: string;
  priority: number | null;
  active: boolean;
  httpConfig: string;
  twilioSid: string;
  twilioFrom: string;
  secrets: Record<string, string>;
  template: SmsTemplate;
}

const EMPTY_TEMPLATE: SmsTemplate = { dltTemplateId: null, body: '', variables: [], status: 'pending' };

function draftOf(account: SmsAccount | null): Draft {
  const { secrets: _s, ...visible } = (account?.config ?? {}) as Record<string, unknown>;
  return {
    name: account?.name ?? '',
    provider: account?.provider ?? 'http',
    sender: account?.sender ?? '',
    dltEntityId: account?.dltEntityId ?? '',
    priority: account?.priority ?? 10,
    active: (account?.status ?? 'active') === 'active',
    httpConfig: account?.provider === 'http' ? JSON.stringify(visible, null, 2) : '',
    twilioSid: String(account?.config.accountSid ?? ''),
    twilioFrom: String(account?.config.from ?? ''),
    secrets: {},
    template: account?.otpTemplate ?? EMPTY_TEMPLATE,
  };
}

/** The request body, or the problems to fix first. Mirrors the API's own checks; the API checks again. */
export function accountInput(d: Draft, account: SmsAccount | null): { input: SmsAccountInput | null; errors: { fieldId: string; message: string }[] } {
  const errors: { fieldId: string; message: string }[] = [];
  const set = new Set(account?.secretsSet ?? []);
  if (!d.name.trim()) errors.push({ fieldId: 'sms-name', message: 'Enter a name' });
  if (d.sender && !/^\+?[A-Za-z0-9]{1,19}$/.test(d.sender)) errors.push({ fieldId: 'sms-sender', message: 'The sender is a DLT header like KAVERI or a number' });
  if (d.dltEntityId && !/^\d{1,30}$/.test(d.dltEntityId)) errors.push({ fieldId: 'sms-entity', message: 'The DLT entity id is digits only' });
  if (d.priority == null || d.priority < 0 || d.priority > 1000) errors.push({ fieldId: 'sms-priority', message: 'Priority must be between 0 and 1000' });

  let config: Record<string, unknown> = {};
  if (d.provider === 'http') {
    try {
      const parsed = JSON.parse(d.httpConfig || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      config = parsed;
      const smuggled = Object.keys(config).find((k) => SECRET_KEYS.includes(k));
      if (smuggled) errors.push({ fieldId: 'sms-http', message: `Remove ${smuggled} from the settings and type it under Secrets` });
      if (typeof config.url !== 'string' || !config.url.startsWith('https://')) errors.push({ fieldId: 'sms-http', message: 'The settings need a "url" starting with https://' });
    } catch {
      errors.push({ fieldId: 'sms-http', message: 'The gateway settings are not valid JSON' });
    }
    for (const name of secretNames(d.httpConfig)) {
      if (!set.has(`secret.${name}`) && !d.secrets[name]) errors.push({ fieldId: `sms-secret-${name}`, message: `Type the value of ${name}` });
    }
  } else if (d.provider === 'twilio') {
    config = { accountSid: d.twilioSid.trim(), from: d.twilioFrom.trim() };
    if (!d.twilioSid.trim()) errors.push({ fieldId: 'sms-twilio-sid', message: 'Enter the Account SID' });
    if (!d.twilioFrom.trim()) errors.push({ fieldId: 'sms-twilio-from', message: 'Enter the sending number' });
    if (!set.has('authToken') && !d.secrets.authToken) errors.push({ fieldId: 'sms-secret-authToken', message: 'Type the auth token' });
  }

  const t = d.template;
  if (!t.body.trim()) errors.push({ fieldId: 'sms-template', message: 'Paste the DLT-registered text' });
  else if (placeholderCount(t.body) !== t.variables.length) errors.push({ fieldId: 'sms-template', message: 'Choose a value for each {#var#}' });
  if (t.body.trim() && t.variables.filter((v) => v === 'code').length !== 1) errors.push({ fieldId: 'sms-template', message: 'The code must fill exactly one {#var#}' });
  if (d.dltEntityId && !t.dltTemplateId) errors.push({ fieldId: 'sms-template-id', message: 'Enter the DLT template id' });
  if (t.dltTemplateId && !/^\d{1,30}$/.test(t.dltTemplateId)) errors.push({ fieldId: 'sms-template-id', message: 'The DLT template id is digits only' });

  if (errors.length) return { input: null, errors };
  const secrets = Object.fromEntries(Object.entries(d.secrets).filter(([, v]) => v !== ''));
  return {
    input: {
      name: d.name.trim(),
      provider: d.provider,
      sender: d.sender || null,
      dltEntityId: d.dltEntityId || null,
      priority: d.priority!,
      status: d.active ? 'active' : 'disabled',
      config,
      secrets,
      otpTemplate: { ...t, dltTemplateId: t.dltTemplateId || null },
    },
    errors,
  };
}

function SecretField({ id, label, name, set, value, onChange, helper }: { id: string; label: string; name: string; set: boolean; value: string; onChange: (v: string) => void; helper?: string }) {
  return (
    <FormField id={id} label={label} required={!set} helper={set ? 'Saved. It is never shown again; type a new value to replace it.' : helper}>
      <PasswordField value={value} onChange={onChange} autoComplete="new-password" placeholder={set ? '••••••••' : undefined} aria-label={label} name={name} />
    </FormField>
  );
}

interface EditorProps {
  account: SmsAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowDevProvider?: boolean;
  examplesHref?: string;
  onSave: (input: SmsAccountInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function SmsAccountEditor({ account, open, onOpenChange, allowDevProvider, examplesHref, onSave, onDelete }: EditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(account));
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' } | { kind: 'failed'; message: string }>({ kind: 'idle' });
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setTemplate = (patch: Partial<SmsTemplate>) => {
    const next = { ...draft.template, ...patch };
    const count = placeholderCount(next.body);
    // Keep one variable per {#var#}: the code first, then what it is for, then minutes.
    const defaults: SmsTemplateVariable[] = ['code', 'purpose', 'minutes', 'app'];
    next.variables = Array.from({ length: count }, (_, i) => next.variables[i] ?? defaults[Math.min(i, defaults.length - 1)]);
    set({ template: next });
  };
  const secretsSet = new Set(account?.secretsSet ?? []);
  const { input, errors } = accountInput(draft, account);
  const errorOf = (id: string) => (showErrors ? errors.find((e) => e.fieldId === id)?.message : undefined);
  const providers = (['http', 'twilio', ...(allowDevProvider || account?.provider === 'dev' ? ['dev'] : [])] as SmsProvider[]).map((p) => ({ value: p, label: p === 'http' ? 'Any gateway' : p === 'twilio' ? 'Twilio' : 'Development' }));

  const save = async () => {
    if (!input) return setShowErrors(true);
    setStatus({ kind: 'saving' });
    try {
      await onSave(input);
      setStatus({ kind: 'idle' });
      setDirty(false);
      onOpenChange(false);
    } catch (err) {
      setStatus({ kind: 'failed', message: err instanceof Error && err.message ? err.message : 'We couldn’t save. Nothing has changed.' });
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      dirty={dirty}
      title={account ? `Edit ${account.name}` : 'Add SMS account'}
      subtitle={account ? PROVIDERS[account.provider] : 'Your own gateway account, with your DLT registration'}
      footer={
        <>
          {account && onDelete && (
            <ConfirmDialog
              trigger={<Button variant="danger">Delete account</Button>}
              title={`Delete ${account.name}?`}
              consequence="Texts stop going through this account at once. Its delivery log stays. You confirm it’s you first."
              confirmLabel="Delete account"
              destructive
              onConfirm={async () => {
                await onDelete();
                onOpenChange(false);
              }}
            />
          )}
          <Button onClick={() => onOpenChange(false)} disabled={status.kind === 'saving'}>Cancel</Button>
          <Button variant="primary" loading={status.kind === 'saving'} onClick={() => void save()}>
            {account ? 'Save changes' : 'Add account'}
          </Button>
        </>
      }
    >
      <form className="yx-ntf__editor" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <InlineAlert tone="info">Secrets are saved encrypted and never shown again. You confirm it’s you before saving.</InlineAlert>
        {showErrors && errors.length > 0 && <ErrorSummary errors={errors} />}

        <FormSection title="Account">
          <FormField id="sms-name" label="Name" required error={errorOf('sms-name')}>
            <TextField value={draft.name} onChange={(name) => set({ name })} maxLength={100} placeholder="Kaveri DLT gateway" />
          </FormField>
          {!account && (
            <FormField label="Gateway">
              <Segment label="Gateway" options={providers} value={draft.provider} onChange={(provider) => set({ provider })} />
            </FormField>
          )}
          <FormField id="sms-sender" label="Sender" error={errorOf('sms-sender')} helper="Your DLT sender header (6 letters, such as KAVERI), or a sending number.">
            <TextField value={draft.sender} onChange={(sender) => set({ sender: sender.trim() })} maxLength={20} />
          </FormField>
          <FormField id="sms-entity" label="DLT entity id" error={errorOf('sms-entity')} helper="From your DLT registration. Leave empty outside India.">
            <TextField value={draft.dltEntityId} onChange={(dltEntityId) => set({ dltEntityId: dltEntityId.trim() })} inputMode="numeric" maxLength={30} />
          </FormField>
          <FormField id="sms-priority" label="Priority" error={errorOf('sms-priority')} helper="Lower numbers are tried first. If an account refuses a message, the next one is tried.">
            <NumberField value={draft.priority} onChange={(priority) => set({ priority })} min={0} max={1000} />
          </FormField>
          <Checkbox label="Send through this account" description="Turn off to stop using it without deleting it." checked={draft.active} onChange={(active) => set({ active })} />
        </FormSection>

        {draft.provider === 'http' && (
          <FormSection
            title="Gateway settings"
            description={
              <>
                URL, body template, answer and delivery-report mapping, as JSON.{' '}
                {examplesHref && <a href={examplesHref} target="_blank" rel="noreferrer">Examples for MSG91, Gupshup, Kaleyra, Exotel and Textlocal</a>}
              </>
            }
          >
            <FormField id="sms-http" label="Settings (JSON)" required error={errorOf('sms-http')} helper="Put API keys in {secret.name} placeholders, never in the text itself.">
              <TextArea value={draft.httpConfig} onChange={(httpConfig) => set({ httpConfig })} rows={12} spellCheck={false} className="yx-ntf__code" />
            </FormField>
            {secretNames(draft.httpConfig).map((name) => (
              <SecretField
                key={name}
                id={`sms-secret-${name}`}
                label={`Secret: ${name}`}
                name={name}
                set={secretsSet.has(`secret.${name}`)}
                value={draft.secrets[name] ?? ''}
                onChange={(v) => set({ secrets: { ...draft.secrets, [name]: v } })}
              />
            ))}
          </FormSection>
        )}

        {draft.provider === 'twilio' && (
          <FormSection title="Twilio">
            <FormField id="sms-twilio-sid" label="Account SID" required error={errorOf('sms-twilio-sid')}>
              <TextField value={draft.twilioSid} onChange={(twilioSid) => set({ twilioSid })} spellCheck={false} />
            </FormField>
            <FormField id="sms-twilio-from" label="Sending number" required error={errorOf('sms-twilio-from')}>
              <TextField value={draft.twilioFrom} onChange={(twilioFrom) => set({ twilioFrom })} placeholder="+1 555 010 0000" />
            </FormField>
            <SecretField id="sms-secret-authToken" label="Auth token" name="authToken" set={secretsSet.has('authToken')} value={draft.secrets.authToken ?? ''} onChange={(v) => set({ secrets: { ...draft.secrets, authToken: v } })} />
          </FormSection>
        )}

        <FormSection title="One-time-code template" description="The text exactly as registered on DLT, with {#var#} where values go. Codes are sent only with an approved template; otherwise they go by email where the sign-in allows it.">
          <FormField id="sms-template-id" label="DLT template id" error={errorOf('sms-template-id')} required={Boolean(draft.dltEntityId)}>
            <TextField value={draft.template.dltTemplateId ?? ''} onChange={(v) => setTemplate({ dltTemplateId: v.trim() || null })} inputMode="numeric" maxLength={30} />
          </FormField>
          <FormField id="sms-template" label="Registered text" required error={errorOf('sms-template')}>
            <TextArea value={draft.template.body} onChange={(body) => setTemplate({ body })} rows={3} maxLength={1000} placeholder="{#var#} is your Kaveri Foods sign-in code. Valid for {#var#} minutes. Do not share. -KAVERI" />
          </FormField>
          {draft.template.variables.map((v, i) => (
            <FormField key={i} label={`Value ${i + 1} of ${draft.template.variables.length}`}>
              <Select
                value={v}
                onChange={(value) => value && setTemplate({ variables: draft.template.variables.map((x, j) => (j === i ? value : x)) })}
                options={VARIABLES}
                aria-label={`Value ${i + 1}`}
              />
            </FormField>
          ))}
          <FormField label="DLT approval">
            <Segment
              label="DLT approval"
              options={[{ value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }, { value: 'rejected', label: 'Rejected' }]}
              value={draft.template.status}
              onChange={(status) => setTemplate({ status })}
            />
          </FormField>
        </FormSection>

        {draft.provider !== 'dev' && (
          <FormSection title="Delivery reports" description="The gateway posts delivery reports and opt-outs here. Each report must carry this account’s callback secret.">
            {account ? (
              <FormField label="Callback URL" helper="Copy it into the gateway’s delivery-report (DLR) settings.">
                <TextField value={account.callbackUrl} readOnly spellCheck={false} />
              </FormField>
            ) : (
              <Text as="p" tone="secondary" size="sm">The callback URL appears here once the account is saved.</Text>
            )}
            <SecretField
              id="sms-secret-callbackSecret"
              label="Callback secret"
              name="callbackSecret"
              set={secretsSet.has('callbackSecret')}
              value={draft.secrets.callbackSecret ?? ''}
              onChange={(v) => set({ secrets: { ...draft.secrets, callbackSecret: v } })}
              helper="At least 16 characters. Without one, delivery reports are refused."
            />
            <div>
              <Button size="sm" onClick={() => set({ secrets: { ...draft.secrets, callbackSecret: newCallbackSecret() } })}>Generate a secret</Button>
            </div>
          </FormSection>
        )}

        {status.kind === 'failed' && <InlineAlert tone="danger" title="Not saved">{status.message}</InlineAlert>}
      </form>
    </Drawer>
  );
}

/* ---------- screen ---------- */

export interface SmsSettingsScreenProps {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  overview: SmsOverview | null;
  deliveries: SmsDeliveryRow[];
  deliveriesState: 'ready' | 'loading' | 'error';
  onRetryDeliveries?: () => void;
  hasMoreDeliveries: boolean;
  onLoadMoreDeliveries: () => void;
  /** The viewer's own verified mobile number, masked; test messages go only there. */
  myMobile: string | null;
  /** Where the viewer verifies their number (My security). */
  myMobileHref: string;
  /** Offer the development provider (local environments only). */
  allowDevProvider?: boolean;
  /** Example gateway configs. */
  examplesHref?: string;
  onSavePolicy: (changes: { useSharedAccount?: boolean; monthlyCap?: number | null }) => Promise<void>;
  /** id null = a new account. The host asks the person to confirm it's them (step-up). */
  onSaveAccount: (id: string | null, input: SmsAccountInput) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onTestAccount: (id: string) => Promise<SmsTestResult>;
}

/** Settings › Notifications › SMS (P04 §7): how texts are sent, this month’s use, accounts, and the delivery log. */
export function SmsSettingsScreen(props: SmsSettingsScreenProps) {
  const platform = props.overview?.scope === 'platform';
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Security' }, { label: 'Text messages (SMS)' }]} />}
        title={platform ? 'YukthiX shared SMS account' : 'Text messages (SMS)'}
        description={platform ? 'The account companies use unless they add their own.' : 'One-time codes by text: which account sends them, your monthly limit and what was sent.'}
      />
      {props.state === 'loading' && (
        <div className="yx-auth__stack" aria-busy="true">
          <Skeleton height={120} />
          <Skeleton height={200} />
        </div>
      )}
      {props.state === 'error' && <ErrorState title="We couldn't load the SMS settings." description="Nothing has changed. Try again in a moment." onRetry={props.onRetry} />}
      {props.state === 'no-access' && <NoAccessState grantedBy="a System Admin" what="the SMS settings" />}
      {props.state === 'ready' && props.overview && <SmsSettings {...props} overview={props.overview} />}
    </div>
  );
}

function PolicyForm({ overview, onSave }: { overview: SmsOverview; onSave: SmsSettingsScreenProps['onSavePolicy'] }) {
  const saved = overview.policy!;
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'failed'; message: string }>({ kind: 'idle' });
  const changes = useMemo(() => ({
    ...(draft.useSharedAccount !== saved.useSharedAccount ? { useSharedAccount: draft.useSharedAccount } : {}),
    ...(draft.monthlyCap !== saved.monthlyCap ? { monthlyCap: draft.monthlyCap } : {}),
  }), [draft, saved]);
  const dirty = Object.keys(changes).length > 0;
  const own = overview.accounts.filter((a) => a.status === 'active').length;
  const save = async () => {
    setStatus({ kind: 'saving' });
    try {
      await onSave(changes);
      setStatus({ kind: 'saved' });
    } catch (err) {
      setStatus({ kind: 'failed', message: err instanceof Error && err.message ? err.message : 'We couldn’t save. Nothing has changed.' });
    }
  };
  const usage = overview.usage!;
  return (
    <form className="yx-auth__settings" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <FormSection title={`This month (${monthName(usage.month)})`}>
        {usage.cap != null ? (
          <Meter label="Texts sent this month" value={usage.sent} max={Math.max(usage.cap, 1)} valueText={`${usage.sent} of ${usage.cap}`} />
        ) : (
          <Text as="p">{usage.sent === 1 ? '1 text sent' : `${usage.sent} texts sent`}. No monthly limit.</Text>
        )}
        {usage.cap != null && usage.sent >= usage.cap && (
          <InlineAlert tone="warning" title="Monthly limit reached">Codes go by email where the sign-in allows it, until next month or until you raise the limit.</InlineAlert>
        )}
      </FormSection>
      <FormSection title="Sending">
        <Checkbox
          label="Use the YukthiX shared account"
          description={own ? 'Tried after your own accounts, when they can’t send.' : 'Your texts go through YukthiX’s registered sender.'}
          checked={draft.useSharedAccount}
          onChange={(useSharedAccount) => {
            setDraft((d) => ({ ...d, useSharedAccount }));
            setStatus({ kind: 'idle' });
          }}
        />
        {!draft.useSharedAccount && own === 0 && (
          <InlineAlert tone="warning" title="No texts will be sent">Add an account of your own, or use the YukthiX account. Until then, sign-in codes go by email where you allow email codes.</InlineAlert>
        )}
        <FormField id="sms-cap" label="Monthly limit" helper="Empty means no limit. Over the limit, codes go by email and your admins are emailed once.">
          <NumberField
            value={draft.monthlyCap}
            onChange={(monthlyCap) => {
              setDraft((d) => ({ ...d, monthlyCap }));
              setStatus({ kind: 'idle' });
            }}
            min={0}
            max={10_000_000}
            suffix="texts"
            placeholder="No limit"
          />
        </FormField>
      </FormSection>
      {status.kind === 'saved' && <InlineAlert tone="success">Saved.</InlineAlert>}
      {status.kind === 'failed' && <InlineAlert tone="danger" title="Not saved">{status.message}</InlineAlert>}
      <div className="yx-auth__row yx-auth__save">
        <Button type="submit" variant="primary" loading={status.kind === 'saving'} disabled={!dirty}>Save changes</Button>
        <Button onClick={() => { setDraft(saved); setStatus({ kind: 'idle' }); }} disabled={!dirty || status.kind === 'saving'}>Discard changes</Button>
      </div>
    </form>
  );
}

function SmsSettings(props: SmsSettingsScreenProps & { overview: SmsOverview }) {
  const { overview } = props;
  const [editing, setEditing] = useState<{ account: SmsAccount | null; key: number } | null>(null);
  const [tests, setTests] = useState<Record<string, { kind: 'sending' } | { kind: 'done'; result: SmsTestResult } | { kind: 'failed'; message: string }>>({});
  const test = async (account: SmsAccount) => {
    setTests((t) => ({ ...t, [account.id]: { kind: 'sending' } }));
    try {
      const result = await props.onTestAccount(account.id);
      setTests((t) => ({ ...t, [account.id]: { kind: 'done', result } }));
    } catch (err) {
      setTests((t) => ({ ...t, [account.id]: { kind: 'failed', message: err instanceof Error && err.message ? err.message : 'The test could not be sent.' } }));
    }
  };

  const accountColumns: TableColumn<SmsAccount>[] = [
    {
      key: 'name',
      header: 'Account',
      value: (a) => a.name,
      render: (a) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{a.name}</Text>
          <Text tone="secondary" size="sm">{PROVIDERS[a.provider]}{a.sender ? ` · ${a.sender}` : ''}</Text>
        </span>
      ),
      hideable: false,
    },
    { key: 'priority', header: 'Order', type: 'number', value: (a) => a.priority, width: 90 },
    {
      key: 'state',
      header: 'Status',
      value: (a) => a.status,
      render: (a) => (
        <span className="yx-auth__badges">
          <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status === 'active' ? 'On' : 'Off'}</Badge>
          {a.otpTemplate ? <Badge tone={TEMPLATE_STATUS[a.otpTemplate.status].tone}>{TEMPLATE_STATUS[a.otpTemplate.status].label}</Badge> : <Badge tone="warning">No template</Badge>}
        </span>
      ),
      width: 260,
    },
  ];
  const deliveryColumns: TableColumn<SmsDeliveryRow>[] = [
    { key: 'when', header: 'When', value: (r) => r.createdAt, render: (r) => when(r.createdAt), width: 190, hideable: false },
    { key: 'to', header: 'To', value: (r) => formatPhone(r.to), width: 150 },
    {
      key: 'status',
      header: 'Result',
      value: (r) => r.status,
      // The reason sits with the result (one fact), so phones show it too.
      render: (r) => {
        const detail = deliveryDetail(r) ?? (r.attempts > 1 ? `${r.attempts} tries` : null);
        return (
          <span className="yx-auth__item-main">
            <span><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></span>
            {detail && <Text tone="secondary" size="sm">{detail}</Text>}
          </span>
        );
      },
    },
    { key: 'account', header: 'Account', value: (r) => `${r.account ?? '—'}${r.kind === 'test' ? ' (test)' : ''}`, width: 200, optional: true },
  ];
  const testResults = overview.accounts.flatMap((a) => {
    const t = tests[a.id];
    if (!t || t.kind === 'sending') return [];
    if (t.kind === 'failed') return [<InlineAlert key={a.id} tone="danger" title={`Test from ${a.name} not sent`}>{t.message}</InlineAlert>];
    const { result } = t;
    if (result.status === 'sent') return [<InlineAlert key={a.id} tone="success" title={`Test sent from ${a.name} to ${result.to ? formatPhone(result.to) : 'your number'}`}>Check your phone. The delivery log below shows the gateway’s report when it arrives.</InlineAlert>];
    return [<InlineAlert key={a.id} tone="warning" title={`Test from ${a.name} not sent`}>{deliveryDetail({ status: 'fallback', error: result.error }) ?? 'The gateway did not confirm the message.'}</InlineAlert>];
  });

  return (
    <>
      {overview.scope === 'company' && <PolicyForm overview={overview} onSave={props.onSavePolicy} />}

      <section className="yx-auth__stack" aria-label={overview.scope === 'platform' ? 'Shared accounts' : 'Your accounts'}>
        <div className="yx-ntf__head">
          <span className="yx-auth__item-main">
            <Text as="p" weight="semibold">{overview.scope === 'platform' ? 'Shared accounts' : 'Your accounts'}</Text>
            <Text as="p" tone="secondary" size="sm">
              {overview.scope === 'platform' ? 'Tried in order after a company’s own accounts.' : 'Your own DLT registration. Tried in order, before the YukthiX account.'}
            </Text>
          </span>
          <Button onClick={() => setEditing({ account: null, key: Date.now() })}>Add account</Button>
        </div>
        {!props.myMobile && overview.accounts.length > 0 && (
          <InlineAlert tone="info" title="Send test is off" actions={<Button asChild size="sm"><a href={props.myMobileHref}>Verify my number</a></Button>}>
            Test messages go only to your own verified mobile number. Verify it in My security first.
          </InlineAlert>
        )}
        {testResults}
        <DataTable
          label={overview.scope === 'platform' ? 'Shared SMS accounts' : 'SMS accounts'}
          columns={accountColumns}
          rows={overview.accounts}
          getRowId={(a) => a.id}
          rowNoun={['account', 'accounts']}
          cardSummary
          empty={
            <EmptyState
              compact
              title={overview.scope === 'platform' ? 'No shared account yet.' : 'No accounts of your own.'}
              description={overview.scope === 'platform' ? 'Add the YukthiX DLT gateway account companies send through.' : overview.policy?.useSharedAccount ? 'Your texts go through the YukthiX account. Add one to use your own DLT sender.' : 'Add one to send texts with your own DLT sender.'}
              action={<Button onClick={() => setEditing({ account: null, key: Date.now() })}>Add account</Button>}
            />
          }
          rowButtons={(a) => (
            <>
              <Button size="sm" onClick={() => setEditing({ account: a, key: Date.now() })}>Edit</Button>
              <Button size="sm" disabled={!props.myMobile || a.status !== 'active'} loading={tests[a.id]?.kind === 'sending'} onClick={() => void test(a)} aria-label={`Send test from ${a.name}`}>
                Send test
              </Button>
            </>
          )}
        />
      </section>

      <section className="yx-auth__stack" aria-label="Delivery log">
        <span className="yx-auth__item-main">
          <Text as="p" weight="semibold">Delivery log</Text>
          <Text as="p" tone="secondary" size="sm">Every text, newest first. Numbers are masked.</Text>
        </span>
        <DataTable
          label="SMS delivery log"
          columns={deliveryColumns}
          rows={props.deliveries}
          getRowId={(r) => r.id}
          state={props.deliveriesState}
          onRetry={props.onRetryDeliveries}
          errorTitle="We couldn't load the delivery log."
          empty={<EmptyState compact title="No texts sent yet." description="Codes people ask for by SMS appear here." />}
          rowNoun={['text', 'texts']}
          cardSummary
        />
        {props.hasMoreDeliveries && (
          <div>
            <Button onClick={props.onLoadMoreDeliveries} loading={props.deliveriesState === 'loading'}>Show older</Button>
          </div>
        )}
      </section>

      {editing && (
        <SmsAccountEditor
          key={editing.key}
          account={editing.account}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          allowDevProvider={props.allowDevProvider}
          examplesHref={props.examplesHref}
          onSave={(input) => props.onSaveAccount(editing.account?.id ?? null, input)}
          onDelete={editing.account ? () => props.onDeleteAccount(editing.account!.id) : undefined}
        />
      )}
    </>
  );
}

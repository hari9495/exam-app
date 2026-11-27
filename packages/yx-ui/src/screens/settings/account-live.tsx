// Settings group 8 made live (S-9, answers 1328 and 1332). 8.1 Plan & add-ons, 8.2 Usage & caps and 8.3 Invoices &
// payment show what the company has, read only (no payment here: YukthiX staff set the plan and products). 8.5 Data
// export & closure: a System Admin starts a whole-company export (security key; the link works the platform's hours)
// and asks YukthiX to close the account (staff close it; the data is kept the platform's days). Drawn fields that are
// not built (add-ons, caps, top-ups, billing contacts, export formats, legal holds) are left out, never shown with
// sample values.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { FormField } from '../../components/field';
import { PasswordField, TextArea, TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import type { SettingDef, SettingsPageDef } from './settings-types';

type Meter = { used: number; limit: number | null };
/** GET /account/billing. */
export interface AccountBilling {
  plan: { name: string; priceLabel: string | null; billingInterval: string } | null;
  lifecycle: string;
  trialEndsAt: string | null;
  products: { code: string; name: string; since: string }[];
  usage: { seats: Meter; candidates: Meter; aiCredits: Meter; proctoringMinutes: Meter; periodStart: string };
  /** null: the invoices could not be read just now. */
  invoices: { number: string | null; status: string | null; amountPaid: number; currency: string; createdAt: string; invoicePdf: string | null }[] | null;
}
/** GET /account/data. */
export interface AccountData {
  companyName: string;
  linkHours: number;
  keepDays: number;
  exports: { id: string; by: string; at: string; expiresAt: string; open: boolean; sizeBytes: number; tables: number; rows: number; downloads: number }[];
  closure: { id: string; status: 'requested' | 'closed'; by: string; at: string; reason: string; keepUntil: string | null } | null;
}

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const size = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const num = (n: number) => n.toLocaleString('en-IN');
const money = (paise: number, currency: string) => `${currency.toUpperCase() === 'INR' ? '₹' : `${currency.toUpperCase()} `}${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const ASK = 'Set by YukthiX. To change your plan or add a product, use Talk to us.';

const pick = (design: SettingsPageDef, sections: { title: string; settings: SettingDef[] }[]): SettingsPageDef => ({
  ...design,
  note: undefined,
  sections: sections.filter((s) => s.settings.length).map((s) => ({ ...s, description: design.sections.find((d) => d.title === s.title)?.description })),
});
const list = (design: SettingsPageDef, key: string, over: Partial<SettingDef>): SettingDef => {
  const d = design.sections.flatMap((s) => s.settings).find((x) => x.key === key)!;
  return { ...d, readOnlyList: true, addLabel: undefined, starter: false, overrides: undefined, ...over };
};
const info = (key: string, label: string, value: string, locked: string): SettingDef => ({ key, label, kind: 'text', value, locked, scope: 'Company' });

/** 8.1: the plan and the products switched on. */
export function planPage(design: SettingsPageDef, b: AccountBilling): SettingsPageDef {
  const plan = b.plan ? [b.plan.name, b.plan.priceLabel, b.plan.billingInterval === 'year' ? 'billed yearly' : 'billed monthly'].filter(Boolean).join(' · ') : 'No plan yet';
  const trial = b.lifecycle === 'trial' && b.trialEndsAt ? [info('plan.trial', 'Trial', `Until ${day(b.trialEndsAt)}`, 'Partner add-ons, live bank files and filings are off during a trial.')] : [];
  return pick(design, [
    { title: 'Products', settings: [info('plan.current', 'Your plan', plan, ASK), ...trial, list(design, 'plan.products', { columns: ['Product', 'On since'], rows: b.products.map((p) => [p.name, day(p.since)]), helper: ASK })] },
  ]);
}

/** 8.2: this month's use against the plan's allowance. */
export function usagePage(design: SettingsPageDef, b: AccountBilling): SettingsPageDef {
  const row = (what: string, m: Meter, unit = '') => [what, `${num(m.used)}${unit}`, m.limit == null ? 'No limit' : `${num(m.limit)}${unit}`];
  const u = b.usage;
  return pick(design, [
    { title: 'Usage this month', settings: [list(design, 'usage.meters', { columns: ['What', 'Used', 'Allowance'], rows: [row('People who can sign in', u.seats), row('Candidates', u.candidates), row('AI credits', u.aiCredits), row('Proctoring', u.proctoringMinutes, ' min')], helper: `Since ${day(u.periodStart)}. ${ASK}` })] },
  ]);
}

/** 8.3: the invoices, read only (paid by bank transfer outside YukthiX). */
export function invoicesPage(design: SettingsPageDef, b: AccountBilling): SettingsPageDef {
  const helper = b.invoices === null ? 'Invoices could not be read just now. Try again later.' : 'Invoices are paid by bank transfer. For a copy or a correction, use Talk to us.';
  return pick(design, [
    { title: 'Invoices', settings: [list(design, 'invoice.list', { columns: ['Invoice', 'Date', 'Amount', 'Status'], rows: (b.invoices ?? []).map((i) => [i.number ?? '—', day(i.createdAt), money(i.amountPaid, i.currency), i.status === 'paid' ? 'Paid' : i.status === 'open' ? 'Due' : (i.status ?? '—')]), helper })] },
  ]);
}

/* ---------------- T2-G 45 (answer 2744): the scheduled export to the company's own storage ---------------- */

export type StorageKind = 's3' | 'azure_blob' | 'google_drive';
export type ExportFrequency = 'daily' | 'weekly' | 'monthly' | 'off';
/** GET /account/export-destination: never a secret. */
export interface ScheduledExport {
  frequency: ExportFrequency;
  destination: { kind: StorageKind; where: string; by: string; at: string; lastAttemptAt: string | null; lastSuccessAt: string | null; lastError: string | null } | null;
}
/** What the drawer sends: the storage, its secret, the zip password, and how often. */
export interface StorageInput {
  kind: StorageKind;
  bucket?: string;
  region?: string;
  accountName?: string;
  container?: string;
  prefix?: string;
  folderId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  accountKey?: string;
  clientEmail?: string;
  privateKey?: string;
  zipPassword: string;
}
export const STORAGE_LABEL: Record<StorageKind, string> = { s3: 'Amazon S3', azure_blob: 'Azure Blob', google_drive: 'Google Drive' };
const FREQ_LABEL: Record<ExportFrequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', off: 'Off' };

/** 8.5's section for the scheduled export: where it goes, how often, the last run, and the System Admin's actions. */
export function scheduledSettings(s: ScheduledExport, canAct: boolean): SettingDef[] {
  const d = s.destination;
  const last: SettingDef[] = d
    ? [
        {
          ...info('export.schedule.last', 'Last export', d.lastError ? `Not sent on ${when(d.lastAttemptAt!)}` : d.lastSuccessAt ? `Sent ${when(d.lastSuccessAt)}` : 'Not sent yet', d.lastError ?? 'Each export is listed in the export log.'),
          ...(d.lastError ? { status: { tone: 'warning' as const, text: 'Not sent' } } : d.lastSuccessAt ? { status: { tone: 'success' as const, text: 'Sent' } } : {}),
        },
      ]
    : [];
  return [
    info('export.schedule.where', 'Your storage', d ? `${STORAGE_LABEL[d.kind]} · ${d.where}` : 'Not connected', d ? `Connected by ${d.by} on ${day(d.at)}.` : 'Connect Amazon S3, Azure Blob or Google Drive to get the company data there on a schedule.'),
    info('export.schedule.frequency', 'How often', FREQ_LABEL[s.frequency], 'Every table as CSV, in a zip locked with your password. Weekly unless you change it.'),
    ...last,
    ...(canAct
      ? [
          { key: 'export.schedule.connect', label: d ? 'Change the storage or schedule' : 'Connect your storage', kind: 'link' as const, linkScreenId: 'ACC-STORAGE', linkLabel: d ? 'Change' : 'Connect storage', helper: 'Needs your security key. Keys are stored encrypted and never shown again.' },
          ...(d ? [{ key: 'export.schedule.send', label: 'Send an export now', kind: 'link' as const, linkScreenId: 'ACC-STORAGE-SEND', linkLabel: 'Send now' }] : []),
        ]
      : []),
  ];
}

const KIND_FIELDS: Record<StorageKind, { key: keyof StorageInput; label: string; helper?: string; secret?: boolean; long?: boolean; optional?: boolean }[]> = {
  s3: [
    { key: 'bucket', label: 'Bucket' },
    { key: 'region', label: 'Region', helper: 'For example ap-south-1.' },
    { key: 'prefix', label: 'Folder in the bucket', optional: true },
    { key: 'accessKeyId', label: 'Access key ID', helper: 'Of an IAM user that may only put files in this bucket.' },
    { key: 'secretAccessKey', label: 'Secret access key', secret: true },
  ],
  azure_blob: [
    { key: 'accountName', label: 'Storage account' },
    { key: 'container', label: 'Container' },
    { key: 'prefix', label: 'Folder in the container', optional: true },
    { key: 'accountKey', label: 'Account key', secret: true },
  ],
  google_drive: [
    { key: 'folderId', label: 'Shared drive folder ID', helper: 'Share the folder with the service account as Content manager.' },
    { key: 'clientEmail', label: 'Service account email' },
    { key: 'privateKey', label: 'Service account private key', secret: true, long: true },
  ],
};

/** Connect (or replace) the company's storage, with the zip password and how often. Every key is asked again. */
export function StorageDrawer({ current, onClose, onSave, onRemove }: { current: ScheduledExport; onClose: () => void; onSave: (input: StorageInput, frequency: ExportFrequency) => Promise<unknown>; onRemove?: () => Promise<unknown> }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<StorageKind>(current.destination?.kind ?? 's3');
  const [frequency, setFrequency] = useState<ExportFrequency>(current.frequency);
  const [v, setV] = useState<Partial<Record<keyof StorageInput, string>>>({});
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const fields = KIND_FIELDS[kind];
  const missing = (k: keyof StorageInput) => !(v[k] ?? '').trim();
  const bad: Record<string, string | null> = {
    ...Object.fromEntries(fields.map((f) => [f.key, !f.optional && missing(f.key) ? `Enter the ${f.label.toLowerCase()}.` : null])),
    zipPassword: (v.zipPassword ?? '').length < 12 ? 'Use at least 12 characters.' : null,
    confirm: confirm !== (v.zipPassword ?? '') ? 'The two passwords are not the same.' : null,
  };
  const save = () => {
    setTried(true);
    const miss = Object.entries(bad).find(([, m]) => m)?.[0];
    if (miss) return document.getElementById(`st-${miss}`)?.focus();
    setBusy(true);
    setFailed(null);
    const input = { kind, zipPassword: v.zipPassword!, ...Object.fromEntries(fields.map((f) => [f.key, (v[f.key] ?? '').trim()])) } as StorageInput;
    onSave(input, frequency)
      .then(() => (toast({ tone: 'success', title: `${STORAGE_LABEL[kind]} connected` }), onClose()))
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : 'It could not be saved. Try again.'))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={current.destination ? 'Change your storage' : 'Connect your storage'}
      subtitle="Scheduled company data export"
      dirty
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : <InlineAlert tone="info" title="Keep the zip password safe. YukthiX cannot show it again, and the files cannot be opened without it." />}
      footer={
        <>
          {current.destination && onRemove && (
            <ConfirmDialog
              trigger={<Button variant="danger">Disconnect</Button>}
              title="Disconnect your storage?"
              consequence="No more exports are sent. Files already sent stay in your storage."
              confirmLabel="Disconnect"
              destructive
              onConfirm={async () => {
                await onRemove();
                toast({ tone: 'success', title: 'Storage disconnected' });
                onClose();
              }}
            />
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-set-stack">
        <Segment<StorageKind> label="Storage" value={kind} onChange={(k) => (setKind(k), setTried(false))} options={(Object.keys(STORAGE_LABEL) as StorageKind[]).map((k) => ({ value: k, label: STORAGE_LABEL[k] }))} />
        {fields.map((f) => (
          <FormField key={`${kind}-${f.key}`} id={`st-${f.key}`} label={f.label} required={!f.optional} helper={f.helper} error={tried ? bad[f.key] : null}>
            {f.long ? <TextArea value={v[f.key] ?? ''} onChange={(x) => setV({ ...v, [f.key]: x })} rows={4} maxLength={5000} /> : f.secret ? <PasswordField value={v[f.key] ?? ''} onChange={(x) => setV({ ...v, [f.key]: x })} autoComplete="off" maxLength={200} /> : <TextField value={v[f.key] ?? ''} onChange={(x) => setV({ ...v, [f.key]: x })} maxLength={200} />}
          </FormField>
        ))}
        <Segment<ExportFrequency> label="How often" value={frequency} onChange={setFrequency} options={(Object.keys(FREQ_LABEL) as ExportFrequency[]).map((k) => ({ value: k, label: FREQ_LABEL[k] }))} />
        <FormField id="st-zipPassword" label="Zip password" required helper="12 characters or more. Opens the zip in 7-Zip, WinZip or any tool that reads AES zip files." error={tried ? bad.zipPassword : null}>
          <PasswordField value={v.zipPassword ?? ''} onChange={(x) => setV({ ...v, zipPassword: x })} autoComplete="new-password" maxLength={128} />
        </FormField>
        <FormField id="st-confirm" label="Zip password again" required error={tried ? bad.confirm : null}>
          <PasswordField value={confirm} onChange={setConfirm} autoComplete="new-password" maxLength={128} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** 8.5: the export (start, download while the link works), the scheduled export (T2-G 45) and the closure request. */
export function dataPage(design: SettingsPageDef, d: AccountData, canAct: boolean, scheduled?: ScheduledExport | null): SettingsPageDef {
  const last = d.exports[0];
  const exp: SettingDef[] = [
    { key: 'export.run', label: 'Export all data', kind: 'link', linkScreenId: 'ACC-EXPORT', linkLabel: 'Start full export', helper: `Every company record as one file (JSON). Sign-in details, secrets and encrypted fields are left out. Needs your security key; the download link works for ${d.linkHours} hours.` },
    ...(last
      ? [
          info('export.last', 'Last full export', `${when(last.at)} by ${last.by} · ${size(last.sizeBytes)} · ${num(last.rows)} records`, last.open ? `The link works until ${when(last.expiresAt)}.` : 'The link has expired. Start a new export.'),
          ...(last.open && canAct ? [{ key: 'export.download', label: 'Download the last export', kind: 'link' as const, linkScreenId: 'ACC-DOWNLOAD', linkLabel: 'Download' }] : []),
        ]
      : []),
  ];
  const c = d.closure;
  const close: SettingDef[] = c
    ? [
        info('closure.state', 'Closing the account', c.status === 'closed' ? `Closed by YukthiX. Data is kept until ${day(c.keepUntil!)}, then deleted.` : `Asked by ${c.by} on ${day(c.at)}. YukthiX will contact you before closing it.`, `Reason: ${c.reason}`),
        ...(c.status === 'requested' && canAct ? [{ key: 'closure.withdraw', label: 'Keep the account', kind: 'link' as const, linkScreenId: 'ACC-WITHDRAW', linkLabel: 'Withdraw the request' }] : []),
      ]
    : [{ key: 'closure.start', label: 'Close account', kind: 'link', linkScreenId: 'ACC-CLOSE', linkLabel: 'Ask YukthiX to close the account', helper: `YukthiX closes it after talking to you. Export your data first: after closing, it is kept for ${d.keepDays} days, then deleted.` }];
  return pick(design, [
    { title: 'Whole-company export', settings: exp },
    { title: 'Scheduled export to your storage', settings: scheduled ? scheduledSettings(scheduled, canAct) : [] },
    { title: 'Close account', settings: close },
  ]);
}

/** The closure request: type the company name and why. */
export function ClosureRequestDrawer({ companyName, keepDays, onClose, onSend }: { companyName: string; keepDays: number; onClose: () => void; onSend: (input: { companyName: string; reason: string }) => Promise<unknown> }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = {
    name: name.trim().toLowerCase() !== companyName.trim().toLowerCase() ? `Type ${companyName} to confirm.` : null,
    reason: reason.trim().length < 3 ? 'Say in a few words why.' : null,
  };
  const send = () => {
    setTried(true);
    const miss = bad.name ? 'cl-name' : bad.reason ? 'cl-reason' : null;
    if (miss) return document.getElementById(miss)?.focus();
    setBusy(true);
    setFailed(null);
    onSend({ companyName: name.trim(), reason: reason.trim() })
      .then(() => (toast({ tone: 'success', title: 'Closing the account is asked for' }), onClose()))
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : 'It could not be sent. Try again.'))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Ask YukthiX to close the account"
      subtitle={companyName}
      dirty
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : <InlineAlert tone="warning" title={`After closing, nobody can sign in and the data is kept for ${keepDays} days, then deleted. Export it first.`} />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={send}>Ask to close</Button>
        </>
      }
    >
      <div className="yx-set-stack">
        <FormField id="cl-name" label="Company name" required error={tried ? bad.name : null} helper={`Type ${companyName} to confirm.`}>
          <TextField value={name} onChange={setName} maxLength={200} />
        </FormField>
        <FormField id="cl-reason" label="Why" required error={tried ? bad.reason : null}>
          <TextArea value={reason} onChange={setReason} maxLength={500} rows={3} />
        </FormField>
      </div>
    </Drawer>
  );
}

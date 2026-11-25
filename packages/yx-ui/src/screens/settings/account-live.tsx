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
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
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

/** 8.5: the export (start, download while the link works) and the closure request. */
export function dataPage(design: SettingsPageDef, d: AccountData, canAct: boolean): SettingsPageDef {
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

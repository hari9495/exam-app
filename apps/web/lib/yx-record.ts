import { formatPhone } from '@yukthix/ui';
import type { FieldRow, JobChange, RecordDoc, RecordEvent, RecordPerformance } from '@yukthix/ui/frame';
import type { AsOfView, ChangeRecord, HistoryView } from '@yukthix/ui/history';
import type { ProfileView, RevealField } from '@yukthix/ui/access';
import type { AssetRow, QueueDocument } from '@yukthix/ui/lifecycle';

// The designed person record (PPL-03) from the live API: pure mapping, unit-tested. The API decides what each
// viewer may see; these functions only turn what it sent into the design's rows.

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const dateText = (iso: string) => day(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const GENDER: Record<string, string> = { male: 'Man', female: 'Woman', non_binary: 'Non-binary', other: 'Other', undisclosed: 'Prefer not to say' };
const STATUS: Record<string, string> = { probation: 'On probation', confirmed: 'Confirmed', notice: 'Serving notice' };
const MARITAL: Record<string, string> = { single: 'Single', married: 'Married', separated: 'Separated', divorced: 'Divorced', widowed: 'Widowed', prefer_not_to_say: 'Prefer not to say' };

/** Personal fields (P02 Personal; the birthday line is Internal). */
export function personalRows(p: NonNullable<ProfileView['personal']>): FieldRow[] {
  const address = [p.addressLine1, p.addressLine2, p.city, p.postalCode].filter(Boolean).join(', ');
  return [
    { label: 'Date of birth', value: p.dateOfBirth ? dateText(p.dateOfBirth) : 'Not on file', cls: 'Personal' },
    { label: 'Gender', value: p.gender ? (GENDER[p.gender] ?? p.gender) : 'Not on file', cls: 'Personal' },
    { label: 'Marital status', value: p.maritalStatus ? (MARITAL[p.maritalStatus] ?? p.maritalStatus) : 'Not on file', cls: 'Personal' },
    { label: 'Personal email', value: p.personalEmail ?? 'Not on file', cls: 'Personal' },
    { label: 'Personal phone', value: p.personalPhone ? formatPhone(p.personalPhone) : 'Not on file', cls: 'Personal' },
    { label: 'Home address', value: address || 'Not on file', cls: 'Personal' },
    { label: 'Birthday (shown in directory)', value: p.hideBirthday || !p.dateOfBirth ? 'Hidden' : day(p.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: 'Internal' },
  ];
}

/** Identity and bank fields, masked as the API sent them; "Show" asks the API (a recorded look) where it allows. */
export function identityRows(p: ProfileView, reveal: (field: RevealField) => Promise<string>): FieldRow[] {
  const id = p.identity;
  if (!id) return [];
  const row = (label: string, field: RevealField, value: string | null, allowed: boolean, cls: FieldRow['cls'] = 'Confidential'): FieldRow =>
    value ? { label, value, masked: value, cls, mono: true, canReveal: allowed, ...(allowed ? { reveal: () => reveal(field) } : {}) } : { label, value: 'Not on file', cls };
  return [
    { label: 'Legal name', value: id.legalName ?? 'Not on file', cls: 'Confidential' },
    row('PAN', 'pan', id.pan, p.can.reveal),
    row('Aadhaar', 'aadhaar', id.aadhaar, p.classes.aadhaar, 'Special'),
    row('UAN', 'uan', id.uan, p.can.reveal),
    row('ESIC IP number', 'esic', id.esic, p.can.reveal),
    ...bankRows(p, reveal),
    passportRow(p, reveal),
  ];
}

/** Passport: the masked number and its expiry; "Show" asks the API for the number (a recorded look). */
export function passportRow(p: ProfileView, reveal: (field: RevealField) => Promise<string>): FieldRow {
  const id = p.identity;
  if (!id?.passport) return { label: 'Passport', value: 'Not on file', cls: 'Confidential' };
  const expires = id.passportExpiresOn ? ` · expires ${dateText(id.passportExpiresOn)}` : '';
  const masked = `${id.passport}${expires}`;
  return { label: 'Passport', value: masked, masked, cls: 'Confidential', mono: true, canReveal: p.can.reveal, ...(p.can.reveal ? { reveal: async () => `${await reveal('passport')}${expires}` } : {}) };
}

export function bankRows(p: ProfileView, reveal: (field: RevealField) => Promise<string>): FieldRow[] {
  const abroad = p.identity?.internationalAccount;
  // PPL-46: the account abroad, masked (no full-value look is designed for it).
  const intl: FieldRow[] = abroad ? [{ label: 'Salary account abroad', value: `${abroad.iban} · ${abroad.bic} · ${abroad.currency}${day(abroad.usableFrom) > new Date() ? ` · used for pay from ${dateText(abroad.usableFrom)}` : ''}`, cls: 'Confidential' as const, mono: true }] : [];
  return [...intl, ...(p.identity?.bankAccounts ?? []).map((b) => {
    const field: RevealField = b.purpose === 'salary' ? 'bank_salary' : 'bank_reimbursement';
    const later = day(b.usableFrom) > new Date() ? ` · used for pay from ${dateText(b.usableFrom)}` : '';
    const masked = `${b.account} · ${b.ifsc}${later}`;
    return {
      label: b.purpose === 'salary' ? 'Salary account' : 'Reimbursement account',
      value: masked,
      masked,
      cls: 'Confidential' as const,
      mono: true,
      canReveal: p.can.reveal,
      ...(p.can.reveal ? { reveal: async () => `${await reveal(field)} · ${b.ifsc}${later}` } : {}),
    };
  })];
}

/** Current assignment (Job tab), as on the viewed date. */
export function jobRows(v: AsOfView): [string, string][] {
  const a = v.assignment;
  if (!a) return [];
  const hours = a.hoursPerWeek ? `${Number(a.hoursPerWeek)} hours a week` : a.normalWeekHours ? `Full-time (${Number(a.normalWeekHours)} hours)` : 'Full-time';
  return [
    ['Designation', a.designation?.name ?? '—'],
    ['Grade', a.grade?.name ?? '—'],
    ['Department', a.department?.name ?? '—'],
    ['Location', a.location.name ?? '—'],
    ['Manager', a.manager?.name ?? '—'],
    ...(a.dottedLineManagers?.length ? [['Secondary manager', a.dottedLineManagers.map((m) => m.name).filter(Boolean).join(', ')] as [string, string]] : []),
    ['Employment type', a.employmentType?.name ?? '—'],
    ['Status', v.status ? `${STATUS[v.status.status] ?? v.status.status} since ${dateText(v.status.validFrom)}` : '—'],
    ['Working hours', hours],
    ...(a.costCentres.length ? [['Cost centre', a.costCentres.map((c) => `${c.code ?? c.name} (${Number(c.percent)} %)`).join(', ')] as [string, string]] : []),
    ['Legal entity', v.employee.legalEntity?.name ?? '—'],
  ];
}

const TYPE: Record<string, string> = {
  join: 'Joining',
  promotion: 'Promotion',
  transfer: 'Transfer',
  redesignation: 'New designation',
  manager_change: 'Manager change',
  salary_revision: 'Salary revision',
  employment_type_change: 'Employment type or hours',
  confirmation: 'Confirmation',
  correction: 'Correction',
  notice: 'Notice period',
  notice_withdrawal: 'Resignation withdrawn',
  exit: 'Left',
};

const money = (amount: string, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount));

/** What a change did, in words: from its impact preview, or from the dated rows it wrote (A → B). */
export function changeSummary(ch: ChangeRecord, h: HistoryView): string {
  if (ch.impact?.facts.length) return ch.impact.facts.map((f) => `${f.fact}: ${f.from ?? '—'} → ${f.to ?? '—'}`).join(' · ');
  const rows = h.assignment.filter((r) => !r.supersededAt).sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const i = rows.findIndex((r) => r.changeId === ch.id);
  const parts: string[] = [];
  if (i >= 0) {
    const now = rows[i];
    const was = i > 0 ? rows[i - 1] : null;
    const facts: [string, string | null | undefined, string | null | undefined][] = [
      ['Designation', was?.designation?.name, now.designation?.name],
      ['Grade', was?.grade?.name, now.grade?.name],
      ['Department', was?.department?.name, now.department?.name],
      ['Location', was?.location.name, now.location.name],
      ['Manager', was?.manager?.name, now.manager?.name],
    ];
    for (const [label, a, b] of facts) {
      if (!was) b && parts.push(b);
      else if (a !== b) parts.push(`${label}: ${a ?? '—'} → ${b ?? '—'}`);
    }
  }
  const comp = h.compensation.filter((r) => !r.supersededAt).sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const j = comp.findIndex((r) => r.changeId === ch.id);
  if (j >= 0) parts.push(j > 0 ? `CTC ${money(comp[j - 1].annualCtc, comp[j - 1].currency)} → ${money(comp[j].annualCtc, comp[j].currency)}` : `CTC ${money(comp[j].annualCtc, comp[j].currency)}`);
  else if (ch.touchesPay && !h.payAccess) parts.push('Pay changed');
  const status = h.status.find((r) => r.changeId === ch.id && !r.supersededAt);
  if (status && ch.changeType !== 'join') parts.push(STATUS[status.status] ?? status.status);
  return parts.join(' · ') || ch.reason;
}

/** Dated changes, newest first: scheduled, the one in force today, past ones and corrections. */
export function historyRows(h: HistoryView, today: string): JobChange[] {
  const shown = h.changes.filter((c) => c.status === 'effective' || c.status === 'scheduled').sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const current = shown.find((c) => c.status === 'effective' && c.effectiveDate <= today && c.changeType !== 'correction');
  return shown.map((c) => ({
    id: c.id,
    effective: day(c.effectiveDate),
    type: TYPE[c.changeType] ?? c.changeType,
    summary: changeSummary(c, h),
    by: '',
    state: c.status === 'scheduled' ? 'scheduled' : c.changeType === 'correction' ? 'correction' : c === current ? 'current' : 'past',
  }));
}

/** Scheduled changes for the Job tab. */
export function scheduledNotes(h: HistoryView): { title: string; body: string }[] {
  return h.changes
    .filter((c) => c.status === 'scheduled')
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    .map((c) => ({ title: `Scheduled: ${(TYPE[c.changeType] ?? c.changeType).toLowerCase()} from ${dateText(c.effectiveDate)}`, body: changeSummary(c, h) }));
}

const SENS: Record<string, FieldRow['cls']> = { public: 'Public', internal: 'Internal', personal: 'Personal', confidential: 'Confidential', special: 'Special' };

/** The person's documents as the design's checklist rows. */
export function docRows(docs: QueueDocument[], today: string): RecordDoc[] {
  const soon = day(today);
  soon.setDate(soon.getDate() + 30);
  return docs.map((d) => {
    const expiring = d.status === 'verified' && d.expiresOn && day(d.expiresOn) <= soon;
    const status = d.status === 'verified' ? (expiring ? 'Expiring' : 'Verified') : d.status === 'uploaded' ? 'Pending verification' : d.status === 'requested' ? 'Missing' : d.status === 'rejected' ? 'Rejected' : 'Expired';
    return {
      id: d.id,
      type: d.typeName,
      cls: SENS[d.sensitivity] ?? 'Internal',
      status,
      on: d.file && d.uploadedAt ? new Date(d.uploadedAt) : null,
      versions: d.versions ?? 0,
      expires: d.expiresOn ? day(d.expiresOn) : null,
    };
  });
}

/** Assets the person holds now. */
export function assetRows(rows: AssetRow[], employeeId: string) {
  return rows
    .filter((a) => a.holder?.employeeId === employeeId)
    .map((a) => ({ tag: a.tag, name: a.name, issued: day(a.holder!.issuedOn), condition: a.holder!.condition, ack: a.holder!.acknowledged ? 'Acknowledged' : 'Waiting' }));
}

/** Rail "Coming up": scheduled changes, probation end, the next work anniversary, waiting identity changes. */
export function upcoming(v: AsOfView | null, h: HistoryView | null, today: string, pending: string[], docs: QueueDocument[] = []): RecordEvent[] {
  const out: RecordEvent[] = [];
  for (const c of h?.changes.filter((x) => x.status === 'scheduled') ?? []) out.push({ label: `${TYPE[c.changeType] ?? c.changeType} effective`, date: day(c.effectiveDate), tone: 'info' });
  if (v?.status?.status === 'probation' && v.status.validTo) out.push({ label: 'Probation ends', date: day(v.status.validTo), tone: 'warning' });
  if (v?.employee.joinedOn && !v.employee.exitedOn) {
    const joined = day(v.employee.joinedOn);
    const t = day(today);
    const next = new Date(t.getFullYear(), joined.getMonth(), joined.getDate());
    if (next <= t) next.setFullYear(next.getFullYear() + 1);
    const years = next.getFullYear() - joined.getFullYear();
    if (years > 0) out.push({ label: `Work anniversary (${years} year${years === 1 ? '' : 's'})`, date: next });
  }
  // Documents that expire within 60 days (or have expired): a licence, a passport, a visa.
  const soon = day(today);
  soon.setDate(soon.getDate() + 60);
  for (const d of docs.filter((x) => x.expiresOn && (x.status === 'verified' || x.status === 'expired') && day(x.expiresOn) <= soon)) out.push({ label: `${d.typeName} ${d.status === 'expired' || d.expiresOn! < today ? 'expired' : 'expires'}`, date: day(d.expiresOn!), tone: 'warning' });
  if (pending.length) out.push({ label: `${pending.length} pending request${pending.length === 1 ? '' : 's'}`, note: pending.map((l) => `Profile change: ${l.toLowerCase()}`).join(', ') });
  return out;
}

const GOAL: Record<string, { label: string; tone: RecordPerformance['goals'][number]['tone'] }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Waiting for approval', tone: 'info' },
  active: { label: 'In progress', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
};

/** Performance tab: goals of the open (or latest) period, the last released review, the next 1:1 with the viewer. */
export function performanceData(
  periods: { id: string; name: string; fromOn: string; toOn: string; status: string }[],
  periodId: string | null,
  goals: { id: string; title: string; status: string; progress: number }[],
  reviews: { employeeId: string; cycle: string; status: string; band: string | null }[],
  meetings: { with: string; on: string; status: string }[],
  employeeId: string,
  name: string,
  today: string,
): RecordPerformance {
  const period = periods.find((x) => x.id === periodId) ?? null;
  const last = reviews.filter((r) => r.employeeId === employeeId && r.band && ['released', 'acknowledged'].includes(r.status)).at(-1);
  const next = meetings.filter((m) => m.with === name && m.status === 'scheduled' && m.on >= today).sort((a, b) => a.on.localeCompare(b.on))[0];
  return {
    period: period?.name ?? null,
    goals: goals.map((g) => ({ id: g.id, title: g.title, status: g.status === 'active' ? `${Math.round(g.progress)}% done` : (GOAL[g.status]?.label ?? g.status), tone: GOAL[g.status]?.tone ?? 'neutral' })),
    lastReview: last ? `${last.band} (${last.cycle})` : null,
    nextOneOnOne: next ? dateText(next.on) : null,
  };
}

/** The current goal period: open and covering today, else the latest open one. */
export function currentPeriod(periods: { id: string; fromOn: string; toOn: string; status: string }[], today: string): string | null {
  const open = periods.filter((p) => p.status === 'open');
  return (open.find((p) => p.fromOn <= today && today <= p.toOn) ?? open[0] ?? periods[0])?.id ?? null;
}

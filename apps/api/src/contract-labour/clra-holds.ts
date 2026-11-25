import { Prisma } from '@prisma/client';
import type { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { audit } from '../org-structure/org-structure.service';
import { PROOF_KINDS, holdsBill, monthOf, packDue, packStatus, recoveryFrom, requiredProofs, type PackStatus, type ProofKind, type ProofState } from './clra-rules';

// Contract labour CL-4 (answers 626, 634): the month-by-month pack status of a contractor's sites, the payment hold it
// puts on the contractor's PAY 8 bills, and the recovery of wages the company paid itself. Plain functions on a
// transaction, so payroll (consultants.service) uses them without depending on the contract labour module.

const ANY_ENTITY = { legalEntityId: '' };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
/** How far back months are looked at (older months were settled long ago). */
const LOOKBACK_MONTHS = 24;

export interface MonthPack {
  agencyId: string;
  locationId: string;
  month: string;
  due: string;
  status: PackStatus;
  released: { reason: string; at: string } | null;
  packId: string | null;
}

/** A deployment counts for a month when it was pending or deployed (or released later) on any day of it. */
export const activeIn = (d: { fromOn: Date; toOn: Date | null; releasedOn: Date | null; status: string }, month: string) => {
  const end = d.releasedOn ?? d.toOn;
  return iso(d.fromOn) <= monthEnd(month) && (!end || iso(end) >= month);
};

/** Every (contractor, site, month) a pack is owed for, before the current month, with its status. */
export async function monthPacks(tx: Tx, c: CompanyContext, today: string, agencyIds?: string[]): Promise<MonthPack[]> {
  const org = c.organizationId;
  const cutoff = Number(await settingFor(tx, c, 'clra.doc_cutoff', ANY_ENTITY));
  const required = requiredProofs(await settingFor(tx, c, 'clra.required_proofs', ANY_ENTITY));
  const current = monthOf(today);
  const from = addMonths(current, -LOOKBACK_MONTHS);
  const deps = await tx.contractDeployment.findMany({ where: { organizationId: org, ...(agencyIds ? { agencyId: { in: agencyIds } } : {}), fromOn: { lt: day(current) } }, select: { agencyId: true, locationId: true, fromOn: true, toOn: true, releasedOn: true, status: true } });
  const keys = new Map<string, { agencyId: string; locationId: string; month: string }>();
  for (const d of deps) {
    const first = monthOf(iso(d.fromOn));
    for (let m = first < from ? from : first; m < current; m = addMonths(m, 1)) if (activeIn(d, m)) keys.set(`${d.agencyId}|${d.locationId}|${m}`, { agencyId: d.agencyId, locationId: d.locationId, month: m });
  }
  const list = [...keys.values()];
  if (!list.length) return [];
  const packs = await tx.contractorPack.findMany({ where: { organizationId: org, agencyId: { in: [...new Set(list.map((k) => k.agencyId))] }, month: { gte: day(from) } } });
  const items = await tx.contractorPackItem.findMany({ where: { organizationId: org, packId: { in: packs.map((p) => p.id) } }, select: { packId: true, kind: true, state: true } });
  const releases = await tx.contractorHoldRelease.findMany({ where: { organizationId: org, agencyId: { in: [...new Set(list.map((k) => k.agencyId))] } } });
  return list.map((k) => {
    const p = packs.find((x) => x.agencyId === k.agencyId && x.locationId === k.locationId && iso(x.month) === k.month);
    const states: Partial<Record<ProofKind, ProofState>> = {};
    for (const i of items.filter((x) => x.packId === p?.id)) states[i.kind as ProofKind] = i.state as ProofState;
    const due = packDue(k.month, cutoff);
    const r = releases.find((x) => x.agencyId === k.agencyId && iso(x.month) === k.month);
    return { ...k, due, status: packStatus(states, due, today, required), released: r ? { reason: r.reason, at: r.releasedAt.toISOString() } : null, packId: p?.id ?? null };
  });
}

/** Answer 634: the months that hold each contractor's bills today (empty when the company chose "alert only"). */
export async function heldMonths(tx: Tx, c: CompanyContext, today: string, agencyIds?: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if ((await settingFor(tx, c, 'clra.payment_hold', ANY_ENTITY)) !== 'hold') return out;
  for (const p of await monthPacks(tx, c, today, agencyIds)) {
    if (!holdsBill(p.status, Boolean(p.released))) continue;
    const ms = out.get(p.agencyId) ?? [];
    if (!ms.includes(p.month)) ms.push(p.month);
    out.set(p.agencyId, ms.sort());
  }
  return out;
}

/** For the PAY 8 bank file: consultant invoices that cannot be paid because their contractor's bills are held. */
export async function heldConsultants(tx: Tx, c: CompanyContext, consultantIds: string[], today: string): Promise<Map<string, string>> {
  const agencies = await tx.agency.findMany({ where: { organizationId: c.organizationId, contractLabour: true, consultantId: { in: consultantIds } }, select: { id: true, name: true, consultantId: true } });
  if (!agencies.length) return new Map();
  const held = await heldMonths(tx, c, today, agencies.map((a) => a.id));
  const out = new Map<string, string>();
  for (const a of agencies) {
    const ms = held.get(a.id);
    if (ms?.length) out.set(a.consultantId!, `${a.name}: bills are held while proofs for ${ms.map((m) => m.slice(0, 7)).join(', ')} are overdue or disputed. The compliance owner can release a month with a reason.`);
  }
  return out;
}

/**
 * Answer 626: when a contractor's PAY 8 bill is approved, wages the company paid the contractor's workers itself and has
 * not recovered yet are taken from it (oldest first, never more than the bill). Returns the rupees recovered.
 */
export async function recoverDirectPayments(tx: Tx, c: CompanyContext, consultantId: string, invoiceId: string, net: Prisma.Decimal): Promise<Prisma.Decimal> {
  const org = c.organizationId;
  const agencies = await tx.agency.findMany({ where: { organizationId: org, contractLabour: true, consultantId }, select: { id: true } });
  if (!agencies.length) return new Prisma.Decimal(0);
  const pending = await tx.contractorDirectPayment.findMany({ where: { organizationId: org, agencyId: { in: agencies.map((a) => a.id) } }, orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }] });
  const left = pending.filter((p) => p.recoveredPaise < p.amountPaise).map((p) => ({ id: p.id, leftPaise: p.amountPaise - p.recoveredPaise }));
  const r = recoveryFrom(BigInt(net.mul(100).toFixed(0)), left);
  for (const t of r.take) {
    await tx.contractorDirectPayment.update({ where: { id: t.id }, data: { recoveredPaise: { increment: t.paise }, recoveredInvoiceId: invoiceId } });
  }
  if (r.totalPaise > 0n) await audit(tx, c, 'clra.direct_payment.recovered', 'consultant_invoice', invoiceId, { rupees: (Number(r.totalPaise) / 100).toFixed(2), payments: r.take.map((t) => t.id) });
  return new Prisma.Decimal(r.totalPaise.toString()).div(100);
}

export { PROOF_KINDS };

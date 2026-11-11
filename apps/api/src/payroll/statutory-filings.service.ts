import { FilesService } from '../documents/files.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { IN_STATES, entityTimeZone, localDate } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { damages, due, inForce, penalty, type RuleSet } from '../statutory/evaluator';
import { FORMATS, ecrFile, esiFile, lwfFile, ptFile, type EcrRow, type EsiRow, type LwfRow, type PtRow, type TdsRow } from '../statutory/filing-files';
import { ETDS_FORMAT, checkFvu, etdsFile, type Deductor } from '../statutory/etds';
import { FvuRunner, FvuUnavailable, type FvuOutcome } from '../statutory/fvu';
import { sha256 } from './pay-file-store';
import { asDate, dateOf, monthRange } from '../time/time-core';
import type { ConfirmationDto } from './dto';
import type { ChallanUpdateDto, FilingDto } from './dto-5f';
import { ExchangeFilesService, type FileKind } from './exchange-files.service';
import { PayKey, entitiesFor, payScope, payViewer, requireEntity, requireSelf } from './pay-access';
import { lawVersionFor, taxForms, taxYearOf } from './tax';

// Statutory files and TDS (M03-BUILD-DESIGN §11.4, §11.5, PAY-6.01 … 6.08): the hub of what is due per statute and month
// with a penalty estimate; PF ECR, ESI, PT and LWF files from the values stored on the approved payslips, generated →
// downloaded (audited) → uploaded with the portal's reference → filed (which locks the month); before filing a new file
// needs a reason, after it only a supplementary filing with its interest and damages; excess adjustments and refunds are
// recorded. TDS challans pre-filled from the payslips with late-payment interest; the quarterly return's deductee rows,
// the deposit-versus-deduction reconciliation (must be zero) and the annexure; correction returns.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
/** The salary returns this service files; the non-salary ones (26Q / 140) are the consultants service's (batch 5h). */
const SALARY_FORMS = ['24Q', '138'];
const KIND: Record<string, FileKind> = { 'IN.PF': 'ecr', 'IN.ESI': 'esi', 'IN.PT': 'pt', 'IN.LWF': 'lwf' };
const LABEL: Record<string, string> = { 'IN.PF': 'PF (ECR)', 'IN.ESI': 'ESI contributions', 'IN.PT': 'Professional tax', 'IN.LWF': 'Labour welfare fund' };
const CAL: Record<string, string> = { 'IN.PF': 'pf_ecr', 'IN.ESI': 'esi' };
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
/**
 * PAY-01 dues (founder 30 Oct 2026, item 13): this month and the three before it. The month before falls due this month,
 * so its filed items still show (as Filed); the two older months only while something is owed and not filed.
 */
export function homeDueMonths(month: string): { months: string[]; unfiledOnly: string[] } {
  const [y, m] = month.split('-').map(Number);
  const back = (n: number) => new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
  return { months: [back(3), back(2), back(1), month], unfiledOnly: [back(3), back(2)] };
}

/** A read-back month's hub with only what is owed and not filed; none when nothing is left. */
export function onlyUnfiled<T extends { cards: { amount: string; status: string }[]; tds: { amount: string; challanStatus: string } }>(d: T): T[] {
  const cards = d.cards.filter((c) => c.status !== 'filed' && D(c.amount).gt(0));
  const tdsOwed = D(d.tds.amount).gt(0) && d.tds.challanStatus !== 'deposited';
  return cards.length || tdsOwed ? [{ ...d, cards }] : [];
}

/** The deductor of an e-TDS return (salary or non-salary), adding what is missing to `problems`. */
export async function etdsDeductor(tx: Tx, org: string, entityId: string, problems: string[]): Promise<Deductor | null> {
  const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: entityId }, select: { name: true, pan: true, tan: true, registeredAddress: true } });
  const reg = await tx.statutoryRegistration.findFirst({ where: { organizationId: org, legalEntityId: entityId, statute: 'IN.TDS' } });
  const tan = e.tan ?? reg?.registrationNo ?? null;
  const addr = (e.registeredAddress ?? reg?.address ?? null) as { lines?: string[]; city?: string; state?: string; postalCode?: string | null } | null;
  const before = problems.length;
  if (!tan) problems.push('The TAN of the legal entity is missing (Payroll set-up › Registrations).');
  if (!e.pan) problems.push('The PAN of the legal entity is missing.');
  if (!reg?.responsiblePerson) problems.push('The person responsible for deducting tax is missing on the TDS registration.');
  if (!addr?.state || !addr?.postalCode) problems.push('The registered address (with state and PIN) of the legal entity is missing.');
  if (problems.length > before) return null;
  return {
    tan: tan!,
    pan: e.pan!,
    name: e.name,
    address: [...(addr!.lines ?? []), addr!.city ?? ''].filter(Boolean),
    state: addr!.state!,
    pin: addr!.postalCode!,
    email: '',
    responsibleName: reg!.responsiblePerson!,
    responsibleDesignation: reg!.responsibleDesignation ?? '',
    responsiblePan: null,
    mobile: '',
  };
}

/**
 * CMP-01 SetupNeeded: the registrations the entity has not recorded at all (on, applied for or "not registered" each
 * count as recorded): PF, ESI, TDS (its TAN on the entity, or a TDS registration), and PT / LWF for every state the
 * entity has a place in where a published rule set charges it. Codes like "IN.PF" or "IN.PT IN-KA".
 */
export async function setupMissing(tx: Tx, org: string, entityId: string, rules: RuleSet[]): Promise<string[]> {
  const [regs, entity, places] = await Promise.all([
    tx.statutoryRegistration.findMany({ where: { organizationId: org, legalEntityId: entityId }, select: { statute: true, state: true } }),
    tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: entityId }, select: { tan: true } }),
    tx.location.findMany({ where: { organizationId: org, legalEntityId: entityId, archivedAt: null }, select: { state: true } }),
  ]);
  const has = (statute: string, state = '') => regs.some((r) => r.statute === statute && r.state === state);
  const out = ['IN.PF', 'IN.ESI'].filter((s) => !has(s));
  if (!entity.tan && !has('IN.TDS')) out.push('IN.TDS');
  for (const st of [...new Set(places.map((p) => p.state))].sort())
    for (const s of ['IN.PT', 'IN.LWF']) if (rules.some((r) => r.statute === s && r.jurisdiction === st) && !has(s, st)) out.push(`${s} ${st}`);
  return out;
}

export type RegisterKind = 'epf' | 'esic' | 'pt' | 'lwf';
/** A person's employee and employer amounts in a statute's register, from their payslip's lines (EPS and EPF shown apart). */
export function registerAmounts(kind: RegisterKind, sum: (key: string) => Prisma.Decimal) {
  if (kind === 'epf') {
    const eps = sum('eps_employer');
    const epf = sum('pf_employer');
    return { employee: sum('pf_employee').toFixed(2), employer: eps.add(epf).toFixed(2), eps: eps.toFixed(2), epfEmployer: epf.toFixed(2) };
  }
  const [ee, er] = kind === 'esic' ? ['esi_employee', 'esi_employer'] : kind === 'pt' ? ['pt', null] : ['lwf_employee', 'lwf_employer'];
  return { employee: sum(ee!).toFixed(2), employer: (er ? sum(er) : ZERO).toFixed(2), eps: null, epfEmployer: null };
}
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const rupeesText = (x: string) => `₹${Number(x).toLocaleString('en-IN')}`;

export const quarterMonths = (taxYear: string, q: number) => {
  const y = Number(taxYear.slice(0, 4));
  return [0, 1, 2].map((i) => {
    const m = 4 + (q - 1) * 3 + i;
    return m > 12 ? `${y + 1}-${String(m - 12).padStart(2, '0')}` : `${y}-${String(m).padStart(2, '0')}`;
  });
};

type Slip = { id: string; employeeId: string; employmentId: string; gross: Prisma.Decimal; ruleVersions: Prisma.JsonValue; version: number };
type Line = { payslipId: string; componentCode: string; amount: Prisma.Decimal; quantity: Prisma.Decimal | null; rule: Prisma.JsonValue };

@Injectable()
export class StatutoryFilingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly files: ExchangeFilesService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly fvu: FvuRunner,
    private readonly docs: FilesService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** An entity the key reaches, with the pay guard opened to it; else "not found". */
  private async entity(tx: Tx, c: CompanyContext, v: Viewer, key: PayKey, entityId: string) {
    await requireEntity(tx, c, v, key, entityId);
    await payScope(tx, [entityId]);
    return tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: entityId }, select: { id: true, name: true, shortName: true } });
  }

  private open(org: string, employeeId: string, blob: string | null | undefined) {
    if (!blob) return null;
    const prefix = `${org}:${employeeId}:`;
    const plain = this.crypto.decrypt(blob);
    return plain.startsWith(prefix) ? plain.slice(prefix.length) : null;
  }

  /** The month's approved payslips (every run) with their lines and the people. */
  private async month(tx: Tx, org: string, entityId: string, month: string) {
    const all = await tx.payslip.findMany({
      where: { organizationId: org, legalEntityId: entityId, periodStart: asDate(`${month}-01`), status: 'approved' },
      select: { id: true, employeeId: true, employmentId: true, gross: true, ruleVersions: true, version: true, subPeriod: true },
    });
    // PAY-9.01: a weekly or fortnightly group pays a person once per period; the month's returns see them once, their
    // periods' payslips added together (lines re-pointed to the first one). Off-cycle payslips stay separate as before.
    const alias = new Map<string, string>();
    const slips: Slip[] = [];
    for (const x of all) {
      const first = x.subPeriod > 0 ? slips.find((y) => y.employmentId === x.employmentId && alias.get(y.id) === y.id && all.find((z) => z.id === y.id)!.subPeriod > 0) : undefined;
      if (first) {
        first.gross = first.gross.add(x.gross);
        alias.set(x.id, first.id);
      } else {
        const { subPeriod: _s, ...slip } = x;
        slips.push(slip);
        alias.set(x.id, x.id);
      }
    }
    const lines: Line[] = (
      await tx.payslipLine.findMany({
        where: { organizationId: org, payslipId: { in: all.map((x) => x.id) } },
        select: { payslipId: true, componentCode: true, amount: true, quantity: true, rule: true },
      })
    ).map((l) => ({ ...l, payslipId: alias.get(l.payslipId)! }));
    const comps = await tx.payComponent.findMany({ where: { organizationId: org, statutory: { not: null } }, select: { code: true, statutory: true } });
    const codes = (key: string) => new Set([key, ...comps.filter((x) => x.statutory === key).map((x) => x.code)]);
    const people = await tx.employment.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employmentId) } }, select: { id: true, employeeCode: true, exitedOn: true } });
    const names = await tx.employee.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employeeId) } }, select: { id: true, givenName: true, familyName: true } });
    const nameOf = (id: string) => {
      const p = names.find((n) => n.id === id);
      return p ? [p.givenName, p.familyName].filter(Boolean).join(' ') : '';
    };
    const sum = (slipId: string, set: Set<string>, jur?: string) =>
      lines.filter((l) => l.payslipId === slipId && set.has(l.componentCode) && (!jur || (l.rule as { jurisdiction?: string } | null)?.jurisdiction === jur)).reduce((t, l) => t.add(l.amount), ZERO);
    return { slips, lines, codes, people, nameOf, sum };
  }

  /** Rows and totals of a statute's file for a month (and state, for PT and LWF). */
  private async rowsFor(tx: Tx, org: string, entityId: string, statute: string, month: string, state: string | null, rules: RuleSet[]) {
    const m = await this.month(tx, org, entityId, month);
    const ids = await tx.employeeIdentifiers.findMany({
      where: { organizationId: org, employeeId: { in: m.slips.map((s) => s.employeeId) } },
      select: { employeeId: true, uanEnc: true, esicEnc: true },
    });
    const missing: { employeeId: string; reason: string }[] = [];
    const per: Record<string, { gross: string; amounts: Record<string, string> }> = {};
    const code = (id: string) => m.people.find((p) => p.id === id)?.employeeCode ?? '';
    if (statute === 'IN.PF') {
      const rows: EcrRow[] = [];
      for (const s of m.slips) {
        const ee = m.sum(s.id, m.codes('pf_employee'));
        if (ee.isZero()) continue;
        const ver = (s.ruleVersions as Record<string, string>)['IN.PF|IN'];
        const rs = rules.find((r) => r.statute === 'IN.PF' && r.jurisdiction === 'IN' && r.version === ver) ?? inForce(rules, 'IN.PF', ['IN'], `${month}-01`);
        if (!rs) throw new ConflictException('The PF rules of these payslips are not published.');
        const v = rs.values as Record<string, string>;
        const eps = m.sum(s.id, new Set(['eps_employer']));
        const edli = m.sum(s.id, new Set(['edli_employer']));
        const uan = this.open(org, s.employeeId, ids.find((x) => x.employeeId === s.employeeId)?.uanEnc);
        if (!uan) {
          missing.push({ employeeId: s.employeeId, reason: 'No UAN on file.' });
          continue;
        }
        const snap = await tx.payslipSnapshot.findFirst({ where: { payslipId: s.id }, select: { inputs: true } });
        const lop = Number((snap?.inputs as { attendance?: { lopDays?: string } } | null)?.attendance?.lopDays ?? 0);
        const r: EcrRow = {
          uan,
          name: m.nameOf(s.employeeId),
          gross: s.gross.toFixed(2),
          epfWages: ee.div(D(v.employeeRate)).toFixed(0),
          epsWages: D(v.epsRate).isZero() ? '0' : eps.div(D(v.epsRate)).toFixed(0),
          edliWages: D(v.edliRate).isZero() ? '0' : edli.div(D(v.edliRate)).toFixed(0),
          epfEmployee: ee.toFixed(2),
          eps: eps.toFixed(2),
          epfDiff: m.sum(s.id, m.codes('pf_employer')).toFixed(2),
          ncpDays: lop,
          refund: '0',
        };
        rows.push(r);
        per[s.id] = { gross: r.gross, amounts: { employee: r.epfEmployee, eps: r.eps, diff: r.epfDiff } };
      }
      const total = rows.reduce((t, r) => t.add(r.epfEmployee).add(r.eps).add(r.epfDiff), ZERO);
      return { rows, missing, per, totals: { contributions: total.toFixed(2) }, data: async () => ecrFile(rows), ext: 'txt', type: 'text/plain; charset=utf-8' };
    }
    if (statute === 'IN.ESI') {
      const rows: EsiRow[] = [];
      for (const s of m.slips) {
        const ee = m.sum(s.id, m.codes('esi_employee'));
        if (ee.isZero()) continue;
        const ip = this.open(org, s.employeeId, ids.find((x) => x.employeeId === s.employeeId)?.esicEnc);
        if (!ip) {
          missing.push({ employeeId: s.employeeId, reason: 'No ESI IP number on file.' });
          continue;
        }
        const days = m.lines.filter((l) => l.payslipId === s.id && l.componentCode === 'basic' && l.quantity).reduce((t, l) => t + Number(l.quantity), 0);
        const exited = m.people.find((p) => p.id === s.employmentId)?.exitedOn;
        rows.push({
          ipNumber: ip,
          name: m.nameOf(s.employeeId),
          days: Math.round(days),
          wages: s.gross.toFixed(2),
          reasonCode: days ? '0' : '1',
          lastWorkingDay: exited && dateOf(exited).slice(0, 7) === month ? dateOf(exited).split('-').reverse().join('/') : '',
        });
        per[s.id] = { gross: s.gross.toFixed(2), amounts: { employee: ee.toFixed(2), employer: m.sum(s.id, m.codes('esi_employer')).toFixed(2) } };
      }
      const total = Object.values(per).reduce((t, p) => t.add(p.amounts.employee).add(p.amounts.employer), ZERO);
      return { rows, missing, per, totals: { contributions: total.toFixed(2) }, data: () => esiFile(rows), ext: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }
    if (statute === 'IN.PT') {
      const rows = m.slips
        .map((s) => ({ s, pt: m.sum(s.id, m.codes('pt'), state!) }))
        .filter((x) => x.pt.gt(0))
        .map((x) => {
          per[x.s.id] = { gross: x.s.gross.toFixed(2), amounts: { employee: x.pt.toFixed(2) } };
          return { code: code(x.s.employmentId), name: m.nameOf(x.s.employeeId), ptWage: x.s.gross.toFixed(2), pt: x.pt.toFixed(2) };
        });
      const total = rows.reduce((t, r) => t.add(r.pt), ZERO);
      return { rows, missing, per, totals: { tax: total.toFixed(2) }, data: async () => ptFile(state!, month, rows), ext: 'csv', type: 'text/csv; charset=utf-8' };
    }
    const rows = m.slips
      .map((s) => ({ s, ee: m.sum(s.id, m.codes('lwf_employee'), state!), er: m.sum(s.id, m.codes('lwf_employer'), state!) }))
      .filter((x) => x.ee.gt(0) || x.er.gt(0))
      .map((x) => {
        per[x.s.id] = { gross: x.s.gross.toFixed(2), amounts: { employee: x.ee.toFixed(2), employer: x.er.toFixed(2) } };
        return { code: code(x.s.employmentId), name: m.nameOf(x.s.employeeId), employee: x.ee.toFixed(2), employer: x.er.toFixed(2) };
      });
    const total = rows.reduce((t, r) => t.add(r.employee).add(r.employer), ZERO);
    return { rows, missing, per, totals: { contributions: total.toFixed(2) }, data: async () => lwfFile(state!, month, rows), ext: 'csv', type: 'text/csv; charset=utf-8' };
  }

  // ------------------------------------------------------------------------------------------ hub (PAY-6.01)

  /** What is due for an entity and month: each statute's amount, due date, filing status and, when late, a penalty estimate. */
  async hub(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      const rules = await this.rules.published();
      const today = localDate(new Date(), await entityTimeZone(tx, org, entityId));
      const m = await this.month(tx, org, entityId, month);
      const states = (statute: string) =>
        [...new Set(m.lines.filter((l) => (l.rule as { statute?: string } | null)?.statute === statute).map((l) => (l.rule as { jurisdiction: string }).jurisdiction))].sort();
      const filings = await tx.statutoryFiling.findMany({
        where: { organizationId: org, legalEntityId: entityId, periodStart: asDate(`${month}-01`), status: { not: 'superseded' } },
        orderBy: { createdAt: 'asc' },
      });
      const cal = inForce(rules, 'IN.CALENDAR', ['IN'], `${month}-01`);
      const pen = inForce(rules, 'IN.PENALTY', ['IN'], `${month}-01`);
      // Founder 30 Oct 2026 (item 12): PT and LWF fall due by the state's own calendar (packs/in-dues.json); a state
      // without one (or without that item) shows no date and the card asks to verify it.
      const stateDue = (state: string, key: 'pt' | 'lwf') => {
        const rs = inForce(rules, 'IN.CALENDAR', [state], `${month}-01`);
        if (!rs || !(rs.values.items as { key: string }[]).some((x) => x.key === key)) return null;
        return due(rs, { key, month }).due as string;
      };
      // CMP-12 (founder answer 22): supplementary filings and excess records sit under the month's card they correct.
      const extra = filings.filter((x) => x.kind !== 'original');
      const penalties = extra.length ? await tx.statutoryPenaltyLine.findMany({ where: { organizationId: org, filingId: { in: extra.map((x) => x.id) } }, orderBy: { kind: 'asc' } }) : [];
      const basisOf = (x: (typeof extra)[number]) => (x.basis ?? {}) as Record<string, { amounts: Record<string, string> }>;
      const slipIds = [...new Set(extra.flatMap((x) => Object.keys(basisOf(x))))];
      const slipPeople = slipIds.length ? await tx.payslip.findMany({ where: { organizationId: org, id: { in: slipIds } }, select: { id: true, employeeId: true } }) : [];
      const names = slipPeople.length ? await tx.employee.findMany({ where: { organizationId: org, id: { in: slipPeople.map((s) => s.employeeId) } }, select: { id: true, givenName: true, familyName: true } }) : [];
      const nameOfSlip = (id: string) => {
        const p = names.find((n) => n.id === slipPeople.find((s) => s.id === id)?.employeeId);
        return p ? `${p.givenName} ${p.familyName ?? ''}`.trim() : 'Someone';
      };
      const children = (statute: string, state: string | null) =>
        extra
          .filter((x) => x.statute === statute && x.state === state)
          .map((x) => {
            const basis = basisOf(x);
            const employee = Object.values(basis).reduce((t, b) => t.add(b.amounts.employee ?? '0'), ZERO);
            const all = Object.values(basis).reduce((t, b) => Object.values(b.amounts).reduce((u, a) => u.add(a), t), ZERO);
            return {
              id: x.id,
              kind: x.kind as 'supplementary' | 'excess_adjustment' | 'excess_refund',
              status: x.status,
              amount: x.amount?.toFixed(2) ?? null,
              reason: x.reason,
              people: x.kind === 'supplementary' ? Object.keys(basis).length : null,
              employeeShare: employee.toFixed(2),
              employerShare: all.sub(employee).toFixed(2),
              causedBy: Object.keys(basis).slice(0, 20).map(nameOfSlip),
              reference: x.reference,
              fileId: x.exchangeFileId,
              correctsId: x.correctsId,
              createdAt: x.createdAt,
              penalties: penalties.filter((p) => p.filingId === x.id).map((p) => ({ kind: p.kind, daysLate: p.daysLate, base: p.base.toFixed(2), rate: p.rate, amount: p.amount.toFixed(2), ruleVersion: p.ruleVersion })),
            };
          });
      const card = (statute: string, state: string | null, amount: Prisma.Decimal, calKey: string | null, interestItem: string | null) => {
        const f = filings.filter((x) => x.statute === statute && x.state === state && x.kind === 'original').pop();
        const dueOn = state ? stateDue(state, statute === 'IN.PT' ? 'pt' : 'lwf') : cal && calKey ? (due(cal, { key: calKey, month }).due as string) : null;
        const late = dueOn && today > dueOn && f?.status !== 'filed';
        const estimate = late && pen && interestItem ? penalty(pen, { item: interestItem, amount: amount.toFixed(2), days: daysBetween(dueOn, today) }).amount.toFixed(2) : null;
        return {
          statute,
          state,
          label: `${LABEL[statute] ?? statute}${state ? ` · ${state}` : ''}`,
          amount: amount.toFixed(2),
          dueOn,
          status: f?.status ?? 'not_generated',
          filingId: f?.id ?? null,
          late: Boolean(late),
          penaltyEstimate: estimate,
          verifyDueDate: !dueOn,
          children: children(statute, state),
        };
      };
      const total = (key: string, jur?: string) => m.slips.reduce((t, s) => t.add(m.sum(s.id, m.codes(key), jur)), ZERO);
      const cards = [
        card(
          'IN.PF',
          null,
          total('pf_employee')
            .add(m.slips.reduce((t, s) => t.add(m.sum(s.id, new Set(['eps_employer']))), ZERO))
            .add(total('pf_employer')),
          CAL['IN.PF'],
          'pf_interest_yearly',
        ),
        card('IN.ESI', null, total('esi_employee').add(total('esi_employer')), CAL['IN.ESI'], 'esi_interest_yearly'),
        ...states('IN.PT').map((st) => card('IN.PT', st, total('pt', st), null, null)),
        ...states('IN.LWF').map((st) => card('IN.LWF', st, total('lwf_employee', st).add(total('lwf_employer', st)), null, null)),
      ];
      const tdsTotal = total('tds');
      const challan = await tx.tdsChallan.findFirst({ where: { organizationId: org, legalEntityId: entityId, depositMonth: asDate(`${month}-01`), subjectKey: 'salary_tds' } });
      const tdsDue = cal ? (due(cal, { key: 'tds_deposit', month }).due as string) : null;
      return {
        entityId,
        month,
        today,
        setupMissing: await setupMissing(tx, org, entityId, rules),
        cards,
        tds: { amount: tdsTotal.toFixed(2), dueOn: tdsDue, challanStatus: challan?.status ?? 'not_prepared', late: Boolean(tdsDue && today > tdsDue && challan?.status !== 'deposited') },
      };
    });
  }

  /**
   * CMP-03 register rows (founder question 2): one row per person paid in the month for EPF, ESIC, PT or LWF, from the
   * values stored on the approved payslips (never today's settings), with whether they were covered and why not, and the
   * entity's employee / employer totals for the six months up to it. IDs show only their last four characters.
   */
  async registerRows(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, kind: RegisterKind) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      const rules = await this.rules.published();
      const m = await this.month(tx, org, entityId, month);
      const end = asDate(monthRange(month).to);
      const [asg, idents, profiles] = await Promise.all([
        tx.employeeAssignment.findMany({
          where: { organizationId: org, employmentId: { in: m.slips.map((s) => s.employmentId) }, supersededAt: null, validFrom: { lte: end }, OR: [{ validTo: null }, { validTo: { gte: end } }] },
          select: { employmentId: true, locationId: true },
        }),
        tx.employeeIdentifiers.findMany({ where: { organizationId: org, employeeId: { in: m.slips.map((s) => s.employeeId) } }, select: { employeeId: true, uanLast4: true, esicLast4: true } }),
        tx.employeeStatutory.findMany({ where: { organizationId: org, employmentId: { in: m.slips.map((s) => s.employmentId) }, validFrom: { lte: end }, OR: [{ validTo: null }, { validTo: { gte: end } }] }, select: { employmentId: true, pf: true } }),
      ]);
      const places = await tx.location.findMany({ where: { organizationId: org, id: { in: asg.map((a) => a.locationId).filter((x): x is string => !!x) } }, select: { id: true, name: true, state: true } });
      const placeOf = (employmentId: string) => places.find((p) => p.id === asg.find((a) => a.employmentId === employmentId)?.locationId) ?? null;
      const esi = inForce(rules, 'IN.ESI', ['IN'], `${month}-01`);
      const monthName = (n: number) => new Date(Date.UTC(2000, n - 1, 1)).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' });
      // One row a person: an off-cycle payslip of the month adds to their regular one.
      const firsts = m.slips.filter((s, i) => m.slips.findIndex((x) => x.employmentId === s.employmentId) === i);
      const rows = firsts.map((s) => {
        const mine = m.slips.filter((x) => x.employmentId === s.employmentId);
        const gross = mine.reduce((t, x) => t.add(x.gross), ZERO);
        const place = placeOf(s.employmentId);
        const id = idents.find((x) => x.employeeId === s.employeeId);
        const amt = registerAmounts(kind, (key) => mine.reduce((t, x) => t.add(m.sum(x.id, key === 'eps_employer' ? new Set([key]) : m.codes(key))), ZERO));
        const pfRules = kind === 'epf' && D(amt.employee).gt(0) ? (rules.find((r) => r.statute === 'IN.PF' && r.jurisdiction === 'IN' && r.version === (s.ruleVersions as Record<string, string>)['IN.PF|IN']) ?? inForce(rules, 'IN.PF', ['IN'], `${month}-01`)) : null;
        const base = {
          employeeId: s.employeeId,
          name: m.nameOf(s.employeeId),
          code: m.people.find((p) => p.id === s.employmentId)?.employeeCode ?? '',
          location: place?.name ?? null,
          state: place?.state ?? null,
          uanLast4: id?.uanLast4 ?? null,
          ipLast4: id?.esicLast4 ?? null,
          gross: gross.toFixed(2),
          pfWage: pfRules ? D(amt.employee).div(D(String(pfRules.values.employeeRate))).toFixed(0) : null,
          ...amt,
        };
        if (D(amt.employee).gt(0) || D(amt.employer).gt(0)) return { ...base, coverage: 'covered' as const, reason: null };
        let reason = '';
        let coverage: 'not_covered' | 'not_due' = 'not_covered';
        if (kind === 'epf') reason = profiles.find((p) => p.employmentId === s.employmentId)?.pf === 'no' ? 'Not a PF member' : 'No PF on this payslip';
        else if (kind === 'esic') reason = esi && gross.gt(String(esi.values.wageCeiling)) ? `Wages above the ESI limit of ${rupeesText(String(esi.values.wageCeiling))}` : 'No ESI on this payslip';
        else {
          const rs = place ? inForce(rules, kind === 'pt' ? 'IN.PT' : 'IN.LWF', [place.state], `${month}-01`) : null;
          const dueMonths = (rs?.values.months as number[] | undefined) ?? null;
          if (!rs) reason = `No ${kind === 'pt' ? 'PT' : 'LWF'} in ${place ? (IN_STATES[place.state] ?? place.state) : 'the work state'}`;
          else if (kind === 'lwf' && dueMonths && !dueMonths.includes(Number(month.slice(5)))) {
            coverage = 'not_due';
            reason = `LWF is deducted in ${dueMonths.map(monthName).join(' and ')} in ${IN_STATES[place!.state] ?? place!.state}`;
          } else reason = kind === 'pt' ? 'Below the PT slab' : 'No LWF on this payslip';
        }
        return { ...base, coverage, reason };
      });
      // The six months up to this one: the entity's employee and employer totals for this statute.
      const trend = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 - i, 1)).toISOString().slice(0, 7);
        const x = i === 0 ? m : await this.month(tx, org, entityId, d);
        const t = x.slips.reduce(
          (acc, s) => {
            const a = registerAmounts(kind, (key) => x.sum(s.id, key === 'eps_employer' ? new Set([key]) : x.codes(key)));
            return { employee: acc.employee.add(a.employee), employer: acc.employer.add(a.employer) };
          },
          { employee: ZERO, employer: ZERO },
        );
        trend.push({ month: d, employee: t.employee.toFixed(2), employer: t.employer.toFixed(2) });
      }
      return { kind, month, rows: rows.sort((a, b) => a.code.localeCompare(b.code)), trend };
    });
  }

  /**
   * CMP-07 Missing IDs (founder answer 22): the people working in the entity today whose statutory IDs or bank account
   * block a filing or change their tax, in scope only: PAN for everyone (missing, or recorded inoperative this tax year);
   * UAN unless their statutory profile says no PF; ESI IP when ESI applies (their profile says yes, or their latest
   * approved payslip took ESI); a salary bank account (missing, or a new one still in its waiting time). No ID values,
   * only what is missing. statutory.filing.view over the entity.
   */
  async missingIds(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      const today = localDate(new Date(), await entityTimeZone(tx, org, entityId));
      const on = asDate(today);
      const jobs = await tx.employment.findMany({
        where: { organizationId: org, legalEntityId: entityId, joinedOn: { lte: on }, OR: [{ exitedOn: null }, { exitedOn: { gte: on } }] },
        select: { id: true, employeeId: true, employeeCode: true },
        orderBy: { employeeCode: 'asc' },
        take: 10_000,
      });
      const ids = jobs.map((j) => j.employeeId);
      const [people, idents, banks, profiles, asg] = await Promise.all([
        tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, givenName: true, familyName: true } }),
        tx.employeeIdentifiers.findMany({ where: { organizationId: org, employeeId: { in: ids } }, select: { employeeId: true, panHash: true, uanHash: true, esicHash: true } }),
        tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: { in: ids }, purpose: 'salary', validTo: null }, select: { employeeId: true, usableFrom: true } }),
        tx.employeeStatutory.findMany({ where: { organizationId: org, employmentId: { in: jobs.map((j) => j.id) }, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] }, select: { employmentId: true, pf: true, esi: true, validFrom: true }, orderBy: { validFrom: 'asc' } }),
        tx.employeeAssignment.findMany({ where: { organizationId: org, employeeId: { in: ids }, supersededAt: null, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] }, select: { employeeId: true, departmentId: true } }),
      ]);
      const depts = await tx.department.findMany({ where: { organizationId: org, id: { in: [...new Set(asg.map((a) => a.departmentId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
      const inoperative = new Set((await tx.taxWorkspace.findMany({ where: { organizationId: org, employeeId: { in: ids }, taxYear: taxYearOf(today.slice(0, 7)), panStatus: 'inoperative' }, select: { employeeId: true } })).map((w) => w.employeeId));
      // The latest approved payslip of each person in the entity: ESI taken there means ESI applies.
      const latest = await tx.$queryRaw<{ id: string; employeeId: string }[]>`
        SELECT DISTINCT ON (employee_id) id::text, employee_id::text AS "employeeId" FROM payslips
        WHERE organization_id = ${org}::uuid AND legal_entity_id = ${entityId}::uuid AND status = 'approved' AND employee_id = ANY(${ids}::uuid[])
        ORDER BY employee_id, period_start DESC`;
      const esiCodes = ['esi_employee', ...(await tx.payComponent.findMany({ where: { organizationId: org, statutory: 'esi_employee' }, select: { code: true } })).map((x) => x.code)];
      const withEsi = new Set(
        latest.length && esiCodes.length
          ? (await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: latest.map((l) => l.id) }, componentCode: { in: esiCodes }, amount: { gt: 0 } }, select: { employeeId: true } })).map((l) => l.employeeId)
          : [],
      );
      const now = new Date();
      const rows: { id: string; employeeId: string; name: string; code: string; department: string | null; issue: 'pan_missing' | 'pan_inoperative' | 'uan_missing' | 'esi_missing' | 'bank_missing' | 'bank_waiting'; blocks: boolean }[] = [];
      for (const j of jobs) {
        const p = people.find((x) => x.id === j.employeeId);
        const i = idents.find((x) => x.employeeId === j.employeeId);
        const prof = profiles.filter((x) => x.employmentId === j.id).pop();
        const bank = banks.find((b) => b.employeeId === j.employeeId);
        const base = { employeeId: j.employeeId, name: p ? `${p.givenName} ${p.familyName ?? ''}`.trim() : '', code: j.employeeCode, department: depts.find((d) => d.id === asg.find((a) => a.employeeId === j.employeeId)?.departmentId)?.name ?? null };
        const add = (issue: (typeof rows)[number]['issue'], blocks: boolean) => rows.push({ id: `${j.employeeId}:${issue}`, ...base, issue, blocks });
        if (!i?.panHash) add('pan_missing', false);
        else if (inoperative.has(j.employeeId)) add('pan_inoperative', false);
        if (prof?.pf !== 'no' && !i?.uanHash) add('uan_missing', true);
        if ((prof?.esi === 'yes' || withEsi.has(j.employeeId)) && !i?.esicHash) add('esi_missing', true);
        if (!bank) add('bank_missing', true);
        else if (bank.usableFrom > now) add('bank_waiting', true);
      }
      const count = (k: string) => rows.filter((r) => r.issue.startsWith(k)).length;
      return { entityId, people: jobs.length, counts: { pan: count('pan'), uan: count('uan'), esi: count('esi'), bank: count('bank') }, rows };
    });
  }

  /**
   * Home (PLT-02 finance): the hub of each legal entity the person may see (statutory.filing.view), for these wage months.
   * Null without the key.
   */
  async homeDues(ctx: TenantContext, user: ScopeUser, months: string[], entityId?: string | null) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    if (v.actingForOther || !v.userId || !v.grants.has('statutory.filing.view')) return null;
    const entities = await inCompany(this.tenantPrisma, ctx, async (tx, c) =>
      tx.legalEntity.findMany({ where: { organizationId: c.organizationId, id: { in: await entitiesFor(tx, c, v, 'statutory.filing.view') } }, select: { id: true, name: true } }),
    );
    const out = [];
    for (const e of entities.filter((x) => !entityId || x.id === entityId))
      for (const month of [...new Set(months)]) out.push({ entity: e.name, ...(await this.hub(ctx, user, e.id, month)) });
    return out;
  }

  // ------------------------------------------------------------------------------------------ filings (PAY-6.02, 6.03, 6.08)

  async generate(ctx: TenantContext, user: ScopeUser, dto: FilingDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entity(tx, c, v, 'statutory.filing.generate', dto.legalEntityId);
      const needsState = dto.statute === 'IN.PT' || dto.statute === 'IN.LWF';
      if (needsState !== Boolean(dto.state)) throw new BadRequestException(needsState ? 'Professional tax and LWF are filed per state: say which.' : 'PF and ESI are not filed per state.');
      const state = dto.state ?? null;
      const periodStart = asDate(`${dto.month}-01`);
      const waiting = await tx.payrollRun.count({ where: { organizationId: org, legalEntityId: e.id, periodStart, status: { notIn: ['approved', 'paid', 'void'] } } });
      if (waiting) throw new ConflictException('Statutory files are made once every payroll of the month is approved.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`filing:${org}:${e.id}:${dto.statute}:${state ?? ''}:${dto.month}`}))`;
      const live = await tx.statutoryFiling.findFirst({
        where: { organizationId: org, legalEntityId: e.id, statute: dto.statute, state, periodStart, kind: 'original', status: { not: 'superseded' } },
      });
      // Excess paid earlier: recorded with the amount and the reason, no file.
      if (dto.kind === 'excess_adjustment' || dto.kind === 'excess_refund') {
        if (!live || live.status !== 'filed') throw new ConflictException('An excess is recorded against a filed return.');
        if (!dto.amount || !dto.reason) throw new BadRequestException('Give the excess amount and the reason.');
        const f = await tx.statutoryFiling.create({
          data: {
            organizationId: org,
            legalEntityId: e.id,
            statute: dto.statute,
            state,
            periodStart,
            kind: dto.kind,
            correctsId: live.id,
            status: 'recorded',
            formatVersion: 'none',
            amount: D(dto.amount),
            reason: dto.reason,
            createdBy: v.userId!,
          },
        });
        await audit(tx, c, `statutory.${dto.kind}.recorded`, 'statutory_filing', f.id, { statute: dto.statute, month: dto.month, amount: dto.amount, reason: dto.reason });
        return { id: f.id, kind: f.kind, status: f.status };
      }
      const rules = await this.rules.published();
      const built = await this.rowsFor(tx, org, e.id, dto.statute, dto.month, state, rules);
      const fileKind = KIND[dto.statute];
      if (dto.kind === 'supplementary') {
        if (!live || live.status !== 'filed') throw new ConflictException('A supplementary filing corrects a filed return; generate the return itself instead.');
        return this.supplementary(tx, c, v, e, live, built, dto, rules);
      }
      if (live?.status === 'filed') throw new ConflictException('This return is filed. A change goes in a supplementary filing.');
      if (live && !dto.reason) throw new BadRequestException('This month already has a file. Say why a new one is needed.');
      if (!built.rows.length) throw new ConflictException({ statusCode: 409, message: 'There is nothing to file for this month.', missing: built.missing });
      const data = await built.data();
      const ex = await this.files.generateIn(tx, c, {
        legalEntityId: e.id,
        kind: fileKind,
        ownerType: 'statutory_filing',
        ownerId: null,
        periodStart: `${dto.month}-01`,
        fileName: `${fileKind}-${(e.shortName || 'entity').toLowerCase()}${state ? `-${state.toLowerCase()}` : ''}-${dto.month}.${built.ext}`,
        contentType: built.type,
        data,
        rows: built.rows.length,
        totals: built.totals as unknown as Record<string, string>,
        by: v.userId!,
      });
      if (live) await tx.statutoryFiling.update({ where: { id: live.id }, data: { status: 'superseded' } });
      const f = await tx.statutoryFiling.create({
        data: {
          organizationId: org,
          legalEntityId: e.id,
          statute: dto.statute,
          state,
          periodStart,
          kind: 'original',
          status: 'generated',
          formatVersion: FORMATS[fileKind as keyof typeof FORMATS],
          exchangeFileId: ex.id,
          generationNo: (live?.generationNo ?? 0) + 1,
          regenerationReason: live ? dto.reason! : null,
          rows: built.rows.length,
          totals: built.totals,
          basis: built.per as unknown as Prisma.InputJsonValue,
          createdBy: v.userId!,
        },
      });
      await audit(tx, c, 'statutory.filing.generated', 'statutory_filing', f.id, {
        statute: dto.statute,
        state,
        month: dto.month,
        rows: f.rows,
        sha256: ex.sha256,
        generation: f.generationNo,
        reason: f.regenerationReason,
        missing: built.missing.length,
      });
      return { id: f.id, fileId: ex.id, rows: f.rows, totals: built.totals, formatVersion: f.formatVersion, missing: built.missing };
    });
  }

  /**
   * PAY-6.08: what changed since the filed return (payslips revised after it), as a file of the differences, with the
   * interest (7Q / ESI interest) and damages (14B / ESI damages) on the late part from the original due date.
   */
  private async supplementary(
    tx: Tx,
    c: CompanyContext,
    v: Viewer,
    e: { id: string; shortName: string },
    live: Prisma.StatutoryFilingGetPayload<object>,
    built: Awaited<ReturnType<StatutoryFilingsService['rowsFor']>>,
    dto: FilingDto,
    rules: RuleSet[],
  ) {
    const org = c.organizationId;
    // What the return (and any supplementary filings since) already carried, payslip by payslip. A revised payslip is a new
    // payslip (the old one leaves the month), and an off-cycle payment adds one: the difference is what is new less what left.
    const earlier = await tx.statutoryFiling.findMany({ where: { organizationId: org, correctsId: live.id, kind: 'supplementary' }, select: { basis: true } });
    const before: Record<string, { amounts: Record<string, string> }> = Object.assign({}, live.basis as object, ...earlier.map((x) => x.basis as object));
    const total = (x: { amounts: Record<string, string> } | undefined) => Object.values(x?.amounts ?? {}).reduce((t, a) => t.add(a), ZERO);
    const changed = Object.keys(built.per).filter((id) => !(id in before));
    const left = Object.keys(before).filter((id) => !(id in built.per));
    const diff = changed.reduce((t, id) => t.add(total(built.per[id])), ZERO).sub(left.reduce((t, id) => t.add(total(before[id])), ZERO));
    if (!changed.length || diff.lte(0))
      throw new ConflictException(diff.lt(0) ? 'The changes lower what was paid: record an excess adjustment or refund instead.' : 'Nothing changed since the filed return.');
    const fileKind = KIND[dto.statute];
    const f = await tx.statutoryFiling.create({
      data: {
        organizationId: org,
        legalEntityId: e.id,
        statute: dto.statute,
        state: dto.state ?? null,
        periodStart: live.periodStart,
        kind: 'supplementary',
        correctsId: live.id,
        status: 'generated',
        formatVersion: FORMATS[fileKind as keyof typeof FORMATS],
        rows: changed.length,
        totals: { difference: diff.toFixed(2) },
        basis: Object.fromEntries(changed.map((id) => [id, built.per[id]])) as unknown as Prisma.InputJsonValue,
        amount: diff,
        reason: dto.reason ?? null,
        createdBy: v.userId!,
      },
    });
    const today = localDate(new Date(), await entityTimeZone(tx, org, e.id));
    const cal = inForce(rules, 'IN.CALENDAR', ['IN'], dateOf(live.periodStart));
    const dueOn = cal && CAL[dto.statute] ? (due(cal, { key: CAL[dto.statute], month: dto.month }).due as string) : null;
    const days = dueOn ? daysBetween(dueOn, today) : 0;
    const pen = inForce(rules, 'IN.PENALTY', ['IN'], dateOf(live.periodStart));
    const dmg = inForce(rules, 'IN.DAMAGES', ['IN'], dateOf(live.periodStart));
    const lines: { kind: string; rate: string; amount: Prisma.Decimal; version: string }[] = [];
    if (days > 0 && (dto.statute === 'IN.PF' || dto.statute === 'IN.ESI')) {
      const pf = dto.statute === 'IN.PF';
      if (pen)
        lines.push({
          kind: pf ? '7Q' : 'esi_interest',
          rate: String((pen.values.items as Record<string, string>)[pf ? 'pf_interest_yearly' : 'esi_interest_yearly']),
          amount: D(penalty(pen, { item: pf ? 'pf_interest_yearly' : 'esi_interest_yearly', amount: diff.toFixed(2), days }).amount),
          version: pen.version,
        });
      if (dmg) {
        const r = damages(dmg, { statute: pf ? 'pf' : 'esi', amount: diff.toFixed(2), daysLate: days });
        lines.push({ kind: pf ? '14B' : 'esi_damages', rate: r.rate, amount: D(r.amount), version: dmg.version });
      }
    }
    for (const l of lines)
      await tx.statutoryPenaltyLine.create({
        data: { organizationId: org, legalEntityId: e.id, filingId: f.id, kind: l.kind, daysLate: days, base: diff, rate: l.rate, amount: l.amount, ruleVersion: l.version },
      });
    // The file carries only the changed people.
    const rows = built.rows.filter((_r, i) => changed.includes(Object.keys(built.per)[i]));
    const data =
      dto.statute === 'IN.PF'
        ? ecrFile(rows as EcrRow[])
        : dto.statute === 'IN.ESI'
          ? await esiFile(rows as EsiRow[])
          : dto.statute === 'IN.PT'
            ? ptFile(dto.state!, dto.month, rows as PtRow[])
            : lwfFile(dto.state!, dto.month, rows as LwfRow[]);
    const ex = await this.files.generateIn(tx, c, {
      legalEntityId: e.id,
      kind: fileKind,
      ownerType: 'statutory_filing',
      ownerId: f.id,
      periodStart: dateOf(live.periodStart),
      fileName: `${fileKind}-supplementary-${dto.month}.${built.ext}`,
      contentType: built.type,
      data,
      rows: rows.length,
      totals: { difference: diff.toFixed(2) },
      by: v.userId!,
    });
    await tx.statutoryFiling.update({ where: { id: f.id }, data: { exchangeFileId: ex.id } });
    await audit(tx, c, 'statutory.filing.supplementary', 'statutory_filing', f.id, {
      statute: dto.statute,
      month: dto.month,
      corrects: live.id,
      difference: diff.toFixed(2),
      penalties: lines.map((l) => ({ kind: l.kind, amount: l.amount.toFixed(2) })),
    });
    return { id: f.id, fileId: ex.id, kind: 'supplementary', difference: diff.toFixed(2), daysLate: days, penalties: lines.map((l) => ({ kind: l.kind, rate: l.rate, amount: l.amount.toFixed(2) })) };
  }

  async filings(ctx: TenantContext, user: ScopeUser, entityId: string, month?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      const rows = await tx.statutoryFiling.findMany({
        where: { organizationId: c.organizationId, legalEntityId: entityId, ...(month ? { periodStart: asDate(`${month}-01`) } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const pens = await tx.statutoryPenaltyLine.findMany({ where: { organizationId: c.organizationId, filingId: { in: rows.map((r) => r.id) } } });
      return rows.map((f) => ({
        id: f.id,
        statute: f.statute,
        state: f.state,
        month: dateOf(f.periodStart).slice(0, 7),
        kind: f.kind,
        status: f.status,
        formatVersion: f.formatVersion,
        fileId: f.exchangeFileId,
        rows: f.rows,
        totals: f.totals,
        amount: f.amount?.toFixed(2) ?? null,
        reason: f.reason ?? f.regenerationReason,
        reference: f.reference,
        filingMode: f.filingMode,
        filedAt: f.filedAt,
        // Answer 842: the bank's challan receipt PDF, when added.
        receipt: Boolean(f.receiptFileId),
        penalties: pens.filter((p) => p.filingId === f.id).map((p) => ({ kind: p.kind, daysLate: p.daysLate, rate: p.rate, amount: p.amount.toFixed(2) })),
      }));
    });
  }

  private async filingFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey) {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const f = await tx.statutoryFiling.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!f || !ids.includes(f.legalEntityId)) throw new NotFoundException('Not found');
    return f;
  }

  /** Uploaded on the portal: the portal's reference (TRRN or challan number) is recorded. */
  async uploaded(ctx: TenantContext, user: ScopeUser, id: string, reference: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.filingFor(tx, c, v, id, 'statutory.filing.mark_filed');
      if (f.status !== 'generated') throw new ConflictException(`This filing is ${f.status}.`);
      await tx.statutoryFiling.update({ where: { id }, data: { status: 'uploaded', reference, uploadedBy: v.userId!, uploadedAt: new Date() } });
      await audit(tx, c, 'statutory.filing.uploaded', 'statutory_filing', id, { statute: f.statute, reference });
      return { id, status: 'uploaded', reference };
    });
  }

  /** Filed (step-up and the typed phrase): the month locks as filed and can no longer be reopened (YX-PAY-21). */
  async filed(ctx: TenantContext, user: ScopeUser, id: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.filingFor(tx, c, v, id, 'statutory.filing.mark_filed');
      if (f.status !== 'uploaded') throw new ConflictException(f.status === 'filed' ? 'This filing is already filed.' : 'Record the upload and its reference first.');
      const month = dateOf(f.periodStart).slice(0, 7);
      const phrase = `FILED ${f.statute.slice(3)} ${month}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      const now = new Date();
      await tx.statutoryFiling.update({ where: { id }, data: { status: 'filed', filedBy: v.userId!, filedAt: now } });
      const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: f.legalEntityId, payGroupId: null, periodStart: f.periodStart } });
      if (p && p.stage === 'locked') {
        await tx.payPeriod.update({ where: { id: p.id }, data: { stage: 'filed', changedAt: now, version: { increment: 1 } } });
        await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: p.id, fromStage: 'locked', toStage: 'filed', byUser: v.userId!, reason: `${f.statute} filed (${f.reference})` } });
      }
      await audit(tx, c, 'statutory.filing.filed', 'statutory_filing', id, {
        statute: f.statute,
        state: f.state,
        month,
        reference: f.reference,
        confirmed: { phrase: confirmation.phrase, impact: confirmation.impact },
      });
      return { id, status: 'filed', periodStage: p ? 'filed' : null };
    });
  }

  /**
   * Answer 842: the bank's challan receipt (PDF, up to 5 MB) for a PF, ESI or PT return once it is uploaded on the portal
   * or filed; a new one replaces the last (both kept as files). It goes in a client pack where present; the return file
   * itself never does.
   */
  async addReceipt(ctx: TenantContext, user: ScopeUser, id: string, file: { originalname?: string; buffer?: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the bank challan receipt (PDF).');
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.filingFor(tx, c, v, id, 'statutory.filing.mark_filed');
      if (!['IN.PF', 'IN.ESI', 'IN.PT'].includes(f.statute)) throw new BadRequestException('A bank challan receipt is kept for PF, ESI and PT returns.');
      if (f.status !== 'uploaded' && f.status !== 'filed') throw new ConflictException('Add the receipt once the return is uploaded on the portal.');
      const stored = await this.docs.storeIn(tx, c, { area: 'challan-receipt', name: file.originalname || 'challan-receipt.pdf', data: file.buffer!, allowedMime: ['application/pdf'], maxMb: 5, via: 'staff' });
      await tx.statutoryFiling.update({ where: { id }, data: { receiptFileId: stored.id } });
      await audit(tx, c, 'statutory.filing.receipt_added', 'statutory_filing', id, { statute: f.statute, fileId: stored.id, sha256: stored.sha256, replaced: f.receiptFileId });
      return { id, receipt: true, fileId: stored.id };
    });
    void this.docs.scan(ctx.organizationId as string, out.fileId).catch(() => undefined);
    return out;
  }

  async receipt(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.filingFor(tx, c, v, id, 'statutory.filing.view');
      if (!f.receiptFileId) throw new NotFoundException('No bank receipt yet.');
      const file = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: f.receiptFileId } });
      if (file.scanStatus !== 'clean') throw new ConflictException('The receipt is still being checked for viruses, or failed the check.');
      return file;
    });
    return { file: await this.docs.bytes(row), name: row.fileName };
  }

  /** PAY-6.06 partner path. Founder decision 5f-D2 (10 Oct 2026): self-filing for the pilot, so no partner is connected. */
  async transmit(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, (tx, c) => this.filingFor(tx, c, v, id, 'statutory.filing.generate'));
    throw new ConflictException({ statusCode: 409, code: 'NO_FILING_PARTNER', message: 'No filing partner is connected yet; file it yourself on the portal and record the reference.' });
  }

  // ------------------------------------------------------------------------------------------ TDS challans (PAY-6.04)

  private challanView(x: Prisma.TdsChallanGetPayload<object>) {
    return {
      id: x.id,
      month: dateOf(x.depositMonth).slice(0, 7),
      subjectKey: x.subjectKey,
      lawVersion: x.lawVersion,
      tds: x.tds.toFixed(2),
      interest: x.interest.toFixed(2),
      fee: x.fee.toFixed(2),
      prefill: x.prefill,
      challanNo: x.challanNo,
      bsrCode: x.bsrCode,
      depositDate: x.depositDate ? dateOf(x.depositDate) : null,
      status: x.status,
      editReason: x.editReason,
      // Founder answer 23: what payroll's payslips say, beside a corrected amount.
      payrollTds: (x.prefill as { tds?: string }).tds ?? null,
    };
  }

  async challans(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      return (await tx.tdsChallan.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: { depositMonth: 'desc' } })).map((x) => this.challanView(x));
    });
  }

  /** The month's challan pre-filled from the approved payslips' TDS (refreshed while it is a draft). */
  async prepareChallan(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.challan.manage', entityId);
      const m = await this.month(tx, org, entityId, month);
      const tds = m.slips.reduce((t, s) => t.add(m.sum(s.id, m.codes('tds'))), ZERO);
      const key = { organizationId: org, legalEntityId: entityId, depositMonth: asDate(`${month}-01`), subjectKey: 'salary_tds' };
      const old = await tx.tdsChallan.findFirst({ where: key });
      if (old?.status === 'deposited') throw new ConflictException('This challan is deposited.');
      const prefill = { tds: tds.toFixed(2), payslips: m.slips.length, at: new Date().toISOString(), by: v.userId! };
      const row = old
        ? await tx.tdsChallan.update({ where: { id: old.id }, data: { tds, prefill, editReason: null, updatedBy: v.userId!, updatedAt: new Date() } })
        : await tx.tdsChallan.create({ data: { ...key, lawVersion: lawVersionFor(taxYearOf(month)), tds, prefill, updatedBy: v.userId! } });
      await audit(tx, c, 'statutory.challan.prepared', 'tds_challan', row.id, { month, tds: tds.toFixed(2) });
      return this.challanView(row);
    });
  }

  /**
   * Edit (a changed amount needs a reason) or record the deposit (challan number, BSR code, date). Paid after the due
   * date: interest for each month or part from the deduction (the month's last day) to the deposit, from P07.
   */
  async updateChallan(ctx: TenantContext, user: ScopeUser, id: string, dto: ChallanUpdateDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'statutory.challan.manage');
      await payScope(tx, ids);
      const x = await tx.tdsChallan.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x || !ids.includes(x.legalEntityId)) throw new NotFoundException('Not found');
      if (x.status === 'deposited') throw new ConflictException('This challan is deposited.');
      const tds = dto.tds !== undefined ? D(dto.tds) : x.tds;
      const pre = D((x.prefill as { tds?: string }).tds ?? '0');
      // Founder answer 23: payroll may correct the amount with a reason (audited), never the person who prepared the challan.
      // A deposit after a correction carries the corrected amount and needs no second reason.
      const corrected = !tds.eq(x.tds);
      if (corrected && !dto.reason) throw new BadRequestException(tds.eq(pre) ? 'Say why the amount changes back.' : 'The amount differs from the payslips: say why.');
      if (corrected && ((x.prefill as { by?: string }).by ?? x.updatedBy) === v.userId)
        throw new ForbiddenException('You prepared this challan, so someone else in payroll corrects its amount.');
      const month = dateOf(x.depositMonth).slice(0, 7);
      const data: Prisma.TdsChallanUpdateInput = { tds, editReason: dto.reason ?? x.editReason, updatedBy: v.userId!, updatedAt: new Date() };
      let interest = ZERO;
      if (dto.challanNo && dto.bsrCode && dto.depositDate) {
        const rules = await this.rules.published();
        const cal = inForce(rules, 'IN.CALENDAR', ['IN'], `${month}-01`);
        const pen = inForce(rules, 'IN.PENALTY', ['IN'], `${month}-01`);
        const dueOn = cal ? (due(cal, { key: 'tds_deposit', month }).due as string) : null;
        if (dueOn && dto.depositDate > dueOn && pen) {
          const deducted = monthRange(month).to;
          const months = (Number(dto.depositDate.slice(0, 4)) - Number(deducted.slice(0, 4))) * 12 + Number(dto.depositDate.slice(5, 7)) - Number(deducted.slice(5, 7)) + 1;
          interest = D(penalty(pen, { item: 'tds_late_payment_monthly', amount: tds.toFixed(2), months }).amount).toDecimalPlaces(0, Prisma.Decimal.ROUND_UP);
        }
        Object.assign(data, { challanNo: dto.challanNo, bsrCode: dto.bsrCode, depositDate: asDate(dto.depositDate), status: 'deposited', interest });
      }
      const row = await tx.tdsChallan.update({ where: { id }, data });
      if (corrected) await audit(tx, c, 'statutory.challan.corrected', 'tds_challan', id, { month, from: x.tds.toFixed(2), to: tds.toFixed(2), payroll: pre.toFixed(2), reason: dto.reason ?? null });
      await audit(tx, c, row.status === 'deposited' ? 'statutory.challan.deposited' : 'statutory.challan.edited', 'tds_challan', id, {
        month,
        tds: tds.toFixed(2),
        interest: interest.toFixed(2),
        reason: dto.reason ?? null,
        challanNo: dto.challanNo ?? null,
      });
      return this.challanView(row);
    });
  }

  // ------------------------------------------------------------------------------------------ TDS returns (PAY-6.05, 6.07)

  /**
   * Deductee rows of a quarter: one per person and month with TDS, leavers included; PAN masked here, in full only in the
   * file. CMP-05 MissingMonth: a month paid before the entity started on YukthiX takes its rows from the imported as-paid
   * lines (Payroll set-up › Imports): TDS from the TDS lines, the amount paid from the earning lines.
   */
  private async tdsRows(tx: Tx, org: string, entityId: string, taxYear: string, quarter: number) {
    const months = quarterMonths(taxYear, quarter);
    const rows: (TdsRow & { employeeId: string; pan: string | null })[] = [];
    for (const month of months) {
      const m = await this.month(tx, org, entityId, month);
      if (!m.slips.length) {
        rows.push(...(await this.importedRows(tx, org, entityId, month, m.codes('tds'))));
        continue;
      }
      const ids = await tx.employeeIdentifiers.findMany({ where: { organizationId: org, employeeId: { in: m.slips.map((s) => s.employeeId) } }, select: { employeeId: true, panEnc: true } });
      for (const s of m.slips) {
        const tds = m.sum(s.id, m.codes('tds'));
        if (tds.isZero()) continue;
        const pan = this.open(org, s.employeeId, ids.find((x) => x.employeeId === s.employeeId)?.panEnc);
        rows.push({
          employeeId: s.employeeId,
          employeeCode: m.people.find((p) => p.id === s.employmentId)?.employeeCode ?? '',
          name: m.nameOf(s.employeeId),
          pan,
          month,
          paid: s.gross.toFixed(2),
          tds: tds.toFixed(2),
          noPan: !pan,
        });
      }
    }
    return rows;
  }

  /** A month paid in the old payroll: its imported as-paid lines as deductee rows (people with TDS only). */
  private async importedRows(tx: Tx, org: string, entityId: string, month: string, tdsCodes: Set<string>) {
    const lines = await tx.asPaidLine.findMany({ where: { organizationId: org, legalEntityId: entityId, periodStart: asDate(`${month}-01`) }, select: { employeeId: true, employmentId: true, componentCode: true, amount: true } });
    if (!lines.length) return [];
    const earning = new Set((await tx.payComponent.findMany({ where: { organizationId: org, kind: 'earning' }, select: { code: true } })).map((x) => x.code));
    const jobs = [...new Set(lines.map((l) => l.employmentId))];
    const [people, names, ids] = await Promise.all([
      tx.employment.findMany({ where: { organizationId: org, id: { in: jobs } }, select: { id: true, employeeId: true, employeeCode: true } }),
      tx.employee.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.employeeId) } }, select: { id: true, givenName: true, familyName: true } }),
      tx.employeeIdentifiers.findMany({ where: { organizationId: org, employeeId: { in: lines.map((l) => l.employeeId) } }, select: { employeeId: true, panEnc: true } }),
    ]);
    const out: (TdsRow & { employeeId: string; pan: string | null })[] = [];
    for (const job of people) {
      const mine = lines.filter((l) => l.employmentId === job.id);
      const tds = mine.filter((l) => tdsCodes.has(l.componentCode)).reduce((t, l) => t.add(l.amount), ZERO);
      if (tds.lte(0)) continue;
      const p = names.find((n) => n.id === job.employeeId);
      const pan = this.open(org, job.employeeId, ids.find((x) => x.employeeId === job.employeeId)?.panEnc);
      out.push({
        employeeId: job.employeeId,
        employeeCode: job.employeeCode,
        name: p ? [p.givenName, p.familyName].filter(Boolean).join(' ') : '',
        pan,
        month,
        paid: mine.filter((l) => earning.has(l.componentCode)).reduce((t, l) => t.add(l.amount), ZERO).toFixed(2),
        tds: tds.toFixed(2),
        noPan: !pan,
      });
    }
    return out;
  }

  /**
   * CMP-05 completeness: per month of the quarter, its deductee rows and where they come from; a month before the
   * entity's first approved payroll with nothing imported is missing (the return file waits for it). PAN warnings:
   * deductees with no PAN, or with a PAN recorded inoperative for the tax year (TDS at the higher rate).
   */
  private async completeness(tx: Tx, org: string, r: { legalEntityId: string; taxYear: string; quarter: number; rows: Prisma.JsonValue }) {
    const months = quarterMonths(r.taxYear, r.quarter);
    const starts = months.map((m) => asDate(`${m}-01`));
    const rows = r.rows as { employeeId: string; employeeCode: string; name: string; month: string; noPan: boolean }[];
    const [first, imported, paid, nil] = await Promise.all([
      tx.payslip.findFirst({ where: { organizationId: org, legalEntityId: r.legalEntityId, status: 'approved' }, orderBy: { periodStart: 'asc' }, select: { periodStart: true } }),
      tx.asPaidLine.findMany({ where: { organizationId: org, legalEntityId: r.legalEntityId, periodStart: { in: starts } }, distinct: ['periodStart'], select: { periodStart: true } }),
      tx.payslip.findMany({ where: { organizationId: org, legalEntityId: r.legalEntityId, status: 'approved', periodStart: { in: starts } }, distinct: ['periodStart'], select: { periodStart: true } }),
      tx.tdsNilMonth.findMany({ where: { organizationId: org, legalEntityId: r.legalEntityId, month: { in: starts }, undoneAt: null } }),
    ]);
    const firstMonth = first ? dateOf(first.periodStart).slice(0, 7) : null;
    const inoperative = new Set(
      (await tx.taxWorkspace.findMany({ where: { organizationId: org, employeeId: { in: [...new Set(rows.map((x) => x.employeeId))] }, taxYear: r.taxYear, panStatus: 'inoperative' }, select: { employeeId: true } })).map((w) => w.employeeId),
    );
    const has = (list: { periodStart: Date }[], m: string) => list.some((x) => dateOf(x.periodStart).slice(0, 7) === m);
    const monthRows = months.map((m) => {
      const none = nil.find((x) => dateOf(x.month).slice(0, 7) === m);
      const source = has(paid, m) ? ('payroll' as const) : has(imported, m) ? ('imported' as const) : none ? ('nil' as const) : ('none' as const);
      return {
        month: m,
        rows: rows.filter((x) => x.month === m).length,
        source,
        missing: source === 'none' && !!firstMonth && m < firstMonth,
        // CMP-05: recorded as having no salary TDS (undo until the return is filed).
        nil: none ? { id: none.id, version: none.version, reason: none.reason, recordedAt: none.recordedAt } : null,
      };
    });
    const seen = new Set<string>();
    const panWarnings = rows
      .filter((x) => (x.noPan || inoperative.has(x.employeeId)) && !seen.has(x.employeeId) && Boolean(seen.add(x.employeeId)))
      .map((x) => ({ employeeId: x.employeeId, employeeCode: x.employeeCode, name: x.name, issue: x.noPan ? ('pan_missing' as const) : ('pan_inoperative' as const) }));
    return { months: monthRows, panWarnings: panWarnings.slice(0, 100), panWarningCount: panWarnings.length, panChecked: new Set(rows.map((x) => x.employeeId)).size };
  }

  /** The filed original salary return of the quarter a month falls in, if any. */
  private async filedFor(tx: Tx, org: string, entityId: string, month: string) {
    const m = Number(month.slice(5));
    const quarter = Math.floor(((m + 8) % 12) / 3) + 1;
    return tx.tdsReturn.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear: taxYearOf(month), quarter, kind: 'original', status: 'filed', formCode: { in: SALARY_FORMS } }, select: { id: true } });
  }

  private nilView(x: Prisma.TdsNilMonthGetPayload<object>) {
    return { id: x.id, entityId: x.legalEntityId, month: dateOf(x.month).slice(0, 7), reason: x.reason, recordedBy: x.recordedBy, recordedAt: x.recordedAt, undoneAt: x.undoneAt, version: x.version };
  }

  /**
   * CMP-05 (founder answer 2): a month with no salary TDS at all, recorded with a reason so the return counts it complete
   * with no rows. Refused for a month still to come, one whose approved payslips or imported lines carry TDS, one already
   * recorded, and one whose quarter's return is filed.
   */
  async recordNilMonth(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.generate', entityId);
      const today = localDate(new Date(), await entityTimeZone(tx, org, entityId));
      if (month >= today.slice(0, 7)) throw new BadRequestException(`${monthName(month)} has not ended yet. Record this for a month that is over.`);
      const m = await this.month(tx, org, entityId, month);
      const tds = m.slips.reduce((t, x) => t.add(m.sum(x.id, m.codes('tds'))), ZERO);
      if (tds.gt(0)) throw new ConflictException(`${monthName(month)} has approved payslips with ${rupeesText(tds.toFixed(2))} of TDS. Its rows come from payroll, so it cannot be marked as having no deductees.`);
      const imported = (await this.importedRows(tx, org, entityId, month, m.codes('tds'))).length;
      if (imported) throw new ConflictException(`${monthName(month)} has imported as-paid lines with TDS for ${imported} ${imported === 1 ? 'person' : 'people'}, so it cannot be marked as having no deductees.`);
      if (await this.filedFor(tx, org, entityId, month)) throw new ConflictException('The return for this quarter is filed. A change goes in a correction return.');
      if (await tx.tdsNilMonth.findFirst({ where: { organizationId: org, legalEntityId: entityId, month: asDate(`${month}-01`), undoneAt: null }, select: { id: true } }))
        throw new ConflictException(`${monthName(month)} is already recorded as having no deductees.`);
      const row = await tx.tdsNilMonth.create({ data: { organizationId: org, legalEntityId: entityId, month: asDate(`${month}-01`), reason, recordedBy: v.userId! } });
      await audit(tx, c, 'statutory.tds_nil_month.recorded', 'tds_nil_month', row.id, { month, reason });
      return this.nilView(row);
    });
  }

  /** Undoes a "no deductees" record (the version as last read) while the quarter's return is not filed. */
  async undoNilMonth(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'statutory.filing.generate');
      await payScope(tx, ids);
      const x = await tx.tdsNilMonth.findFirst({ where: { organizationId: org, id } });
      if (!x || !ids.includes(x.legalEntityId)) throw new NotFoundException('Not found');
      const month = dateOf(x.month).slice(0, 7);
      if (x.undoneAt) throw new ConflictException('This is already undone.');
      if (await this.filedFor(tx, org, x.legalEntityId, month)) throw new ConflictException('The return for this quarter is filed, so this stays. A change goes in a correction return.');
      const done = await tx.tdsNilMonth.updateMany({ where: { organizationId: org, id, version, undoneAt: null }, data: { undoneAt: new Date(), undoneBy: v.userId!, version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('Someone else changed this. Reload to see it.');
      await audit(tx, c, 'statutory.tds_nil_month.undone', 'tds_nil_month', id, { month, reason: x.reason });
      return this.nilView(await tx.tdsNilMonth.findFirstOrThrow({ where: { organizationId: org, id } }));
    });
  }

  private returnView(r: Prisma.TdsReturnGetPayload<object>) {
    const rows = r.rows as { employeeId: string; employeeCode: string; name: string; panLast4: string | null; month: string; paid: string; tds: string; noPan: boolean }[];
    return {
      id: r.id,
      formCode: r.formCode,
      lawVersion: r.lawVersion,
      taxYear: r.taxYear,
      quarter: r.quarter,
      kind: r.kind,
      correctsId: r.correctsId,
      status: r.status,
      tokenNo: r.tokenNo,
      reconciliation: r.reconciliation,
      fileId: r.exchangeFileId,
      validation: r.fvu ?? null,
      rows: rows.length,
      tds: rows.reduce((t, x) => t.add(x.tds), ZERO).toFixed(2),
      deductees: rows,
    };
  }

  private mask = (rows: Awaited<ReturnType<StatutoryFilingsService['tdsRows']>>) => rows.map(({ pan, ...r }) => ({ ...r, panLast4: pan ? pan.slice(-4) : null }));

  async createReturn(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string, quarter: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.entity(tx, c, v, 'statutory.filing.generate', entityId);
      const law = lawVersionFor(taxYear);
      const old = await tx.tdsReturn.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear, quarter, kind: 'original', formCode: { in: SALARY_FORMS } } });
      if (old?.status === 'filed') throw new ConflictException('This return is filed. A change goes in a correction return.');
      const rows = this.mask(await this.tdsRows(tx, org, entityId, taxYear, quarter));
      const data = { rows: rows as unknown as Prisma.InputJsonValue, reconciliation: Prisma.DbNull, status: 'draft', exchangeFileId: null };
      const r = old
        ? await tx.tdsReturn.update({ where: { id: old.id }, data })
        : await tx.tdsReturn.create({
            data: { organizationId: org, legalEntityId: entityId, formCode: taxForms(law).quarterlyReturn === '24Q' ? '24Q' : '138', lawVersion: law, taxYear, quarter, createdBy: v.userId!, ...data },
          });
      await audit(tx, c, 'statutory.tds_return.drafted', 'tds_return', r.id, { taxYear, quarter, rows: rows.length });
      return { ...this.returnView(r), completeness: await this.completeness(tx, org, r) };
    });
  }

  private async returnFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey) {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const r = await tx.tdsReturn.findFirst({ where: { organizationId: c.organizationId, id, formCode: { in: SALARY_FORMS } } });
    if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
    return r;
  }

  async getReturn(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.returnFor(tx, c, v, id, 'statutory.filing.view');
      return { ...this.returnView(r), completeness: await this.completeness(tx, c.organizationId, r) };
    });
  }

  /** RPT-STAT-01: tax deducted per month against the deposited challans; the return goes ahead only at zero difference. */
  async reconcile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.returnFor(tx, c, v, id, 'statutory.filing.generate');
      if (r.status === 'filed') throw new ConflictException('This return is filed.');
      const rows = r.rows as { month: string; tds: string }[];
      const months = quarterMonths(r.taxYear, r.quarter);
      const challans = await tx.tdsChallan.findMany({
        where: { organizationId: c.organizationId, legalEntityId: r.legalEntityId, subjectKey: 'salary_tds', depositMonth: { in: months.map((m) => asDate(`${m}-01`)) } },
      });
      const lines = months.map((m) => {
        const deducted = rows.filter((x) => x.month === m).reduce((t, x) => t.add(x.tds), ZERO);
        const ch = challans.find((x) => dateOf(x.depositMonth).slice(0, 7) === m);
        const deposited = ch?.status === 'deposited' ? ch.tds : ZERO;
        return { month: m, deducted: deducted.toFixed(2), deposited: deposited.toFixed(2), difference: deducted.sub(deposited).toFixed(2), challan: ch?.challanNo ?? null };
      });
      const ok = lines.every((l) => D(l.difference).isZero());
      const row = await tx.tdsReturn.update({
        where: { id },
        data: { reconciliation: { lines, ok, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue, status: ok ? 'reconciled' : 'draft' },
      });
      await audit(tx, c, 'statutory.tds_return.reconciled', 'tds_return', id, { ok, lines });
      return this.returnView(row);
    });
  }

  /**
   * Founder decision 5f-D1: the return in the official e-TDS format (deductor from the entity and its TDS registration,
   * a challan record per deposited month and its deductees under it, full PANs only in the file), validated by the
   * government's File Validation Utility in an isolated worker (a fake with structural checks in development only).
   * Stored encrypted and downloaded through an audited single-use link; a valid file makes the return "validated".
   */
  async returnFile(ctx: TenantContext, user: ScopeUser, id: string, csi: Buffer | null = null) {
    const v = await this.viewer(user);
    const built = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await this.returnFor(tx, c, v, id, 'statutory.filing.generate');
      if (!['reconciled', 'validated'].includes(r.status)) throw new ConflictException('Reconcile the return with the challans first (the difference must be zero).');
      const gap = (await this.completeness(tx, org, r)).months.filter((x) => x.missing).map((x) => monthName(x.month));
      if (gap.length)
        throw new ConflictException({
          statusCode: 409,
          code: 'TDS_MONTH_MISSING',
          message: `${gap.join(' and ')} ${gap.length === 1 ? 'was' : 'were'} paid before this company started on YukthiX. Import ${gap.length === 1 ? 'its' : 'their'} as-paid lines, start the return again, then make the file.`,
        });
      const rows = await this.tdsRows(tx, org, r.legalEntityId, r.taxYear, r.quarter);
      const problems = rows.filter((x) => x.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(x.pan)).map((x) => `${x.employeeCode}: the PAN on file is not valid.`);
      const deductor = await etdsDeductor(tx, org, r.legalEntityId, problems);
      if (problems.length) throw new BadRequestException({ statusCode: 400, message: 'Fix these before the return file is made.', problems });
      const months = [...new Set(rows.map((x) => x.month))].sort();
      const challans = await tx.tdsChallan.findMany({
        where: { organizationId: org, legalEntityId: r.legalEntityId, subjectKey: 'salary_tds', status: 'deposited', depositMonth: { in: months.map((m) => asDate(`${m}-01`)) } },
      });
      const input = {
        formNo: r.formCode as '24Q' | '138',
        taxYear: r.taxYear,
        quarter: r.quarter,
        createdOn: localDate(new Date(), await entityTimeZone(tx, org, r.legalEntityId)),
        deductor: deductor!,
        challans: months.map((m) => {
          const ch = challans.find((x) => dateOf(x.depositMonth).slice(0, 7) === m)!;
          const end = monthRange(m).to;
          return {
            bsr: ch.bsrCode!,
            challanNo: ch.challanNo!,
            depositDate: dateOf(ch.depositDate!),
            tds: ch.tds.toFixed(2),
            interest: ch.interest.toFixed(2),
            fee: ch.fee.toFixed(2),
            deductees: rows.filter((x) => x.month === m).map((x) => ({ pan: x.pan, name: x.name, paid: x.paid, tds: x.tds, paidOn: end, deductedOn: end, noPan: x.noPan })),
          };
        }),
      };
      return { r, data: etdsFile(input), rows };
    });
    let outcome: FvuOutcome;
    try {
      outcome = await this.fvu.validate(built.data, built.r.taxYear, csi);
    } catch (e) {
      if (e instanceof FvuUnavailable) throw new ConflictException({ statusCode: 409, code: 'FVU_UNAVAILABLE', message: e.message });
      throw e;
    }
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = built.r;
      await payScope(tx, [r.legalEntityId]);
      const kind: FileKind = r.formCode === '24Q' ? 'form24q' : 'form138';
      const ex = await this.files.generateIn(tx, c, {
        legalEntityId: r.legalEntityId,
        kind,
        ownerType: 'tds_return',
        ownerId: r.id,
        periodStart: null,
        fileName: `${r.formCode.toLowerCase()}-${r.taxYear}-q${r.quarter}${r.kind === 'correction' ? '-correction' : ''}.txt`,
        contentType: 'text/plain; charset=utf-8',
        data: built.data,
        rows: built.rows.length,
        totals: { tds: built.rows.reduce((t, x) => t.add(x.tds), ZERO).toFixed(2) },
        by: v.userId!,
      });
      // The FVU's .fvu output is what the portal takes: kept beside the return file, under the same audited links.
      const out = outcome.output
        ? await this.files.generateIn(tx, c, {
            legalEntityId: r.legalEntityId,
            kind,
            ownerType: 'tds_return',
            ownerId: r.id,
            periodStart: null,
            fileName: `${r.formCode.toLowerCase()}-${r.taxYear}-q${r.quarter}.fvu`,
            contentType: 'application/octet-stream',
            data: outcome.output,
            rows: built.rows.length,
            totals: {},
            by: v.userId!,
          })
        : null;
      const fvu = {
        fvuFileId: out?.id ?? null,
        validator: outcome.validator,
        version: outcome.version,
        ok: outcome.ok,
        errors: outcome.errors.slice(0, 50),
        fileSha256: ex.sha256,
        fvuSha256: outcome.output ? sha256(outcome.output) : null,
        format: ETDS_FORMAT,
        at: new Date().toISOString(),
      };
      await tx.tdsReturn.update({ where: { id: r.id }, data: { exchangeFileId: ex.id, fvu: fvu as unknown as Prisma.InputJsonValue, status: outcome.ok ? 'validated' : 'reconciled' } });
      await audit(tx, c, 'statutory.tds_return.validated', 'tds_return', r.id, { validator: outcome.validator, ok: outcome.ok, errors: outcome.errors.length, sha256: ex.sha256 });
      return { id: r.id, fileId: ex.id, rows: built.rows.length, sha256: ex.sha256, validation: fvu };
    });
  }

  /**
   * Founder decision 5g-D1: the filer ran the FVU on their computer and uploads the .fvu. It must be this return as we
   * generated it (checked record for record, the stored file's hash checked first); then the return is validated and the
   * .fvu is kept beside it under the same audited links.
   */
  async uploadFvu(ctx: TenantContext, user: ScopeUser, id: string, fvuFile: Buffer | undefined) {
    const v = await this.viewer(user);
    if (!fvuFile?.length) throw new BadRequestException('Attach the .fvu file the FVU made.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.returnFor(tx, c, v, id, 'statutory.filing.generate');
      if (!['reconciled', 'validated'].includes(r.status) || !r.exchangeFileId) throw new ConflictException('Make the return file first, then run the FVU on it.');
      const ex = await tx.exchangeFile.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.exchangeFileId } });
      const { problems, fvuVersion } = checkFvu(await this.files.checked(ex), fvuFile);
      if (problems.length) {
        await audit(tx, c, 'statutory.tds_return.fvu_refused', 'tds_return', r.id, { problems: problems.length, sha256: sha256(fvuFile) });
        throw new BadRequestException({ statusCode: 400, message: 'This .fvu is not the FVU output of this return.', problems });
      }
      const kind: FileKind = r.formCode === '24Q' ? 'form24q' : 'form138';
      const out = await this.files.generateIn(tx, c, {
        legalEntityId: r.legalEntityId,
        kind,
        ownerType: 'tds_return',
        ownerId: r.id,
        periodStart: null,
        fileName: `${r.formCode.toLowerCase()}-${r.taxYear}-q${r.quarter}.fvu`,
        contentType: 'application/octet-stream',
        data: fvuFile,
        rows: ex.rowCount,
        totals: {},
        by: v.userId!,
      });
      const fvu = { fvuFileId: out.id, validator: 'filer', version: fvuVersion, ok: true, errors: [], fileSha256: ex.sha256, fvuSha256: out.sha256, format: ETDS_FORMAT, at: new Date().toISOString() };
      await tx.tdsReturn.update({ where: { id: r.id }, data: { fvu: fvu as unknown as Prisma.InputJsonValue, status: 'validated' } });
      await audit(tx, c, 'statutory.tds_return.validated', 'tds_return', r.id, { validator: 'filer', fvuVersion, sha256: ex.sha256, fvuSha256: out.sha256 });
      return { id: r.id, status: 'validated', validation: fvu };
    });
  }

  /** Filed on the portal (step-up, phrase): the token number is recorded. A correction then supersedes changed certificates. */
  async returnFiled(ctx: TenantContext, user: ScopeUser, id: string, tokenNo: string, confirmation: ConfirmationDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.returnFor(tx, c, v, id, 'statutory.filing.mark_filed');
      if (r.status !== 'validated' || !r.exchangeFileId) throw new ConflictException('Make the return file and have it validated first.');
      const phrase = `FILED ${r.formCode} Q${r.quarter} ${r.taxYear}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      await tx.tdsReturn.update({ where: { id }, data: { status: 'filed', tokenNo, filedBy: v.userId!, filedAt: new Date() } });
      let changed: string[] = [];
      if (r.kind === 'correction' && r.correctsId) {
        const before = (await tx.tdsReturn.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.correctsId } })).rows as {
          employeeId: string;
          month: string;
          tds: string;
          paid: string;
        }[];
        const after = r.rows as { employeeId: string; month: string; tds: string; paid: string }[];
        const key = (x: { employeeId: string; month: string; tds: string; paid: string }) => `${x.employeeId}|${x.month}|${x.tds}|${x.paid}`;
        const a = new Set(after.map(key));
        const b = new Set(before.map(key));
        changed = [...new Set([...after.filter((x) => !b.has(key(x))), ...before.filter((x) => !a.has(key(x)))].map((x) => x.employeeId))];
      }
      await audit(tx, c, 'statutory.tds_return.filed', 'tds_return', id, { formCode: r.formCode, quarter: r.quarter, taxYear: r.taxYear, tokenNo, kind: r.kind, changedPeople: changed.length });
      return { id, status: 'filed', tokenNo, changedEmployees: changed };
    });
  }

  /** PAY-6.07: a correction of a filed return, from the payslips as they are now. */
  async correction(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.returnFor(tx, c, v, id, 'statutory.filing.generate');
      if (r.kind !== 'original' || r.status !== 'filed') throw new ConflictException('A correction is made for a filed original return.');
      const rows = this.mask(await this.tdsRows(tx, c.organizationId, r.legalEntityId, r.taxYear, r.quarter));
      const row = await tx.tdsReturn.create({
        data: {
          organizationId: c.organizationId,
          legalEntityId: r.legalEntityId,
          formCode: r.formCode,
          lawVersion: r.lawVersion,
          taxYear: r.taxYear,
          quarter: r.quarter,
          kind: 'correction',
          correctsId: r.id,
          rows: rows as unknown as Prisma.InputJsonValue,
          createdBy: v.userId!,
        },
      });
      await audit(tx, c, 'statutory.tds_return.correction', 'tds_return', row.id, { corrects: r.id, rows: rows.length });
      return this.returnView(row);
    });
  }

  async returns(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, 'statutory.filing.view', entityId);
      const list = await tx.tdsReturn.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, formCode: { in: SALARY_FORMS } }, orderBy: [{ taxYear: 'desc' }, { quarter: 'desc' }, { createdAt: 'desc' }] });
      const out = [];
      for (const r of list) {
        const { deductees: _d, ...rest } = this.returnView(r);
        // A filed return is locked: what it held was settled when it was filed.
        out.push({ ...rest, completeness: r.status === 'filed' ? null : await this.completeness(tx, c.organizationId, r) });
      }
      return out;
    });
  }
}

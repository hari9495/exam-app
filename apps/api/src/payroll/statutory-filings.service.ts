import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { entityTimeZone, localDate } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { damages, due, inForce, penalty, type RuleSet } from '../statutory/evaluator';
import { FORMATS, ecrFile, esiFile, lwfFile, ptFile, type EcrRow, type EsiRow, type LwfRow, type PtRow, type TdsRow } from '../statutory/filing-files';
import { ETDS_FORMAT, etdsFile } from '../statutory/etds';
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
const KIND: Record<string, FileKind> = { 'IN.PF': 'ecr', 'IN.ESI': 'esi', 'IN.PT': 'pt', 'IN.LWF': 'lwf' };
const LABEL: Record<string, string> = { 'IN.PF': 'PF (ECR)', 'IN.ESI': 'ESI contributions', 'IN.PT': 'Professional tax', 'IN.LWF': 'Labour welfare fund' };
const CAL: Record<string, string> = { 'IN.PF': 'pf_ecr', 'IN.ESI': 'esi' };
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const quarterMonths = (taxYear: string, q: number) => {
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
    const slips: Slip[] = await tx.payslip.findMany({
      where: { organizationId: org, legalEntityId: entityId, periodStart: asDate(`${month}-01`), status: 'approved' },
      select: { id: true, employeeId: true, employmentId: true, gross: true, ruleVersions: true, version: true },
    });
    const lines: Line[] = await tx.payslipLine.findMany({
      where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) } },
      select: { payslipId: true, componentCode: true, amount: true, quantity: true, rule: true },
    });
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
      const card = (statute: string, state: string | null, amount: Prisma.Decimal, calKey: string | null, interestItem: string | null) => {
        const f = filings.filter((x) => x.statute === statute && x.state === state && x.kind === 'original').pop();
        const dueOn = cal && calKey ? (due(cal, { key: calKey, month }).due as string) : null;
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
        cards,
        tds: { amount: tdsTotal.toFixed(2), dueOn: tdsDue, challanStatus: challan?.status ?? 'not_prepared', late: Boolean(tdsDue && today > tdsDue && challan?.status !== 'deposited') },
      };
    });
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
      const prefill = { tds: tds.toFixed(2), payslips: m.slips.length, at: new Date().toISOString() };
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
      if (!tds.eq(pre) && !dto.reason) throw new BadRequestException('The amount differs from the payslips: say why.');
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

  /** Deductee rows of a quarter: one per person and month with TDS, leavers included; PAN masked here, in full only in the file. */
  private async tdsRows(tx: Tx, org: string, entityId: string, taxYear: string, quarter: number) {
    const months = quarterMonths(taxYear, quarter);
    const rows: (TdsRow & { employeeId: string; pan: string | null })[] = [];
    for (const month of months) {
      const m = await this.month(tx, org, entityId, month);
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
      const old = await tx.tdsReturn.findFirst({ where: { organizationId: org, legalEntityId: entityId, taxYear, quarter, kind: 'original' } });
      if (old?.status === 'filed') throw new ConflictException('This return is filed. A change goes in a correction return.');
      const rows = this.mask(await this.tdsRows(tx, org, entityId, taxYear, quarter));
      const data = { rows: rows as unknown as Prisma.InputJsonValue, reconciliation: Prisma.DbNull, status: 'draft', exchangeFileId: null };
      const r = old
        ? await tx.tdsReturn.update({ where: { id: old.id }, data })
        : await tx.tdsReturn.create({
            data: { organizationId: org, legalEntityId: entityId, formCode: taxForms(law).quarterlyReturn === '24Q' ? '24Q' : '138', lawVersion: law, taxYear, quarter, createdBy: v.userId!, ...data },
          });
      await audit(tx, c, 'statutory.tds_return.drafted', 'tds_return', r.id, { taxYear, quarter, rows: rows.length });
      return this.returnView(r);
    });
  }

  private async returnFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey) {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const r = await tx.tdsReturn.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
    return r;
  }

  async getReturn(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => this.returnView(await this.returnFor(tx, c, v, id, 'statutory.filing.view')));
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
      const rows = await this.tdsRows(tx, org, r.legalEntityId, r.taxYear, r.quarter);
      const problems = rows.filter((x) => x.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(x.pan)).map((x) => `${x.employeeCode}: the PAN on file is not valid.`);
      const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: r.legalEntityId }, select: { name: true, pan: true, tan: true, registeredAddress: true } });
      const reg = await tx.statutoryRegistration.findFirst({ where: { organizationId: org, legalEntityId: r.legalEntityId, statute: 'IN.TDS' } });
      const tan = e.tan ?? reg?.registrationNo ?? null;
      const addr = (e.registeredAddress ?? reg?.address ?? null) as { lines?: string[]; city?: string; state?: string; postalCode?: string | null } | null;
      if (!tan) problems.push('The TAN of the legal entity is missing (Payroll set-up › Registrations).');
      if (!e.pan) problems.push('The PAN of the legal entity is missing.');
      if (!reg?.responsiblePerson) problems.push('The person responsible for deducting tax is missing on the TDS registration.');
      if (!addr?.state || !addr?.postalCode) problems.push('The registered address (with state and PIN) of the legal entity is missing.');
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
        deductor: {
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
        },
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
      return (await tx.tdsReturn.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: [{ taxYear: 'desc' }, { quarter: 'desc' }, { createdAt: 'desc' }] })).map(
        (r) => {
          const { deductees: _d, ...rest } = this.returnView(r);
          return rest;
        },
      );
    });
  }
}

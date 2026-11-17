import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { sealValue } from '../people/profile.service';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { asDate, dateOf } from '../time/time-core';
import type { CalcComponent, Segment } from './calc';
import type { ConfirmationDto } from './dto';
import type { DeclarationLineDto, TaxWindowActionDto, Form12bDecisionDto, Form12bDto, PerquisiteDto, ProofDecisionDto, RegimeRequestDto, ResidencyRequestDto, WorkspacePatchDto } from './dto-5e';
import { ApprovalsEngine, type Notice } from '../workflow/approvals-engine.service';
import { dayMonYear } from './loan-rules';
import { PayDocumentsService } from './documents.service';
import { PayFileStore, sha256 } from './pay-file-store';
import { FilesService } from '../documents/files.service';
import { PayKey, entitiesFor, payHolders, payScope, payViewer, requireEntity, requireSelf, withPayScope } from './pay-access';
import { lawVersionFor, nextMonth, projectTax, taxForms, taxYearOf, type TaxInputs, type TaxProjection } from './tax';
import { form16Block } from './form16-link';

// Income tax (M03-BUILD-DESIGN §8.5, §8.6, PAY-5.01 … 5.08): the employee's tax workspace (regime until the company's
// cut-off, then only HR with a reason; residential status; other income), declarations (Form 12BB or its successor) and
// proofs verified line by line by someone other than the employee, the tax sheet (the projection row of the latest
// payslip: the same numbers as the TDS deducted), perquisites (Form 12BA), and the year-end certificate (Form 16 / Form
// 130: Part A from TRACES, Part B from the year's payslips, issued as a DSC-signed pay document to the employee and alumni).

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const PROOF_TYPES: [string, (b: Buffer) => boolean][] = [
  ['application/pdf', (b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
];
type Workspace = Prisma.TaxWorkspaceGetPayload<object>;
type ProofFile = { ref: string; name: string; sha256: string; size: number; contentType: string; at: string };
type Form12b = Prisma.Form12bSubmissionGetPayload<object>;
type Residency = Prisma.TaxResidencyRequestGetPayload<object>;
type PanLink = Prisma.TaxPanLinkRequestGetPayload<object>;
/** PAY-22 NoPan: the portal's link confirmation is a PDF or a picture of it. */
const PAN_LINK_MIME = ['application/pdf', 'image/png', 'image/jpeg'] as const;
type RegimeRequest = Prisma.TaxRegimeRequestGetPayload<object>;
/** Founder answer 3: the Approvals request type for a regime change after the cut-off. */
export const REGIME_CHANGE = 'tax.regime_change';
const TAN = /^[A-Z]{4}\d{5}[A-Z]$/;
const RUPEES = /^\d{1,12}(\.\d{1,2})?$/;

/** The company's tax dates for a tax year (settings, P04 reminders go before each). */
export async function taxDates(tx: Tx, c: CompanyContext, legalEntityId: string, taxYear: string) {
  const y = Number(taxYear.slice(0, 4));
  const lev = { legalEntityId };
  const opens = await settingFor(tx, c, 'tax.proof_window_opens', lev);
  return {
    regimeCutoff: `${y}-${await settingFor(tx, c, 'tax.regime_cutoff', lev)}`,
    proofWindowOpens: `${Number(opens.slice(0, 2)) >= 4 ? y : y + 1}-${opens}`,
    proofCutoff: `${y + 1}-${await settingFor(tx, c, 'tax.proof_cutoff', lev)}`,
  };
}

export type TaxWindowKey = 'declarations' | 'proofs';
export interface TaxWindowView {
  key: TaxWindowKey;
  open: boolean;
  from: string;
  to: string;
  by: 'dates' | 'hr_open' | 'hr_lock';
}
/**
 * E1 (batch H part 2): the declaration window (from the tax year's start to the proof cut-off) and the proof window
 * (the company dates), each as HR last set it: opened early, locked, or back to the dates (answer 2408).
 */
export async function taxWindows(tx: Tx, org: string, legalEntityId: string, taxYear: string, dates: Awaited<ReturnType<typeof taxDates>>, today: string): Promise<TaxWindowView[]> {
  const base: Record<TaxWindowKey, { from: string; to: string }> = { declarations: { from: `${taxYear.slice(0, 4)}-04-01`, to: dates.proofCutoff }, proofs: { from: dates.proofWindowOpens, to: dates.proofCutoff } };
  const acts = await tx.taxWindowAction.findMany({ where: { organizationId: org, legalEntityId, taxYear }, orderBy: { createdAt: 'desc' }, select: { window: true, action: true } });
  return (['declarations', 'proofs'] as const).map((key) => {
    const a = acts.find((x) => x.window === key)?.action;
    const by = a === 'open' ? 'hr_open' : a === 'lock' ? 'hr_lock' : 'dates';
    return { key, ...base[key], by, open: by === 'dates' ? today >= base[key].from && today <= base[key].to : by === 'hr_open' };
  });
}
/** Why a window refuses (409): locked by HR, not open yet, or closed. */
const closedText = (w: TaxWindowView, what: string, today: string) => (w.by === 'hr_lock' ? `HR has locked ${what.toLowerCase()} for now.` : today < w.from ? `${what} open on ${dayMonYear(w.from)}.` : `${what} closed on ${dayMonYear(w.to)}.`);

const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/**
 * The tax inputs of one person's month (PAY-5.02, 5.05, 5.07), read with the pay guard opened to the whole company: the year
 * so far across every entity and employment of the person (transfers and rehires carry the year), earlier employers
 * (Form 12B) and opening balances, perquisites, the workspace and the declarations or verified proofs.
 */
export async function buildTaxInputs(
  tx: Tx,
  c: CompanyContext,
  a: { employeeId: string; employmentId: string; legalEntityId: string; month: string; periodStart: Date; exitedOn: Date | null; segment: Segment; components: CalcComponent[]; age: number },
): Promise<TaxInputs> {
  const org = c.organizationId;
  const taxYear = taxYearOf(a.month);
  const y = Number(taxYear.slice(0, 4));
  const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
  return withPayScope(tx, all, async () => {
    const ws = await tx.taxWorkspace.findFirst({ where: { organizationId: org, employmentId: a.employmentId, taxYear } });
    const ident = await tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId: a.employeeId }, select: { panHash: true } });
    const dates = await taxDates(tx, c, a.legalEntityId, taxYear);
    const monthEnd = dateOf(new Date(Date.UTC(Number(a.month.slice(0, 4)), Number(a.month.slice(5, 7)), 0)));
    const proofStage = monthEnd > dates.proofCutoff ? 'verified' : 'declared';
    const codes = (key: string) => a.components.filter((x) => x.statutory === key).map((x) => x.code);
    const slips = await tx.payslip.findMany({
      where: { organizationId: org, employeeId: a.employeeId, status: 'approved', periodStart: { gte: asDate(`${y}-04-01`), lt: a.periodStart } },
      select: { id: true, gross: true, periodStart: true, legalEntityId: true },
    });
    const lines = await tx.payslipLine.findMany({
      where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: { in: ['basic', 'hra', 'tds', ...codes('tds'), ...codes('pt')] } },
      select: { payslipId: true, componentCode: true, amount: true },
    });
    const of = (ids: Set<string>, pick: (code: string) => boolean) => lines.filter((l) => ids.has(l.payslipId) && pick(l.componentCode)).reduce((t, l) => t.add(l.amount), ZERO);
    const allIds = new Set(slips.map((s) => s.id));
    const tdsCodes = new Set(['tds', ...codes('tds')]);
    const ptCodes = new Set(codes('pt'));
    const byMonth = new Map<string, Set<string>>();
    for (const s of slips) byMonth.set(dateOf(s.periodStart).slice(0, 7), new Set([...(byMonth.get(dateOf(s.periodStart).slice(0, 7)) ?? []), s.id]));
    const prev: { gross: Prisma.Decimal; exemptions: Prisma.Decimal; tds: Prisma.Decimal }[] = [
      ...(await tx.previousEmploymentIncome.findMany({ where: { organizationId: org, employeeId: a.employeeId, fy: taxYear } })),
      // Founder decision 6: the employee's own Form 12B counts once payroll has approved it (pending or rejected never).
      ...(await tx.form12bSubmission.findMany({ where: { organizationId: org, employeeId: a.employeeId, taxYear, status: 'approved' } })),
    ];
    const opening = await tx.openingBalance.findMany({ where: { organizationId: org, employeeId: a.employeeId, fy: taxYear } });
    const head = (h: string) => opening.filter((o) => o.head === h).reduce((t, o) => t.add(o.amount), ZERO);
    const perqs = await tx.perquisite.findMany({ where: { organizationId: org, employeeId: a.employeeId, taxYear, cancelledAt: null } });
    const outside = await tx.taxPaidOutside.aggregate({ where: { organizationId: org, employeeId: a.employeeId, taxYear, cancelledAt: null }, _sum: { amount: true } });
    const decl = ws ? await tx.taxDeclarationLine.findMany({ where: { organizationId: org, workspaceId: ws.id } }) : [];
    const counted = (l: (typeof decl)[number]) => (proofStage === 'declared' ? l.amount : ['approved', 'partly'].includes(l.proofStatus) ? (l.approvedAmount ?? ZERO) : ZERO);
    const hra = decl.find((l) => l.subjectKey === 'hra');
    const lastMonth = a.exitedOn && dateOf(a.exitedOn) < `${y + 1}-04-01` ? dateOf(a.exitedOn).slice(0, 7) : `${y + 1}-03`;
    const comp = new Map(a.components.map((x) => [x.code, x]));
    const monthly = (pick: (code: string) => boolean) =>
      a.segment.lines
        .filter((l) => pick(l.code))
        .reduce((t, l) => t.add(l.monthly), ZERO)
        .toFixed(2);
    return {
      taxYear,
      lawVersion: lawVersionFor(taxYear),
      regime: (ws?.regime ?? 'new') as 'new' | 'old',
      age: a.age,
      resident: ws?.residentialStatus !== 'non_resident',
      pan: !ident?.panHash ? 'missing' : ws?.panStatus === 'inoperative' ? 'inoperative' : 'ok',
      proofStage,
      past: {
        gross: slips.reduce((t, s) => t.add(s.gross), ZERO).toFixed(2),
        tds: of(allIds, (x) => tdsCodes.has(x)).toFixed(2),
        pt: of(allIds, (x) => ptCodes.has(x)).toFixed(2),
        months: [...byMonth.entries()]
          .sort(([x], [z]) => x.localeCompare(z))
          .map(([month, ids]) => ({ month, basic: of(ids, (x) => x === 'basic').toFixed(2), hra: of(ids, (x) => x === 'hra').toFixed(2) })),
        otherEntities: [...new Set(slips.map((s) => s.legalEntityId).filter((e) => e !== a.legalEntityId))],
      },
      previous: {
        gross: prev
          .reduce((t, p) => t.add(p.gross), ZERO)
          .add(head('gross'))
          .toFixed(2),
        exemptions: prev
          .reduce((t, p) => t.add(p.exemptions), ZERO)
          .add(head('exempt_allowances'))
          .toFixed(2),
        tds: prev
          .reduce((t, p) => t.add(p.tds), ZERO)
          .add(head('tds'))
          .toFixed(2),
        pt: head('pt').toFixed(2),
      },
      otherIncome: ((ws?.otherIncome as { amount: string }[] | undefined) ?? []).reduce((t, o) => t.add(o.amount), ZERO).toFixed(2),
      perquisites: perqs
        .reduce((t, p) => t.add(p.annualValue), ZERO)
        .add(head('perquisites'))
        .toFixed(2),
      ...(outside._sum.amount?.gt(0) ? { paidOutside: outside._sum.amount.toFixed(2) } : {}),
      futureMonths: Math.max(0, monthsBetween(a.month, lastMonth)),
      future: {
        gross: monthly((code) => comp.get(code)?.kind === 'earning' && comp.get(code)?.taxable !== false),
        basic: monthly((code) => code === 'basic'),
        hra: monthly((code) => code === 'hra'),
        pt: null,
      },
      deductions: decl.filter((l) => l.subjectKey !== 'hra').map((l) => ({ key: l.subjectKey, amount: counted(l).toFixed(2) })),
      treatyCountry: ws?.dtaaCountry ?? null,
      rent: hra && hra.rentFrom && hra.rentTo && counted(hra).gt(0) ? { monthly: counted(hra).toFixed(2), from: hra.rentFrom, to: hra.rentTo, metro: !!hra.metro } : null,
    };
  });
}

/** The deduction key of home loan interest in the tax deduction rules. */
const HOME_LOAN = 'sec24b';

/** PAY-41: the inputs with the what-if rent (the whole tax year, or the declared months) and home loan interest. */
export function whatIfInputs(t: TaxInputs, taxYear: string, w: { rentMonthly?: string; homeLoanInterest?: string; metro?: boolean }): TaxInputs {
  let out = t;
  if (w.rentMonthly !== undefined) {
    const y = Number(taxYear.slice(0, 4));
    out = { ...out, rent: D(w.rentMonthly).gt(0) ? { monthly: D(w.rentMonthly).toFixed(2), from: t.rent?.from ?? `${y}-04`, to: t.rent?.to ?? `${y + 1}-03`, metro: w.metro ?? t.rent?.metro ?? false } : null };
  } else if (w.metro !== undefined && t.rent) out = { ...out, rent: { ...t.rent, metro: w.metro } };
  if (w.homeLoanInterest !== undefined) {
    const rest = out.deductions.filter((x) => x.key !== HOME_LOAN);
    out = { ...out, deductions: D(w.homeLoanInterest).gt(0) ? [...rest, { key: HOME_LOAN, amount: D(w.homeLoanInterest).toFixed(2) }] : rest };
  }
  return out;
}

@Injectable()
export class TaxService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly files: PayFileStore,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly documents: PayDocumentsService,
    private readonly engine: ApprovalsEngine,
    private readonly sharedFiles: FilesService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: REGIME_CHANGE, label: 'Tax regime change', risk: 'normal', autoActions: false, onDecided: (tx, req, o) => this.regimeDecided(tx, req, o), requesterLink: () => '/yx/me/tax-declarations' });
  }

  /** The latest regime and residency requests of a workspace (PAY-22 shows the one waiting, or the last decision). */
  private async requestsOf(tx: Tx, ws: Workspace) {
    const where = { organizationId: ws.organizationId, workspaceId: ws.id };
    const [regime, residency, pan] = await Promise.all([
      tx.taxRegimeRequest.findFirst({ where, orderBy: { createdAt: 'desc' } }),
      tx.taxResidencyRequest.findFirst({ where, orderBy: { createdAt: 'desc' } }),
      tx.taxPanLinkRequest.findFirst({ where, orderBy: { createdAt: 'desc' } }),
    ]);
    return { regimeRequest: regime ? this.regimeRequestView(regime) : null, residencyRequest: residency ? this.residencyView(residency) : null, panLinkRequest: pan ? await this.panLinkView(tx, pan) : null };
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private async mine(tx: Tx): Promise<string[]> {
    const [{ ids }] = await tx.$queryRaw<{ ids: string[] }[]>`SELECT app_current_employee_ids()::text[] AS ids`;
    return ids ?? [];
  }

  /** The signed-in person's current employment and its workspace for this tax year (made on first use). */
  private async ownWorkspace(tx: Tx, c: CompanyContext) {
    const today = todayIst();
    const e = await tx.employment.findFirst({
      where: { organizationId: c.organizationId, employeeId: { in: await this.mine(tx) }, joinedOn: { lte: asDate(today) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(today) } }] },
      orderBy: { joinedOn: 'desc' },
    });
    if (!e) throw new NotFoundException('You have no current employment here.');
    const taxYear = taxYearOf(today.slice(0, 7));
    const where = { organizationId: c.organizationId, employmentId: e.id, taxYear };
    // The tax page asks for several things at once on a first visit: insert-if-absent, so the parallel calls don't collide.
    if (!(await tx.taxWorkspace.findFirst({ where })))
      await tx.taxWorkspace.createMany({
        data: [{ organizationId: c.organizationId, legalEntityId: e.legalEntityId, employeeId: e.employeeId, employmentId: e.id, taxYear, lawVersion: lawVersionFor(taxYear) }],
        skipDuplicates: true,
      });
    const ws = (await tx.taxWorkspace.findFirst({ where }))!;
    const dates = await taxDates(tx, c, e.legalEntityId, taxYear);
    return { ws, dates, today, windows: await taxWindows(tx, c.organizationId, e.legalEntityId, taxYear, dates, today) };
  }

  /** A workspace the key reaches (pay guard opened to those entities), never the viewer's own. */
  private async staffWorkspace(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey) {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const ws = await tx.taxWorkspace.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!ws || !ids.includes(ws.legalEntityId)) throw new NotFoundException('Not found');
    if ((await this.mine(tx)).includes(ws.employeeId)) throw new ForbiddenException('Someone else handles your own tax.');
    return ws;
  }

  private view(ws: Workspace, dates?: Awaited<ReturnType<typeof taxDates>>, today?: string, windows?: TaxWindowView[]) {
    return {
      id: ws.id,
      employeeId: ws.employeeId,
      taxYear: ws.taxYear,
      lawVersion: ws.lawVersion,
      forms: taxForms(ws.lawVersion as 'IT-1961' | 'IT-2025'),
      regime: ws.regime,
      regimeSetAt: ws.regimeSetAt,
      regimeOverridden: Boolean(ws.regimeOverrideBy),
      residentialStatus: ws.residentialStatus,
      trcValidTo: ws.trcValidTo ? dateOf(ws.trcValidTo) : null,
      dtaaCountry: ws.dtaaCountry,
      // 5e-D3: no treaty relief is worked out; payroll handles a treaty claim by hand.
      treatyHandledByHand: Boolean(ws.dtaaCountry),
      panStatus: ws.panStatus,
      otherIncome: ws.otherIncome,
      ...(dates && today
        ? windows
          ? { dates, windows, canChooseRegime: today <= dates.regimeCutoff, canDeclare: windows[0].open, canSendProofs: windows[1].open }
          : { dates, canChooseRegime: today <= dates.regimeCutoff, canDeclare: today <= dates.proofCutoff, canSendProofs: today >= dates.proofWindowOpens && today <= dates.proofCutoff }
        : {}),
    };
  }

  // ------------------------------------------------------------------------------------------ the employee (PAY-5.01, 5.03)

  async myWorkspace(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, dates, today, windows } = await this.ownWorkspace(tx, c);
      return { ...this.view(ws, dates, today, windows), ...(await this.requestsOf(tx, ws)) };
    });
  }

  /** The regime until the cut-off (YX-TAX-01); residential status, treaty details and other income at any time. */
  async patchWorkspace(ctx: TenantContext, user: ScopeUser, dto: WorkspacePatchDto) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      if (dto.regime && dto.regime !== ws.regime && today > dates.regimeCutoff)
        throw new ConflictException(`The regime could be changed until ${dates.regimeCutoff}. Ask payroll to change it, with a reason.`);
      // Founder answer 2: residential status and treaty details change only through a request payroll approves.
      const trcNow = ws.trcValidTo ? dateOf(ws.trcValidTo) : null;
      if ((dto.residentialStatus && dto.residentialStatus !== ws.residentialStatus) || (dto.trcValidTo !== undefined && dto.trcValidTo !== trcNow) || (dto.dtaaCountry !== undefined && dto.dtaaCountry !== ws.dtaaCountry))
        throw new ConflictException('Residential status and treaty details change once payroll approves them. Send the change with your tax residency certificate from Residential status.');
      const data: Prisma.TaxWorkspaceUpdateInput = { updatedAt: new Date(), version: { increment: 1 } };
      if (dto.regime && dto.regime !== ws.regime) Object.assign(data, { regime: dto.regime, regimeSetAt: new Date() });
      if (dto.otherIncome) data.otherIncome = dto.otherIncome as unknown as Prisma.InputJsonValue;
      const row = await tx.taxWorkspace.update({ where: { id: ws.id }, data });
      await audit(tx, c, 'tax.workspace.updated', 'tax_workspace', ws.id, {
        regime: dto.regime ?? null,
        residentialStatus: dto.residentialStatus ?? null,
        otherIncome: dto.otherIncome ? dto.otherIncome.length : null,
      });
      return { ...this.view(row, dates, today), ...(await this.requestsOf(tx, row)) };
    });
  }

  // ------------------------------------------------------------------------------------------ regime after the cut-off (founder answer 3)

  private regimeRequestView(r: RegimeRequest) {
    return { id: r.id, taxYear: r.taxYear, from: r.fromRegime as 'new' | 'old', to: r.toRegime as 'new' | 'old', reason: r.reason, status: r.status as 'pending' | 'approved' | 'rejected', requestedAt: r.createdAt, decidedAt: r.decidedAt };
  }

  /** "Ask HR to change my regime": only after the cut-off, with a reason; approved in Approvals by tax.regime.override, never by the person. */
  async requestRegime(ctx: TenantContext, user: ScopeUser, dto: RegimeRequestDto) {
    const v = await this.viewer(user);
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      if (today <= dates.regimeCutoff) throw new ConflictException(`You can still change your regime yourself until ${dayMonYear(dates.regimeCutoff)}, in Declarations.`);
      if (dto.regime === ws.regime) throw new BadRequestException(`The ${dto.regime} regime is already yours. Ask only to change it.`);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tax-regime:${ws.id}`}))`;
      if (await tx.taxRegimeRequest.count({ where: { organizationId: org, workspaceId: ws.id, status: 'pending' } })) throw new ConflictException('Your earlier request is still with HR. Wait for their answer.');
      const subject = (await tx.employee.findFirst({ where: { organizationId: org, id: ws.employeeId }, select: { userId: true } }))?.userId;
      const approvers = (await payHolders(tx, org, 'tax.regime.override', ws.legalEntityId, today)).filter((u) => u !== v.userId && u !== subject);
      if (!approvers.length) throw new BadRequestException('No one can approve this yet. Someone in payroll needs "tax.regime.override". Ask HR.');
      const row = await tx.taxRegimeRequest.create({ data: { organizationId: org, legalEntityId: ws.legalEntityId, employeeId: ws.employeeId, workspaceId: ws.id, taxYear: ws.taxYear, fromRegime: ws.regime, toRegime: dto.regime, reason: dto.reason, requestedBy: v.userId! } });
      const sub = await this.engine.submit(tx, c, {
        type: REGIME_CHANGE,
        subjectType: 'tax_regime_request',
        subjectId: row.id,
        title: `Tax regime change to the ${dto.regime} regime, ${ws.taxYear}`,
        summary: [
          { label: 'From', value: `${ws.regime === 'new' ? 'New' : 'Old'} regime` },
          { label: 'To', value: `${dto.regime === 'new' ? 'New' : 'Old'} regime` },
          { label: 'Why', value: dto.reason.slice(0, 200) },
        ],
        subjectPersonId: ws.employeeId,
        requesterUserId: v.userId!,
        raisedByUserId: v.userId!,
        steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 24 }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: [],
      });
      notices.push(...sub.notices);
      await tx.taxRegimeRequest.update({ where: { id: row.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'tax.regime.requested', 'tax_regime_request', row.id, { workspaceId: ws.id, taxYear: ws.taxYear, from: ws.regime, to: dto.regime, reason: dto.reason });
      return this.regimeRequestView({ ...row, wfRequestId: sub.id });
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  /** Approvals decided (exactly once, in its transaction): approved changes the regime, as payroll's override does. */
  private async regimeDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
    await withPayScope(tx, all, async () => {
      const r = await tx.taxRegimeRequest.findFirst({ where: { organizationId: org, id: wf.subjectId } });
      if (!r || r.status !== 'pending') return;
      const by = (await tx.wfAction.findFirst({ where: { organizationId: org, requestId: wf.id, action: { in: ['approved', 'rejected'] } }, orderBy: { createdAt: 'desc' }, select: { actorUserId: true } }))?.actorUserId ?? null;
      await tx.taxRegimeRequest.update({ where: { id: r.id }, data: { status: outcome, decidedBy: by, decidedAt: new Date() } });
      const c = { organizationId: org, isSuperAdmin: false, userId: by };
      if (outcome === 'approved') {
        const ws = await tx.taxWorkspace.findFirstOrThrow({ where: { organizationId: org, id: r.workspaceId } });
        await tx.taxWorkspace.update({
          where: { id: ws.id },
          data: { regime: r.toRegime, regimeSetAt: new Date(), regimeOverrideBy: by, regimeOverrideReason: `Employee's request approved: ${r.reason}`.slice(0, 500), updatedAt: new Date(), version: { increment: 1 } },
        });
        await audit(tx, c, 'tax.regime.overridden', 'tax_workspace', ws.id, { employeeId: ws.employeeId, from: ws.regime, to: r.toRegime, reason: r.reason, requestId: r.id });
      }
      await audit(tx, c, `tax.regime.request_${outcome}`, 'tax_regime_request', r.id, { from: r.fromRegime, to: r.toRegime });
    });
  }

  // ------------------------------------------------------------------------------------------ residential status (founder answer 2)

  private residencyView(r: Residency) {
    const file = r.file as unknown as ProofFile | null;
    return {
      id: r.id,
      taxYear: r.taxYear,
      from: r.fromStatus as 'resident' | 'non_resident',
      residentialStatus: r.residentialStatus as 'resident' | 'non_resident',
      trcValidTo: r.trcValidTo ? dateOf(r.trcValidTo) : null,
      dtaaCountry: r.dtaaCountry,
      form10fFiled: r.form10fFiled,
      file: file ? { name: file.name, size: file.size, at: file.at } : null,
      status: r.status as 'pending' | 'approved' | 'rejected',
      comment: r.verifierComment,
      submittedAt: r.createdAt,
      verifiedAt: r.verifiedAt,
    };
  }

  /**
   * Sends a residential-status change (or, staying non-resident, a new TRC for treaty relief) for payroll to approve.
   * Non-resident needs the TRC as a PDF (checked by content), its last day not before today, and Form 10F filed.
   */
  async requestResidency(ctx: TenantContext, user: ScopeUser, dto: ResidencyRequestDto, file: { buffer: Buffer; originalname?: string } | undefined) {
    const v = await this.viewer(user);
    const nr = dto.residentialStatus === 'non_resident';
    if (!nr && (dto.trcValidTo || dto.dtaaCountry)) throw new BadRequestException('A tax residency certificate and treaty country go only with non-resident.');
    if (nr) {
      if (!file?.buffer?.length) throw new BadRequestException('Attach your tax residency certificate (TRC) as a PDF.');
      if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('The tax residency certificate must be a PDF file.');
      if (!dto.trcValidTo) throw new BadRequestException("Enter the last day your tax residency certificate is valid.");
      if (dto.form10fFiled !== 'true') throw new BadRequestException('File Form 10F on the income-tax portal first, then tick that you have filed it.');
    }
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { ws, today } = await this.ownWorkspace(tx, c);
      if (nr && dto.trcValidTo! < today) throw new BadRequestException(`Your tax residency certificate ended on ${dayMonYear(dto.trcValidTo!)}. Send one that is still valid.`);
      if (!nr && ws.residentialStatus !== 'non_resident') throw new ConflictException('You are already resident. Nothing to change.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tax-residency:${ws.id}`}))`;
      if (await tx.taxResidencyRequest.count({ where: { organizationId: org, workspaceId: ws.id, status: 'pending' } })) throw new ConflictException('Your earlier request is still with payroll. Wait for their answer.');
      let entry: ProofFile | null = null;
      if (nr && file) {
        const ref = await this.files.put(`tax-residency/${org}/${ws.legalEntityId}/${randomBytes(12).toString('hex')}`, file.buffer);
        entry = { ref, name: (file.originalname ?? 'trc.pdf').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 100), sha256: sha256(file.buffer), size: file.buffer.length, contentType: 'application/pdf', at: new Date().toISOString() };
      }
      const row = await tx.taxResidencyRequest.create({
        data: {
          organizationId: org,
          legalEntityId: ws.legalEntityId,
          employeeId: ws.employeeId,
          employmentId: ws.employmentId,
          workspaceId: ws.id,
          taxYear: ws.taxYear,
          fromStatus: ws.residentialStatus,
          residentialStatus: dto.residentialStatus,
          trcValidTo: nr ? asDate(dto.trcValidTo!) : null,
          dtaaCountry: nr ? (dto.dtaaCountry ?? null) : null,
          form10fFiled: nr,
          file: (entry ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
          submittedBy: v.userId!,
        },
      });
      await audit(tx, c, 'tax.residency.requested', 'tax_residency_request', row.id, { taxYear: ws.taxYear, from: ws.residentialStatus, to: dto.residentialStatus, sha256: entry?.sha256 ?? null, dtaaCountry: row.dtaaCountry });
      return this.residencyView(row);
    });
  }

  /** Payroll's queue (PAY-23, beside Form 12B): the entities in scope, never the viewer's own. */
  async residencyQueue(ctx: TenantContext, user: ScopeUser, status: 'pending' | 'approved' | 'rejected' = 'pending') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const rows = await tx.taxResidencyRequest.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, status, employeeId: { notIn: await this.mine(tx) } }, orderBy: { updatedAt: 'asc' }, take: 300 });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true } });
      return rows.map((r) => {
        const p = people.find((x) => x.id === r.employeeId);
        return { ...this.residencyView(r), employeeId: r.employeeId, employeeName: p ? `${p.givenName} ${p.familyName ?? ''}`.trim() : '', legalEntityId: r.legalEntityId };
      });
    });
  }

  /** A request the key reaches (else "not found"), never the viewer's own. */
  private async residencyFor(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
    await payScope(tx, ids);
    const r = await tx.taxResidencyRequest.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
    if ((await this.mine(tx)).includes(r.employeeId)) throw new ForbiddenException('Someone else checks your own residential status.');
    return r;
  }

  async residencyFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.residencyFor(tx, c, v, id);
      const meta = r.file as unknown as ProofFile | null;
      if (!meta) throw new NotFoundException('This request has no certificate.');
      const got = await this.files.get(meta.ref);
      if (sha256(got) !== meta.sha256) throw new ConflictException('This certificate does not match the file that was sent.');
      await audit(tx, c, 'tax.residency.viewed', 'tax_residency_request', r.id, { sha256: meta.sha256 });
      return { file: got, name: meta.name, contentType: meta.contentType };
    });
  }

  /** Approve (the workspace changes from the next run) or reject with a comment. */
  async decideResidency(ctx: TenantContext, user: ScopeUser, id: string, dto: Form12bDecisionDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.residencyFor(tx, c, v, id);
      if (dto.decision === 'reject' && !dto.comment) throw new BadRequestException('Say why, so the employee can fix it.');
      const status = dto.decision === 'approve' ? 'approved' : 'rejected';
      const n = await tx.taxResidencyRequest.updateMany({ where: { id: r.id, status: 'pending' }, data: { status, verifierId: v.userId!, verifierComment: dto.comment ?? null, verifiedAt: new Date(), updatedAt: new Date() } });
      if (!n.count) throw new ConflictException('This request is not waiting for a check.');
      if (status === 'approved')
        await tx.taxWorkspace.update({ where: { id: r.workspaceId }, data: { residentialStatus: r.residentialStatus, trcValidTo: r.trcValidTo, dtaaCountry: r.dtaaCountry, updatedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'tax.residency.verified', 'tax_residency_request', r.id, { employeeId: r.employeeId, taxYear: r.taxYear, status, from: r.fromStatus, to: r.residentialStatus, comment: dto.comment ?? null });
      return this.residencyView(await tx.taxResidencyRequest.findFirstOrThrow({ where: { id: r.id } }));
    });
  }

  // ------------------------------------------------------------------------------------------ PAN link (PAY-22 NoPan)

  private async panLinkView(tx: Tx, r: PanLink) {
    const f = await tx.file.findFirst({ where: { organizationId: r.organizationId, id: r.fileId }, select: { fileName: true, size: true, mime: true, scanStatus: true, createdAt: true } });
    return {
      id: r.id,
      taxYear: r.taxYear,
      file: f ? { name: f.fileName, size: f.size, type: f.mime, at: f.createdAt, scan: f.scanStatus } : null,
      status: r.status as 'pending' | 'approved' | 'rejected',
      comment: r.verifierComment,
      submittedAt: r.createdAt,
      verifiedAt: r.verifiedAt,
    };
  }

  /**
   * The employee sends the portal's PAN-Aadhaar link confirmation while their PAN is recorded as inoperative. The file
   * goes through the shared pipeline (real type PDF, PNG or JPEG, at most 5 MB, virus scan before anyone can open it).
   */
  async requestPanLink(ctx: TenantContext, user: ScopeUser, file: { buffer: Buffer; originalname?: string } | undefined) {
    const v = await this.viewer(user);
    if (!file?.buffer?.length) throw new BadRequestException('Attach the link confirmation from the income-tax portal (PDF, PNG or JPEG).');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { ws } = await this.ownWorkspace(tx, c);
      if (ws.panStatus !== 'inoperative') throw new ConflictException('Payroll has not recorded your PAN as inoperative, so there is nothing to send.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tax-pan-link:${ws.id}`}))`;
      if (await tx.taxPanLinkRequest.count({ where: { organizationId: org, workspaceId: ws.id, status: 'pending' } })) throw new ConflictException('Your earlier confirmation is still with payroll. Wait for their answer.');
      const stored = await this.sharedFiles.storeIn(tx, c, { area: 'tax-pan-link', name: file.originalname ?? 'pan-link.pdf', data: file.buffer, allowedMime: PAN_LINK_MIME, maxMb: 5, via: 'self' });
      const row = await tx.taxPanLinkRequest.create({
        data: { organizationId: org, legalEntityId: ws.legalEntityId, employeeId: ws.employeeId, employmentId: ws.employmentId, workspaceId: ws.id, taxYear: ws.taxYear, fileId: stored.id, submittedBy: v.userId! },
      });
      await audit(tx, c, 'tax.pan_link.requested', 'tax_pan_link_request', row.id, { taxYear: ws.taxYear, fileId: stored.id, sha256: stored.sha256 });
      return { view: await this.panLinkView(tx, row), fileId: stored.id };
    });
    // Scanned after the commit, as every upload of the shared pipeline; until it is clean nobody can open it.
    void this.sharedFiles.scan(ctx.organizationId!, out.fileId).catch(() => undefined);
    return out.view;
  }

  /** Payroll's queue (PAY-23, beside Form 12B and residency): the entities in scope, never the viewer's own. */
  async panLinkQueue(ctx: TenantContext, user: ScopeUser, status: 'pending' | 'approved' | 'rejected' = 'pending') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const rows = await tx.taxPanLinkRequest.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids }, status, employeeId: { notIn: await this.mine(tx) } }, orderBy: { updatedAt: 'asc' }, take: 300 });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true } });
      const out = [];
      for (const r of rows) {
        const p = people.find((x) => x.id === r.employeeId);
        out.push({ ...(await this.panLinkView(tx, r)), employeeId: r.employeeId, employeeName: p ? `${p.givenName} ${p.familyName ?? ''}`.trim() : '', legalEntityId: r.legalEntityId });
      }
      return out;
    });
  }

  /** A request the key reaches (else "not found"), never the viewer's own. */
  private async panLinkFor(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
    await payScope(tx, ids);
    const r = await tx.taxPanLinkRequest.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r || !ids.includes(r.legalEntityId)) throw new NotFoundException('Not found');
    if ((await this.mine(tx)).includes(r.employeeId)) throw new ForbiddenException('Someone else checks your own PAN.');
    return r;
  }

  async panLinkFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.panLinkFor(tx, c, v, id);
      const row = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: r.fileId } });
      const data = await this.sharedFiles.bytes(row);
      await audit(tx, c, 'tax.pan_link.viewed', 'tax_pan_link_request', r.id, { sha256: row.sha256 });
      return { file: data, name: row.fileName, contentType: row.mime };
    });
  }

  /** Approve (the PAN is operative again: normal-rate tax from the next payslip) or refuse with a reason. */
  async decidePanLink(ctx: TenantContext, user: ScopeUser, id: string, dto: Form12bDecisionDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.panLinkFor(tx, c, v, id);
      if (dto.decision === 'reject' && !dto.comment) throw new BadRequestException('Say why, so the employee can fix it.');
      const status = dto.decision === 'approve' ? 'approved' : 'rejected';
      const n = await tx.taxPanLinkRequest.updateMany({ where: { id: r.id, status: 'pending' }, data: { status, verifierId: v.userId!, verifierComment: dto.comment ?? null, verifiedAt: new Date(), updatedAt: new Date() } });
      if (!n.count) throw new ConflictException('This confirmation is not waiting for a check.');
      if (status === 'approved') {
        const reason = 'PAN link confirmation checked';
        await tx.taxWorkspace.update({ where: { id: r.workspaceId }, data: { panStatus: 'operative', panStatusBy: v.userId!, panStatusReason: reason, updatedAt: new Date(), version: { increment: 1 } } });
        await audit(tx, c, 'tax.pan_status.recorded', 'tax_workspace', r.workspaceId, { employeeId: r.employeeId, status: 'operative', reason, panLinkRequestId: r.id });
      }
      await audit(tx, c, 'tax.pan_link.verified', 'tax_pan_link_request', r.id, { employeeId: r.employeeId, taxYear: r.taxYear, status, comment: dto.comment ?? null });
      return this.panLinkView(tx, await tx.taxPanLinkRequest.findFirstOrThrow({ where: { id: r.id } }));
    });
  }

  /** The latest projection of the person's own approved payslips this tax year (the tax sheet, YX-TAX-06). */
  private async latestProjection(tx: Tx, org: string, employeeIds: string[], taxYear: string) {
    const rows = await tx.tdsProjection.findMany({ where: { organizationId: org, employeeId: { in: employeeIds }, taxYear }, orderBy: { createdAt: 'desc' }, take: 24 });
    const approved = new Set((await tx.payslip.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.payslipId) }, status: 'approved' }, select: { id: true } })).map((s) => s.id));
    return rows.find((r) => approved.has(r.payslipId)) ?? null;
  }

  async taxSheet(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws } = await this.ownWorkspace(tx, c);
      const p = await this.latestProjection(tx, c.organizationId, await this.mine(tx), ws.taxYear);
      if (!p) return { taxYear: ws.taxYear, sheet: null, message: 'Your tax sheet appears with your first payslip of the tax year.' };
      const sheet = p.result as unknown as TaxProjection;
      return { taxYear: ws.taxYear, payslipId: p.payslipId, month: sheet.thisMonth.month, sheet: p.result, months: await this.tdsMonths(tx, c.organizationId, await this.mine(tx), ws.taxYear, sheet) };
    });
  }

  /**
   * PAY-22 "tax by month": the 12 months of the tax year. Up to the sheet's month, what the approved payslips of each month
   * deducted (each payslip's own latest projection); after it, the sheet's monthly TDS for the months it is spread over.
   */
  private async tdsMonths(tx: Tx, org: string, employeeIds: string[], taxYear: string, sheet: TaxProjection) {
    const rows = await tx.tdsProjection.findMany({ where: { organizationId: org, employeeId: { in: employeeIds }, taxYear }, orderBy: { createdAt: 'desc' }, select: { payslipId: true, result: true } });
    const approved = new Set((await tx.payslip.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.payslipId) }, status: 'approved' }, select: { id: true } })).map((s) => s.id));
    const seen = new Set<string>();
    const deducted = new Map<string, Prisma.Decimal>();
    for (const r of rows) {
      if (!approved.has(r.payslipId) || seen.has(r.payslipId)) continue;
      seen.add(r.payslipId);
      const x = r.result as unknown as TaxProjection;
      deducted.set(x.thisMonth.month, (deducted.get(x.thisMonth.month) ?? ZERO).add(x.monthTds));
    }
    const last = sheet.thisMonth.month;
    const out: { month: string; tds: string; kind: 'deducted' | 'projected' }[] = [];
    let month = `${taxYear.slice(0, 4)}-04`;
    for (let i = 0, ahead = 0; i < 12; i++, month = nextMonth(month)) {
      if (month <= last) out.push({ month, tds: (deducted.get(month) ?? ZERO).toFixed(2), kind: 'deducted' });
      else out.push({ month, tds: ++ahead < sheet.remainingPeriods ? sheet.monthTds : '0.00', kind: 'projected' });
    }
    return out;
  }

  /**
   * Old and new regime on the figures of the latest payslip (the same function as the TDS). PAY-41 what-if: a monthly
   * rent for the year and the year's home loan interest replace the declared ones in this calculation only; nothing is saved.
   */
  async compare(ctx: TenantContext, user: ScopeUser, whatIf: { rentMonthly?: string; homeLoanInterest?: string; metro?: boolean } = {}) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws } = await this.ownWorkspace(tx, c);
      const p = await this.latestProjection(tx, c.organizationId, await this.mine(tx), ws.taxYear);
      if (!p) throw new ConflictException('The comparison uses your figures from your first payslip of the tax year.');
      const inputs = whatIfInputs(p.inputs as unknown as TaxInputs, ws.taxYear, whatIf);
      const month = (p.result as unknown as TaxProjection).thisMonth;
      const rules = await this.rules.published();
      const run = (regime: 'new' | 'old') => {
        const r = projectTax({ ...inputs, regime }, rules, month);
        return { regime, taxable: r.taxable, annualTax: r.tax.total, monthTds: r.monthTds };
      };
      const both = [run('new'), run('old')];
      const cap = (inForce(rules, 'IN.TAXDED', ['IN'], `${month.month}-01`)?.values.caps as Record<string, string | null> | undefined)?.sec24b ?? null;
      return {
        taxYear: ws.taxYear,
        current: ws.regime,
        regimes: both,
        lower: D(both[0].annualTax).lte(both[1].annualTax) ? 'new' : 'old',
        // The figures this comparison used (declared, or the what-if), and the rule's limit on home loan interest.
        whatIf: { rentMonthly: inputs.rent?.monthly ?? '0.00', metro: inputs.rent?.metro ?? false, homeLoanInterest: D(inputs.deductions.find((x) => x.key === HOME_LOAN)?.amount ?? 0).toFixed(2), homeLoanCap: cap },
      };
    });
  }

  private async subjectKeys(on: string) {
    const rs = inForce(await this.rules.published(), 'IN.TAXDED', ['IN'], on);
    return { keys: new Set(['hra', ...Object.keys((rs?.values.caps as Record<string, unknown> | undefined) ?? {})]), landlordPanAbove: D(String(rs?.values.landlordPanAbove ?? '100000')) };
  }

  private lineView(l: Prisma.TaxDeclarationLineGetPayload<object>) {
    return {
      id: l.id,
      subjectKey: l.subjectKey,
      amount: l.amount.toFixed(2),
      landlordName: l.landlordName,
      landlordPan: l.landlordPanLast4 ? `••••••${l.landlordPanLast4}` : null,
      landlordRelationship: l.landlordRelationship,
      rentFrom: l.rentFrom,
      rentTo: l.rentTo,
      metro: l.metro,
      proofStatus: l.proofStatus,
      approvedAmount: l.approvedAmount?.toFixed(2) ?? null,
      comment: l.verifierComment,
      proofs: ((l.proofFiles as ProofFile[]) ?? []).map((f, i) => ({ n: i, name: f.name, size: f.size, at: f.at })),
    };
  }

  async declarations(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      const lines = await tx.taxDeclarationLine.findMany({ where: { organizationId: c.organizationId, workspaceId: ws.id }, orderBy: { subjectKey: 'asc' } });
      const { keys } = await this.subjectKeys(today);
      const labels = await tx.statutoryLawCrosswalk.findMany({ where: { lawVersion: ws.lawVersion, subjectKey: { in: [...keys, 'salary_declaration'] } } });
      return {
        taxYear: ws.taxYear,
        proofWindowOpens: dates.proofWindowOpens,
        proofCutoff: dates.proofCutoff,
        subjects: [...keys].map((k) => ({ key: k, section: labels.find((x) => x.subjectKey === k)?.section ?? null })),
        // H14: the declaration form of the workspace's law (Form 12BB, or Form No. 124 under the 2025 Act), from the crosswalk.
        form: labels.find((x) => x.subjectKey === 'salary_declaration')?.form ?? (ws.lawVersion === 'IT-2025' ? 'Form No. 124' : 'Form 12BB'),
        lines: lines.map((l) => ({ ...this.lineView(l), section: labels.find((x) => x.subjectKey === l.subjectKey)?.section ?? null })),
      };
    });
  }

  /** Declares (or changes) lines while the declaration window is open; a line with an approved proof is not changed. Amount 0 drops it. */
  async declare(ctx: TenantContext, user: ScopeUser, rows: DeclarationLineDto[]) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, today, windows } = await this.ownWorkspace(tx, c);
      if (!windows[0].open) throw new ConflictException(closedText(windows[0], 'Declarations', today));
      return this.saveLines(tx, c, ws, today, rows, null);
    });
  }

  /** The declaration lines of a workspace, checked the same way for the employee and for HR on their behalf (E2). */
  private async saveLines(tx: Tx, c: CompanyContext, ws: Workspace, today: string, rows: DeclarationLineDto[], onBehalfBy: string | null) {
    const org = c.organizationId;
    const { keys, landlordPanAbove } = await this.subjectKeys(today);
    const y = Number(ws.taxYear.slice(0, 4));
    for (const r of rows) {
      if (!keys.has(r.subjectKey)) throw new BadRequestException(`${r.subjectKey} is not something you can declare.`);
      const old = await tx.taxDeclarationLine.findFirst({ where: { organizationId: org, workspaceId: ws.id, subjectKey: r.subjectKey } });
      if (old && ['approved', 'partly'].includes(old.proofStatus)) throw new ConflictException(`${r.subjectKey} has a verified proof and is not changed.`);
      let pan: { enc: string; last4: string } | null = null;
      if (r.subjectKey === 'hra') {
        if (!r.rentFrom || !r.rentTo || r.metro === undefined || r.rentFrom > r.rentTo || r.rentFrom < `${y}-04` || r.rentTo > `${y + 1}-03`)
          throw new BadRequestException('Rent needs the months you pay it in this tax year and whether the city is a metro.');
        const yearly = D(r.amount).mul(monthsBetween(r.rentFrom, r.rentTo) + 1);
        if (yearly.gt(landlordPanAbove) && !r.landlordPan) throw new BadRequestException(`Rent above ₹${landlordPanAbove.toFixed(0)} a year needs your landlord's PAN.`);
        // H15: Form No. 124 (Income-tax Rules 2026 r.205) also asks how you are related to the landlord.
        if (ws.lawVersion === 'IT-2025' && yearly.gt(landlordPanAbove) && !r.landlordRelationship) throw new BadRequestException(`Rent above ₹${landlordPanAbove.toFixed(0)} a year needs how you are related to your landlord.`);
        if (r.landlordPan) {
          if (!PAN.test(r.landlordPan)) throw new BadRequestException("The landlord's PAN looks like ABCDE1234F.");
          pan = { enc: sealValue(this.crypto, org, ws.employeeId, r.landlordPan), last4: r.landlordPan.slice(-4) };
        }
      }
      const data = {
        amount: D(r.amount),
        landlordName: r.landlordName ?? null,
        landlordPanEnc: pan?.enc ?? null,
        landlordPanLast4: pan?.last4 ?? null,
        landlordRelationship: r.subjectKey === 'hra' ? (r.landlordRelationship ?? null) : null,
        rentFrom: r.subjectKey === 'hra' ? r.rentFrom! : null,
        rentTo: r.subjectKey === 'hra' ? r.rentTo! : null,
        metro: r.subjectKey === 'hra' ? !!r.metro : null,
        updatedAt: new Date(),
      };
      if (old) await tx.taxDeclarationLine.update({ where: { id: old.id }, data: { ...data, ...(old.proofStatus === 'rejected' ? { proofStatus: 'none' } : {}) } });
      else await tx.taxDeclarationLine.create({ data: { organizationId: org, legalEntityId: ws.legalEntityId, employeeId: ws.employeeId, workspaceId: ws.id, subjectKey: r.subjectKey, ...data } });
    }
    await audit(tx, c, 'tax.declaration.saved', 'tax_workspace', ws.id, { lines: rows.map((r) => r.subjectKey), ...(onBehalfBy ? { onBehalfOf: ws.employeeId } : {}) });
    return { saved: rows.length };
  }

  /** A proof for one line, in the proof window (PDF, PNG or JPEG, checked by content); stored encrypted with its hash. */
  async addProof(ctx: TenantContext, user: ScopeUser, lineId: string, file: { buffer: Buffer; originalname?: string } | undefined) {
    await this.viewer(user);
    if (!file?.buffer?.length) throw new BadRequestException('Attach the proof (PDF, PNG or JPEG).');
    const type = PROOF_TYPES.find(([, is]) => is(file.buffer))?.[0];
    if (!type) throw new BadRequestException('A proof is a PDF, PNG or JPEG file.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, today, windows } = await this.ownWorkspace(tx, c);
      // E1: HR may open or lock the proof window early (answer 2408: proofs already sent are still decided).
      if (!windows[1].open) throw new ConflictException(closedText(windows[1], 'Proofs', today));
      const l = await tx.taxDeclarationLine.findFirst({ where: { organizationId: c.organizationId, workspaceId: ws.id, id: lineId } });
      if (!l) throw new NotFoundException('Not found');
      if (['approved', 'partly'].includes(l.proofStatus)) throw new ConflictException('This line is already verified.');
      const files = (l.proofFiles as ProofFile[]) ?? [];
      if (files.length >= 10) throw new ConflictException('A line has at most 10 proof files.');
      const ref = await this.files.put(`tax-proofs/${c.organizationId}/${ws.legalEntityId}/${randomBytes(12).toString('hex')}`, file.buffer);
      const entry: ProofFile = {
        ref,
        name: (file.originalname ?? 'proof').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 100),
        sha256: sha256(file.buffer),
        size: file.buffer.length,
        contentType: type,
        at: new Date().toISOString(),
      };
      await tx.taxDeclarationLine.update({ where: { id: l.id }, data: { proofFiles: [...files, entry] as unknown as Prisma.InputJsonValue, proofStatus: 'pending', updatedAt: new Date() } });
      await audit(tx, c, 'tax.proof.submitted', 'tax_declaration_line', l.id, { subjectKey: l.subjectKey, sha256: entry.sha256 });
      return { lineId: l.id, proofStatus: 'pending', files: files.length + 1 };
    });
  }

  // ------------------------------------------------------------------------------------------ payroll (PAY-5.03, 5.05, 5.06)

  async workspaces(ctx: TenantContext, user: ScopeUser, employeeId?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.workspace.view');
      await payScope(tx, ids);
      const rows = await tx.taxWorkspace.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(employeeId ? { employeeId } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      });
      return rows.map((w) => this.view(w));
    });
  }

  /** The verification queue: lines with proofs, of the entities in scope (never one's own). */
  async proofQueue(ctx: TenantContext, user: ScopeUser, status = 'pending') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const me = await this.mine(tx);
      const rows = await tx.taxDeclarationLine.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, proofStatus: status, employeeId: { notIn: me } },
        orderBy: { updatedAt: 'asc' },
        take: 300,
      });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true } });
      return rows.map((l) => ({ ...this.lineView(l), workspaceId: l.workspaceId, employeeId: l.employeeId, employeeName: people.find((p) => p.id === l.employeeId)?.givenName ?? '' }));
    });
  }

  private async lineFor(tx: Tx, c: CompanyContext, v: Viewer, workspaceId: string, lineId: string) {
    const ws = await this.staffWorkspace(tx, c, v, workspaceId, 'tax.proof.verify');
    const l = await tx.taxDeclarationLine.findFirst({ where: { organizationId: c.organizationId, workspaceId: ws.id, id: lineId } });
    if (!l) throw new NotFoundException('Not found');
    return { ws, l };
  }

  async proofFile(ctx: TenantContext, user: ScopeUser, workspaceId: string, lineId: string, n: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { l } = await this.lineFor(tx, c, v, workspaceId, lineId);
      const f = ((l.proofFiles as ProofFile[]) ?? [])[n];
      if (!f) throw new NotFoundException('Not found');
      const file = await this.files.get(f.ref);
      if (sha256(file) !== f.sha256) throw new ConflictException('This proof does not match the file that was sent.');
      await audit(tx, c, 'tax.proof.viewed', 'tax_declaration_line', l.id, { sha256: f.sha256 });
      return { file, name: f.name, contentType: f.contentType };
    });
  }

  /** Approve, partly approve (with the amount) or reject (with a comment), line by line; never one's own (YX-TAX-05). */
  async decide(ctx: TenantContext, user: ScopeUser, workspaceId: string, lineId: string, dto: ProofDecisionDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { l } = await this.lineFor(tx, c, v, workspaceId, lineId);
      if (l.proofStatus !== 'pending') throw new ConflictException('This line has no proof waiting.');
      let approved: Prisma.Decimal | null = null;
      if (dto.decision === 'approve') approved = l.amount;
      if (dto.decision === 'partly') {
        if (!dto.amount || D(dto.amount).gte(l.amount) || D(dto.amount).lte(0)) throw new BadRequestException('A part approval is an amount above zero and below what was declared.');
        approved = D(dto.amount);
      }
      if (dto.decision !== 'approve' && !dto.comment) throw new BadRequestException('Say why, so the employee can fix it.');
      const status = dto.decision === 'approve' ? 'approved' : dto.decision === 'partly' ? 'partly' : 'rejected';
      await tx.taxDeclarationLine.update({
        where: { id: l.id },
        data: { proofStatus: status, approvedAmount: approved, verifierId: v.userId!, verifierComment: dto.comment ?? null, verifiedAt: new Date(), updatedAt: new Date() },
      });
      await audit(tx, c, 'tax.proof.verified', 'tax_declaration_line', l.id, { employeeId: l.employeeId, subjectKey: l.subjectKey, status, approvedAmount: approved?.toFixed(2) ?? null });
      return { lineId: l.id, proofStatus: status, approvedAmount: approved?.toFixed(2) ?? null };
    });
  }

  // ------------------------------------------------------------------------------------------ Form 12B (founder decision 6)

  private form12bView(f: Form12b) {
    const file = f.file as unknown as ProofFile;
    return {
      id: f.id,
      employerName: f.employerName,
      employerTan: f.employerTan,
      gross: f.gross.toFixed(2),
      exemptions: f.exemptions.toFixed(2),
      tds: f.tds.toFixed(2),
      status: f.status as 'pending' | 'approved' | 'rejected',
      comment: f.verifierComment,
      file: { name: file.name, size: file.size, at: file.at },
      submittedAt: file.at,
      verifiedAt: f.verifiedAt,
    };
  }

  /** The employee's previous-employer income for this tax year (PAY-22): sent until the proof cut-off. */
  async myForm12b(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      const f = await tx.form12bSubmission.findFirst({ where: { organizationId: c.organizationId, employmentId: ws.employmentId, taxYear: ws.taxYear } });
      return { taxYear: ws.taxYear, open: today <= dates.proofCutoff, closesOn: dates.proofCutoff, submission: f ? this.form12bView(f) : null };
    });
  }

  /** Sends or replaces the Form 12B (a PDF, checked by content) while it is not yet approved; payroll checks it next. */
  async submitForm12b(ctx: TenantContext, user: ScopeUser, dto: Form12bDto, file: { buffer: Buffer; originalname?: string } | undefined) {
    const v = await this.viewer(user);
    const tan = (dto.employerTan ?? '').toUpperCase();
    if (!TAN.test(tan)) throw new BadRequestException("Enter the previous employer's TAN: 4 letters, 5 digits and a letter, like BLRA12345B.");
    const money = (x: string | undefined, label: string, optional = false) => {
      if (optional && !x) return ZERO;
      if (!x || !RUPEES.test(x)) throw new BadRequestException(`Enter ${label} in rupees, like 125000.50.`);
      return D(x);
    };
    const gross = money(dto.gross, 'the gross salary');
    const exemptions = money(dto.exemptions, 'the exemptions', true);
    const tds = money(dto.tds, 'the tax deducted');
    if (tds.gt(gross)) throw new BadRequestException('The tax deducted cannot be more than the gross salary.');
    if (!file?.buffer?.length) throw new BadRequestException('Attach your Form 12B as a PDF.');
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('Form 12B must be a PDF file.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { ws, dates, today } = await this.ownWorkspace(tx, c);
      if (today > dates.proofCutoff) throw new ConflictException(`Previous employer income could be sent until ${dayMonYear(dates.proofCutoff)}.`);
      const approved = () => new ConflictException('Payroll has already checked your Form 12B. Ask payroll to change it.');
      const existing = await tx.form12bSubmission.findFirst({ where: { organizationId: org, employmentId: ws.employmentId, taxYear: ws.taxYear } });
      if (existing?.status === 'approved') throw approved();
      const ref = await this.files.put(`tax-form12b/${org}/${ws.legalEntityId}/${randomBytes(12).toString('hex')}`, file.buffer);
      const entry: ProofFile = {
        ref,
        name: (file.originalname ?? 'form12b.pdf').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 100),
        sha256: sha256(file.buffer),
        size: file.buffer.length,
        contentType: 'application/pdf',
        at: new Date().toISOString(),
      };
      const data = { employerName: dto.employerName || null, employerTan: tan, gross, exemptions, tds, file: entry as unknown as Prisma.InputJsonValue, submittedBy: v.userId!, updatedAt: new Date() };
      let id: string;
      if (existing) {
        // Guarded on the status, so an approval in between wins (never overwritten).
        const n = await tx.form12bSubmission.updateMany({
          where: { id: existing.id, status: { in: ['pending', 'rejected'] } },
          data: { ...data, status: 'pending', verifierId: null, verifierComment: null, verifiedAt: null },
        });
        if (!n.count) throw approved();
        id = existing.id;
      } else {
        try {
          id = (await tx.form12bSubmission.create({ data: { ...data, organizationId: org, legalEntityId: ws.legalEntityId, employeeId: ws.employeeId, employmentId: ws.employmentId, taxYear: ws.taxYear } })).id;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Your Form 12B was just sent from another window. Open it again to see it.');
          throw e;
        }
      }
      await audit(tx, c, 'tax.form12b.submitted', 'form12b_submission', id, { taxYear: ws.taxYear, sha256: entry.sha256, replaced: Boolean(existing) });
      return this.form12bView(await tx.form12bSubmission.findFirstOrThrow({ where: { id } }));
    });
  }

  /** Payroll's Form 12B queue (PAY-23): the entities in scope, never the viewer's own. */
  async form12bQueue(ctx: TenantContext, user: ScopeUser, status: 'pending' | 'approved' | 'rejected' = 'pending') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const rows = await tx.form12bSubmission.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, status, employeeId: { notIn: await this.mine(tx) } },
        orderBy: { updatedAt: 'asc' },
        take: 300,
      });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true } });
      return rows.map((f) => {
        const p = people.find((x) => x.id === f.employeeId);
        const { verifiedAt: _verifiedAt, ...rest } = this.form12bView(f);
        return { ...rest, employeeId: f.employeeId, employeeName: p ? `${p.givenName} ${p.familyName ?? ''}`.trim() : '', legalEntityId: f.legalEntityId, taxYear: f.taxYear };
      });
    });
  }

  /** A submission the key reaches (else "not found"), never the viewer's own. */
  private async form12bFor(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
    await payScope(tx, ids);
    const f = await tx.form12bSubmission.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!f || !ids.includes(f.legalEntityId)) throw new NotFoundException('Not found');
    if ((await this.mine(tx)).includes(f.employeeId)) throw new ForbiddenException('Someone else checks your own Form 12B.');
    return f;
  }

  async form12bFile(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.form12bFor(tx, c, v, id);
      const meta = f.file as unknown as ProofFile;
      const file = await this.files.get(meta.ref);
      if (sha256(file) !== meta.sha256) throw new ConflictException('This Form 12B does not match the file that was sent.');
      await audit(tx, c, 'tax.form12b.viewed', 'form12b_submission', f.id, { sha256: meta.sha256 });
      return { file, name: meta.name, contentType: meta.contentType };
    });
  }

  /** Approve, or reject with a comment, a pending Form 12B; approved amounts count in the tax projection from the next run. */
  async decideForm12b(ctx: TenantContext, user: ScopeUser, id: string, dto: Form12bDecisionDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.form12bFor(tx, c, v, id);
      if (dto.decision === 'reject' && !dto.comment) throw new BadRequestException('Say why, so the employee can fix it.');
      const status = dto.decision === 'approve' ? 'approved' : 'rejected';
      const n = await tx.form12bSubmission.updateMany({
        where: { id: f.id, status: 'pending' },
        data: { status, verifierId: v.userId!, verifierComment: dto.comment ?? null, verifiedAt: new Date(), updatedAt: new Date() },
      });
      if (!n.count) throw new ConflictException('This Form 12B is not waiting for a check.');
      await audit(tx, c, 'tax.form12b.verified', 'form12b_submission', f.id, { employeeId: f.employeeId, taxYear: f.taxYear, status, gross: f.gross.toFixed(2), tds: f.tds.toFixed(2) });
      return this.form12bView(await tx.form12bSubmission.findFirstOrThrow({ where: { id: f.id } }));
    });
  }

  /** E1: this tax year's windows for each entity HR may override in (tax.regime.override). */
  async windowsAdmin(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => this.windowRows(tx, c, await entitiesFor(tx, c, v, 'tax.regime.override')));
  }

  private async windowRows(tx: Tx, c: CompanyContext, entityIds: string[]) {
    const today = todayIst();
    const taxYear = taxYearOf(today.slice(0, 7));
    const ents = await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, id: { in: entityIds }, archivedAt: null, country: 'IN' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const out: (TaxWindowView & { legalEntityId: string; entityName: string; taxYear: string })[] = [];
    for (const e of ents) for (const w of await taxWindows(tx, c.organizationId, e.id, taxYear, await taxDates(tx, c, e.id, taxYear), today)) out.push({ ...w, legalEntityId: e.id, entityName: e.name, taxYear });
    return out;
  }

  /** E1 (answer 2408): open or lock a window now, or go back to the dates; kept with the reason and audited. */
  async setWindow(ctx: TenantContext, user: ScopeUser, dto: TaxWindowActionDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'tax.regime.override', dto.legalEntityId);
      const taxYear = taxYearOf(todayIst().slice(0, 7));
      await tx.taxWindowAction.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, taxYear, window: dto.window, action: dto.action, reason: dto.reason, createdBy: v.userId! } });
      await audit(tx, c, 'tax.window.changed', 'legal_entity', dto.legalEntityId, { taxYear, window: dto.window, action: dto.action, reason: dto.reason });
      return this.windowRows(tx, c, [dto.legalEntityId]);
    });
  }

  async overrideRegime(ctx: TenantContext, user: ScopeUser, id: string, regime: 'new' | 'old', reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ws = await this.staffWorkspace(tx, c, v, id, 'tax.regime.override');
      const row = await tx.taxWorkspace.update({
        where: { id: ws.id },
        data: { regime, regimeSetAt: new Date(), regimeOverrideBy: v.userId!, regimeOverrideReason: reason, updatedAt: new Date(), version: { increment: 1 } },
      });
      await audit(tx, c, 'tax.regime.overridden', 'tax_workspace', ws.id, { employeeId: ws.employeeId, from: ws.regime, to: regime, reason });
      return this.view(row);
    });
  }

  /**
   * PAN operative or inoperative (YX-TAX-10): recorded by payroll with a reason. Without a PAN on file the tax is at the
   * higher rate anyway. Founder decision 5e-D2: recorded by hand; a checking provider comes later.
   */
  async panStatus(ctx: TenantContext, user: ScopeUser, id: string, status: 'operative' | 'inoperative', reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ws = await this.staffWorkspace(tx, c, v, id, 'tax.proof.verify');
      const row = await tx.taxWorkspace.update({
        where: { id: ws.id },
        data: { panStatus: status, panStatusBy: v.userId!, panStatusReason: reason, updatedAt: new Date(), version: { increment: 1 } },
      });
      await audit(tx, c, 'tax.pan_status.recorded', 'tax_workspace', ws.id, { employeeId: ws.employeeId, status, reason });
      return this.view(row);
    });
  }

  // Perquisites (Form 12BA, PAY-5.06).
  async perquisites(ctx: TenantContext, user: ScopeUser, employeeId?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const rows = await tx.perquisite.findMany({
        where: { organizationId: c.organizationId, legalEntityId: { in: ids }, ...(employeeId ? { employeeId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        taxYear: p.taxYear,
        kind: p.kind,
        annualValue: p.annualValue.toFixed(2),
        description: p.description,
        cancelled: Boolean(p.cancelledAt),
      }));
    });
  }

  async addPerquisite(ctx: TenantContext, user: ScopeUser, dto: PerquisiteDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const y = Number(dto.taxYear.slice(0, 4));
      const e = await tx.employment.findFirst({
        where: { organizationId: c.organizationId, employeeId: dto.employeeId, joinedOn: { lte: asDate(`${y + 1}-03-31`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(`${y}-04-01`) } }] },
        orderBy: { joinedOn: 'desc' },
      });
      if (!e) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, 'tax.proof.verify', e.legalEntityId);
      if ((await this.mine(tx)).includes(dto.employeeId)) throw new ForbiddenException('Someone else records your own perquisites.');
      await payScope(tx, [e.legalEntityId]);
      const p = await tx.perquisite.create({
        data: {
          organizationId: c.organizationId,
          legalEntityId: e.legalEntityId,
          employeeId: dto.employeeId,
          employmentId: e.id,
          taxYear: dto.taxYear,
          kind: dto.kind,
          annualValue: D(dto.annualValue),
          description: dto.description,
          enteredBy: v.userId!,
        },
      });
      await audit(tx, c, 'tax.perquisite.added', 'perquisite', p.id, { employeeId: dto.employeeId, kind: dto.kind, taxYear: dto.taxYear });
      return { id: p.id };
    });
  }

  async cancelPerquisite(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'tax.proof.verify');
      await payScope(tx, ids);
      const p = await tx.perquisite.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
      if ((await this.mine(tx)).includes(p.employeeId)) throw new ForbiddenException('Someone else records your own perquisites.');
      if (!p.cancelledAt) await tx.perquisite.update({ where: { id }, data: { cancelledAt: new Date() } });
      await audit(tx, c, 'tax.perquisite.cancelled', 'perquisite', id, {});
      return { id, cancelled: true };
    });
  }

  // ------------------------------------------------------------------------------------------ year-end certificate (PAY-5.08)

  /** Part B from the year's approved payslips and the last projection; Form 16 for years to March 2026, Form 130 after. */
  /** Part B of a person's year in one entity from the approved payslips and the last projection. */
  private async partBOf(tx: Tx, org: string, employeeId: string, legalEntityId: string, taxYear: string) {
    const y = Number(taxYear.slice(0, 4));
    const p = await this.latestProjection(tx, org, [employeeId], taxYear);
    if (!p) throw new ConflictException('There is no approved payslip with tax for this person in that tax year.');
    const r = p.result as unknown as TaxProjection;
    const slips = await tx.payslip.findMany({ where: { organizationId: org, employeeId, legalEntityId, status: 'approved', periodStart: { gte: asDate(`${y}-04-01`), lte: asDate(`${y + 1}-03-01`) } }, select: { id: true, gross: true } });
    const tds = await tx.payslipLine.aggregate({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: 'tds' }, _sum: { amount: true } });
    return { taxYear, lawVersion: lawVersionFor(taxYear), regime: r.regime, grossSalary: slips.reduce((t, s) => t.add(s.gross), ZERO).toFixed(2), income: r.income, exemptions: r.exemptions, deductions: r.deductions, taxable: r.taxable, tax: r.tax, taxDeducted: (tds._sum.amount ?? ZERO).toFixed(2), perquisites: r.income.perquisites };
  }

  async prepareCertificate(ctx: TenantContext, user: ScopeUser, employeeId: string, taxYear: string, key: PayKey = 'payroll.document.issue') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const y = Number(taxYear.slice(0, 4));
      const e = await tx.employment.findFirst({
        where: { organizationId: org, employeeId, joinedOn: { lte: asDate(`${y + 1}-03-31`) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(`${y}-04-01`) } }] },
        orderBy: { joinedOn: 'desc' },
      });
      if (!e) throw new NotFoundException('Not found');
      await requireEntity(tx, c, v, key, e.legalEntityId);
      if ((await this.mine(tx)).includes(employeeId)) throw new ForbiddenException('Someone else issues your own tax certificate.');
      await payScope(tx, [e.legalEntityId]);
      const law = lawVersionFor(taxYear);
      const partB = await this.partBOf(tx, org, employeeId, e.legalEntityId, taxYear);
      const existing = await tx.taxCertificate.findFirst({ where: { organizationId: org, employmentId: e.id, taxYear } });
      if (existing?.payDocumentId) throw new ConflictException('This certificate is issued. A correction supersedes the pay document.');
      const row = existing
        ? await tx.taxCertificate.update({ where: { id: existing.id }, data: { partB: partB as unknown as Prisma.InputJsonValue } })
        : await tx.taxCertificate.create({
            data: {
              organizationId: org,
              legalEntityId: e.legalEntityId,
              employeeId,
              employmentId: e.id,
              taxYear,
              lawVersion: law,
              form: taxForms(law).certificate,
              partB: partB as unknown as Prisma.InputJsonValue,
              createdBy: v.userId!,
            },
          });
      await audit(tx, c, 'tax.certificate.prepared', 'tax_certificate', row.id, { employeeId, taxYear, form: row.form });
      return { id: row.id, form: row.form, partB, partA: Boolean(row.partARef) };
    });
  }

  /** The entity's certificates for a tax year: prepared, with Part A, issued (never one's own). */
  async certificates(ctx: TenantContext, user: ScopeUser, entityId: string, taxYear: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.document.issue', entityId);
      await payScope(tx, [entityId]);
      const rows = await tx.taxCertificate.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId, taxYear, employeeId: { notIn: await this.mine(tx) } }, orderBy: { createdAt: 'asc' }, take: 5000 });
      return rows.map((t) => ({ id: t.id, employeeId: t.employeeId, taxYear: t.taxYear, form: t.form, partA: Boolean(t.partARef), issued: Boolean(t.payDocumentId) }));
    });
  }

  private async certificateFor(tx: Tx, c: CompanyContext, v: Viewer, id: string, key: PayKey = 'payroll.document.issue') {
    const ids = await entitiesFor(tx, c, v, key);
    await payScope(tx, ids);
    const t = await tx.taxCertificate.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!t || !ids.includes(t.legalEntityId)) throw new NotFoundException('Not found');
    if ((await this.mine(tx)).includes(t.employeeId)) throw new ForbiddenException('Someone else issues your own tax certificate.');
    return t;
  }

  /** Part A as downloaded from TRACES (a PDF); kept encrypted with its hash. */
  async attachPartA(ctx: TenantContext, user: ScopeUser, id: string, file: Buffer | undefined, key: PayKey = 'payroll.document.issue') {
    const v = await this.viewer(user);
    if (!file?.length || file.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('Part A is the PDF downloaded from TRACES.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await this.certificateFor(tx, c, v, id, key);
      if (t.payDocumentId) throw new ConflictException('This certificate is issued.');
      const ref = await this.files.put(`tax-certificates/${c.organizationId}/${t.legalEntityId}/${randomBytes(12).toString('hex')}.pdf`, file);
      await tx.taxCertificate.update({ where: { id: t.id }, data: { partARef: ref, partASha256: sha256(file) } });
      await audit(tx, c, 'tax.certificate.part_a', 'tax_certificate', t.id, { sha256: sha256(file) });
      return { id: t.id, partA: true };
    });
  }

  /** Issues Part B as a pay document (DSC where the company signs, verify code); the employee and alumni then see it. */
  /**
   * Issues Part B as a pay document; with `revise` (after an accepted correction return, YX-TAX-20) Part B is worked out
   * again and the new document supersedes the issued one, which stays as superseded.
   */
  async issueCertificate(ctx: TenantContext, user: ScopeUser, id: string, confirmation: ConfirmationDto, key: PayKey = 'payroll.document.issue', revise?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      let t = await this.certificateFor(tx, c, v, id, key);
      if (t.payDocumentId && !revise) throw new ConflictException('This certificate is already issued.');
      if (!t.payDocumentId && revise) throw new ConflictException('This certificate is not issued yet.');
      if (!t.partARef) throw new ConflictException('Attach Part A from TRACES first.');
      // CMP-06: a link to anything but the year's filed Q4 return blocks issuing.
      const block = await form16Block(tx, org, t.legalEntityId, t.taxYear);
      if (block) throw new ConflictException(block);
      const phrase = `ISSUE ${t.form.toUpperCase()} ${t.taxYear}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      const old = t.payDocumentId ? await tx.payDocument.findFirstOrThrow({ where: { organizationId: org, id: t.payDocumentId } }) : null;
      if (revise) t = await tx.taxCertificate.update({ where: { id: t.id }, data: { partB: (await this.partBOf(tx, org, t.employeeId, t.legalEntityId, t.taxYear)) as unknown as Prisma.InputJsonValue } });
      const b = t.partB as unknown as {
        regime: string;
        income: TaxProjection['income'];
        exemptions: TaxProjection['exemptions'];
        deductions: TaxProjection['deductions'];
        taxable: string;
        taxDeducted: string;
      };
      const [entity, person, employment, ident] = await Promise.all([
        tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: t.legalEntityId }, select: { name: true } }),
        tx.employee.findFirstOrThrow({ where: { organizationId: org, id: t.employeeId }, select: { givenName: true, familyName: true } }),
        tx.employment.findFirstOrThrow({ where: { organizationId: org, id: t.employmentId }, select: { employeeCode: true } }),
        tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId: t.employeeId }, select: { panLast4: true } }),
      ]);
      const label: Record<string, string> = { salary: 'Salary', previousEmployers: 'Earlier employers', perquisites: 'Perquisites (Form 12BA)', other: 'Other income' };
      const earnings = Object.entries(label)
        .filter(([k]) => D(b.income[k as keyof typeof b.income]).gt(0))
        .map(([k, l]) => ({ label: l, amount: D(b.income[k as keyof typeof b.income]).toFixed(2) }));
      const deductions = [
        { label: 'Standard deduction', amount: b.exemptions.standardDeduction },
        { label: 'HRA exemption', amount: b.exemptions.hra },
        { label: 'Professional tax', amount: b.exemptions.professionalTax },
        ...b.deductions.filter((d) => D(d.allowed).gt(0)).map((d) => ({ label: d.key, amount: d.allowed })),
      ].filter((x) => D(x.amount).gt(0));
      const doc = await this.documents.issueIn(tx, c, {
        employeeId: t.employeeId,
        legalEntityId: t.legalEntityId,
        kind: t.form as 'form16' | 'form130',
        month: null,
        fields: {
          employerName: entity.name,
          employeeName: [person.givenName, person.familyName].filter(Boolean).join(' '),
          employeeCode: employment.employeeCode,
          pan: ident?.panLast4 ? `••••••${ident.panLast4}` : 'Not on file',
          taxYear: t.taxYear,
          regime: b.regime,
          taxable: b.taxable,
          taxDeducted: b.taxDeducted,
          partA: `TRACES Part A, SHA-256 ${t.partASha256}`,
          earnings,
          deductions,
        },
        supersedes: old,
        by: v.userId!,
        confirmation,
        reason: revise,
      });
      await tx.taxCertificate.update({ where: { id: t.id }, data: { payDocumentId: doc.id } });
      await audit(tx, c, revise ? 'tax.certificate.revised' : 'tax.certificate.issued', 'tax_certificate', t.id, { payDocumentId: doc.id, form: t.form, taxYear: t.taxYear, supersedes: old?.id ?? null, reason: revise ?? null });
      return { id: t.id, payDocumentId: doc.id, referenceNo: doc.referenceNo, status: doc.status, signature: doc.signature };
    });
  }

  /** The person's own issued certificates, with Part A to download. */
  async myCertificates(ctx: TenantContext, user: ScopeUser) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.taxCertificate.findMany({
        where: { organizationId: c.organizationId, employeeId: { in: await this.mine(tx) }, payDocumentId: { not: null } },
        orderBy: { taxYear: 'desc' },
      });
      return rows.map((t) => ({ id: t.id, taxYear: t.taxYear, form: t.form, payDocumentId: t.payDocumentId }));
    });
  }

  async myPartA(ctx: TenantContext, user: ScopeUser, id: string) {
    await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await tx.taxCertificate.findFirst({ where: { organizationId: c.organizationId, id, employeeId: { in: await this.mine(tx) }, payDocumentId: { not: null } } });
      if (!t?.partARef) throw new NotFoundException('Not found');
      const file = await this.files.get(t.partARef);
      if (sha256(file) !== t.partASha256) throw new ConflictException('This file does not match the one attached.');
      await audit(tx, c, 'tax.certificate.part_a_downloaded', 'tax_certificate', t.id, {});
      return { file, name: `${t.form}-part-a-${t.taxYear}.pdf`, contentType: 'application/pdf' };
    });
  }
}

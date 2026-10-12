import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser } from '../access/scope';
import { AutomationService } from '../rules-engine/automation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { gratuityDue, inForce, retrenchment } from '../statutory/evaluator';
import { hashValue, sealValue } from '../people/profile.service';
import { asDate, dateOf, monthRange } from '../time/time-core';
import { addDays } from '../time/time-maths';
import { entitiesFor, payHolders, payScope, payViewer, requireSelf } from './pay-access';
import { FNF_COMPONENTS } from './starter';
import type { FnfPatchDto, FnfPayeesDto } from './dto-5g';

// Full and final settlement (M03-BUILD-DESIGN §9.9, PAY-7.04 … 7.06). When lifecycle freezes the payroll hand-off for an
// exit (exit.settlement_inputs.ready), the F&F settlement and its off-cycle run are made at once, with the deadline of
// 2 working days after the last day from the entity's holiday calendar (lifecycle works it out). The run pays salary to
// the last day and the settlement lines worked out here: leave encashment, gratuity, retrenchment compensation, notice
// pay or the notice buy-out recovered, the statutory bonus provided this year, recorded clearance recoveries, the whole
// loan balance. Lines that cannot be paid yet (an asset not returned, a missing permission) are held back with the
// reason: the rest is paid on time and the held lines go in a second F&F run. On death in service the pay goes to the
// nominees or legal heirs by share (their bank accounts encrypted). Anyone with payroll.fnf.manage for the entity edits
// the lines before the run is submitted; the run's approval is the usual maker ≠ checker approval.

// Founder decisions 5g-D2 … 5g-D5 (12 Oct 2026, M03 §19.9): on death the bank file pays each payee by share; no TDS on
// the heirs' shares (verify with the partner CA); exit exemptions come from the IN.EXIT-EXEMPT rules in the payslip's tax;
// leave encashment is paid on basic + DA unless the company chose gross; an unserved resignation notice is recovered
// unless the company's policy waives it or HR waives it for the person, with a reason.
const SYSTEM = '00000000-0000-0000-0000-000000000000';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const r2 = (x: Prisma.Decimal) => x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
type Settlement = Prisma.FnfSettlementGetPayload<object>;
type Payee = { kind: string; name: string; relation: string; sharePercent: string; accountEnc?: string | null; accountHash?: string | null; accountLast4?: string | null; ifsc?: string | null };
const EDITABLE = ['draft', 'calculated', 'in_review', 'reopened'];

@Injectable()
export class FnfService implements OnModuleInit {
  private readonly logger = new Logger(FnfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly automation: AutomationService,
    private readonly notifications: NotificationsService,
    private readonly rules: StatutoryRulesService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  onModuleInit() {
    this.automation.subscribe(async (ev) => {
      if (ev.type !== 'exit.settlement_inputs.ready' || typeof ev.payload.exitCaseId !== 'string') return;
      await this.fromInputs(ev.organizationId, ev.payload.exitCaseId).catch((e: Error) => this.logger.error(`F&F for exit ${ev.payload.exitCaseId}: ${e.message}`));
    });
  }

  private sys(org: string) {
    return { organizationId: org, isSuperAdmin: false, userId: null } as unknown as CompanyContext;
  }

  /** Makes or refreshes the settlement and its run from lifecycle's current hand-off revision (idempotent). */
  async fromInputs(org: string, exitCaseId: string) {
    const c = this.sys(org);
    await this.tenantPrisma.forTenant(c, async (tx) => {
      const k = await tx.exitCase.findFirst({ where: { organizationId: org, id: exitCaseId } });
      const em = k ? await tx.employment.findFirst({ where: { organizationId: org, id: k.employmentId } }) : null;
      if (!k || !em) return;
      await payScope(tx, [em.legalEntityId]);
      const input = await tx.exitSettlementInput.findFirst({ where: { organizationId: org, exitCaseId, supersededAt: null } });
      if (!input) return;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fnf:${exitCaseId}`}))`;
      let f = await tx.fnfSettlement.findFirst({ where: { organizationId: org, exitCaseId } });
      if (f && (f.status !== 'open' || f.inputRevision >= input.revision)) return;
      const run = f?.runId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: f.runId } }) : null;
      if (run && !EDITABLE.includes(run.status)) return; // submitted or approved: changes after that go to the second run.
      // A company that does not run payroll here (no pay group in the entity) gets no settlement.
      if (!f && !(await tx.payGroup.findFirst({ where: { organizationId: org, legalEntityId: em.legalEntityId }, select: { id: true } }))) return;
      const lwd = dateOf(input.lwd);
      const month = lwd.slice(0, 7);
      const lifePayees = (input.payees as { kind: string; name: string; relation: string; sharePercent: string }[]) ?? [];
      const keep = (f?.payees as Payee[] | undefined) ?? [];
      const payees: Payee[] = lifePayees.map((p) => ({ ...p, ...(keep.find((x) => x.name === p.name && x.relation === p.relation) ?? {}), sharePercent: p.sharePercent }));
      const data = { exitType: input.exitType, inputRevision: input.revision, lwd: input.lwd, deadline: input.wagesDueBy, payees: payees as unknown as Prisma.InputJsonValue };
      if (!f) f = await tx.fnfSettlement.create({ data: { organizationId: org, legalEntityId: em.legalEntityId, employeeId: em.employeeId, employmentId: em.id, exitCaseId, ...data } });
      else f = await tx.fnfSettlement.update({ where: { id: f.id }, data: { ...data, version: { increment: 1 } } });
      // The run: the leaver's pay group on the last day (else the entity's first), in the month of the last day.
      let runId = run?.id ?? null;
      const { from, to } = monthRange(month);
      if (run && dateOf(run.periodStart) !== from) await tx.payrollRun.update({ where: { id: run.id }, data: { periodStart: asDate(from), periodEnd: asDate(to), version: { increment: 1 } } });
      if (!run) {
        const member = await tx.payGroupMember.findFirst({
          where: { organizationId: org, employmentId: em.id, validFrom: { lte: input.lwd }, OR: [{ validTo: null }, { validTo: { gte: input.lwd } }] },
        });
        const group = member
          ? { id: member.payGroupId }
          : await tx.payGroup.findFirst({ where: { organizationId: org, legalEntityId: em.legalEntityId, status: 'active' }, orderBy: { createdAt: 'asc' } });
        if (group) {
          const r = await tx.payrollRun.create({
            data: {
              organizationId: org,
              legalEntityId: em.legalEntityId,
              payGroupId: group.id,
              periodStart: asDate(from),
              periodEnd: asDate(to),
              runType: 'offcycle',
              offcycleKind: 'fnf',
              preparedBy: SYSTEM,
            },
          });
          runId = r.id;
          await tx.fnfSettlement.update({ where: { id: f.id }, data: { runId } });
          await audit(tx, c, 'payroll.run.created', 'payroll_run', r.id, { payGroupId: group.id, month, offcycle: 'fnf', fnfSettlementId: f.id });
        }
      }
      await this.lines(tx, c, { ...f, runId }, k, from);
      await audit(tx, c, run ? 'payroll.fnf.refreshed' : 'payroll.fnf.created', 'fnf_settlement', f.id, { exitCaseId, revision: input.revision, lwd, deadline: dateOf(input.wagesDueBy), runId });
    });
  }

  /** The settlement lines worked out by the system (lines someone edited are kept as they are). */
  private async lines(tx: Tx, c: CompanyContext, f: Settlement, k: Prisma.ExitCaseGetPayload<object>, monthStart: string) {
    const org = c.organizationId;
    await tx.payComponent.createMany({ data: FNF_COMPONENTS.map(({ ...s }) => ({ organizationId: org, ...s, taxable: s.taxable ?? true, statutory: null, createdBy: null })), skipDuplicates: true });
    await tx.oneTimePay.updateMany({ where: { organizationId: org, source: 'fnf', sourceRef: f.id, createdBy: SYSTEM, status: 'approved' }, data: { status: 'cancelled' } });
    const edited = new Set(
      (await tx.oneTimePay.findMany({ where: { organizationId: org, source: 'fnf', sourceRef: f.id, status: 'approved' }, select: { componentCode: true, label: true } })).map(
        (x) => `${x.componentCode}|${x.label}`,
      ),
    );
    const em = await tx.employment.findFirstOrThrow({ where: { organizationId: org, id: f.employmentId } });
    const lwd = dateOf(f.lwd);
    const rules = await this.rules.published();
    const pay = await this.payOn(tx, org, em.id, lwd);
    const group = f.runId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: f.runId }, select: { payGroupId: true } }) : null;
    const basis = group ? (await tx.payGroup.findFirst({ where: { organizationId: org, id: group.payGroupId }, select: { dayBasis: true } }))?.dayBasis : null;
    const days = !basis || basis === 'calendar' ? Number(monthRange(lwd.slice(0, 7)).to.slice(8)) : Number(basis);
    const daily = pay.gross.div(days);
    const lev = { legalEntityId: f.legalEntityId };
    const encashOn = (await settingFor(tx, c, 'payroll.leave_encashment_basis', lev)) === 'gross' ? pay.gross : pay.gratuityWage;
    const encashDaily = encashOn.div(days);
    const items: { code: string; amount: Prisma.Decimal; label: string; hold?: string }[] = [];
    // Leave encashment: the balance of encashable leave on the last day at the daily rate the company chose (5g-D4).
    const types = (await tx.leaveType.findMany({ where: { organizationId: org } })).filter((t) => (t.rules as { encashable?: boolean } | null)?.encashable);
    for (const t of types) {
      const bal = (await tx.leaveLedgerEntry.aggregate({ where: { organizationId: org, employeeId: em.employeeId, leaveTypeId: t.id, entryOn: { lte: f.lwd } }, _sum: { days: true } }))._sum.days;
      if (bal && D(bal).gt(0)) items.push({ code: 'leave_encashment', amount: r2(encashDaily.mul(bal)), label: `${t.name}: ${D(bal).toFixed(2)} days at ₹${r2(encashDaily).toFixed(2)} a day.` });
    }
    // Gratuity on the last wage (basic and DA), by the law in force on the last day.
    const gratRs = inForce(rules, 'IN.SS-CODE', ['IN'], lwd) ?? inForce(rules, 'IN.GRATUITY', ['IN'], lwd);
    if (gratRs?.values.kind === 'gratuity') {
      const type = await tx.employeeAssignment.findFirst({
        where: { organizationId: org, employmentId: em.id, supersededAt: null, validFrom: { lte: f.lwd } },
        orderBy: { validFrom: 'desc' },
        select: { employmentTypeId: true },
      });
      const cat = type ? (await tx.employmentType.findFirst({ where: { organizationId: org, id: type.employmentTypeId }, select: { category: true } }))?.category : null;
      const g = gratuityDue(gratRs, { lastWage: pay.gratuityWage, joined: dateOf(em.joinedOn), lastDay: lwd, fixedTerm: cat === 'fixed_term', death: f.exitType === 'death' });
      if (g.eligible && g.amount.gt(0))
        items.push({ code: 'gratuity', amount: g.amount, label: `Gratuity for ${g.years} years on the last wage ₹${pay.gratuityWage.toFixed(2)} (${gratRs.statute} ${gratRs.version}).` });
    }
    // Retrenchment (IR Code): compensation, notice pay in lieu, the re-skilling fund; held without the permission it needs.
    const rt = k.retrenchment as { noticeMode?: string; workers?: number } | null;
    const irRs = f.exitType === 'retrenchment' ? inForce(rules, 'IN.IR', ['IN'], lwd) : null;
    if (f.exitType === 'retrenchment') {
      if (!irRs) this.logger.warn(`F&F ${f.id}: no IN.IR rules in force on ${lwd}; retrenchment lines not worked out`);
      else {
        const recent = await tx.payslip.findMany({
          where: { organizationId: org, employmentId: em.id, status: 'approved', runType: 'regular' },
          orderBy: { periodStart: 'desc' },
          take: 3,
          select: { gross: true },
        });
        const average = recent.length ? recent.reduce((t, x) => t.add(x.gross), D(0)).div(recent.length) : pay.gross;
        const r = retrenchment(irRs, { averagePay: average, lastWage: pay.gross, joined: dateOf(em.joinedOn), lastDay: lwd, noticePaid: rt?.noticeMode === 'pay_in_lieu', workers: rt?.workers ?? 0 });
        const permitted = k.irPermissionId
          ? await tx.irPermissionRequest.findFirst({ where: { organizationId: org, id: k.irPermissionId, status: { in: ['granted', 'deemed'] } }, select: { id: true } })
          : null;
        const hold = r.permissionNeeded && !permitted ? `The establishment has ${rt?.workers ?? 0} workers: the government's permission for retrenchment is needed first.` : undefined;
        items.push({ code: 'retrenchment_comp', amount: r.compensation, label: `Retrenchment compensation for ${r.years} years on average pay ₹${r2(average).toFixed(2)}.`, hold });
        if (r.noticePay.gt(0)) items.push({ code: 'notice_pay', amount: r.noticePay, label: 'Notice pay in lieu of notice.', hold });
        items.push({ code: 'reskilling_fund', amount: r.reskillingFund, label: 'Worker re-skilling fund (paid by the employer to the government fund).', hold });
      }
    }
    // A notice buy-out: the employee's buy-out is recovered, the company's paid, at the daily rate of monthly pay.
    for (const a of ((k.noticeArrangement as { kind?: string; buyoutBy?: string | null; buyoutDays?: number | null }[] | null) ?? []).filter((x) => x.kind === 'buyout' && x.buyoutDays)) {
      const amount = r2(daily.mul(a.buyoutDays!));
      if (a.buyoutBy === 'employee') items.push({ code: 'notice_recovery', amount, label: `Notice buy-out: ${a.buyoutDays} days at ₹${r2(daily).toFixed(2)} a day.` });
      else items.push({ code: 'notice_pay', amount, label: `Notice bought out by the company: ${a.buyoutDays} days at ₹${r2(daily).toFixed(2)} a day.` });
    }
    // 5g-D5: a resignation that leaves before the standard last day, with no approved buy-out or release, recovers the
    // days not served (unless the company's policy or HR waives it).
    const arranged = ((k.noticeArrangement as { kind?: string }[] | null) ?? []).length > 0;
    const short = dateOf(k.standardLwd) > lwd ? Math.round((asDate(dateOf(k.standardLwd)).getTime() - f.lwd.getTime()) / 86_400_000) : 0;
    if (f.exitType === 'resignation' && !arranged && short > 0 && !f.noticeWaivedBy && (await settingFor(tx, c, 'payroll.notice_shortfall', lev)) === 'recover')
      items.push({ code: 'notice_recovery', amount: r2(daily.mul(short)), label: `Notice not served: ${short} days at ₹${r2(daily).toFixed(2)} a day.` });
    // The statutory bonus provided this accounting year and not yet paid.
    const fy = `${Number(lwd.slice(5, 7)) >= 4 ? lwd.slice(0, 4) : Number(lwd.slice(0, 4)) - 1}-04-01`;
    const slips = await tx.payslip.findMany({ where: { organizationId: org, employmentId: em.id, status: 'approved', periodStart: { gte: asDate(fy) } }, select: { id: true } });
    const provided =
      (await tx.payslipLine.aggregate({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: 'bonus_provision' }, _sum: { amount: true } }))._sum.amount ?? D(0);
    const paid =
      (await tx.payslipLine.aggregate({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, componentCode: 'bonus', kind: 'earning' }, _sum: { amount: true } }))._sum.amount ??
      D(0);
    if (provided.sub(paid).gt(0)) items.push({ code: 'bonus', amount: r2(provided.sub(paid)), label: 'Statutory bonus provided this year and not yet paid.' });
    // Clearance and asset recoveries from the hand-off: recorded ones recovered, open ones held until settled.
    const input = await tx.exitSettlementInput.findFirst({ where: { organizationId: org, exitCaseId: f.exitCaseId, supersededAt: null } });
    for (const r of ((input?.recoveries as { title: string; amount: string | null; reason: string | null; status: string }[] | undefined) ?? []).filter((x) => x.amount && D(x.amount).gt(0)))
      items.push({
        code: 'fnf_recovery',
        amount: D(r.amount!),
        label: `${r.title}${r.reason ? `: ${r.reason}` : ''}`.slice(0, 200),
        hold: r.status === 'open' ? 'Not returned or signed off yet.' : undefined,
      });
    for (const i of items) {
      if (edited.has(`${i.code}|${i.label.slice(0, 200)}`)) continue;
      if (i.amount.lte(0)) continue;
      await tx.oneTimePay.create({
        data: {
          organizationId: org,
          legalEntityId: f.legalEntityId,
          employeeId: f.employeeId,
          employmentId: f.employmentId,
          componentCode: i.code,
          amount: i.amount,
          periodStart: asDate(monthStart),
          source: 'fnf',
          sourceRef: f.id,
          reason: 'Full and final settlement',
          label: i.label.slice(0, 200),
          holdReason: i.hold?.slice(0, 300) ?? null,
          status: 'approved',
          runId: f.runId,
          createdBy: SYSTEM,
        },
      });
    }
  }

  /** Monthly pay on a date: gross of the plain earnings, and the gratuity wage (components flagged for it). */
  private async payOn(tx: Tx, org: string, employmentId: string, on: string) {
    const comp = await tx.compensation.findFirst({
      where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] },
      orderBy: { validFrom: 'desc' },
    });
    const pkg = comp ? await tx.compensationPackage.findFirst({ where: { organizationId: org, changeId: comp.changeId } }) : null;
    const lines = pkg ? await tx.compensationLine.findMany({ where: { organizationId: org, packageId: pkg.id } }) : [];
    const comps = new Map((await tx.payComponent.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.componentId) } } })).map((x) => [x.id, x]));
    let gross = D(0);
    let gratuityWage = D(0);
    for (const l of lines) {
      const x = comps.get(l.componentId);
      if (!x || x.kind !== 'earning' || x.statutory) continue;
      gross = gross.add(l.monthly);
      if (x.gratuityWage) gratuityWage = gratuityWage.add(l.monthly);
    }
    return { gross, gratuityWage };
  }

  // ------------------------------------------------------------------------------------------ reading and editing

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private async view(tx: Tx, org: string, f: Settlement) {
    const items = await tx.oneTimePay.findMany({ where: { organizationId: org, source: 'fnf', sourceRef: f.id, status: 'approved' }, orderBy: { createdAt: 'asc' } });
    const run = f.runId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: f.runId } }) : null;
    const slip = run
      ? await tx.payslip.findFirst({ where: { organizationId: org, runId: run.id, employmentId: f.employmentId, status: { in: ['draft', 'approved'] }, calcVersion: run.calcVersion } })
      : null;
    const net = slip?.net ?? null;
    const today = todayIst();
    return {
      id: f.id,
      employeeId: f.employeeId,
      exitCaseId: f.exitCaseId,
      exitType: f.exitType,
      lwd: dateOf(f.lwd),
      deadline: dateOf(f.deadline),
      overdue: f.status === 'open' && dateOf(f.deadline) < today && run?.status !== 'approved',
      status: f.status,
      runId: f.runId,
      runStatus: run?.status ?? null,
      secondRunId: f.secondRunId,
      net: net?.toFixed(2) ?? null,
      items: items.map((i) => ({ id: i.id, componentCode: i.componentCode, amount: i.amount.toFixed(2), label: i.label, held: i.holdReason, inRun: i.runId, byPayroll: i.createdBy !== SYSTEM })),
      // Death in service: who is paid and how much each gets of the net (accounts shown by their last four digits only).
      payees: ((f.payees as Payee[]) ?? []).map((p) => ({
        kind: p.kind,
        name: p.name,
        relation: p.relation,
        sharePercent: p.sharePercent,
        accountLast4: p.accountLast4 ?? null,
        ifsc: p.ifsc ?? null,
        amount: net ? r2(net.mul(p.sharePercent).div(100)).toFixed(2) : null,
      })),
      noticeWaived: f.noticeWaivedBy ? { by: f.noticeWaivedBy, reason: f.noticeWaiveReason } : null,
      ...(f.exitType === 'death' ? { taxNote: "No TDS is deducted on the payees' shares (verify with the partner CA)." } : {}),
      version: f.version,
    };
  }

  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.fnf.manage');
      await payScope(tx, ids);
      const rows = await tx.fnfSettlement.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, orderBy: [{ status: 'asc' }, { deadline: 'asc' }], take: 200 });
      return Promise.all(rows.map((f) => this.view(tx, c.organizationId, f)));
    });
  }

  private async settlementIn(tx: Tx, c: CompanyContext, v: Awaited<ReturnType<FnfService['viewer']>>, id: string) {
    const ids = await entitiesFor(tx, c, v, 'payroll.fnf.manage');
    await payScope(tx, ids);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fnf-edit:${id}`}))`;
    const f = await tx.fnfSettlement.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!f || !ids.includes(f.legalEntityId)) throw new NotFoundException('Not found');
    return f;
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => this.view(tx, c.organizationId, await this.settlementIn(tx, c, v, id)));
  }

  /** Edit lines (amount, hold back with a reason, release), add lines, and record the payees' bank accounts. */
  async patch(ctx: TenantContext, user: ScopeUser, id: string, dto: FnfPatchDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.settlementIn(tx, c, v, id);
      if (f.version !== dto.version) throw new ConflictException('The settlement changed since you opened it. Reload it.');
      if (f.status !== 'open') throw new ConflictException('This settlement is closed.');
      const first = f.runId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: f.runId } }) : null;
      const second = f.secondRunId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: f.secondRunId } }) : null;
      const open = second ? EDITABLE.includes(second.status) : !first || EDITABLE.includes(first.status);
      // After the first run is approved, only held lines change (they go in the second run).
      const firstDone = first?.status === 'approved';
      if (!open && !firstDone) throw new ConflictException('The F&F run is waiting for approval or approved; lines cannot change now.');
      for (const x of dto.items ?? []) {
        const row = await tx.oneTimePay.findFirst({ where: { organizationId: org, id: x.id, source: 'fnf', sourceRef: f.id, status: 'approved' } });
        if (!row) throw new NotFoundException('Not found');
        if (firstDone && !second && row.runId) throw new ConflictException('This line was paid in the F&F run.');
        await tx.oneTimePay.update({
          where: { id: row.id },
          data: {
            ...(x.amount !== undefined ? { amount: x.amount } : {}),
            ...(x.holdReason !== undefined ? { holdReason: x.holdReason } : {}),
            ...(x.remove ? { status: 'cancelled' } : {}),
            createdBy: v.userId!,
          },
        });
        await audit(tx, c, 'payroll.fnf.line_changed', 'fnf_settlement', f.id, {
          lineId: row.id,
          componentCode: row.componentCode,
          amount: x.amount ?? null,
          held: x.holdReason ?? null,
          removed: !!x.remove,
          reason: dto.reason,
        });
      }
      for (const x of dto.add ?? []) {
        const comp = await tx.payComponent.findFirst({ where: { organizationId: org, code: x.componentCode, status: 'active' } });
        if (!comp || comp.statutory || !['earning', 'deduction', 'employer'].includes(comp.kind))
          throw new BadRequestException('Choose an earning, deduction or employer component (not a statutory one).');
        const runId = firstDone ? null : f.runId;
        const row = await tx.oneTimePay.create({
          data: {
            organizationId: org,
            legalEntityId: f.legalEntityId,
            employeeId: f.employeeId,
            employmentId: f.employmentId,
            componentCode: comp.code,
            amount: x.amount,
            periodStart: asDate(`${dateOf(f.lwd).slice(0, 7)}-01`),
            source: 'fnf',
            sourceRef: f.id,
            reason: dto.reason,
            label: x.label,
            status: 'approved',
            runId,
            createdBy: v.userId!,
          },
        });
        await audit(tx, c, 'payroll.fnf.line_added', 'fnf_settlement', f.id, { lineId: row.id, componentCode: comp.code, amount: x.amount, reason: dto.reason });
      }
      const fresh = await tx.fnfSettlement.update({ where: { id: f.id }, data: { version: { increment: 1 } } });
      return this.view(tx, org, fresh);
    });
  }

  /** Death in service: who is paid and their shares, with their bank accounts encrypted (step-up by the route). */
  async payees(ctx: TenantContext, user: ScopeUser, id: string, dto: FnfPayeesDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.settlementIn(tx, c, v, id);
      if (f.version !== dto.version) throw new ConflictException('The settlement changed since you opened it. Reload it.');
      if (f.status !== 'open') throw new ConflictException('This settlement is closed.');
      if (f.exitType !== 'death') throw new BadRequestException('Payees are recorded only for a death in service.');
      if (dto.payees.some((p) => !!p.accountNumber !== !!p.ifsc)) throw new BadRequestException('Give the IFSC with each bank account.');
      const total = dto.payees.reduce((t, p) => t.add(p.sharePercent), D(0));
      if (!total.eq(100)) throw new BadRequestException('The shares must add up to 100%.');
      const payees: Payee[] = dto.payees.map((p) => ({
        kind: p.kind,
        name: p.name,
        relation: p.relation,
        sharePercent: D(p.sharePercent).toFixed(2),
        ...(p.accountNumber
          ? {
              accountEnc: sealValue(this.crypto, org, f.employeeId, p.accountNumber),
              accountHash: hashValue(this.crypto, org, 'payee_account', p.accountNumber),
              accountLast4: p.accountNumber.slice(-4),
              ifsc: p.ifsc ?? null,
            }
          : {}),
      }));
      await tx.fnfSettlement.update({ where: { id: f.id }, data: { payees: payees as unknown as Prisma.InputJsonValue } });
      await audit(tx, c, 'payroll.fnf.payees_changed', 'fnf_settlement', f.id, {
        payees: payees.map((p) => ({ name: p.name, sharePercent: p.sharePercent, accountLast4: p.accountLast4 ?? null })),
        reason: dto.reason,
      });
      const fresh = await tx.fnfSettlement.update({ where: { id: f.id }, data: { version: { increment: 1 } } });
      return this.view(tx, org, fresh);
    });
  }

  /** HR waives the unserved notice for this person (5g-D5), with a reason; the recovery line goes. */
  async waiveNotice(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.settlementIn(tx, c, v, id);
      if (f.status !== 'open') throw new ConflictException('This settlement is closed.');
      if (f.noticeWaivedBy) throw new ConflictException('The notice is already waived.');
      const run = f.runId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: f.runId } }) : null;
      if (run && !EDITABLE.includes(run.status)) throw new ConflictException('The F&F run is waiting for approval or approved; the notice cannot be waived now.');
      await tx.fnfSettlement.update({ where: { id: f.id }, data: { noticeWaivedBy: v.userId, noticeWaiveReason: reason, version: { increment: 1 } } });
      const gone = await tx.oneTimePay.updateMany({ where: { organizationId: org, source: 'fnf', sourceRef: f.id, componentCode: 'notice_recovery', status: 'approved' }, data: { status: 'cancelled' } });
      await audit(tx, c, 'payroll.fnf.notice_waived', 'fnf_settlement', f.id, { reason, linesRemoved: gone.count });
      return this.view(tx, org, await tx.fnfSettlement.findFirstOrThrow({ where: { id: f.id } }));
    });
  }

  /** The second F&F run: the lines released after the first run was approved (held lines stay until released). */
  async secondRun(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.settlementIn(tx, c, v, id);
      const first = f.runId ? await tx.payrollRun.findFirst({ where: { organizationId: org, id: f.runId } }) : null;
      if (!first || first.status !== 'approved') throw new ConflictException('Approve the F&F run first; the second run pays what was held back.');
      if (f.secondRunId) throw new ConflictException('This settlement already has its second run.');
      const ready = await tx.oneTimePay.findMany({ where: { organizationId: org, source: 'fnf', sourceRef: f.id, status: 'approved', runId: null, holdReason: null } });
      if (!ready.length) throw new ConflictException('Nothing is released for a second run yet. Release a held line first.');
      const { from, to } = monthRange(todayIst().slice(0, 7));
      const run = await tx.payrollRun.create({
        data: {
          organizationId: org,
          legalEntityId: f.legalEntityId,
          payGroupId: first.payGroupId,
          periodStart: asDate(from),
          periodEnd: asDate(to),
          runType: 'offcycle',
          offcycleKind: 'fnf',
          preparedBy: v.userId!,
        },
      });
      await tx.oneTimePay.updateMany({ where: { id: { in: ready.map((x) => x.id) } }, data: { runId: run.id, periodStart: asDate(from) } });
      await tx.fnfSettlement.update({ where: { id: f.id }, data: { secondRunId: run.id, version: { increment: 1 } } });
      await audit(tx, c, 'payroll.fnf.second_run', 'fnf_settlement', f.id, { runId: run.id, lines: ready.length });
      return { runId: run.id, lines: ready.length };
    });
  }

  /** Daily (PAY-7.04 SLA): settlements whose deadline is today or tomorrow and whose run is not approved alert payroll. */
  async alertDue(today = todayIst()): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findMany({ select: { id: true } }));
    let n = 0;
    for (const o of orgs) {
      const c = this.sys(o.id);
      const due = await this.tenantPrisma.forTenant(c, async (tx) => {
        const entities = (await tx.legalEntity.findMany({ where: { organizationId: o.id }, select: { id: true } })).map((e) => e.id);
        await payScope(tx, entities);
        const rows = await tx.fnfSettlement.findMany({
          where: { organizationId: o.id, status: 'open', deadline: { lte: asDate(addDays(today, 1)) }, OR: [{ alertedOn: null }, { alertedOn: { lt: asDate(today) } }] },
        });
        const out: { users: string[]; id: string; text: string }[] = [];
        for (const f of rows) {
          const run = f.runId ? await tx.payrollRun.findFirst({ where: { organizationId: o.id, id: f.runId }, select: { status: true } }) : null;
          if (run?.status === 'approved' || run?.status === 'paid') continue;
          await tx.fnfSettlement.update({ where: { id: f.id }, data: { alertedOn: asDate(today) } });
          out.push({
            users: await payHolders(tx, o.id, 'payroll.fnf.manage', f.legalEntityId, today),
            id: f.id,
            text: `A full and final settlement is due by ${dateOf(f.deadline)}${dateOf(f.deadline) < today ? ' and is late' : ''}.`,
          });
        }
        return out;
      });
      for (const d of due) {
        n++;
        await this.notifications
          .notifySystem(
            { organizationId: o.id, isSuperAdmin: false },
            d.users,
            'payroll.fnf.due',
            { entityType: 'fnf_settlement', entityId: d.id, contextText: d.text, linkPath: '/yx/payroll/fnf' },
            { subject: 'A full and final settlement is due', html: `<p>${d.text} Open YukthiX to finish it.</p>` },
          )
          .catch(() => undefined);
      }
    }
    return n;
  }
}

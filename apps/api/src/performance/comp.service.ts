import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, companyContext, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { ApprovalsEngine } from '../workflow/approvals-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { holdersOf } from '../time/time-core';
import { withPayScope } from '../payroll/pay-access';
import { PayrollIntakeService } from '../payroll/intake.service';
import { EmployeeHistoryService } from '../employee-history/employee-history.service';
import { LettersService } from '../documents/letters/letters.service';
import { bandFor } from './perf-rules';
import { bandPosition, belowMedian, budgetUse, cellFor, compaRatio, matrixProblem, meritFor, outOfRange, payGap, splitPool, type Cell } from './comp-rules';
import { STARTER_MATRIX } from './starters';
import type { BudgetsDto, CompCycleDto, MatrixDto, ProposalDto } from './review-dto';

// Performance batch PM7 (M06-BUILD-DESIGN §12; PM-7.01 … 7.07): from ratings to pay.
//   matrices   bands × compa-ratio ranges with min / target / max %; cells tile the axis (checked on save)
//   cycles     one per legal entity and pay currency (perf.comp.manage for the entity); opening one makes a proposal for
//              every released review of the linked review cycle in the entity: current pay, compa-ratio, the matrix
//              cell, the target % prorated by eligible months, and a bonus share of the department's pool
//   proposals  the manager changes their team's (team pay only inside this cycle, every read audited); outside the
//              cell or a promotion needs a justification and an extra finance step (YX-PERF-10); over budget adds the
//              extra step or blocks (perf.comp.budget_overrun)
//   approval   P03 'perf.comp': the manager's manager, HR, finance (perf.comp.approve for the entity), plus the extra step
//   apply      in one transaction: P06 bulk batches of up to 1,000 rows (comp_review, linked to the cycle, already
//              approved by the comp chain), salary revisions and promotions effective on the cycle date (a date in a
//              processed month is a back-dated change; payroll pays the arrears, M03 §7.6), bonuses as approved one-time
//              pays (perf_bonus) through payroll's intake; then letters; re-applying is refused
//   pay band   an employee sees only their own grade's range and where they sit (PAY-39)
//   equity     HR and finance see the gap by a dimension before and after, small groups suppressed (YX-PERF-18)

export const COMP_SET = 'perf.comp';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const num = (x: Prisma.Decimal | null) => (x === null ? null : Number(x.toString()));
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const asJson = (x: unknown) => x as Prisma.InputJsonValue;
const money = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
/** M01: a bulk batch holds at most 1,000 rows, so a larger comp cycle is split (§12.6). Mutable only for tests. */
export const APPLY_LIMITS = { batchRows: 1000 };
type Bonus = { month: string; targetPct: number; multipliers: Record<string, number> };
type Proposal = Prisma.CompProposalGetPayload<object>;

@Injectable()
export class PerformanceCompService implements OnModuleInit {
  private readonly logger = new Logger(PerformanceCompService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly notifications: NotificationsService,
    private readonly intake: PayrollIntakeService,
    private readonly history: EmployeeHistoryService,
    private readonly letters: LettersService,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: COMP_SET,
      label: 'Pay changes',
      risk: 'high',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.decided(tx, req, outcome),
      requesterLink: () => '/yx/performance/comp',
    });
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.comp.manage', 'perf.comp.approve', 'perf.cycle.manage']);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  /** The key reaches an entity: company-wide, or granted for that legal entity. */
  private reaches(v: Viewer, key: string, entityId: string) {
    if (v.actingForOther) return false;
    return tenantWide(v, key) || (v.scopes.get(key) ?? []).some((s) => s.type === 'legal_entity' && s.id === entityId);
  }

  private async me(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  // ------------------------------------------------------------------------------------------ matrices (PM-7.01)

  private matrixView(m: Prisma.CompMatrixGetPayload<object>, cells: Prisma.CompMatrixCellGetPayload<object>[]) {
    return { id: m.id, name: m.name, axis: m.axis, status: m.status, starter: Boolean(m.starterKey), version: m.version, cells: cells.filter((c) => c.matrixId === m.id).map((c) => ({ band: c.band, compaFrom: num(c.compaFrom), compaTo: num(c.compaTo), minPct: num(c.minPct)!, targetPct: num(c.targetPct)!, maxPct: num(c.maxPct)! })) };
  }

  private manageAny(v: Viewer) {
    if (v.actingForOther || !(v.scopes.get('perf.comp.manage') ?? []).length) throw new ForbiddenException('Comp reviews are run by HR with perf.comp.manage.');
  }

  async matrices(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.manageAny(v);
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.compMatrix.findMany({ where: { organizationId: c.organizationId }, orderBy: { name: 'asc' } });
      const cells = await tx.compMatrixCell.findMany({ where: { organizationId: c.organizationId, matrixId: { in: rows.map((r) => r.id) } } });
      return rows.map((m) => this.matrixView(m, cells));
    });
  }

  /** The bands a matrix uses: those of the company's active rating scale (the starter's when there is one). */
  private async bandLabels(tx: Tx, org: string) {
    const scale = await tx.ratingScale.findFirst({ where: { organizationId: org, status: 'active' }, orderBy: [{ starterKey: 'asc' }, { createdAt: 'asc' }] });
    if (!scale) throw new ConflictException('Set up a rating scale first (Settings › Performance).');
    return (await tx.ratingBand.findMany({ where: { organizationId: org, scaleId: scale.id }, orderBy: { fromScore: 'asc' } })).map((b) => b.label);
  }

  /** The starter matrix (five bands × three compa ranges, example percentages), copied once and never overwritten. */
  async starterMatrix(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.manageAny(v);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const kept = await tx.compMatrix.findFirst({ where: { organizationId: org, starterKey: STARTER_MATRIX.key } });
      if (kept) return { id: kept.id, created: false };
      const labels = await this.bandLabels(tx, org);
      const cells = labels.flatMap((band, i) => STARTER_MATRIX.byRank[Math.min(i, STARTER_MATRIX.byRank.length - 1)].map((x) => ({ band, ...x })));
      const p = matrixProblem('compa_ratio', labels, cells);
      if (p) throw new ConflictException(`The starter matrix does not fit this scale: ${p}`);
      const m = await tx.compMatrix.create({ data: { organizationId: org, name: STARTER_MATRIX.name, axis: 'compa_ratio', starterKey: STARTER_MATRIX.key, createdBy: v.userId } });
      await tx.compMatrixCell.createMany({ data: cells.map((x) => ({ organizationId: org, matrixId: m.id, ...x })) });
      await audit(tx, c, 'perf.comp.matrix_created', 'comp_matrix', m.id, { starter: true });
      return { id: m.id, created: true };
    });
  }

  async saveMatrix(ctx: TenantContext, user: ScopeUser, id: string | null, dto: MatrixDto) {
    const v = await this.viewer(user);
    this.manageAny(v);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = matrixProblem(dto.axis, await this.bandLabels(tx, org), dto.cells as Cell[]);
      if (p) throw new BadRequestException(p);
      let m;
      if (id) {
        // A matrix a cycle used keeps its meaning: change a copy instead.
        if (await tx.compCycle.count({ where: { organizationId: org, matrixId: id, status: { not: 'draft' } } })) throw new ConflictException('A comp cycle uses this matrix. Make a new one instead.');
        const n = await tx.compMatrix.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { name: dto.name, axis: dto.axis, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this matrix. Reload it.');
        await tx.compMatrixCell.deleteMany({ where: { organizationId: org, matrixId: id } });
        m = await tx.compMatrix.findFirstOrThrow({ where: { id } });
      } else m = await tx.compMatrix.create({ data: { organizationId: org, name: dto.name, axis: dto.axis, createdBy: v.userId } });
      await tx.compMatrixCell.createMany({ data: dto.cells.map((x) => ({ organizationId: org, matrixId: m.id, band: x.band, compaFrom: x.compaFrom ?? null, compaTo: x.compaTo ?? null, minPct: x.minPct, targetPct: x.targetPct, maxPct: x.maxPct })) });
      await audit(tx, c, 'perf.comp.matrix_saved', 'comp_matrix', m.id, { cells: dto.cells.length });
      return this.matrixView(m, await tx.compMatrixCell.findMany({ where: { organizationId: org, matrixId: m.id } }));
    });
  }

  // ------------------------------------------------------------------------------------------ cycles (PM-7.01 … 7.04)

  private cycleView(x: Prisma.CompCycleGetPayload<object>) {
    return { id: x.id, name: x.name, reviewCycleId: x.reviewCycleId, legalEntityId: x.legalEntityId, currency: x.currency, effectiveOn: iso(x.effectiveOn), matrixId: x.matrixId, bonus: (x.bonus as Bonus | null) ?? null, status: x.status, appliedAt: x.appliedAt?.toISOString() ?? null, version: x.version };
  }

  async cycles(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.compCycle.findMany({ where: { organizationId: c.organizationId }, orderBy: { effectiveOn: 'desc' } });
      const me = await this.me(tx, c.organizationId, v);
      const mine = me ? new Set((await tx.compProposal.groupBy({ by: ['compCycleId'], where: { organizationId: c.organizationId, managerEmployeeId: me }, _count: { _all: true } }).catch(() => [])).map((x) => x.compCycleId)) : new Set<string>();
      // HR and finance of the entity; a manager only the cycles where they propose for their team.
      return rows.filter((x) => this.reaches(v, 'perf.comp.manage', x.legalEntityId) || this.reaches(v, 'perf.comp.approve', x.legalEntityId) || mine.has(x.id)).map((x) => this.cycleView(x));
    });
  }

  async createCycle(ctx: TenantContext, user: ScopeUser, dto: CompCycleDto) {
    const v = await this.viewer(user);
    if (!this.reaches(v, 'perf.comp.manage', dto.legalEntityId)) throw new ForbiddenException('Comp cycles of this entity need perf.comp.manage for it.');
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: dto.legalEntityId } }))) throw new BadRequestException('Choose a legal entity of this company.');
      if (!(await tx.compMatrix.findFirst({ where: { organizationId: org, id: dto.matrixId, status: 'active' } }))) throw new BadRequestException('Choose an active matrix.');
      if (dto.reviewCycleId && !(await tx.reviewCycle.findFirst({ where: { organizationId: org, id: dto.reviewCycleId } }))) throw new BadRequestException('Choose a review cycle of this company.');
      if (await tx.compCycle.findFirst({ where: { organizationId: org, legalEntityId: dto.legalEntityId, currency: dto.currency, effectiveOn: asDate(dto.effectiveOn), status: { not: 'closed' } } })) throw new ConflictException('There is already a comp cycle for this entity, currency and date.');
      const x = await tx.compCycle.create({ data: { organizationId: org, name: dto.name, reviewCycleId: dto.reviewCycleId ?? null, legalEntityId: dto.legalEntityId, currency: dto.currency, effectiveOn: asDate(dto.effectiveOn), matrixId: dto.matrixId, bonus: dto.bonus ? asJson(dto.bonus) : Prisma.DbNull, createdBy: v.userId } });
      await audit(tx, c, 'perf.comp.cycle_created', 'comp_cycle', x.id, { legalEntityId: dto.legalEntityId });
      return this.cycleView(x);
    });
  }

  private async cycleOr404(tx: Tx, org: string, id: string) {
    const x = await tx.compCycle.findFirst({ where: { organizationId: org, id } });
    if (!x) throw new NotFoundException('No such comp cycle.');
    return x;
  }

  /** Budgets per department (merit and bonus), while the cycle is a draft or open. */
  async setBudgets(ctx: TenantContext, user: ScopeUser, id: string, dto: BudgetsDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await this.cycleOr404(tx, org, id);
      if (!this.reaches(v, 'perf.comp.manage', x.legalEntityId)) throw new ForbiddenException('Budgets need perf.comp.manage for this entity.');
      if (x.status !== 'draft' && x.status !== 'open') throw new ConflictException('Budgets are set before the cycle is approved.');
      for (const b of dto.budgets) {
        await tx.compBudget.upsert({ where: { compCycleId_departmentId_kind: { compCycleId: id, departmentId: b.departmentId, kind: b.kind } }, create: { organizationId: org, compCycleId: id, departmentId: b.departmentId, kind: b.kind, amount: b.amount }, update: { amount: b.amount } });
      }
      await audit(tx, c, 'perf.comp.budgets_set', 'comp_cycle', id, { budgets: dto.budgets.length });
      return { budgets: dto.budgets.length };
    });
  }

  /**
   * Opening makes the proposals: every released review of the linked cycle in the entity (or, without one, everyone
   * employed there) with current pay on the effective date, the compa-ratio against the grade range, the matrix cell,
   * the prorated target %, and a bonus share of the department's pool.
   */
  async open(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await this.cycleOr404(tx, org, id);
      if (!this.reaches(v, 'perf.comp.manage', x.legalEntityId)) throw new ForbiddenException('Opening needs perf.comp.manage for this entity.');
      if (x.status !== 'draft') throw new ConflictException('This cycle is already open.');
      if (x.version !== version) throw new ConflictException('Someone else changed this cycle. Reload it.');
      const on = iso(x.effectiveOn);
      const people = await tx.$queryRaw<{ employee_id: string; employment_id: string; department_id: string; grade_id: string | null; manager_employee_id: string | null }[]>`
        SELECT DISTINCT ON (a.employee_id) a.employee_id::text, a.employment_id::text, a.department_id::text, a.grade_id::text, a.manager_employee_id::text
        FROM employee_assignments a JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id
        WHERE a.organization_id = ${org}::uuid AND a.legal_entity_id = ${x.legalEntityId}::uuid AND a.superseded_at IS NULL
          AND a.valid_from <= ${on}::date AND (a.valid_to IS NULL OR a.valid_to >= ${on}::date) AND (m.exited_on IS NULL OR m.exited_on >= ${on}::date)
        ORDER BY a.employee_id, a.valid_from DESC`;
      const reviews = x.reviewCycleId ? await tx.review.findMany({ where: { organizationId: org, cycleId: x.reviewCycleId, status: { in: ['released', 'acknowledged'] } } }) : [];
      const elig = x.reviewCycleId ? new Map((await tx.reviewEligibility.findMany({ where: { organizationId: org, cycleId: x.reviewCycleId } })).map((e) => [e.employeeId, num(e.proration)!])) : new Map<string, number>();
      const chosen = x.reviewCycleId ? people.filter((p) => reviews.some((r) => r.employeeId === p.employee_id)) : people;
      if (!chosen.length) throw new ConflictException('No one is in this comp cycle: release the review cycle first, or check the entity.');
      const cells = (await tx.compMatrixCell.findMany({ where: { organizationId: org, matrixId: x.matrixId } })).map((c2) => ({ band: c2.band, compaFrom: num(c2.compaFrom), compaTo: num(c2.compaTo), minPct: num(c2.minPct)!, targetPct: num(c2.targetPct)!, maxPct: num(c2.maxPct)! }));
      const bonus = (x.bonus as Bonus | null) ?? null;
      const rows = await withPayScope(tx, [x.legalEntityId], async () => {
        const pays = await tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: chosen.map((p) => p.employment_id) }, supersededAt: null, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] } });
        const ranges = await tx.gradePayRange.findMany({ where: { organizationId: org, legalEntityId: x.legalEntityId, currency: x.currency, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] } });
        return chosen.flatMap((p) => {
          const pay = pays.find((y) => y.employmentId === p.employment_id && y.currency === x.currency);
          if (!pay) return [];
          const ctc = num(pay.annualCtc)!;
          const r = reviews.find((y) => y.employeeId === p.employee_id) ?? null;
          const band = r?.band ?? null;
          const range = ranges.find((y) => y.gradeId === p.grade_id);
          const ratio = compaRatio(ctc, range ? num(range.mid) : null);
          const cell = band ? cellFor(cells, band, ratio) : null;
          const proration = elig.get(p.employee_id) ?? 1;
          const merit = meritFor(ctc, cell, proration);
          return [{ p, ctc, r, band, ratio, cell, proration, merit }];
        });
      });
      // Bonus: each department's pool split by target × band multiplier (§12.3).
      const bonusOf = new Map<string, number>();
      if (bonus) {
        const pools = await tx.compBudget.findMany({ where: { organizationId: org, compCycleId: id, kind: 'bonus' } });
        for (const pool of pools) {
          const inDept = rows.filter((y) => y.p.department_id === pool.departmentId);
          const split = splitPool(num(pool.amount)!, inDept.map((y) => ({ id: y.p.employee_id, target: (y.ctc * bonus.targetPct) / 100, multiplier: y.band ? (bonus.multipliers[y.band] ?? 0) : 0 })));
          for (const [k, val] of split) bonusOf.set(k, val);
        }
      }
      await withPayScope(tx, [x.legalEntityId], () =>
        tx.compProposal.createMany({
          data: rows.map((y) => ({
            organizationId: org,
            compCycleId: id,
            legalEntityId: x.legalEntityId,
            employeeId: y.p.employee_id,
            employmentId: y.p.employment_id,
            departmentId: y.p.department_id,
            managerEmployeeId: y.p.manager_employee_id,
            reviewId: y.r?.id ?? null,
            band: y.band,
            currentCtc: money(y.ctc),
            compaRatio: y.ratio,
            proration: y.proration,
            cell: y.cell ? asJson(y.cell) : Prisma.DbNull,
            meritPct: y.merit.pct,
            meritAmount: money(y.merit.amount),
            bonusAmount: money(bonusOf.get(y.p.employee_id) ?? 0),
            newCtc: money(y.ctc + y.merit.amount),
          })),
        }),
      );
      await tx.compCycle.update({ where: { id }, data: { status: 'open', version: { increment: 1 } } });
      await audit(tx, c, 'perf.comp.cycle_opened', 'comp_cycle', id, { proposals: rows.length, skippedWithoutPay: chosen.length - rows.length });
      return { proposals: rows.length, withoutPay: chosen.length - rows.length };
    });
  }

  // ------------------------------------------------------------------------------------------ the sheet (PM-7.02, 7.05)

  /** Who may read and change a cycle's proposals: HR and finance of the entity see all; a manager their team's only. */
  private async sheetAccess(tx: Tx, c: CompanyContext, v: Viewer, x: Prisma.CompCycleGetPayload<object>) {
    const hr = this.reaches(v, 'perf.comp.manage', x.legalEntityId);
    const finance = this.reaches(v, 'perf.comp.approve', x.legalEntityId);
    const me = await this.me(tx, c.organizationId, v);
    return { hr, finance, me };
  }

  private async budgets(tx: Tx, org: string, x: Prisma.CompCycleGetPayload<object>) {
    const list = await tx.compBudget.findMany({ where: { organizationId: org, compCycleId: x.id } });
    const props = await withPayScope(tx, [x.legalEntityId], () => tx.compProposal.findMany({ where: { organizationId: org, compCycleId: x.id, status: { in: ['draft', 'submitted', 'approved', 'applied'] } } }));
    const depts = new Map((await tx.department.findMany({ where: { organizationId: org, id: { in: list.map((b) => b.departmentId) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
    return list.map((b) => {
      const mine = props.filter((p) => p.departmentId === b.departmentId);
      const used = b.kind === 'merit' ? mine.map((p) => num(p.meritAmount)! + num(p.promotionAmount)!) : mine.map((p) => num(p.bonusAmount)!);
      return { departmentId: b.departmentId, department: depts.get(b.departmentId) ?? '', kind: b.kind, amount: num(b.amount)!, ...budgetUse(num(b.amount)!, used) };
    });
  }

  private proposalView(p: Proposal, people: Map<string, string>) {
    return {
      id: p.id,
      employee: people.get(p.employeeId) ?? '',
      employeeId: p.employeeId,
      departmentId: p.departmentId,
      manager: people.get(p.managerEmployeeId ?? '') ?? '',
      band: p.band,
      currentCtc: num(p.currentCtc),
      compaRatio: num(p.compaRatio),
      proration: num(p.proration),
      cell: p.cell,
      meritPct: num(p.meritPct),
      meritAmount: num(p.meritAmount),
      promotionToGradeId: p.promotionToGradeId,
      promotionToDesignationId: p.promotionToDesignationId,
      promotionAmount: num(p.promotionAmount),
      bonusAmount: num(p.bonusAmount),
      newCtc: num(p.newCtc),
      outOfRange: p.outOfRange,
      justification: p.justification,
      status: p.status,
      version: p.version,
    };
  }

  async sheet(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await this.cycleOr404(tx, org, id);
      const a = await this.sheetAccess(tx, c, v, x);
      const all = await withPayScope(tx, [x.legalEntityId], () => tx.compProposal.findMany({ where: { organizationId: org, compCycleId: id }, orderBy: { createdAt: 'asc' } }));
      const rows = a.hr || a.finance ? all : all.filter((p) => a.me && p.managerEmployeeId === a.me);
      if (!a.hr && !a.finance && !rows.length) throw new NotFoundException('No such comp cycle.');
      // Q6: a manager sees team pay only inside a comp cycle they propose in, and every look is recorded.
      if (!a.hr && !a.finance) await audit(tx, c, 'perf.comp.team_pay_viewed', 'comp_cycle', id, { people: rows.length });
      const people = await this.names(tx, org, rows.flatMap((p) => [p.employeeId, p.managerEmployeeId]));
      const overrun = await settingFor(tx, c, 'perf.comp.budget_overrun', { legalEntityId: x.legalEntityId });
      return {
        cycle: this.cycleView(x),
        role: a.hr ? 'hr' : a.finance ? 'finance' : 'manager',
        proposals: rows.map((p) => this.proposalView(p, people)),
        budgets: a.hr || a.finance ? await this.budgets(tx, org, x) : (await this.budgets(tx, org, x)).filter((b) => rows.some((p) => p.departmentId === b.departmentId)),
        overrun,
        can: { edit: x.status === 'open', submit: x.status === 'open' && rows.some((p) => p.status === 'draft' && (a.hr || p.managerEmployeeId === a.me)), apply: a.hr && x.status === 'approved' },
      };
    });
  }

  async updateProposal(ctx: TenantContext, user: ScopeUser, proposalId: string, dto: ProposalDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      // Proposals sit behind the pay guard: find which cycle this one belongs to inside the scope of the company's comp entities.
      const entities = [...new Set((await tx.compCycle.findMany({ where: { organizationId: org }, select: { legalEntityId: true } })).map((y) => y.legalEntityId))];
      const head = await withPayScope(tx, entities, () => tx.compProposal.findFirst({ where: { organizationId: org, id: proposalId }, select: { compCycleId: true } }));
      if (!head) throw new NotFoundException('No such proposal.');
      const x = await this.cycleOr404(tx, org, head.compCycleId);
      return withPayScope(tx, [x.legalEntityId], async () => {
        const p = await tx.compProposal.findFirstOrThrow({ where: { id: proposalId } });
        const a = await this.sheetAccess(tx, c, v, x);
        if (!a.hr && p.managerEmployeeId !== a.me) throw new NotFoundException('No such proposal.');
        if (x.status !== 'open' || p.status !== 'draft') throw new ConflictException('Only a draft proposal in an open cycle changes.');
        if (p.version !== dto.version) throw new ConflictException('Someone else changed this proposal. Reload it.');
        const ctc = num(p.currentCtc)!;
        const promotion = Boolean(dto.promotionToGradeId || dto.promotionToDesignationId || (dto.promotionAmount ?? 0) > 0);
        if (promotion && (!dto.promotionToDesignationId || (dto.promotionAmount ?? 0) <= 0)) throw new BadRequestException('A promotion names the new designation and its increase.');
        const meritAmount = Math.round(ctc * dto.meritPct) / 100;
        const out = outOfRange(dto.meritPct, (p.cell as Cell | null) ?? null, num(p.proration)!, promotion);
        if (out && !dto.justification?.trim()) throw new BadRequestException('Outside the matrix, or with a promotion: say why (YX-PERF-10).');
        const updated = await tx.compProposal.update({
          where: { id: proposalId },
          data: {
            meritPct: dto.meritPct,
            meritAmount: money(meritAmount),
            promotionToGradeId: dto.promotionToGradeId ?? null,
            promotionToDesignationId: dto.promotionToDesignationId ?? null,
            promotionAmount: money(dto.promotionAmount ?? 0),
            bonusAmount: money(dto.bonusAmount ?? num(p.bonusAmount)!),
            newCtc: money(ctc + meritAmount + (dto.promotionAmount ?? 0)),
            outOfRange: out,
            justification: dto.justification?.trim() || null,
            version: { increment: 1 },
          },
        });
        await audit(tx, c, 'perf.comp.proposal_changed', 'comp_proposal', proposalId, { meritPct: dto.meritPct, outOfRange: out });
        return this.proposalView(updated, await this.names(tx, org, [p.employeeId, p.managerEmployeeId]));
      });
    });
  }

  /** The submitter's draft proposals (their team's, or all for HR) go for approval together (P03 'perf.comp'). */
  async submit(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    const notices = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await this.cycleOr404(tx, org, id);
      const a = await this.sheetAccess(tx, c, v, x);
      if (x.status !== 'open') throw new ConflictException('This cycle is not open for proposals.');
      return withPayScope(tx, [x.legalEntityId], async () => {
        const drafts = await tx.compProposal.findMany({ where: { organizationId: org, compCycleId: id, status: 'draft', ...(a.hr ? {} : { managerEmployeeId: a.me ?? '' }) } });
        if (!drafts.length) throw new ConflictException('There is nothing to send.');
        const budgets = await this.budgets(tx, org, x);
        const over = budgets.filter((b) => b.over && drafts.some((p) => p.departmentId === b.departmentId));
        const overrun = await settingFor(tx, c, 'perf.comp.budget_overrun', { legalEntityId: x.legalEntityId });
        if (over.length && overrun === 'block') throw new ConflictException(`Over budget in ${over.map((b) => `${b.department} (${b.kind})`).join(', ')}: bring it within budget before you send it.`);
        const exceptions = drafts.some((p) => p.outOfRange) || over.length > 0;
        const today = todayIst();
        const hr = (await holdersOf(tx, org, 'perf.comp.manage', drafts[0].employeeId, today)).filter((u) => u !== v.userId);
        const finance = (await holdersOf(tx, org, 'perf.comp.approve', drafts[0].employeeId, today)).filter((u) => u !== v.userId);
        const subject = a.me ?? drafts[0].employeeId;
        if (!finance.length) throw new ConflictException('No one can approve pay changes as finance for this entity (perf.comp.approve).');
        const steps = [
          ...(a.me && !a.hr ? [{ name: 'Your manager', approvers: [{ kind: 'manager' as const }], mode: 'any' as const, remindAfterHours: 48, timeoutHours: 120, onTimeout: 'escalate' as const, selfApproval: 'never' as const }] : []),
          // HR who raise it themselves are the HR step; anyone else's proposals go to HR.
          ...(hr.length && !a.hr ? [{ name: 'HR', approvers: [{ kind: 'users' as const, userIds: hr.slice(0, 25) }], mode: 'any' as const, selfApproval: 'never' as const }] : []),
          { name: 'Finance', approvers: [{ kind: 'users' as const, userIds: finance.slice(0, 25) }], mode: 'any' as const, selfApproval: 'never' as const },
          // YX-PERF-10: outside the matrix, a promotion or over budget adds a second finance approval.
          ...(exceptions ? [{ name: 'Finance (exceptions)', approvers: [{ kind: 'users' as const, userIds: finance.slice(0, 25) }], mode: 'any' as const, selfApproval: 'never' as const }] : []),
        ];
        const person = await tx.employee.findFirst({ where: { organizationId: org, id: subject }, select: { personId: true } });
        const res = await this.engine.submit(tx, c, {
          type: COMP_SET,
          subjectType: 'employee',
          subjectId: subject,
          title: `Pay changes for ${drafts.length} ${drafts.length === 1 ? 'person' : 'people'}: ${x.name}`.slice(0, 150),
          summary: [{ label: 'Comp cycle', value: x.name }, { label: 'Proposals', value: String(drafts.length) }, { label: 'Exceptions', value: exceptions ? 'Outside the matrix, a promotion or over budget' : 'None' }],
          subjectPersonId: person?.personId ?? null,
          requesterUserId: v.userId,
          raisedByUserId: v.userId,
          steps,
          payload: { compCycleId: id, proposalIds: drafts.map((p) => p.id) },
          payloadFields: [],
          fallbackUserIds: hr,
        });
        await tx.compProposal.updateMany({ where: { organizationId: org, id: { in: drafts.map((p) => p.id) } }, data: { status: 'submitted', wfRequestId: res.id, version: { increment: 1 } } });
        await audit(tx, c, 'perf.comp.submitted', 'comp_cycle', id, { proposals: drafts.length, exceptions });
        return res.notices;
      });
    });
    await this.engine.send({ organizationId: ctx.organizationId!, isSuperAdmin: false }, notices);
    return { submitted: true };
  }

  /** The chain decided: the proposals follow; once none is waiting, the cycle is approved. */
  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    // The request's proposals are the ones that point at it; they are read inside the pay scope of the comp cycles' entities.
    const entities = (await tx.compCycle.findMany({ where: { organizationId: org }, select: { legalEntityId: true } })).map((c) => c.legalEntityId);
    await withPayScope(tx, [...new Set(entities)], async () => {
      const first = await tx.compProposal.findFirst({ where: { organizationId: org, wfRequestId: req.id }, select: { compCycleId: true } });
      if (!first) return;
      const compCycleId = first.compCycleId;
      const x = await tx.compCycle.findFirstOrThrow({ where: { organizationId: org, id: compCycleId } });
      await tx.compProposal.updateMany({ where: { organizationId: org, wfRequestId: req.id, status: 'submitted' }, data: outcome === 'approved' ? { status: 'approved', version: { increment: 1 } } : { status: 'draft', wfRequestId: null, version: { increment: 1 } } });
      const waiting = await tx.compProposal.count({ where: { organizationId: org, compCycleId, status: { in: ['draft', 'submitted'] } } });
      if (outcome === 'approved' && !waiting && x.status === 'open') await tx.compCycle.update({ where: { id: compCycleId }, data: { status: 'approved', version: { increment: 1 } } });
    });
  }

  // ------------------------------------------------------------------------------------------ apply (PM-7.06)

  /**
   * §12.6, in one transaction: bulk batches of up to 1,000 rows (comp_review, linked to the cycle, approved by the comp
   * chain), each merit or promotion as a P06 change effective on the cycle date, bonuses as approved one-time pays.
   * Either everything is applied or nothing is; re-applying is refused. Letters follow, once it is all in.
   */
  async apply(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    const c0 = companyContext(ctx);
    // A batch write whose rows were decided before it opened: the one transaction may take longer than 5 s (§12.6).
    const out = await this.tenantPrisma.forTenant(c0, async (tx) => {
      const c = c0;
      const org = c.organizationId;
      const x = await this.cycleOr404(tx, org, id);
      if (!this.reaches(v, 'perf.comp.manage', x.legalEntityId)) throw new ForbiddenException('Applying needs perf.comp.manage for this entity.');
      if (x.status === 'applied') throw new ConflictException('This cycle is already applied.');
      if (x.status !== 'approved') throw new ConflictException('Every proposal must be approved first.');
      if (x.version !== version) throw new ConflictException('Someone else changed this cycle. Reload it.');
      await tx.compCycle.update({ where: { id }, data: { status: 'applied', appliedAt: new Date(), appliedBy: v.userId, version: { increment: 1 } } });
      const props = await withPayScope(tx, [x.legalEntityId], () => tx.compProposal.findMany({ where: { organizationId: org, compCycleId: id, status: 'approved' }, orderBy: { createdAt: 'asc' } }));
      const changing = props.filter((p) => num(p.meritAmount)! > 0 || num(p.promotionAmount)! > 0);
      const effectiveOn = iso(x.effectiveOn);
      const bonus = (x.bonus as Bonus | null) ?? null;
      let batches = 0;
      for (let i = 0; i < changing.length; i += APPLY_LIMITS.batchRows) {
        const part = changing.slice(i, i + APPLY_LIMITS.batchRows);
        const batch = await tx.employeeChangeBatch.create({ data: { organizationId: org, source: 'comp_review', status: 'approved', reason: `Comp cycle ${x.name}`.slice(0, 1000), rowCount: part.length, requestedBy: v.userId, decidedBy: v.userId, decidedAt: new Date(), decisionNote: `Approved through the comp cycle ${x.name}.`, compCycleId: id } });
        batches += 1;
        for (const p of part) {
          const promotion = Boolean(p.promotionToDesignationId);
          const dto = {
            employeeId: p.employeeId,
            changeType: (promotion ? 'promotion' : 'salary_revision') as 'promotion' | 'salary_revision',
            effectiveDate: effectiveOn,
            payload: { ...(promotion ? { assignment: { designationId: p.promotionToDesignationId!, ...(p.promotionToGradeId ? { gradeId: p.promotionToGradeId } : {}) } } : {}), compensation: { annualCtc: num(p.newCtc)!.toFixed(2), currency: x.currency } },
            reason: `Comp cycle ${x.name}`,
            overrideReason: `Applied from the approved comp cycle ${x.name}.`,
          };
          const { ch, e } = await this.history.createChange(tx, c, v, dto as never);
          await tx.employeeChange.update({ where: { id: ch.id }, data: { batchId: batch.id } });
          // Already approved by the comp chain (P03 perf.comp); the change log shows the batch as its approval.
          const { updated, impact, effectiveNow } = await this.history.approveIn(tx, c, v, ch, e, { confirmRebase: true, note: `Approved through the comp cycle ${x.name}.`, simulate: true });
          await this.history.afterApply(tx, c, updated, impact as { retro: unknown }, effectiveNow);
          await withPayScope(tx, [x.legalEntityId], () => tx.compProposal.update({ where: { id: p.id }, data: { batchId: batch.id, changeId: ch.id } }));
        }
      }
      let bonuses = 0;
      if (bonus) {
        for (const p of props.filter((y) => num(y.bonusAmount)! > 0)) {
          const r = await this.intake.oneTime(tx, c, { source: 'm06', sourceRef: p.id, employeeId: p.employeeId, componentCode: 'perf_bonus', amount: num(p.bonusAmount)!.toFixed(2), month: bonus.month, reason: `Performance bonus, ${x.name}`, by: v.userId! });
          await withPayScope(tx, [x.legalEntityId], () => tx.compProposal.update({ where: { id: p.id }, data: { oneTimePayId: r.id } }));
          bonuses += 1;
        }
      }
      await withPayScope(tx, [x.legalEntityId], () => tx.compProposal.updateMany({ where: { organizationId: org, compCycleId: id, status: 'approved' }, data: { status: 'applied' } }));
      await audit(tx, c, 'perf.comp.applied', 'comp_cycle', id, { changes: changing.length, batches, bonuses });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: changing.map((p) => p.employeeId) } }, select: { id: true, personId: true } });
      return { changes: changing.length, batches, bonuses, letters: changing.map((p) => ({ proposalId: p.id, personId: people.find((y) => y.id === p.employeeId)!.personId, promotion: Boolean(p.promotionToDesignationId) })), entity: x.legalEntityId };
    }, { timeout: 600_000 });
    // Letters after the pay changes are in (P05 renders them on its own queue); a missing template is noted, not fatal.
    let letters = 0;
    for (const l of out.letters) {
      try {
        const issued = (await this.letters.issueSystem(ctx, { letterType: l.promotion ? 'promotion' : 'increment', personId: l.personId } as never)) as { id?: string } | null;
        if (issued?.id) {
          letters += 1;
          await this.run(ctx, (tx) => withPayScope(tx, [out.entity], () => tx.compProposal.update({ where: { id: l.proposalId }, data: { letterId: issued.id } })));
        }
      } catch (e) {
        this.logger.warn(`comp letter ${l.proposalId}: ${(e as Error).message}`);
      }
    }
    return { changes: out.changes, batches: out.batches, bonuses: out.bonuses, letters };
  }

  // ------------------------------------------------------------------------------------------ pay band and equity (PM-7.07)

  /** PAY-39: my own grade's range and where I sit; never anyone else's. */
  async myPayBand(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      if (!me) throw new NotFoundException('Only employees have a pay band.');
      const today = todayIst();
      const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: me, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] }, orderBy: { validFrom: 'desc' } });
      if (!a) throw new NotFoundException('No current job.');
      if ((await settingFor(tx, c, 'perf.pay_band.visible', { legalEntityId: a.legalEntityId })) !== 'on') return { visible: false };
      return withPayScope(tx, [a.legalEntityId], async () => {
        const pay = await tx.compensation.findFirst({ where: { organizationId: org, employmentId: a.employmentId, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] } });
        const range = a.gradeId && pay ? await tx.gradePayRange.findFirst({ where: { organizationId: org, gradeId: a.gradeId, legalEntityId: a.legalEntityId, currency: pay.currency, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] } }) : null;
        if (!pay || !range) return { visible: true, range: null };
        const r = { min: num(range.min)!, mid: num(range.mid)!, max: num(range.max)! };
        return { visible: true, currency: pay.currency, range: r, ...bandPosition(num(pay.annualCtc)!, r) };
      });
    });
  }

  /** YX-PERF-18: the gap by a dimension before and after the proposals; small groups suppressed; people far below their peers flagged. */
  async payEquity(ctx: TenantContext, user: ScopeUser, id: string, dimension: 'gender' | 'grade' | 'location') {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await this.cycleOr404(tx, org, id);
      if (!this.reaches(v, 'perf.comp.manage', x.legalEntityId) && !this.reaches(v, 'perf.comp.approve', x.legalEntityId)) throw new ForbiddenException('Pay equity is for HR and finance of the entity.');
      const props = await withPayScope(tx, [x.legalEntityId], () => tx.compProposal.findMany({ where: { organizationId: org, compCycleId: id } }));
      const today = todayIst();
      const facts = await tx.$queryRaw<{ employee_id: string; gender: string | null; grade: string | null; location: string | null; role: string | null }[]>`
        SELECT a.employee_id::text, pd.gender, g.name AS grade, l.name AS location, d.name AS role
        FROM employee_assignments a
        LEFT JOIN employee_personal_details pd ON pd.organization_id = a.organization_id AND pd.employee_id = a.employee_id
        LEFT JOIN grades g ON g.organization_id = a.organization_id AND g.id = a.grade_id
        LEFT JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
        LEFT JOIN designations d ON d.organization_id = a.organization_id AND d.id = a.designation_id
        WHERE a.organization_id = ${org}::uuid AND a.employee_id = ANY(${props.map((p) => p.employeeId)}::uuid[]) AND a.superseded_at IS NULL
          AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)`;
      const min = Number(await settingFor(tx, c, 'perf.report.min_cell', { legalEntityId: '' }));
      const threshold = Number(await settingFor(tx, c, 'perf.pay_equity.flag_pct', { legalEntityId: x.legalEntityId }));
      const rows = (pay: (p: Proposal) => number) => props.map((p) => {
        const f = facts.find((y) => y.employee_id === p.employeeId);
        return { id: p.employeeId, group: (dimension === 'gender' ? f?.gender : dimension === 'grade' ? f?.grade : f?.location) ?? 'Not recorded', grade: f?.grade ?? '—', role: f?.role ?? '—', pay: pay(p) };
      });
      const before = rows((p) => num(p.currentCtc)!);
      const after = rows((p) => num(p.newCtc)!);
      const flagged = belowMedian(after, threshold);
      const people = await this.names(tx, org, flagged);
      const results = { dimension, before: payGap(before, min), after: payGap(after, min), flagged: flagged.map((f) => ({ employeeId: f, employee: people.get(f) ?? '' })), threshold, min };
      await withPayScope(tx, [x.legalEntityId], () => tx.payEquityRun.create({ data: { organizationId: org, compCycleId: id, legalEntityId: x.legalEntityId, dimension, results: asJson(results), runBy: v.userId } }));
      await audit(tx, c, 'perf.comp.pay_equity_run', 'comp_cycle', id, { dimension });
      return results;
    });
  }
}

void D;
void bandFor;

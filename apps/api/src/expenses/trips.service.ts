import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, covers, grantPeriods, started, tenantWide } from '../access/scope';
import { ApprovalsEngine, type StepSpec } from '../workflow/approvals-engine.service';
import { FilesService } from '../documents/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { holdersOf, hrApprovers } from '../time/time-core';
import { refreezeExitOf } from '../lifecycle/settlement';
import { tierFor } from './checks';
import { TRAVEL_BOOKING, openBalance, settleClaim, tripBudget, type TravelBookingAdapter } from './travel';
import type { AdvanceAmountDto, AdvanceDto, BookingDto, PayAdvanceDto, ReturnDto, TripDto } from './trips-dto';

// Expenses batch E4 (M05-BUILD-DESIGN §5.5, §9.4, §10, §11.3; XP-4.01 … XP-4.06): trips with legs and bookings, and
// advances (for a trip, or a standing imprest) with their settlement ledger.
//   who sees   the traveller; approvers holding or having held a task; expense.claim.view in scope; the travel desk
//              (travel.booking.manage in scope) for trips; finance (expense.payout.manage for the entity) for advances
//   money      pay currency only (forex advances are E5); an advance's open balance = paid − Σ settlements, and an
//              approved claim on the trip (or the imprest) settles it first (YX-EXP-08, M05 §9)
//   pending    salary recovery of an overdue advance waits for payroll's 'expense' loan type (§22.1 change 5); until
//              then overdue advances are flagged, finance is told, and money comes back by bank return or at F&F

export const TRIP_TYPE = 'expense.trip';
export const ADVANCE_TYPE = 'expense.advance';
const KEYS = ['expense.claim.view', 'travel.booking.manage', 'expense.payout.manage'] as const;
const BOOKING_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const addDays = (d: string, n: number) => iso(new Date(asDate(d).getTime() + n * 86_400_000));
const SYSTEM = (org: string): CompanyContext => ({ organizationId: org, isSuperAdmin: false, userId: null });

type Trip = Prisma.TripGetPayload<object>;
type Advance = Prisma.ExpenseAdvanceGetPayload<object>;
type Subject = { employeeId: string; legalEntityId: string; wfRequestId: string | null };
type Access = { own: boolean; approver: boolean; openTaskId: string | null; scope: boolean; desk: boolean; payout: boolean };

/**
 * A claim on a trip (or an imprest) was approved: the advance covers what it can and the rest is paid (XP-4.04).
 * Runs in the claim's decision transaction; returns the amount taken from the advance.
 */
export async function settleAdvanceByClaim(tx: Tx, org: string, claim: { id: string; tripId: string | null; advanceId: string | null; employmentId: string }, approved: Prisma.Decimal): Promise<Prisma.Decimal> {
  const adv = claim.advanceId
    ? await tx.expenseAdvance.findFirst({ where: { organizationId: org, id: claim.advanceId } })
    : claim.tripId
      ? await tx.expenseAdvance.findFirst({ where: { organizationId: org, tripId: claim.tripId } })
      : null;
  if (!adv || !['paid', 'to_fnf'].includes(adv.status)) return D(0);
  if (await tx.advanceSettlement.findFirst({ where: { organizationId: org, claimId: claim.id }, select: { id: true } })) return D(0);
  const open = await balanceOf(tx, org, adv);
  const s = settleClaim(open, approved);
  if (D(s.adjusted).lte(0)) return D(0);
  await tx.advanceSettlement.create({ data: { organizationId: org, advanceId: adv.id, kind: 'claim', claimId: claim.id, amount: s.adjusted, on: asDate(todayIst()) } });
  if (D(s.leftOnAdvance).lte(0)) {
    await tx.expenseAdvance.update({ where: { id: adv.id }, data: { status: 'settled', version: { increment: 1 } } });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'advance.settled', payload: { advanceId: adv.id } } });
  }
  await refreezeExitOf(tx, SYSTEM(org), claim.employmentId);
  return D(s.adjusted);
}

async function balanceOf(tx: Tx, org: string, a: Advance) {
  const rows = await tx.advanceSettlement.findMany({ where: { organizationId: org, advanceId: a.id }, select: { amount: true } });
  // Nothing is owed on an advance until it is paid.
  return openBalance(a.paidOn ? a.amount : null, rows.map((r) => r.amount));
}

@Injectable()
export class ExpenseTripsService implements OnModuleInit {
  private readonly logger = new Logger(ExpenseTripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly engine: ApprovalsEngine,
    private readonly notifications: NotificationsService,
    @Inject(TRAVEL_BOOKING) private readonly partner: TravelBookingAdapter,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: TRIP_TYPE,
      label: 'Trip',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.tripDecided(tx, req, outcome),
      requesterLink: (req) => `/yx/expenses/trips/${req.subjectId}`,
    });
    this.engine.register({
      key: ADVANCE_TYPE,
      label: 'Expense advance',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, outcome) => this.advanceDecided(tx, req, outcome),
      requesterLink: (req) => `/yx/expenses/advances/${req.subjectId}`,
    });
  }

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
  }

  // ------------------------------------------------------------------------------------------ access

  private async myEmployee(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true, personId: true } });
  }

  private async access(tx: Tx, c: CompanyContext, v: Viewer, s: Subject): Promise<Access> {
    const org = c.organizationId;
    const me = await this.myEmployee(tx, org, v);
    let approver = false;
    let openTaskId: string | null = null;
    if (s.wfRequestId && v.userId) {
      const tasks = await tx.wfTask.findMany({ where: { organizationId: org, requestId: s.wfRequestId, assigneeUserId: v.userId }, select: { id: true, status: true, step: true } });
      approver = tasks.length > 0;
      const req = await tx.wfRequest.findFirst({ where: { organizationId: org, id: s.wfRequestId }, select: { status: true, currentStep: true } });
      openTaskId = (req?.status === 'pending' ? tasks.find((t) => t.status === 'open' && t.step === req.currentStep)?.id : undefined) ?? null;
    }
    const today = todayIst();
    const inScope = async (key: string) => v.grants.has(key) && covers(started(await grantPeriods(tx, c, v, key, s.employeeId, me?.id ?? null), today), today);
    const payout = !v.actingForOther && v.grants.has('expense.payout.manage') && (tenantWide(v, 'expense.payout.manage') || (v.scopes.get('expense.payout.manage') ?? []).some((x) => x.type === 'legal_entity' && x.id === s.legalEntityId));
    return { own: me?.id === s.employeeId, approver, openTaskId, scope: await inScope('expense.claim.view'), desk: !v.actingForOther && (await inScope('travel.booking.manage')), payout };
  }

  private async tripOr404(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const trip = await tx.trip.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!trip) throw new NotFoundException('No such trip.');
    const a = await this.access(tx, c, v, trip);
    if (!a.own && !a.approver && !a.scope && !a.desk && !a.payout) throw new NotFoundException('No such trip.');
    return { trip, a };
  }

  private async advanceOr404(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const adv = await tx.expenseAdvance.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!adv) throw new NotFoundException('No such advance.');
    const a = await this.access(tx, c, v, adv);
    if (!a.own && !a.approver && !a.scope && !a.payout) throw new NotFoundException('No such advance.');
    return { adv, a };
  }

  private async currentJob(tx: Tx, org: string, employeeId: string) {
    const today = asDate(todayIst());
    const job = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' }, select: { employmentId: true, legalEntityId: true } });
    if (!job) throw new ForbiddenException('You have no current job.');
    const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: job.legalEntityId }, select: { currency: true } });
    return { ...job, currency: entity.currency };
  }

  private async names(tx: Tx, org: string, employeeIds: string[]) {
    const emps = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(employeeIds)] } }, select: { id: true, personId: true } });
    const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: emps.map((e) => e.personId) } } });
    return new Map(
      emps.map((e) => {
        const p = persons.find((x) => x.id === e.personId);
        return [e.id, p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : ''];
      }),
    );
  }

  private async tell(org: string, users: (string | null)[], text: string, link: string, type: 'expense.trip.update' | 'expense.advance.update') {
    const to = [...new Set(users.filter((u): u is string => Boolean(u)))];
    // Amounts stay in the app (P04 Q6): the mail only says there is something to look at.
    if (to.length) await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: type === 'expense.trip.update' ? 'trip' : 'expense_advance', entityId: org, contextText: text, linkPath: link }, { subject: 'Expenses: something needs your attention', html: '<p>Something about your expenses needs your attention in YukthiX.</p>' }).catch(() => undefined);
  }

  private async userOf(tx: Tx, org: string, employeeId: string) {
    return (await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { userId: true } }))?.userId ?? null;
  }

  // ------------------------------------------------------------------------------------------ trips (XP-4.01)

  private checkTrip(dto: TripDto) {
    if (dto.toOn < dto.fromOn) throw new BadRequestException('The trip cannot end before it starts.');
    for (const l of dto.legs) if (l.departOn < dto.fromOn || l.departOn > dto.toOn) throw new BadRequestException(`The leg ${l.fromCity} → ${l.toCity} is outside the trip dates.`);
    if (D(dto.advanceRequested ?? '0').gt(D(dto.estimate))) throw new BadRequestException('The advance cannot be more than the estimate.');
  }

  private async writeLegs(tx: Tx, org: string, tripId: string, dto: TripDto) {
    await tx.tripLeg.deleteMany({ where: { organizationId: org, tripId } });
    const tiers = await tx.cityTier.findMany({ where: { organizationId: org } });
    const legs = [...dto.legs].sort((a, b) => a.departOn.localeCompare(b.departOn));
    await tx.tripLeg.createMany({
      data: legs.map((l, i) => ({ organizationId: org, tripId, seq: i + 1, fromCity: l.fromCity, toCity: l.toCity, country: l.country ?? 'IN', departOn: asDate(l.departOn), mode: l.mode, stayNights: l.stayNights ?? 0, tierId: tierFor(tiers, l.toCity, l.country ?? 'IN')?.id ?? null })),
    });
  }

  async createTrip(ctx: TenantContext, user: ScopeUser, dto: TripDto) {
    this.checkTrip(dto);
    const v = await this.viewer(user);
    const id = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.myEmployee(tx, org, v);
      if (!me) throw new ForbiddenException('Only employees can request trips.');
      const job = await this.currentJob(tx, org, me.id);
      const trip = await tx.trip.create({ data: { organizationId: org, employeeId: me.id, employmentId: job.employmentId, legalEntityId: job.legalEntityId, purpose: dto.purpose, fromOn: asDate(dto.fromOn), toOn: asDate(dto.toOn), currency: job.currency, estimate: dto.estimate, advanceRequested: dto.advanceRequested ?? '0', bookingNeeded: Boolean(dto.bookingNeeded), createdBy: v.userId } });
      await this.writeLegs(tx, org, trip.id, dto);
      await audit(tx, c, 'expense.trip.created', 'trip', trip.id, {});
      return trip.id;
    });
    return this.getTrip(ctx, user, id);
  }

  async updateTrip(ctx: TenantContext, user: ScopeUser, id: string, dto: TripDto) {
    this.checkTrip(dto);
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { trip, a } = await this.tripOr404(tx, c, v, id);
      if (!a.own) throw new ForbiddenException('Only the traveller can change the trip.');
      if (trip.status !== 'draft') throw new ConflictException('Only a draft trip can be changed.');
      const n = await tx.trip.updateMany({ where: { organizationId: c.organizationId, id, version: dto.version ?? -1 }, data: { purpose: dto.purpose, fromOn: asDate(dto.fromOn), toOn: asDate(dto.toOn), estimate: dto.estimate, advanceRequested: dto.advanceRequested ?? '0', bookingNeeded: Boolean(dto.bookingNeeded), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this trip. Reload it.');
      await this.writeLegs(tx, c.organizationId, id, dto);
    });
    return this.getTrip(ctx, user, id);
  }

  async listTrips(ctx: TenantContext, user: ScopeUser, view: 'mine' | 'approvals' | 'scope' | 'desk' = 'mine') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      let trips: Trip[] = [];
      if (view === 'mine') {
        const me = await this.myEmployee(tx, org, v);
        trips = me ? await tx.trip.findMany({ where: { organizationId: org, employeeId: me.id }, orderBy: { fromOn: 'desc' }, take: 200 }) : [];
      } else if (view === 'approvals') {
        const tasks = v.userId ? await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: v.userId, status: 'open' }, select: { requestId: true } }) : [];
        trips = tasks.length ? await tx.trip.findMany({ where: { organizationId: org, status: 'submitted', wfRequestId: { in: tasks.map((t) => t.requestId) } }, orderBy: { fromOn: 'asc' }, take: 200 }) : [];
      } else {
        const key = view === 'desk' ? 'travel.booking.manage' : 'expense.claim.view';
        if (!v.grants.has(key)) throw new ForbiddenException('You cannot see other people’s trips.');
        const rows = await tx.trip.findMany({ where: { organizationId: org, status: { in: view === 'desk' ? ['submitted', 'approved'] : ['submitted', 'approved', 'rejected', 'closed'] }, ...(view === 'desk' ? { bookingNeeded: true } : {}) }, orderBy: { fromOn: 'asc' }, take: 500 });
        for (const r of rows) {
          const a = await this.access(tx, c, v, r);
          if (view === 'desk' ? a.desk : a.scope) trips.push(r);
        }
      }
      const people = await this.names(tx, org, trips.map((t) => t.employeeId));
      return { trips: trips.map((t) => this.tripSummary(t, people.get(t.employeeId) ?? '')) };
    });
  }

  private tripSummary(t: Trip, person: string) {
    return { id: t.id, purpose: t.purpose, person, fromOn: iso(t.fromOn), toOn: iso(t.toOn), currency: t.currency, estimate: t.estimate.toFixed(2), advanceRequested: t.advanceRequested.toFixed(2), bookingNeeded: t.bookingNeeded, status: t.status, version: t.version };
  }

  async getTrip(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { trip, a } = await this.tripOr404(tx, c, v, id);
      return this.tripView(tx, c, trip, a);
    });
  }

  private async tripView(tx: Tx, c: CompanyContext, trip: Trip, a: Access) {
    const org = c.organizationId;
    const legs = await tx.tripLeg.findMany({ where: { organizationId: org, tripId: trip.id }, orderBy: { seq: 'asc' } });
    const bookings = await tx.tripBooking.findMany({ where: { organizationId: org, tripId: trip.id, removedAt: null }, orderBy: { createdAt: 'asc' } });
    // The travel desk works on bookings; it does not see the traveller's claims or advance (§16.1).
    const money = a.own || a.scope || a.payout || (a.approver && !a.desk);
    const claims = money ? await tx.expenseClaim.findMany({ where: { organizationId: org, tripId: trip.id, status: { notIn: ['rejected', 'withdrawn'] } }, orderBy: { createdAt: 'asc' } }) : [];
    const adv = await tx.expenseAdvance.findFirst({ where: { organizationId: org, tripId: trip.id } });
    const route = trip.wfRequestId ? await tx.wfRequest.findFirst({ where: { organizationId: org, id: trip.wfRequestId }, select: { status: true, currentStep: true, steps: true } }) : null;
    const person = (await this.names(tx, org, [trip.employeeId])).get(trip.employeeId) ?? '';
    const budget = tripBudget(
      trip.estimate,
      bookings.filter((b) => b.paidBy === 'company').map((b) => b.amount),
      claims.map((x) => x.approvedTotal ?? x.claimedTotal),
    );
    const live = ['draft', 'submitted', 'approved'].includes(trip.status);
    return {
      ...this.tripSummary(trip, person),
      decisionNote: trip.decisionNote,
      legs: legs.map((l) => ({ seq: l.seq, fromCity: l.fromCity, toCity: l.toCity, country: l.country, departOn: iso(l.departOn), mode: l.mode, stayNights: l.stayNights, tierId: l.tierId })),
      bookings: bookings.map((b) => ({ id: b.id, kind: b.kind, title: b.title, amount: b.amount.toFixed(2), paidBy: b.paidBy, provider: b.provider, providerRef: b.providerRef, hasFile: Boolean(b.fileId) })),
      budget: money ? budget : null,
      claims: claims.map((x) => ({ id: x.id, title: x.title, status: x.status, claimedTotal: x.claimedTotal.toFixed(2), approvedTotal: x.approvedTotal?.toFixed(2) ?? null, advanceAdjusted: x.advanceAdjusted.toFixed(2) })),
      advance: money && adv ? await this.advanceSummary(tx, org, adv) : null,
      route: route ? { status: route.status, currentStep: route.currentStep, steps: (route.steps as { name: string; state: string }[]).map((s) => ({ name: s.name, state: s.state })) } : null,
      can: {
        edit: a.own && trip.status === 'draft',
        submit: a.own && trip.status === 'draft',
        cancel: a.own && live && !(adv && ['paid', 'settled', 'to_fnf'].includes(adv.status)),
        book: live && (a.own || a.desk),
        partner: live && (a.own || a.desk) && this.partner.name !== 'none',
        decide: a.openTaskId,
        claim: a.own && trip.status === 'approved',
      },
    };
  }

  async submitTrip(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    const notices = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { trip, a } = await this.tripOr404(tx, c, v, id);
      if (!a.own || trip.status !== 'draft') throw new ConflictException('Only the traveller can send a draft trip.');
      if (trip.version !== version) throw new ConflictException('Someone else changed this trip. Reload it.');
      const today = todayIst();
      const steps: StepSpec[] = [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate', selfApproval: 'never' }];
      if (trip.bookingNeeded) {
        // §9.4: the travel desk approves second when it is asked to book.
        const desk = (await holdersOf(tx, org, 'travel.booking.manage', trip.employeeId, today)).filter((u) => u !== v.userId);
        if (desk.length) steps.push({ name: 'Travel desk', approvers: [{ kind: 'users', userIds: desk }], mode: 'any', remindAfterHours: 24, selfApproval: 'never' });
      }
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: trip.employeeId }, select: { personId: true } });
      const sub = await this.engine.submit(tx, c, {
        type: TRIP_TYPE,
        subjectType: 'trip',
        subjectId: id,
        title: trip.purpose.slice(0, 150),
        summary: [
          { label: 'Dates', value: `${iso(trip.fromOn)} to ${iso(trip.toOn)}` },
          { label: 'Estimate', value: `${trip.currency} ${trip.estimate.toFixed(2)}` },
          ...(trip.advanceRequested.gt(0) ? [{ label: 'Advance', value: `${trip.currency} ${trip.advanceRequested.toFixed(2)}` }] : []),
        ],
        subjectPersonId: emp.personId,
        requesterUserId: v.userId,
        raisedByUserId: v.userId,
        steps,
        payload: { estimate: Number(trip.estimate), advance: Number(trip.advanceRequested) },
        payloadFields: [],
        fallbackUserIds: await hrApprovers(tx, org, trip.employeeId, today, v.userId),
      });
      await tx.trip.update({ where: { id }, data: { status: 'submitted', wfRequestId: sub.id, decisionNote: null, version: { increment: 1 } } });
      await audit(tx, c, 'expense.trip.submitted', 'trip', id, { steps: steps.map((s) => s.name) });
      return sub.notices;
    });
    await this.engine.send(ctx, notices);
    return this.getTrip(ctx, user, id);
  }

  async cancelTrip(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { trip, a } = await this.tripOr404(tx, c, v, id);
      if (!a.own || !['draft', 'submitted', 'approved'].includes(trip.status)) throw new ConflictException('Only the traveller can cancel a trip that is still on.');
      const adv = await tx.expenseAdvance.findFirst({ where: { organizationId: org, tripId: id } });
      if (adv && ['paid', 'settled', 'to_fnf'].includes(adv.status)) throw new ConflictException('The advance for this trip is already paid. Settle it with claims or a return; the trip stays on record.');
      if (trip.status === 'submitted' && trip.wfRequestId) await this.engine.withdraw(tx, c, trip.wfRequestId, v.userId, 'Trip cancelled by the traveller');
      if (adv) await tx.expenseAdvance.update({ where: { id: adv.id }, data: { status: 'cancelled', version: { increment: 1 } } });
      await tx.trip.update({ where: { id }, data: { status: 'cancelled', version: { increment: 1 } } });
      await audit(tx, c, 'expense.trip.cancelled', 'trip', id, {});
    });
    return this.getTrip(ctx, user, id);
  }

  /** P03 effect for a trip, once, in the decision's own transaction (YX-EXP-08: approval creates the advance). */
  private async tripDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const trip = await tx.trip.findFirst({ where: { organizationId: org, id: req.subjectId } });
    if (!trip || trip.status !== 'submitted' || trip.wfRequestId !== req.id) return;
    const last = await tx.wfAction.findFirst({ where: { organizationId: org, requestId: req.id }, orderBy: { createdAt: 'desc' }, select: { reason: true } });
    await tx.trip.update({ where: { id: trip.id }, data: { status: outcome, decisionNote: last?.reason ?? null, version: { increment: 1 } } });
    if (outcome !== 'approved') return;
    // The approvers saw the amount on the trip, so the advance starts approved; finance pays it.
    if (trip.advanceRequested.gt(0)) await tx.expenseAdvance.create({ data: { organizationId: org, employeeId: trip.employeeId, employmentId: trip.employmentId, legalEntityId: trip.legalEntityId, tripId: trip.id, kind: 'trip', purpose: trip.purpose, currency: trip.currency, requested: trip.advanceRequested, amount: trip.advanceRequested, status: 'approved' } });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'trip.approved', payload: { tripId: trip.id } } });
  }

  // ------------------------------------------------------------------------------------------ bookings (XP-4.02, 4.03)

  private bookable(trip: Trip, a: Access) {
    if (!a.own && !a.desk) throw new ForbiddenException('Only the traveller or the travel desk can add bookings.');
    if (!['draft', 'submitted', 'approved'].includes(trip.status)) throw new ConflictException('Bookings can be added only to a trip that is still on.');
    if (a.desk && !a.own && trip.status === 'draft') throw new ConflictException('The trip has not been sent yet.');
  }

  async addBooking(ctx: TenantContext, user: ScopeUser, id: string, dto: BookingDto, file?: { originalname: string; buffer: Buffer }) {
    const v = await this.viewer(user);
    const fileId = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { trip, a } = await this.tripOr404(tx, c, v, id);
      this.bookable(trip, a);
      const stored = file?.buffer?.length ? await this.files.storeIn(tx, c, { area: 'expense', name: file.originalname, data: file.buffer, allowedMime: BOOKING_MIME, maxMb: 10, via: a.own ? 'self' : 'staff' }) : null;
      const b = await tx.tripBooking.create({ data: { organizationId: c.organizationId, tripId: id, kind: dto.kind, title: dto.title, fileId: stored?.id ?? null, amount: dto.amount, paidBy: dto.paidBy, bookedBy: v.userId! } });
      await tx.eventOutbox.create({ data: { organizationId: c.organizationId, eventType: 'trip.booking.uploaded', payload: { tripId: id, bookingId: b.id } } });
      await audit(tx, c, 'expense.trip.booking_added', 'trip', id, { bookingId: b.id, paidBy: dto.paidBy });
      if (!a.own) void this.tell(c.organizationId, [await this.userOf(tx, c.organizationId, trip.employeeId)], 'The travel desk added a booking to your trip', `/yx/expenses/trips/${id}`, 'expense.trip.update');
      return stored?.id ?? null;
    });
    if (fileId) void this.files.scan(ctx.organizationId!, fileId).catch(() => undefined);
    return this.getTrip(ctx, user, id);
  }

  async partnerBook(ctx: TenantContext, user: ScopeUser, id: string, legSeq: number) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { trip, a } = await this.tripOr404(tx, c, v, id);
      this.bookable(trip, a);
      if (trip.status !== 'approved') throw new ConflictException('A partner books only for an approved trip.');
      const leg = await tx.tripLeg.findFirst({ where: { organizationId: c.organizationId, tripId: id, seq: legSeq } });
      if (!leg) throw new NotFoundException('No such leg.');
      let got;
      try {
        got = await this.partner.book({ fromCity: leg.fromCity, toCity: leg.toCity, departOn: iso(leg.departOn), mode: leg.mode, stayNights: leg.stayNights }, trip.currency);
      } catch (e) {
        throw new ConflictException((e as Error).message);
      }
      // Bought by the company through the partner: counts against the budget, never reimbursed.
      const b = await tx.tripBooking.create({ data: { organizationId: c.organizationId, tripId: id, kind: got.kind, title: got.title.slice(0, 150), provider: got.provider, providerRef: got.ref, amount: got.amount, paidBy: 'company', bookedBy: v.userId! } });
      await audit(tx, c, 'expense.trip.partner_booked', 'trip', id, { bookingId: b.id, provider: got.provider });
    });
    return this.getTrip(ctx, user, id);
  }

  async removeBooking(ctx: TenantContext, user: ScopeUser, id: string, bookingId: string) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { trip, a } = await this.tripOr404(tx, c, v, id);
      this.bookable(trip, a);
      const n = await tx.tripBooking.updateMany({ where: { organizationId: c.organizationId, id: bookingId, tripId: id, removedAt: null }, data: { removedAt: new Date() } });
      if (!n.count) throw new NotFoundException('No such booking.');
      await audit(tx, c, 'expense.trip.booking_removed', 'trip', id, { bookingId });
    });
    return this.getTrip(ctx, user, id);
  }

  async bookingFile(ctx: TenantContext, user: ScopeUser, id: string, bookingId: string) {
    const v = await this.viewer(user);
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.tripOr404(tx, c, v, id);
      const b = await tx.tripBooking.findFirst({ where: { organizationId: c.organizationId, id: bookingId, tripId: id } });
      if (!b?.fileId) throw new NotFoundException('This booking has no file.');
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: b.fileId } });
      if (f.scanStatus !== 'clean') throw new ConflictException('The file has not passed the virus check yet.');
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  // ------------------------------------------------------------------------------------------ advances (XP-4.04, 4.05)

  private async advanceSummary(tx: Tx, org: string, x: Advance) {
    const bal = await balanceOf(tx, org, x);
    const today = todayIst();
    return {
      id: x.id,
      kind: x.kind,
      tripId: x.tripId,
      purpose: x.purpose,
      currency: x.currency,
      requested: x.requested.toFixed(2),
      amount: x.amount?.toFixed(2) ?? null,
      changeReason: x.changeReason,
      status: x.status,
      paidOn: x.paidOn ? iso(x.paidOn) : null,
      settleBy: x.settleBy ? iso(x.settleBy) : null,
      balance: bal.toFixed(2),
      overdue: x.status === 'paid' && bal.gt(0) && Boolean(x.settleBy) && iso(x.settleBy!) < today,
      version: x.version,
    };
  }

  async requestAdvance(ctx: TenantContext, user: ScopeUser, dto: AdvanceDto) {
    const v = await this.viewer(user);
    const { id, notices } = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.myEmployee(tx, org, v);
      if (!me) throw new ForbiddenException('Only employees can ask for an advance.');
      if (D(dto.amount).lte(0)) throw new BadRequestException('Enter the amount.');
      const job = await this.currentJob(tx, org, me.id);
      const adv = await tx.expenseAdvance.create({ data: { organizationId: org, employeeId: me.id, employmentId: job.employmentId, legalEntityId: job.legalEntityId, kind: 'imprest', purpose: dto.purpose, currency: job.currency, requested: dto.amount } });
      const today = todayIst();
      // §9.4: the manager, then finance (who will pay it); approve-with-changes on the amount only.
      const steps: StepSpec[] = [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate', selfApproval: 'never' }];
      const finance = (await holdersOf(tx, org, 'expense.payout.manage', me.id, today)).filter((u) => u !== v.userId);
      if (finance.length) steps.push({ name: 'Finance', approvers: [{ kind: 'users', userIds: finance }], mode: 'any', remindAfterHours: 24, selfApproval: 'never' });
      const sub = await this.engine.submit(tx, c, {
        type: ADVANCE_TYPE,
        subjectType: 'expense_advance',
        subjectId: adv.id,
        title: dto.purpose.slice(0, 150),
        summary: [{ label: 'Amount', value: `${job.currency} ${D(dto.amount).toFixed(2)}` }],
        subjectPersonId: me.personId,
        requesterUserId: v.userId,
        raisedByUserId: v.userId,
        steps,
        payload: { amount: Number(dto.amount) },
        payloadFields: [],
        fallbackUserIds: await hrApprovers(tx, org, me.id, today, v.userId),
      });
      await tx.expenseAdvance.update({ where: { id: adv.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'expense.advance.requested', 'expense_advance', adv.id, { kind: 'imprest' });
      return { id: adv.id, notices: sub.notices };
    });
    await this.engine.send(ctx, notices);
    return this.getAdvance(ctx, user, id);
  }

  /** Approve with changes (P03 Q5): the approver whose turn it is lowers the amount, with a reason the employee sees. */
  async changeAmount(ctx: TenantContext, user: ScopeUser, id: string, dto: AdvanceAmountDto) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { adv, a } = await this.advanceOr404(tx, c, v, id);
      if (!a.openTaskId || adv.status !== 'requested') throw new ForbiddenException('Only the approver whose turn it is can change the amount.');
      const amount = D(dto.amount);
      if (amount.lte(0) || amount.gt(adv.requested)) throw new BadRequestException(`Approve between 0.01 and the ${adv.requested.toFixed(2)} asked for.`);
      const lower = amount.lt(adv.requested);
      if (lower && (dto.reason?.trim().length ?? 0) < 3) throw new BadRequestException('Say why you are approving less; the employee sees it.');
      await tx.expenseAdvance.update({ where: { id }, data: { amount: amount.toFixed(2), changeReason: lower ? dto.reason!.trim() : null, version: { increment: 1 } } });
      await audit(tx, c, 'expense.advance.amount_changed', 'expense_advance', id, { from: (adv.amount ?? adv.requested).toFixed(2), to: amount.toFixed(2) });
    });
    return this.getAdvance(ctx, user, id);
  }

  private async advanceDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const adv = await tx.expenseAdvance.findFirst({ where: { organizationId: org, id: req.subjectId } });
    if (!adv || adv.status !== 'requested' || adv.wfRequestId !== req.id) return;
    await tx.expenseAdvance.update({ where: { id: adv.id }, data: outcome === 'approved' ? { status: 'approved', amount: adv.amount ?? adv.requested, version: { increment: 1 } } : { status: 'rejected', version: { increment: 1 } } });
  }

  private payer(a: Access) {
    if (!a.payout) throw new ForbiddenException('Only finance pays advances and records returns.');
    if (a.own) throw new ForbiddenException('You cannot pay or settle your own advance.');
  }

  async pay(ctx: TenantContext, user: ScopeUser, id: string, dto: PayAdvanceDto) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { adv, a } = await this.advanceOr404(tx, c, v, id);
      this.payer(a);
      if (adv.status !== 'approved') throw new ConflictException('Only an approved advance can be paid.');
      if (dto.paidOn > todayIst()) throw new BadRequestException('The payment date cannot be in the future.');
      const trip = adv.tripId ? await tx.trip.findFirstOrThrow({ where: { organizationId: org, id: adv.tripId } }) : null;
      const days = Number(await settingFor(tx, c, 'expense.advance.settle_days', { legalEntityId: adv.legalEntityId }));
      // A trip advance is settled within the window after the trip ends; a standing imprest has no end date.
      const settleBy = trip ? addDays(iso(trip.toOn), days) : null;
      const n = await tx.expenseAdvance.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { status: 'paid', paidOn: asDate(dto.paidOn), paidRef: dto.ref, paidBy: v.userId, settleBy: settleBy ? asDate(settleBy) : null, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this advance. Reload it.');
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'advance.paid', payload: { advanceId: id } } });
      await audit(tx, c, 'expense.advance.paid', 'expense_advance', id, { paidOn: dto.paidOn });
      await refreezeExitOf(tx, c, adv.employmentId);
      void this.tell(org, [await this.userOf(tx, org, adv.employeeId)], settleBy ? `Your advance was paid; settle it by ${settleBy}` : 'Your advance was paid', `/yx/expenses/advances/${id}`, 'expense.advance.update');
    });
    return this.getAdvance(ctx, user, id);
  }

  /** The employee paid back by bank; finance confirms it (§11.3 point 4). */
  async recordReturn(ctx: TenantContext, user: ScopeUser, id: string, dto: ReturnDto) {
    const v = await this.viewer(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { adv, a } = await this.advanceOr404(tx, c, v, id);
      this.payer(a);
      if (!['paid', 'to_fnf'].includes(adv.status)) throw new ConflictException('Only a paid advance can be returned.');
      if (dto.on > todayIst()) throw new BadRequestException('The return date cannot be in the future.');
      const open = await balanceOf(tx, org, adv);
      const amount = D(dto.amount);
      if (amount.lte(0) || amount.gt(open)) throw new BadRequestException(`Record between 0.01 and the open ${open.toFixed(2)}.`);
      await tx.advanceSettlement.create({ data: { organizationId: org, advanceId: id, kind: 'return', amount: amount.toFixed(2), on: asDate(dto.on), ref: dto.ref, recordedBy: v.userId } });
      if (open.sub(amount).lte(0)) {
        await tx.expenseAdvance.update({ where: { id }, data: { status: 'settled', version: { increment: 1 } } });
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'advance.settled', payload: { advanceId: id } } });
      }
      await audit(tx, c, 'expense.advance.returned', 'expense_advance', id, { amount: amount.toFixed(2) });
      await refreezeExitOf(tx, c, adv.employmentId);
    });
    return this.getAdvance(ctx, user, id);
  }

  async listAdvances(ctx: TenantContext, user: ScopeUser, view: 'mine' | 'approvals' | 'scope' | 'payout' = 'mine') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      let rows: Advance[] = [];
      if (view === 'mine') {
        const me = await this.myEmployee(tx, org, v);
        rows = me ? await tx.expenseAdvance.findMany({ where: { organizationId: org, employeeId: me.id }, orderBy: { createdAt: 'desc' }, take: 200 }) : [];
      } else if (view === 'approvals') {
        const tasks = v.userId ? await tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: v.userId, status: 'open' }, select: { requestId: true } }) : [];
        rows = tasks.length ? await tx.expenseAdvance.findMany({ where: { organizationId: org, status: 'requested', wfRequestId: { in: tasks.map((t) => t.requestId) } }, orderBy: { createdAt: 'asc' }, take: 200 }) : [];
      } else {
        const key = view === 'payout' ? 'expense.payout.manage' : 'expense.claim.view';
        if (!v.grants.has(key)) throw new ForbiddenException('You cannot see other people’s advances.');
        const all = await tx.expenseAdvance.findMany({ where: { organizationId: org, status: { in: view === 'payout' ? ['approved', 'paid', 'to_fnf'] : ['requested', 'approved', 'paid', 'to_fnf', 'settled'] } }, orderBy: { createdAt: 'asc' }, take: 500 });
        for (const r of all) {
          const a = await this.access(tx, c, v, r);
          if (view === 'payout' ? a.payout && !a.own : a.scope) rows.push(r);
        }
      }
      const people = await this.names(tx, org, rows.map((r) => r.employeeId));
      const out = [];
      for (const r of rows) out.push({ ...(await this.advanceSummary(tx, org, r)), person: people.get(r.employeeId) ?? '' });
      return { advances: out };
    });
  }

  async getAdvance(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { adv, a } = await this.advanceOr404(tx, c, v, id);
      const ledger = await tx.advanceSettlement.findMany({ where: { organizationId: org, advanceId: id }, orderBy: [{ on: 'asc' }, { createdAt: 'asc' }] });
      const claims = new Map((await tx.expenseClaim.findMany({ where: { organizationId: org, id: { in: ledger.map((l) => l.claimId).filter((x): x is string => Boolean(x)) } }, select: { id: true, title: true } })).map((x) => [x.id, x.title]));
      const person = (await this.names(tx, org, [adv.employeeId])).get(adv.employeeId) ?? '';
      const s = await this.advanceSummary(tx, org, adv);
      return {
        ...s,
        person,
        ledger: [
          ...(adv.paidOn ? [{ id: `${adv.id}-paid`, on: iso(adv.paidOn), kind: 'paid', text: 'Advance paid', amount: adv.amount!.toFixed(2), claimId: null }] : []),
          ...ledger.map((l) => ({ id: l.id, on: iso(l.on), kind: l.kind, text: l.kind === 'claim' ? `Settled by claim: ${claims.get(l.claimId!) ?? ''}` : l.kind === 'return' ? `Returned by bank (${l.ref ?? ''})` : l.kind, amount: l.amount.neg().toFixed(2), claimId: l.claimId })),
        ],
        can: {
          changeAmount: Boolean(a.openTaskId) && adv.status === 'requested',
          decide: a.openTaskId,
          pay: a.payout && !a.own && adv.status === 'approved',
          recordReturn: a.payout && !a.own && ['paid', 'to_fnf'].includes(adv.status) && D(s.balance).gt(0),
          claim: a.own && adv.kind === 'imprest' && adv.status === 'paid',
        },
      };
    });
  }

  // ------------------------------------------------------------------------------------------ reminders (XP-4.05)

  async sweep(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM expense_advances WHERE status = 'paid' AND settle_by IS NOT NULL`);
    for (const { id: org } of orgs) {
      try {
        await this.sweepOrg(org, today);
      } catch (e) {
        this.logger.warn(`advance sweep ${org}: ${(e as Error).message}`);
      }
    }
  }

  /** One company's advance reminders: three days before the settle-by date, then overdue (what the tests run). */
  async sweepOrg(org: string, today = todayIst()) {
    const c = SYSTEM(org);
    const tells = await this.tenantPrisma.forTenant(
      c,
      async (tx) => {
        const out: { users: (string | null)[]; text: string; id: string }[] = [];
        const due = await tx.expenseAdvance.findMany({ where: { organizationId: org, status: 'paid', settleBy: { not: null, lte: asDate(addDays(today, 3)) } } });
        for (const x of due) {
          const open = await balanceOf(tx, org, x);
          if (open.lte(0)) continue;
          const by = iso(x.settleBy!);
          const employee = await this.userOf(tx, org, x.employeeId);
          if (by < today && !x.overdueOn) {
            await tx.expenseAdvance.update({ where: { id: x.id }, data: { overdueOn: asDate(today), version: { increment: 1 } } });
            await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'advance.overdue', payload: { advanceId: x.id } } });
            await audit(tx, c, 'expense.advance.overdue', 'expense_advance', x.id, { settleBy: by });
            // shortcut: salary recovery (a loans row of type 'expense', §11.3) waits for payroll change 5 (§22.1); finance is told instead.
            out.push({ users: [employee, ...(await holdersOf(tx, org, 'expense.payout.manage', x.employeeId, today))], text: `An expense advance was due to be settled by ${by}`, id: x.id });
          } else if (by >= today && !x.remindedOn) {
            await tx.expenseAdvance.update({ where: { id: x.id }, data: { remindedOn: asDate(today), version: { increment: 1 } } });
            out.push({ users: [employee], text: `Settle your advance by ${by} with claims or a bank return`, id: x.id });
          }
        }
        return out;
      },
      { timeout: 60_000 },
    );
    for (const t of tells) await this.tell(org, t.users, t.text, `/yx/expenses/advances/${t.id}`, 'expense.advance.update');
    return tells.length;
  }
}

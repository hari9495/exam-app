import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../documents/files.service';
import { CompanyContext, Tx, audit, companyContext } from '../org-structure/org-structure.service';
import { localDate, todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { safeName } from '../service-desk/attachments.service';
import { type Clock, type EcValues, type Facts, addDays, caseNumber, ecAmount, ecInterest, late, mergeFacts, remindNow } from './accident-rules';
import type { EcDto, EcPaidDto, FactsDto, FiledDto, MedicalDto, ReportAccidentDto, StatementDto } from './dto';

// HLP-12 accident cases (rules: docs/yukthix/helpdesk-design-map.md section 4g). Anyone signed in reports an accident or
// injury, also for someone else. The safety team (a speak-up list the System Admin keeps) and the HR person they name
// as handler see everything, medical details included; the injured employee's current manager sees the leave dates
// only; everyone else, and other companies, get 404 (APX-D §6.3). Every look is audited. Records are append-only: the
// case state is read from its steps, medical records keep each file's SHA-256 fingerprint and every open is audited.
// Deadlines come from the rule sets IN.ESI.ACCIDENT and IN.EC.CLAIM (verify), never from code. The app never files
// with the government: it prepares the details to print, a person files on the ESIC portal and records the date.

type Case = Prisma.AccidentCaseGetPayload<object>;
type Step = Prisma.AccidentStepGetPayload<object>;
const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;
const MEDICAL_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const FILE_MAX_MB = 10;
const MAX_PHOTOS = 10;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
const NOT_FOUND = 'Not found.';

const clash = (e: unknown): never => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another accident was reported at the same moment. Press Send report again.');
  throw e;
};

interface Loaded {
  row: Case;
  steps: Step[];
  facts: Facts;
  safety: string[];
}

@Injectable()
export class AccidentsService {
  private readonly logger = new Logger(AccidentsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  private tx<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    const c = companyContext(ctx);
    if (!c.userId) throw new ForbiddenException('Sign in to use accident reports.');
    return this.tenantPrisma.forTenant(c, (tx) => fn(tx, c)).catch(clash);
  }

  private async safetyTeam(tx: Tx, org: string): Promise<string[]> {
    return (await tx.speakupTeamMember.findMany({ where: { organizationId: org, team: 'safety', removedAt: null }, select: { userId: true } })).map((r) => r.userId);
  }

  private async ruleSet(tx: Tx, statute: 'IN.ESI.ACCIDENT' | 'IN.EC.CLAIM', on: string) {
    const rs = await tx.statutoryRuleSet.findFirst({ where: { statute, jurisdiction: 'IN', status: 'published', validFrom: { lte: day(on) }, OR: [{ validTo: null }, { validTo: { gte: day(on) } }] }, orderBy: { validFrom: 'desc' } });
    return rs ? { values: rs.values as Record<string, number>, label: `${statute} ${rs.version}${rs.verify ? ' (verify)' : ''}` } : null;
  }

  private async names(tx: Tx, org: string, ids: (string | null | undefined)[]) {
    const want = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = want.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: want } }, select: { id: true, name: true, email: true } }) : [];
    return (id: string | null | undefined) => (id ? (rows.find((u) => u.id === id)?.name ?? rows.find((u) => u.id === id)?.email ?? 'Former user') : '');
  }

  /** The injured employee's manager today (their current assignment), as a user; null for a contract worker or none. */
  private async managerUser(tx: Tx, org: string, employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const today = day(todayIst());
    const a = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' }, select: { managerEmployeeId: true } });
    if (!a?.managerEmployeeId) return null;
    return (await tx.employee.findFirst({ where: { organizationId: org, id: a.managerEmployeeId }, select: { userId: true } }))?.userId ?? null;
  }

  private async load(tx: Tx, c: CompanyContext, id: string): Promise<Loaded | null> {
    const row = await tx.accidentCase.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!row) return null;
    const steps = await tx.accidentStep.findMany({ where: { organizationId: c.organizationId, caseId: row.id }, orderBy: { at: 'asc' } });
    return { row, steps, facts: mergeFacts(steps), safety: await this.safetyTeam(tx, c.organizationId) };
  }

  /** The safety team or the case's handler: the full case. Anyone else: 404, the same as a case that isn't there. */
  private async teamCase(tx: Tx, c: CompanyContext, id: string): Promise<Loaded> {
    const l = await this.load(tx, c, id);
    if (!l || !(l.safety.includes(c.userId!) || l.facts.handlerUserId === c.userId)) throw new NotFoundException(NOT_FOUND);
    return l;
  }

  private open(l: Loaded) {
    if (l.steps.some((s) => s.kind === 'closed')) throw new ConflictException('This case is closed.');
  }

  private async step(tx: Tx, c: CompanyContext, l: Loaded, kind: string, data: Record<string, unknown>, action: string) {
    const s = await tx.accidentStep.create({ data: { organizationId: c.organizationId, caseId: l.row.id, kind, actorUserId: c.userId, data: data as Prisma.InputJsonValue } });
    await audit(tx, c, action, 'accident_case', l.row.id, { stepId: s.id, ...data });
    return s;
  }

  /** ESI cover: as recorded on the case, else the employee's payroll setting (yes / no; "by wage" stays unknown). */
  private async esiCovered(tx: Tx, l: Loaded): Promise<{ covered: boolean | null; from: 'case' | 'payroll' | null }> {
    if (l.facts.esiCovered !== undefined) return { covered: l.facts.esiCovered, from: 'case' };
    if (!l.row.injuredEmployeeId) return { covered: null, from: null };
    const st = await tx.employeeStatutory.findFirst({ where: { organizationId: l.row.organizationId, employeeId: l.row.injuredEmployeeId, validFrom: { lte: l.row.occurredOn }, OR: [{ validTo: null }, { validTo: { gte: l.row.occurredOn } }] }, orderBy: { validFrom: 'desc' }, select: { esi: true } });
    return st?.esi === 'yes' ? { covered: true, from: 'payroll' } : st?.esi === 'no' ? { covered: false, from: 'payroll' } : { covered: null, from: null };
  }

  /** Clocks and the EC working, from the rule sets valid on the accident date. */
  private async clocks(tx: Tx, l: Loaded, covered: boolean | null, today: string) {
    const on = iso(l.row.occurredOn);
    const last = (k: string) => [...l.steps].reverse().find((s) => s.kind === k)?.data as Record<string, string> | undefined;
    const contract = l.row.injuredKind === 'contract';
    const filed = last(contract ? 'contractor_filed' : 'esic_filed');
    const esiRs = covered ? await this.ruleSet(tx, 'IN.ESI.ACCIDENT', on) : null;
    const ecRs = covered === false ? await this.ruleSet(tx, 'IN.EC.CLAIM', on) : null;
    const clocks: Clock[] = [];
    if (covered && esiRs) clocks.push({ key: 'esic', label: contract ? 'ESIC accident report (the contractor files)' : 'ESIC accident report (employer’s report)', due: addDays(on, esiRs.values.reportDays), doneOn: filed?.on ?? null });
    const ecSet = last('ec_set') as (EcDto & { fellDueOn: string }) | undefined;
    const paid = last('ec_paid') as { on: string; how: string } | undefined;
    let ec = null;
    if (ecSet && ecRs) {
      const v = ecRs.values as unknown as EcValues;
      const calc = ecAmount(v, ecSet);
      const deadline = addDays(ecSet.fellDueOn, v.payWithinDays);
      clocks.push({ key: 'ec', label: 'Employee’s Compensation payment', due: deadline, doneOn: paid?.on ?? null });
      ec = { kind: ecSet.kind, factor: ecSet.factor ?? null, disablementPct: ecSet.disablementPct ?? null, days: ecSet.days ?? null, monthlyWage: ecSet.monthlyWage, fellDueOn: ecSet.fellDueOn, ...calc, deadline, interest: ecInterest(calc.amount, ecSet.fellDueOn, deadline, paid?.on ?? today, v.interestPctYear), paid: paid ?? null };
    }
    const esic = clocks.find((x) => x.key === 'esic');
    return {
      clocks,
      source: [esiRs?.label, ecRs?.label].filter(Boolean).join(' · ') || null,
      ec,
      esicFiled: !contract && filed ? { on: filed.on, ack: filed.ack ?? null } : null,
      contractorFiled: contract && filed ? { on: filed.on, ack: filed.ack ?? null } : null,
      contractorNotFiled: contract && late(esic, today),
      ecOpen: covered === false && !ecSet,
    };
  }

  // ------------------------------------------------------------------------------------------ the report form

  async form(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const [locations, employees, types, safety, me] = await Promise.all([
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        // shortcut: names of up to 5,000 people for the picker; a search route when a company is larger.
        tx.employee.findMany({ where: { organizationId: org }, select: { id: true, givenName: true, familyName: true, preferredName: true, userId: true }, orderBy: { givenName: 'asc' }, take: 5000 }),
        settingFor(tx, c, 'accident.injury_types', ANY_ENTITY),
        this.safetyTeam(tx, org),
        tx.employee.findFirst({ where: { organizationId: org, userId: c.userId! }, select: { id: true } }),
      ]);
      return {
        locations,
        employees: employees.map((e) => ({ id: e.id, name: e.preferredName ?? [e.givenName, e.familyName].filter(Boolean).join(' ') })),
        injuryTypes: lines(types),
        ready: safety.length > 0,
        meEmployeeId: me?.id ?? null,
      };
    });
  }

  // ------------------------------------------------------------------------------------------ reporting

  async report(ctx: TenantContext, dto: ReportAccidentDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const at = new Date(dto.occurredAt);
      if (Number.isNaN(at.getTime())) throw new BadRequestException('Give the date and time it happened.');
      if (at.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('The time it happened can’t be in the future.');
      const safety = await this.safetyTeam(tx, org);
      if (!safety.length) throw new ConflictException({ statusCode: 409, code: 'ACCIDENT_NO_TEAM', message: 'Your company has not named its safety team yet, so the app cannot take this report. Tell your safety officer in person and tell your System Admin.' });
      if (!(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { id: true } }))) throw new BadRequestException('Choose one of the company’s locations.');
      const types = lines(await settingFor(tx, c, 'accident.injury_types', ANY_ENTITY));
      if (!types.includes(dto.injuryType)) throw new BadRequestException('Choose one of the injury types in the list.');
      let name = dto.injuredName ?? '';
      if (dto.injuredKind === 'employee') {
        const e = await tx.employee.findFirst({ where: { organizationId: org, id: dto.injuredEmployeeId! }, select: { givenName: true, familyName: true, preferredName: true } });
        if (!e) throw new BadRequestException('Choose the injured person from the list.');
        name = e.preferredName ?? [e.givenName, e.familyName].filter(Boolean).join(' ');
      }
      const last = await tx.accidentCase.aggregate({ where: { organizationId: org }, _max: { number: true } });
      const row = await tx.accidentCase.create({
        data: {
          organizationId: org,
          number: (last._max.number ?? 0) + 1,
          reporterUserId: c.userId!,
          injuredKind: dto.injuredKind,
          injuredEmployeeId: dto.injuredKind === 'employee' ? dto.injuredEmployeeId! : null,
          injuredName: name,
          contractor: dto.injuredKind === 'contract' ? dto.contractor! : null,
          occurredAt: at,
          occurredOn: day(localDate(at, 'Asia/Kolkata')),
          locationId: dto.locationId,
          place: dto.place,
          description: dto.description,
          injuryType: dto.injuryType,
          bodyPart: dto.bodyPart || null,
          firstAid: Boolean(dto.firstAid),
          witnesses: dto.witnesses || null,
        },
      });
      await audit(tx, c, 'accident.reported', 'accident_case', row.id, { number: caseNumber(row.number), injuredKind: row.injuredKind, forSomeoneElse: dto.injuredKind === 'contract' || dto.injuredEmployeeId !== (await tx.employee.findFirst({ where: { organizationId: org, userId: c.userId! }, select: { id: true } }))?.id });
      return { row, safety };
    });
    const n = caseNumber(out.row.number);
    await this.notifications
      .notifySystem({ organizationId: out.row.organizationId, isSuperAdmin: false }, out.safety, 'helpdesk.accident.reported', { entityType: 'accident_case', entityId: out.row.id, contextText: `${n}: ${out.row.injuryType} at ${out.row.place}`, linkPath: `/yx/desk/accidents/${out.row.id}` }, { subject: `Accident ${n} was reported`, html: `<p>A workplace accident (${n}) was reported in YukthiX. Open it to see the details and the ESIC deadline.</p>` })
      .catch((e: Error) => this.logger.warn(`accident notice: ${e.message}`));
    return { id: out.row.id, number: n };
  }

  /** Photos with the report: the reporter (right after sending) or the case team. */
  async addPhoto(ctx: TenantContext, id: string, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a photo to attach.');
    return this.tx(ctx, async (tx, c) => {
      const l = await this.load(tx, c, id);
      if (!l || !(l.row.reporterUserId === c.userId || l.safety.includes(c.userId!) || l.facts.handlerUserId === c.userId)) throw new NotFoundException(NOT_FOUND);
      this.open(l);
      if (l.steps.filter((s) => s.kind === 'photo').length >= MAX_PHOTOS) throw new BadRequestException(`A case can have up to ${MAX_PHOTOS} photos.`);
      const f = await this.files.storeIn(tx, c, { area: 'accident', name: safeName(file.name), data: file.data, allowedMime: PHOTO_TYPES, maxMb: FILE_MAX_MB, via: 'self' });
      await this.step(tx, c, l, 'photo', { fileId: f.id, sha256: f.sha256 }, 'accident.photo_added');
      void this.files.scan(c.organizationId, f.id).catch(() => undefined);
      return { id: f.id, name: f.fileName, size: f.size, scan: f.scanStatus };
    });
  }

  // ------------------------------------------------------------------------------------------ reading

  /** The cases the signed-in person handles (the safety team: all of them), as rows of the Cases list. */
  async list(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const safety = await this.safetyTeam(tx, org);
      // shortcut: the newest 500 cases; paging when a company has more.
      const rows = await tx.accidentCase.findMany({ where: { organizationId: org }, orderBy: { filedAt: 'desc' }, take: 500 });
      const steps = await tx.accidentStep.findMany({ where: { organizationId: org, caseId: { in: rows.map((r) => r.id) } }, orderBy: { at: 'asc' } });
      const mine: { l: Loaded; facts: Facts }[] = [];
      for (const row of rows) {
        const s = steps.filter((x) => x.caseId === row.id);
        const facts = mergeFacts(s);
        if (safety.includes(c.userId!) || facts.handlerUserId === c.userId) mine.push({ l: { row, steps: s, facts, safety }, facts });
      }
      const name = await this.names(tx, org, mine.flatMap(({ l, facts }) => [l.row.reporterUserId, facts.handlerUserId]));
      const locs = await tx.location.findMany({ where: { organizationId: org, id: { in: mine.map((m) => m.l.row.locationId) } }, select: { id: true, name: true } });
      const out = [];
      for (const { l, facts } of mine) {
        const closed = l.steps.some((s) => s.kind === 'closed');
        const esi = await this.esiCovered(tx, l);
        const k = await this.clocks(tx, l, esi.covered, today);
        const next = k.clocks.filter((x) => !x.doneOn && x.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
        const overdue = !closed && k.clocks.some((x) => late(x, today));
        out.push({
          id: l.row.id,
          ref: caseNumber(l.row.number),
          kind: 'accident' as const,
          subject: `${l.row.injuryType}, ${l.row.place}`,
          location: locs.find((x) => x.id === l.row.locationId)?.name ?? '',
          stage: closed ? 'Closed' : esi.covered === null ? 'Check ESI cover' : k.contractorNotFiled ? 'Contractor not filed' : next ? `${next.label.split(' (')[0]} due` : 'Open',
          raisedBy: name(l.row.reporterUserId),
          anonymous: false,
          owner: facts.handlerUserId ? name(facts.handlerUserId) : 'Safety team',
          next: !closed && next ? { label: next.label, on: next.due } : null,
          overdue,
          status: closed ? ('closed' as const) : overdue || esi.covered === null ? ('action' as const) : ('open' as const),
        });
      }
      return out;
    });
  }

  /** One case: the full record for the team (medical included), the leave dates for the manager, else 404. Audited. */
  async detail(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const l = await this.load(tx, c, id);
      if (!l) throw new NotFoundException(NOT_FOUND);
      const team = l.safety.includes(c.userId!) || l.facts.handlerUserId === c.userId;
      if (!team) {
        const manager = await this.managerUser(tx, org, l.row.injuredEmployeeId);
        if (!manager || manager !== c.userId) throw new NotFoundException(NOT_FOUND);
        await audit(tx, c, 'accident.viewed', 'accident_case', l.row.id, { view: 'manager', medicalShown: false });
        return { view: 'manager' as const, id: l.row.id, number: caseNumber(l.row.number), injuredName: l.row.injuredName, leaveFrom: l.facts.leaveFrom ?? null, leaveTo: l.facts.leaveTo ?? null };
      }
      const today = todayIst();
      const esi = await this.esiCovered(tx, l);
      const k = await this.clocks(tx, l, esi.covered, today);
      const medical = await tx.accidentMedicalRecord.findMany({ where: { organizationId: org, caseId: l.row.id }, orderBy: { at: 'asc' } });
      const photoIds = l.steps.filter((s) => s.kind === 'photo').map((s) => (s.data as { fileId: string }).fileId);
      const fileRows = await tx.file.findMany({ where: { organizationId: org, id: { in: [...photoIds, ...medical.map((m) => m.fileId).filter((x): x is string => Boolean(x))] } }, select: { id: true, fileName: true, size: true, scanStatus: true, sha256: true } });
      const name = await this.names(tx, org, [l.row.reporterUserId, l.facts.handlerUserId, ...l.safety, ...l.steps.map((s) => s.actorUserId), ...medical.map((m) => m.addedBy)]);
      const loc = await tx.location.findFirst({ where: { organizationId: org, id: l.row.locationId }, select: { name: true } });
      const company = await tx.organization.findFirst({ where: { id: org }, select: { name: true } });
      const closed = [...l.steps].reverse().find((s) => s.kind === 'closed');
      const scan = (s: string) => (s === 'clean' ? 'clean' : s === 'infected' ? 'infected' : 'pending');
      await audit(tx, c, 'accident.viewed', 'accident_case', l.row.id, { view: 'team', medicalShown: true });
      const leaveDays = l.facts.leaveFrom && l.facts.leaveTo ? Math.round((Date.parse(l.facts.leaveTo) - Date.parse(l.facts.leaveFrom)) / 86_400_000) + 1 : null;
      return {
        view: 'team' as const,
        id: l.row.id,
        number: caseNumber(l.row.number),
        company: company?.name ?? '',
        injured: { kind: l.row.injuredKind as 'employee' | 'contract', name: l.row.injuredName, employeeId: l.row.injuredEmployeeId, contractor: l.row.contractor },
        occurredAt: l.row.occurredAt.toISOString(),
        occurredOn: iso(l.row.occurredOn),
        location: loc?.name ?? '',
        place: l.row.place,
        description: l.row.description,
        injuryType: l.row.injuryType,
        bodyPart: l.row.bodyPart,
        firstAid: l.row.firstAid,
        witnesses: l.row.witnesses,
        reportedBy: name(l.row.reporterUserId),
        filedAt: l.row.filedAt.toISOString(),
        esi: esi.covered,
        esiFrom: esi.from,
        ipNumber: l.facts.ipNumber ?? null,
        hospital: l.facts.hospital ?? null,
        handler: l.facts.handlerUserId ? { id: l.facts.handlerUserId, name: name(l.facts.handlerUserId) } : null,
        leave: l.facts.leaveFrom && l.facts.leaveTo ? { from: l.facts.leaveFrom, to: l.facts.leaveTo, days: leaveDays } : null,
        statements: l.steps.filter((s) => s.kind === 'statement').map((s) => ({ id: s.id, ...(s.data as { who: string; text: string }), by: name(s.actorUserId), at: s.at.toISOString() })),
        photos: photoIds.flatMap((fid) => fileRows.filter((f) => f.id === fid).map((f) => ({ id: f.id, name: f.fileName, size: f.size, scan: scan(f.scanStatus) }))),
        ...k,
        medical: medical.map((m) => ({ id: m.id, kind: m.kind, note: m.note, file: m.fileId ? { id: m.fileId, name: fileRows.find((f) => f.id === m.fileId)?.fileName ?? 'file', sha256: m.fileSha256!, scan: scan(fileRows.find((f) => f.id === m.fileId)?.scanStatus ?? '') } : null, by: name(m.addedBy), at: m.at.toISOString() })),
        members: [
          ...l.safety.map((u) => ({ name: name(u), role: 'Safety team', access: 'Full case, medical details' })),
          ...(l.facts.handlerUserId && !l.safety.includes(l.facts.handlerUserId) ? [{ name: name(l.facts.handlerUserId), role: 'HR (files the reports)', access: 'Full case, medical details' }] : []),
          ...(l.row.injuredEmployeeId ? [{ name: 'The injured person’s manager', role: 'Manager', access: 'Leave dates only' }] : []),
        ],
        canAssign: l.safety.includes(c.userId!),
        closed: closed ? { on: closed.at.toISOString(), by: name(closed.actorUserId) } : null,
        users: l.safety.includes(c.userId!) ? (await tx.user.findMany({ where: { organizationId: org, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 1000 })).map((u) => ({ id: u.id, name: u.name ?? u.email })) : [],
      };
    });
  }

  /** The ESIC accident report's details, ready to print; a person files them on the ESIC portal. Audited. */
  async esicForm(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      const esi = await this.esiCovered(tx, l);
      if (!esi.covered) throw new ConflictException('This person is not marked as covered by ESI, so there is no ESIC accident report.');
      const loc = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: l.row.locationId }, select: { name: true } });
      const company = await tx.organization.findFirst({ where: { id: c.organizationId }, select: { name: true } });
      const at = l.row.occurredAt;
      await audit(tx, c, 'accident.form_prepared', 'accident_case', l.row.id, {});
      return {
        title: 'ESIC accident report: details to enter on the ESIC portal',
        fields: [
          { label: 'Employer', value: l.row.contractor ? `${l.row.contractor} (immediate employer); principal employer ${company?.name ?? ''}` : (company?.name ?? '') },
          { label: 'Insured person', value: l.row.injuredName },
          { label: 'Insurance number (IP)', value: l.facts.ipNumber ?? 'Not recorded yet' },
          { label: 'Date and time', value: `${localDate(at, 'Asia/Kolkata')} ${at.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })}` },
          { label: 'Place', value: `${l.row.place}, ${loc?.name ?? ''}` },
          { label: 'How it happened', value: l.row.description },
          { label: 'Injury', value: [l.row.injuryType, l.row.bodyPart].filter(Boolean).join(', ') },
          { label: 'First aid given', value: l.row.firstAid ? 'Yes' : 'No' },
          { label: 'Hospital or dispensary', value: l.facts.hospital ?? 'Not recorded yet' },
          { label: 'Witnesses', value: l.row.witnesses ?? 'None named' },
        ],
      };
    });
  }

  // ------------------------------------------------------------------------------------------ the case team's steps

  async facts(ctx: TenantContext, id: string, dto: FactsDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      this.open(l);
      const data: Facts = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined && v !== '')) as Facts;
      if (!Object.keys(data).length) throw new BadRequestException('Nothing to record.');
      if (data.handlerUserId !== undefined) {
        if (!l.safety.includes(c.userId!)) throw new ForbiddenException('Only the safety team chooses who handles the case.');
        if (!(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: data.handlerUserId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company.');
      }
      if (data.esiCovered !== undefined && l.row.injuredKind === 'employee' && data.esiCovered === false && l.steps.some((s) => s.kind === 'esic_filed')) throw new ConflictException('The ESIC report is already recorded as filed for this case.');
      const from = data.leaveFrom ?? l.facts.leaveFrom;
      const to = data.leaveTo ?? l.facts.leaveTo;
      if ((data.leaveFrom || data.leaveTo) && (!from || !to)) throw new BadRequestException('Give both the first and the last day of leave.');
      if (from && to) {
        if (to < from) throw new BadRequestException('The last day of leave can’t be before the first.');
        if (from < iso(l.row.occurredOn)) throw new BadRequestException('Injury leave can’t start before the accident.');
      }
      await this.step(tx, c, l, 'facts', data as Record<string, unknown>, 'accident.facts');
      const manager = data.leaveFrom || data.leaveTo ? await this.managerUser(tx, c.organizationId, l.row.injuredEmployeeId) : null;
      return { l, handler: data.handlerUserId && data.handlerUserId !== l.facts.handlerUserId ? data.handlerUserId : null, manager };
    });
    const n = caseNumber(out.l.row.number);
    const link = `/yx/desk/accidents/${out.l.row.id}`;
    const send = (to: string, text: string) =>
      this.notifications.notifySystem({ organizationId: out.l.row.organizationId, isSuperAdmin: false }, [to], 'helpdesk.accident.update', { entityType: 'accident_case', entityId: out.l.row.id, contextText: text, linkPath: link }, { subject: text, html: `<p>${text}. Open YukthiX to see it.</p>` }).catch((e: Error) => this.logger.warn(`accident notice: ${e.message}`));
    if (out.handler) await send(out.handler, `You handle accident ${n}`);
    // The manager hears only that leave dates were recorded, never the injury.
    if (out.manager) await send(out.manager, `Injury leave was recorded for ${out.l.row.injuredName}`);
    return { ok: true };
  }

  async statement(ctx: TenantContext, id: string, dto: StatementDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      this.open(l);
      const s = await this.step(tx, c, l, 'statement', { who: dto.who, text: dto.text }, 'accident.statement');
      return { id: s.id };
    });
  }

  private filedDate(l: Loaded, on: string) {
    if (on > todayIst()) throw new BadRequestException('The date filed can’t be in the future.');
    if (on < iso(l.row.occurredOn)) throw new BadRequestException('The date filed can’t be before the accident.');
  }

  /** "Filed on the ESIC portal on …": an employee's case, ESI covered, once. */
  async esicFiled(ctx: TenantContext, id: string, dto: FiledDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      this.open(l);
      if (l.row.injuredKind === 'contract') throw new ConflictException('For a contract worker the contractor files. Record the date the contractor filed instead.');
      if (!(await this.esiCovered(tx, l)).covered) throw new ConflictException('This person is not marked as covered by ESI.');
      if (l.steps.some((s) => s.kind === 'esic_filed')) throw new ConflictException('The ESIC report is already recorded as filed.');
      this.filedDate(l, dto.on);
      await this.step(tx, c, l, 'esic_filed', { on: dto.on, ...(dto.ack ? { ack: dto.ack } : {}) }, 'accident.esic_filed');
      return { ok: true };
    });
  }

  async contractorFiled(ctx: TenantContext, id: string, dto: FiledDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      this.open(l);
      if (l.row.injuredKind !== 'contract') throw new ConflictException('Only a contract worker’s case has a contractor.');
      if (l.steps.some((s) => s.kind === 'contractor_filed')) throw new ConflictException('The contractor’s filing is already recorded.');
      this.filedDate(l, dto.on);
      await this.step(tx, c, l, 'contractor_filed', { on: dto.on, ...(dto.ack ? { ack: dto.ack } : {}) }, 'accident.contractor_filed');
      return { ok: true };
    });
  }

  /** The EC claim (not ESI covered): the working from IN.EC.CLAIM. Recording it again replaces the working (a new step). */
  async ec(ctx: TenantContext, id: string, dto: EcDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      this.open(l);
      if ((await this.esiCovered(tx, l)).covered !== false) throw new ConflictException('An Employee’s Compensation claim is only for someone not covered by ESI. Mark ESI cover first.');
      if (l.steps.some((s) => s.kind === 'ec_paid')) throw new ConflictException('The compensation is already recorded as paid.');
      if (dto.fellDueOn < iso(l.row.occurredOn) || dto.fellDueOn > todayIst()) throw new BadRequestException('The day it fell due must be between the accident and today.');
      const rs = await this.ruleSet(tx, 'IN.EC.CLAIM', iso(l.row.occurredOn));
      if (!rs) throw new ConflictException('No Employee’s Compensation rules are in force on the accident date.');
      const data = { kind: dto.kind, monthlyWage: dto.monthlyWage, fellDueOn: dto.fellDueOn, ...(dto.kind !== 'temporary' ? { factor: dto.factor } : { days: dto.days }), ...(dto.kind === 'permanent-partial' ? { disablementPct: dto.disablementPct } : {}) };
      await this.step(tx, c, l, 'ec_set', data, 'accident.ec_set');
      return ecAmount(rs.values as unknown as EcValues, data);
    });
  }

  async ecPaid(ctx: TenantContext, id: string, dto: EcPaidDto) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      this.open(l);
      if (!l.steps.some((s) => s.kind === 'ec_set')) throw new ConflictException('Record the compensation first.');
      if (l.steps.some((s) => s.kind === 'ec_paid')) throw new ConflictException('The compensation is already recorded as paid.');
      this.filedDate(l, dto.on);
      await this.step(tx, c, l, 'ec_paid', { on: dto.on, how: dto.how }, 'accident.ec_paid');
      return { ok: true };
    });
  }

  /** A medical record (special data): append-only; a file keeps its fingerprint. */
  async addMedical(ctx: TenantContext, id: string, dto: MedicalDto, file: { name: string; data: Buffer } | null) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      const f = file?.data?.length ? await this.files.storeIn(tx, c, { area: 'accident-medical', name: safeName(file.name), data: file.data, allowedMime: MEDICAL_TYPES, maxMb: FILE_MAX_MB, via: 'staff' }) : null;
      const m = await tx.accidentMedicalRecord.create({ data: { organizationId: c.organizationId, caseId: l.row.id, kind: dto.kind, note: dto.note, fileId: f?.id ?? null, fileSha256: f?.sha256 ?? null, addedBy: c.userId! } });
      await audit(tx, c, 'accident.medical_added', 'accident_case', l.row.id, { recordId: m.id, kind: dto.kind, ...(f ? { fileId: f.id, sha256: f.sha256 } : {}) });
      if (f) void this.files.scan(c.organizationId, f.id).catch(() => undefined);
      return { id: m.id };
    });
  }

  /** Opens a medical file or a photo of the case for the team: clean files only; every open is audited. */
  async file(ctx: TenantContext, id: string, fileId: string) {
    const row = await this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      const medical = await tx.accidentMedicalRecord.findFirst({ where: { organizationId: c.organizationId, caseId: l.row.id, fileId }, select: { id: true, fileSha256: true } });
      const photo = l.steps.some((s) => s.kind === 'photo' && (s.data as { fileId: string }).fileId === fileId);
      if (!medical && !photo) throw new NotFoundException(NOT_FOUND);
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
      if (f.scanStatus !== 'clean') throw new ConflictException('This file is still being checked for viruses, or failed the check.');
      if (medical && medical.fileSha256 !== f.sha256) throw new ConflictException('This file does not match its recorded fingerprint. Tell your System Admin.');
      await audit(tx, c, medical ? 'accident.medical_opened' : 'accident.photo_opened', 'accident_case', l.row.id, { fileId, sha256: f.sha256, ...(medical ? { recordId: medical.id } : {}) });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  /** Closing needs every clock done (an open ESIC report or unpaid compensation keeps it open). */
  async close(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const l = await this.teamCase(tx, c, id);
      this.open(l);
      const esi = await this.esiCovered(tx, l);
      if (esi.covered === null) throw new ConflictException('Record whether ESI covers this person first.');
      const k = await this.clocks(tx, l, esi.covered, todayIst());
      if (k.clocks.some((x) => !x.doneOn)) throw new ConflictException('Record the filings and payments first: a deadline is still open.');
      if (k.ecOpen) throw new ConflictException('Record the Employee’s Compensation claim first (this person is not covered by ESI).');
      await this.step(tx, c, l, 'closed', {}, 'accident.closed');
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------------------------------ the morning reminder

  /** Contract workers whose contractor has not filed by the deadline: remind the safety team on the company's schedule. */
  async remindAll(today = todayIst()): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM accident_cases WHERE injured_kind = 'contract'`);
    let n = 0;
    for (const { id } of orgs) n += await this.remindOrg(id, today).catch((e: Error) => (this.logger.warn(`accident reminders ${id}: ${e.message}`), 0));
    return n;
  }

  async remindOrg(org: string, today = todayIst()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const sends = await this.tenantPrisma.forTenant(c, async (tx) => {
      const every = await settingFor(tx, c, 'accident.contractor_reminder_days', ANY_ENTITY);
      const safety = await this.safetyTeam(tx, org);
      const out: { id: string; text: string }[] = [];
      for (const row of await tx.accidentCase.findMany({ where: { organizationId: org, injuredKind: 'contract' } })) {
        const steps = await tx.accidentStep.findMany({ where: { organizationId: org, caseId: row.id }, orderBy: { at: 'asc' } });
        const l: Loaded = { row, steps, facts: mergeFacts(steps), safety };
        if (steps.some((s) => s.kind === 'closed')) continue;
        const k = await this.clocks(tx, l, (await this.esiCovered(tx, l)).covered, today);
        const lastOn = [...steps].reverse().find((s) => s.kind === 'reminded')?.data as { on?: string } | undefined;
        if (!k.contractorNotFiled || !remindNow(lastOn?.on ?? null, today, every)) continue;
        await tx.accidentStep.create({ data: { organizationId: org, caseId: row.id, kind: 'reminded', actorUserId: null, data: { on: today } } });
        await audit(tx, c, 'accident.reminded', 'accident_case', row.id, { on: today, to: safety.length });
        out.push({ id: row.id, text: `${row.contractor} has not filed the ESIC accident report for ${caseNumber(row.number)}` });
      }
      return { out, safety };
    });
    for (const s of sends.out)
      await this.notifications
        .notifySystem({ organizationId: org, isSuperAdmin: false }, sends.safety, 'helpdesk.accident.contractor_late', { entityType: 'accident_case', entityId: s.id, contextText: s.text, linkPath: `/yx/desk/accidents/${s.id}` }, { subject: 'A contractor has not filed an ESIC accident report', html: `<p>${s.text}. As principal employer your company stays responsible. Open the case in YukthiX.</p>` })
        .catch((e: Error) => this.logger.warn(`accident reminder: ${e.message}`));
    return sends.out.length;
  }
}


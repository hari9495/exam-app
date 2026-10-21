import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, TenantContext, maskTail } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { isCountry, isSubdivisionOf, isoDate, todayIst } from '../org-structure/org-validation';
import { covers } from '../access/scope';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { EmailService } from '../email/email.service';
import { e164 } from './persons';
import { settingFor } from './probation';
import { EmergencyContactsDto, FamilyDto, KIND_FIELDS, nominationProblem, PersonalDetailsDto, ProfileRequestDto, ProposedValueDto, RequestKind } from './profile.dto';

// The employee's own data beyond job facts (P02 §4.4–4.5; P01 §4.4; M01 §3.1, Q4):
//   Personal      the person and HR holding employee.personal.view in scope; the person edits it directly,
//                 HR with employee.profile.edit (§4.5)
//   Confidential  PAN, UAN, ESIC, legal name, bank accounts: masked to the last four for the person and
//                 employee.identity.view in scope; the full value only through an audited reveal (YX-SEC-09)
//   Special       Aadhaar: masked always; full only to employee.aadhaar.view, each view audited (YX-SEC-08)
// Identity and bank values change only through a request approved by someone other than the requester and the
// person (YX-SEC-11/13), with step-up; the old contact is told, and a new bank account is used for pay only
// after the company's cooling period. Values are encrypted at rest and bound to the company and person.
// Nothing is shown while acting for someone else (P02 YX-SEC-20).

type Kind = RequestKind;
type Identifier = 'pan' | 'aadhaar' | 'uan' | 'esic' | 'passport';
const IDENTIFIERS: readonly Identifier[] = ['pan', 'aadhaar', 'uan', 'esic', 'passport'];
const BANK: Record<string, 'salary' | 'reimbursement'> = { bank_salary: 'salary', bank_reimbursement: 'reimbursement' };
const LABEL: Record<Kind, string> = { pan: 'PAN', aadhaar: 'Aadhaar', uan: 'UAN', esic: 'ESIC IP number', legal_name: 'Legal name', bank_salary: 'Salary bank account', bank_reimbursement: 'Reimbursement bank account', passport: 'Passport' };
const FIELD_LABEL: Record<string, string> = { pan: 'PAN', uan: 'UAN', esic: 'ESIC IP number', bank_salary: 'Salary bank account', bank_reimbursement: 'Reimbursement bank account' };
/** Views of someone's Confidential / Special data, shown to them in "Who accessed my data" (P02 §7, P08). */
export const SENSITIVE_VIEW_ACTIONS = ['employee.pay.viewed', 'employee.identity.viewed', 'employee.aadhaar.viewed'] as const;

type Proposal = { [K in keyof ProposedValueDto]?: string };
type PersonalRow = Prisma.EmployeePersonalDetailsGetPayload<object>;
type RequestRow = Prisma.EmployeeProfileRequestGetPayload<object>;

const last4 = (s: string) => s.slice(-4);

/** AES-256-GCM, bound to the company and person so a row copied to another record will not open. */
export const sealValue = (crypto: OrgSecretsCryptoService, organizationId: string, employeeId: string, value: string) => crypto.encrypt(`${organizationId}:${employeeId}:${value}`);
/** Keyed hash per kind for duplicate checks (YX-EMP-02); the company id keeps companies apart. */
export const hashValue = (crypto: OrgSecretsCryptoService, organizationId: string, kind: string, value: string) => crypto.hmac(`employee.${kind}`, `${organizationId}:${value}`);

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly email: EmailService,
  ) {}

  // ---- sealed values ----

  private seal(c: CompanyContext, employeeId: string, value: string): string {
    return sealValue(this.crypto, c.organizationId, employeeId, value);
  }

  private open(c: CompanyContext, employeeId: string, blob: string): string {
    const prefix = `${c.organizationId}:${employeeId}:`;
    const plain = this.crypto.decrypt(blob);
    if (!plain.startsWith(prefix)) throw new ConflictException('A stored value does not belong to this record.');
    return plain.slice(prefix.length);
  }

  private hash(c: CompanyContext, kind: Identifier | 'bank', value: string): string {
    return hashValue(this.crypto, c.organizationId, kind, value);
  }

  private async can(tx: Tx, c: CompanyContext, v: Viewer, key: Parameters<EmployeeHistoryService['reaches']>[3], employeeId: string) {
    return !v.actingForOther && (await this.history.reaches(tx, c, v, key, employeeId, todayIst()));
  }

  // ================= reading the record by class =================

  /** The record by class, each part only where the viewer's grants reach the person today (YX-SEC-07). */
  profile(ctx: TenantContext, v: Viewer, employeeId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      const today = todayIst();
      const employee = await tx.employee.findFirstOrThrow({ where: { id: employeeId, organizationId: c.organizationId } });
      const internal = a.self || covers(a.periods, today);
      const personal = a.self || (await this.can(tx, c, v, 'employee.personal.view', employeeId));
      const identity = a.self || (await this.can(tx, c, v, 'employee.identity.view', employeeId));
      const employment = internal ? await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId }, orderBy: { joinedOn: 'desc' } }) : null;
      const details = personal ? await tx.employeePersonalDetails.findFirst({ where: { organizationId: c.organizationId, employeeId } }) : null;
      return {
        employeeId,
        personId: employee.personId,
        name: displayName(employee),
        self: a.self,
        employeeCode: employment?.employeeCode ?? null,
        joinedOn: employment ? isoDate(employment.joinedOn) : null,
        classes: {
          internal,
          personal,
          identity,
          aadhaar: await this.can(tx, c, v, 'employee.aadhaar.view', employeeId),
          pay: covers(a.payPeriods, today),
        },
        personal: personal ? this.personalView(details) : null,
        // PPL-03 family, nominations and emergency contacts: Personal class, like the details above.
        family: personal ? await this.familyView(tx, c, employeeId) : null,
        identity: identity ? await this.identityView(tx, c, employeeId) : null,
        // Internal class: the work phone and email (PPL-03 key facts, Message).
        work: internal ? { phone: employee.workPhone ?? null, email: employee.workEmail ?? null } : null,
        // Internal: the birthday as the directory shows it (day and month), unless the person hides it.
        birthday: internal ? await this.birthday(tx, c, employeeId) : null,
        can: {
          editPersonal: !v.actingForOther && (a.self || (await this.can(tx, c, v, 'employee.profile.edit', employeeId))),
          requestChange: !v.actingForOther && (a.self || (await this.can(tx, c, v, 'employee.identity.manage', employeeId))),
          reveal: !v.actingForOther && identity,
          editWork: !v.actingForOther && !a.self && (await this.can(tx, c, v, 'employee.profile.edit', employeeId)),
          // Family and nominations decide who is paid (YX-LC-16): HR changes them, the person asks HR.
          editFamily: !v.actingForOther && !a.self && (await this.can(tx, c, v, 'employee.profile.edit', employeeId)),
        },
      };
    });
  }

  private async birthday(tx: Tx, c: CompanyContext, employeeId: string) {
    const d = await tx.employeePersonalDetails.findFirst({ where: { organizationId: c.organizationId, employeeId }, select: { dateOfBirth: true, hideBirthday: true } });
    return d?.dateOfBirth && !d.hideBirthday ? isoDate(d.dateOfBirth).slice(5) : null;
  }

  private personalView(d: PersonalRow | null) {
    return {
      dateOfBirth: d?.dateOfBirth ? isoDate(d.dateOfBirth) : null,
      gender: d?.gender ?? null,
      personalEmail: d?.personalEmail ?? null,
      personalPhone: d?.personalPhone ?? null,
      addressLine1: d?.addressLine1 ?? null,
      addressLine2: d?.addressLine2 ?? null,
      city: d?.city ?? null,
      stateCode: d?.stateCode ?? null,
      postalCode: d?.postalCode ?? null,
      country: d?.country ?? null,
      hideBirthday: d?.hideBirthday ?? false,
      maritalStatus: d?.maritalStatus ?? null,
    };
  }

  /** Masked identity and bank (last four), Aadhaar always masked (YX-SEC-08). */
  private async identityView(tx: Tx, c: CompanyContext, employeeId: string) {
    const ids = await tx.employeeIdentifiers.findFirst({ where: { organizationId: c.organizationId, employeeId } });
    const banks = await tx.employeeBankAccount.findMany({ where: { organizationId: c.organizationId, employeeId, validTo: null }, orderBy: { purpose: 'asc' } });
    const pending = await tx.employeeProfileRequest.findMany({ where: { organizationId: c.organizationId, employeeId, status: 'pending' }, select: { id: true, kind: true } });
    return {
      legalName: ids?.legalName ?? null,
      pan: maskTail(ids?.panLast4),
      aadhaar: maskTail(ids?.aadhaarLast4),
      uan: maskTail(ids?.uanLast4),
      esic: maskTail(ids?.esicLast4),
      passport: maskTail(ids?.passportLast4),
      passportExpiresOn: ids?.passportExpiresOn ? isoDate(ids.passportExpiresOn) : null,
      bankAccounts: banks.map((b) => ({ purpose: b.purpose, holderName: b.holderName, ifsc: b.ifsc, account: maskTail(b.accountLast4), usableFrom: b.usableFrom })),
      pending: pending.map((p) => ({ requestId: p.id, kind: p.kind })),
    };
  }

  /**
   * The full value of one identifier: the person (not Aadhaar), employee.identity.view in scope, or for
   * Aadhaar employee.aadhaar.view. Someone else's value is audited (YX-SEC-08/09).
   */
  reveal(ctx: TenantContext, v: Viewer, employeeId: string, field: Identifier | 'bank_salary' | 'bank_reimbursement') {
    return this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      const allowed = field === 'aadhaar' ? await this.can(tx, c, v, 'employee.aadhaar.view', employeeId) : a.self || (await this.can(tx, c, v, 'employee.identity.view', employeeId));
      if (!allowed) throw new ForbiddenException(field === 'aadhaar' ? 'Aadhaar is shown in full only to employee.aadhaar.view (YX-SEC-08).' : 'Viewing identity details needs employee.identity.view for this person.');
      let value: string | null = null;
      if (field === 'bank_salary' || field === 'bank_reimbursement') {
        const b = await tx.employeeBankAccount.findFirst({ where: { organizationId: c.organizationId, employeeId, purpose: BANK[field], validTo: null } });
        value = b ? this.open(c, employeeId, b.accountEnc) : null;
      } else {
        const ids = await tx.employeeIdentifiers.findFirst({ where: { organizationId: c.organizationId, employeeId } });
        const blob = ids?.[`${field}Enc`];
        value = blob ? this.open(c, employeeId, blob) : null;
      }
      if (value === null) throw new NotFoundException('Nothing on file');
      if (field === 'aadhaar') await audit(tx, c, 'employee.aadhaar.viewed', 'employee', employeeId, { self: a.self });
      else if (!a.self) await audit(tx, c, 'employee.identity.viewed', 'employee', employeeId, { field });
      return { field, value };
    });
  }

  // ================= Personal: edited directly (§4.5) =================

  async updatePersonal(ctx: TenantContext, v: Viewer, employeeId: string, dto: PersonalDetailsDto) {
    const out = await this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      if (!a.self && !(await this.can(tx, c, v, 'employee.profile.edit', employeeId))) throw new ForbiddenException('Editing personal details needs employee.profile.edit for this person.');
      const today = todayIst();
      if (dto.dateOfBirth && (dto.dateOfBirth > today || dto.dateOfBirth < '1900-01-01')) throw new BadRequestException('The date of birth must be a real past date.');
      const current = await tx.employeePersonalDetails.findFirst({ where: { organizationId: c.organizationId, employeeId } });
      const data: Record<string, unknown> = {};
      const set = (k: keyof PersonalDetailsDto, value: unknown) => {
        if (dto[k] !== undefined) data[k] = value;
      };
      set('dateOfBirth', dto.dateOfBirth ? new Date(`${dto.dateOfBirth}T00:00:00Z`) : null);
      set('gender', dto.gender ?? null);
      set('personalEmail', dto.personalEmail?.trim().toLowerCase() || null);
      if (dto.personalPhone) {
        try {
          data.personalPhone = e164(dto.personalPhone);
        } catch {
          throw new BadRequestException('That phone number is not valid.');
        }
      } else set('personalPhone', null);
      for (const k of ['addressLine1', 'addressLine2', 'city', 'postalCode'] as const) set(k, dto[k]?.trim() || null);
      set('country', dto.country ?? null);
      set('stateCode', dto.stateCode ?? null);
      set('hideBirthday', dto.hideBirthday ?? false);
      set('maritalStatus', dto.maritalStatus ?? null);
      const country = (data.country !== undefined ? data.country : current?.country) as string | null;
      const state = (data.stateCode !== undefined ? data.stateCode : current?.stateCode) as string | null;
      if (country && !isCountry(country)) throw new BadRequestException('Unknown country');
      if (state && (!country || !isSubdivisionOf(state, country))) throw new BadRequestException('The state is not a subdivision of the country.');
      const fields = Object.keys(data).filter((k) => JSON.stringify(data[k]) !== JSON.stringify((current as Record<string, unknown> | null)?.[k] ?? null));
      if (!fields.length) return { view: this.personalView(current), tell: [] as string[], organizationId: c.organizationId };
      const row = await tx.employeePersonalDetails.upsert({
        where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId } },
        create: { organizationId: c.organizationId, employeeId, ...data, updatedBy: c.userId ?? null },
        update: { ...data, updatedBy: c.userId ?? null },
      });
      // P08: which fields changed and by whom, never the values (Personal data stays out of the log).
      await audit(tx, c, 'employee.personal.updated', 'employee', employeeId, { fields, by: a.self ? 'self' : 'hr' });
      // YX-SEC-13: a new personal email is a new "previous contact" for later identity / bank notices, so the
      // contacts on file before it (the old personal and the work address) are told.
      const tell = fields.includes('personalEmail') ? (await this.contactsOnFile(tx, c, employeeId, current?.personalEmail ?? null)).filter((x) => x !== row.personalEmail) : [];
      return { view: this.personalView(row), tell, organizationId: c.organizationId };
    });
    const html = `<p>The personal email on your work record was changed on ${todayIst()}.</p><p>If you did not do this, contact HR at once.</p>`;
    await Promise.allSettled(out.tell.map((to) => this.email.send({ to, subject: 'Your personal email at work was changed', html, organizationId: out.organizationId }))).catch((e) => this.logger.error(e));
    return out.view;
  }

  // ================= family, nominations, emergency contacts (PPL-03; Personal) =================

  /** The family, the current nominations and the emergency contacts; nominee names follow the family member. */
  private async familyView(tx: Tx, c: CompanyContext, employeeId: string) {
    const o = { organizationId: c.organizationId, employeeId };
    const members = await tx.employeeFamilyMember.findMany({ where: { ...o, removedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    const nominations = await tx.employeeNomination.findMany({ where: { ...o, supersededAt: null }, orderBy: { createdAt: 'asc' } });
    const contacts = await tx.employeeEmergencyContact.findMany({ where: o, orderBy: { position: 'asc' } });
    const statutory = await tx.employeeStatutory.findFirst({ where: { ...o, validTo: null }, orderBy: { validFrom: 'desc' }, select: { pf: true, eps: true } });
    const marital = await tx.auditLog.findFirst({
      where: { organizationId: c.organizationId, entityType: 'employee', entityId: employeeId, action: 'employee.personal.updated', metadataJson: { contains: '"maritalStatus"' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const reviewedAt = nominations.reduce<Date | null>((m, n) => (!m || n.createdAt > m ? n.createdAt : m), null);
    return {
      members: members.map((m) => ({ id: m.id, name: m.name, relation: m.relation, dateOfBirth: m.dateOfBirth ? isoDate(m.dateOfBirth) : null, dependant: m.dependant })),
      nominations: nominations.map((n) => {
        const m = members.find((x) => x.id === n.familyMemberId);
        return { scheme: n.scheme, familyMemberId: n.familyMemberId, name: m?.name ?? n.name, relation: m?.relation ?? n.relation, sharePercent: Number(n.sharePercent) };
      }),
      // Schemes the person should name a nominee for: gratuity always; PF and EPS only while covered.
      expectedSchemes: ['gratuity', ...(statutory?.pf === 'yes' ? ['pf', ...(statutory.eps ? ['eps'] : [])] : [])],
      contacts: contacts.map((x) => ({ name: x.name, relation: x.relation, phone: x.phone })),
      maritalChangedAt: marital?.createdAt.toISOString() ?? null,
      nominationsReviewedAt: reviewedAt?.toISOString() ?? null,
    };
  }

  /** Family and nominations together (nominees are family members; each scheme's shares total 100). HR only. */
  updateFamily(ctx: TenantContext, v: Viewer, employeeId: string, dto: FamilyDto) {
    return this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      if (a.self) throw new ForbiddenException('HR keeps your family and nominations. Ask HR to change them.');
      if (!(await this.can(tx, c, v, 'employee.profile.edit', employeeId))) throw new ForbiddenException('Changing family and nominations needs employee.profile.edit for this person.');
      const problem = nominationProblem(dto.members.length, dto.nominations);
      if (problem) throw new BadRequestException(problem);
      const today = todayIst();
      if (dto.members.some((m) => m.dateOfBirth && (m.dateOfBirth > today || m.dateOfBirth < '1900-01-01'))) throw new BadRequestException('A date of birth must be a real past date.');
      const o = { organizationId: c.organizationId, employeeId };
      const current = await tx.employeeFamilyMember.findMany({ where: { ...o, removedAt: null }, select: { id: true } });
      if (dto.members.some((m) => m.id && !current.some((x) => x.id === m.id))) throw new BadRequestException('A family member is not on this record.');
      const by = c.userId ?? null;
      const ids: string[] = [];
      for (const [position, m] of dto.members.entries()) {
        const data = { name: m.name.trim(), relation: m.relation.trim(), dateOfBirth: m.dateOfBirth ? new Date(`${m.dateOfBirth}T00:00:00Z`) : null, dependant: m.dependant, position, updatedBy: by };
        ids.push(m.id ? (await tx.employeeFamilyMember.update({ where: { id: m.id }, data })).id : (await tx.employeeFamilyMember.create({ data: { ...o, ...data } })).id);
      }
      const removed = current.filter((x) => !ids.includes(x.id)).map((x) => x.id);
      if (removed.length) await tx.employeeFamilyMember.updateMany({ where: { ...o, id: { in: removed } }, data: { removedAt: new Date(), updatedBy: by } });
      // Nominations are replaced only when they changed, so "reviewed" stays the date they were last decided.
      const key = (r: { scheme: string; familyMemberId: string | null; sharePercent: unknown }) => `${r.scheme}:${r.familyMemberId}:${Number(r.sharePercent).toFixed(2)}`;
      const before = await tx.employeeNomination.findMany({ where: { ...o, supersededAt: null } });
      const next = dto.nominations.map((n) => ({ scheme: n.scheme, familyMemberId: ids[n.member], sharePercent: n.sharePercent, member: dto.members[n.member] }));
      const nominationsChanged = before.map(key).sort().join('|') !== next.map(key).sort().join('|');
      if (nominationsChanged) {
        await tx.employeeNomination.updateMany({ where: { ...o, supersededAt: null }, data: { supersededAt: new Date() } });
        if (next.length) await tx.employeeNomination.createMany({ data: next.map((n) => ({ ...o, scheme: n.scheme, familyMemberId: n.familyMemberId, name: n.member.name.trim(), relation: n.member.relation.trim(), sharePercent: n.sharePercent, source: 'hr' })) });
      }
      // P08: what changed and by whom, never the values (Personal data stays out of the log).
      await audit(tx, c, 'employee.family.updated', 'employee', employeeId, { members: ids.length, removed: removed.length, nominationsChanged, by: 'hr' });
      return this.familyView(tx, c, employeeId);
    });
  }

  /** Emergency contacts, in calling order: the person edits their own directly; HR with employee.profile.edit. */
  setEmergencyContacts(ctx: TenantContext, v: Viewer, employeeId: string, dto: EmergencyContactsDto) {
    return this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      if (!a.self && !(await this.can(tx, c, v, 'employee.profile.edit', employeeId))) throw new ForbiddenException('Changing emergency contacts needs employee.profile.edit for this person.');
      const o = { organizationId: c.organizationId, employeeId };
      const rows = dto.contacts.map((x, position) => ({ ...o, name: x.name.trim(), relation: x.relation.trim(), phone: e164(x.phone), position, updatedBy: c.userId ?? null }));
      await tx.employeeEmergencyContact.deleteMany({ where: o });
      if (rows.length) await tx.employeeEmergencyContact.createMany({ data: rows });
      await audit(tx, c, 'employee.emergency_contacts.updated', 'employee', employeeId, { count: rows.length, by: a.self ? 'self' : 'hr' });
      return (await this.familyView(tx, c, employeeId)).contacts;
    });
  }

  /** Work phone (Internal): HR with employee.profile.edit for the person; the person asks HR (it is the company's line). */
  setWorkPhone(ctx: TenantContext, v: Viewer, employeeId: string, workPhone: string | null) {
    return this.history.run(ctx, async (tx, c) => {
      await this.history.access(tx, c, v, employeeId);
      if (v.actingForOther || !(await this.can(tx, c, v, 'employee.profile.edit', employeeId))) throw new ForbiddenException('Changing the work phone needs employee.profile.edit for this person.');
      let phone: string | null = null;
      if (workPhone?.trim()) {
        try {
          phone = e164(workPhone);
        } catch {
          throw new BadRequestException('That phone number is not valid.');
        }
      }
      await tx.employee.update({ where: { id: employeeId }, data: { workPhone: phone } });
      await audit(tx, c, 'employee.work_phone.updated', 'employee', employeeId, { cleared: phone === null });
      return { workPhone: phone };
    });
  }

  /**
   * PPL-03 Activity: who did what on this person's record, newest first, each kind only where the viewer may see it:
   * job changes (raised, decided; never pay values) for anyone who may open the record; identity and bank change
   * requests (the kind, never values) for the person and identity keys; documents for the person and document keys;
   * letters for the person and letter.issue. Twenty at most.
   */
  activity(ctx: TenantContext, v: Viewer, employeeId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      const org = c.organizationId;
      const may = async (keys: Parameters<ProfileService['can']>[3][]) => a.self || (await Promise.all(keys.map((k) => this.can(tx, c, v, k, employeeId)))).some(Boolean);
      const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: employeeId }, select: { personId: true } });
      const out: { id: string; kind: 'change' | 'approval' | 'comment'; actorId: string | null; at: Date; text: string }[] = [];
      const TYPE: Record<string, string> = { join: 'the joining', promotion: 'a promotion', transfer: 'a transfer', redesignation: 'a new designation', manager_change: 'a manager change', salary_revision: 'a salary revision', employment_type_change: 'an employment type change', confirmation: 'a confirmation', correction: 'a correction', notice: 'a notice period', notice_withdrawal: 'a resignation withdrawal', exit: 'the exit' };
      const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const changes = await tx.employeeChange.findMany({ where: { organizationId: org, employeeId }, orderBy: { requestedAt: 'desc' }, take: 20 });
      for (const ch of changes) {
        const what = `${TYPE[ch.changeType] ?? 'a change'} from ${day(ch.effectiveDate)}`;
        out.push({ id: `ch-r-${ch.id}`, kind: 'change', actorId: ch.requestedBy, at: ch.requestedAt, text: `Raised ${what}` });
        if (ch.decidedAt && ['approved', 'scheduled', 'effective', 'rejected'].includes(ch.status)) out.push({ id: `ch-d-${ch.id}`, kind: 'approval', actorId: ch.decidedBy, at: ch.decidedAt, text: `${ch.status === 'rejected' ? 'Rejected' : 'Approved'} ${what}` });
      }
      if (await may(['employee.identity.view', 'employee.identity.manage', 'employee.identity.approve'])) {
        const reqs = await tx.employeeProfileRequest.findMany({ where: { organizationId: org, employeeId }, orderBy: { createdAt: 'desc' }, take: 10 });
        for (const r of reqs) {
          const label = (LABEL[r.kind as Kind] ?? r.kind).toLowerCase();
          out.push({ id: `pr-r-${r.id}`, kind: 'change', actorId: r.requestedBy, at: r.createdAt, text: `Asked to change the ${label}` });
          if (r.decidedAt && (r.status === 'approved' || r.status === 'rejected')) out.push({ id: `pr-d-${r.id}`, kind: 'approval', actorId: r.decidedBy, at: r.decidedAt, text: `${r.status === 'approved' ? 'Approved' : 'Rejected'} the ${label} change` });
        }
      }
      if (await may(['document.view', 'document.manage'])) {
        // Only document classes the viewer may see: Personal with employee.personal.view, Confidential / Special with identity.
        const classes = a.self ? null : ['public', 'internal', ...((await this.can(tx, c, v, 'employee.personal.view', employeeId)) ? ['personal'] : []), ...((await this.can(tx, c, v, 'employee.identity.view', employeeId)) ? ['confidential', 'special'] : [])];
        const allTypes = await tx.documentType.findMany({ where: { OR: [{ organizationId: org }, { organizationId: null }] }, select: { key: true, name: true, sensitivity: true } });
        const seen = allTypes.filter((t) => !classes || classes.includes(t.sensitivity)).map((t) => t.key);
        const docs = await tx.document.findMany({ where: { organizationId: org, personId: emp.personId, typeKey: { in: seen } }, orderBy: { createdAt: 'desc' }, take: 10 });
        const name = (k: string) => (allTypes.find((t) => t.key === k)?.name ?? k.replace(/_/g, ' ')).toLowerCase();
        const versions = await tx.documentVersion.findMany({ where: { organizationId: org, documentId: { in: docs.map((d) => d.id) } }, orderBy: { createdAt: 'desc' } });
        for (const d of docs) {
          for (const ver of versions.filter((x) => x.documentId === d.id)) out.push({ id: `dv-${ver.id}`, kind: 'comment', actorId: ver.uploadedBy, at: ver.createdAt, text: `Uploaded the ${name(d.typeKey)}` });
          if (d.verifiedAt) out.push({ id: `dk-${d.id}`, kind: 'approval', actorId: d.verifiedBy, at: d.verifiedAt, text: `${d.status === 'rejected' ? 'Sent back' : 'Verified'} the ${name(d.typeKey)}` });
        }
      }
      if (await may(['letter.issue'])) {
        const letters = await tx.letterIssue.findMany({ where: { organizationId: org, personId: emp.personId, status: { in: ['issued', 'superseded'] } }, orderBy: { issuedAt: 'desc' }, take: 10 });
        for (const l of letters) if (l.issuedAt) out.push({ id: `li-${l.id}`, kind: 'approval', actorId: l.issuedBy, at: l.issuedAt, text: `Issued the ${l.title.split(':')[0].toLowerCase()}${l.referenceNo ? ` (${l.referenceNo})` : ''}` });
      }
      out.sort((x, y) => y.at.getTime() - x.at.getTime());
      const top = out.slice(0, 20);
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: top.flatMap((e) => (e.actorId ? [e.actorId] : [])) } }, select: { id: true, name: true, email: true } });
      return { entries: top.map((e) => ({ id: e.id, kind: e.kind, actor: e.actorId ? (users.find((u) => u.id === e.actorId)?.name || users.find((u) => u.id === e.actorId)?.email || 'Someone') : null, at: e.at.toISOString(), text: e.text })) };
    });
  }

  // ================= identity / bank / legal name: change with approval (§4.5, YX-SEC-13) =================

  private proposal(kind: Kind, value: ProposedValueDto): Proposal {
    const allowed = KIND_FIELDS[kind];
    const given = (Object.keys(value) as (keyof ProposedValueDto)[]).filter((k) => value[k] !== undefined);
    const extra = given.filter((k) => !allowed.includes(k));
    const missing = allowed.filter((k) => value[k] === undefined);
    if (extra.length || missing.length) throw new BadRequestException(`${LABEL[kind]} takes ${allowed.join(', ')}${extra.length ? `, not ${extra.join(', ')}` : ''}.`);
    const out: Proposal = {};
    for (const k of allowed) out[k] = String(value[k]).trim();
    return out;
  }

  /** What lists show: masked, never the value (P02 §4.4). */
  private display(kind: Kind, p: Proposal): Record<string, string | null> {
    if (kind === 'legal_name') return { legalName: p.legalName ?? null };
    if (BANK[kind]) return { holderName: p.holderName ?? null, ifsc: p.ifsc ?? null, account: maskTail(last4(p.accountNumber ?? '')) };
    if (kind === 'passport') return { value: maskTail(last4(p.passport ?? '')), expiresOn: p.passportExpiresOn ?? null };
    return { value: maskTail(last4(p[kind as Identifier] ?? '')) };
  }

  private async currentDisplay(tx: Tx, c: CompanyContext, employeeId: string, kind: Kind) {
    if (BANK[kind]) {
      const b = await tx.employeeBankAccount.findFirst({ where: { organizationId: c.organizationId, employeeId, purpose: BANK[kind], validTo: null } });
      return b ? { holderName: b.holderName, ifsc: b.ifsc, account: maskTail(b.accountLast4) } : null;
    }
    const ids = await tx.employeeIdentifiers.findFirst({ where: { organizationId: c.organizationId, employeeId } });
    if (!ids) return null;
    if (kind === 'legal_name') return ids.legalName ? { legalName: ids.legalName } : null;
    const tail = ids[`${kind as Identifier}Last4`];
    if (kind === 'passport') return tail ? { value: maskTail(tail), expiresOn: ids.passportExpiresOn ? isoDate(ids.passportExpiresOn) : null } : null;
    return tail ? { value: maskTail(tail) } : null;
  }

  /** The person themselves, or HR holding employee.identity.manage in scope (raising on their behalf). Step-up at the route. */
  requestChange(ctx: TenantContext, v: Viewer, employeeId: string, dto: ProfileRequestDto) {
    const p = this.proposal(dto.kind, dto.value);
    return this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      if (!a.self && !(await this.can(tx, c, v, 'employee.identity.manage', employeeId))) throw new ForbiddenException('Raising an identity or bank change for someone else needs employee.identity.manage.');
      if (await this.sameAsOnFile(tx, c, employeeId, dto.kind, p)) throw new BadRequestException('That is already the value on file.');
      let row: RequestRow;
      try {
        row = await tx.employeeProfileRequest.create({
          data: {
            organizationId: c.organizationId,
            employeeId,
            kind: dto.kind,
            proposedEnc: this.seal(c, employeeId, JSON.stringify(p)),
            proposedDisplay: this.display(dto.kind, p),
            currentDisplay: (await this.currentDisplay(tx, c, employeeId, dto.kind)) ?? Prisma.DbNull,
            reason: dto.reason.trim(),
            requestedBy: c.userId!,
            // YX-SEC-13: the "previous contact" is the one on file now, before anything else changes.
            notifyContacts: await this.contactsOnFile(tx, c, employeeId),
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`A ${LABEL[dto.kind]} change is already waiting for approval.`);
        throw e;
      }
      await audit(tx, c, 'employee.profile_change.requested', 'employee', employeeId, { requestId: row.id, kind: dto.kind, by: a.self ? 'self' : 'hr' });
      return this.requestView(row, new Map(), new Map(), v);
    });
  }

  /**
   * Lifecycle 6b: identity and bank details a joiner gave in pre-boarding become ordinary change requests on their new
   * record on the joining day, inside that transaction, so the usual approval (maker ≠ checker, cooling hours) applies.
   */
  async raiseIn(tx: Tx, c: CompanyContext, employeeId: string, kind: RequestKind, value: ProposedValueDto, reason: string) {
    const p = this.proposal(kind, value);
    if (await this.sameAsOnFile(tx, c, employeeId, kind, p)) return null;
    const row = await tx.employeeProfileRequest.create({
      data: {
        organizationId: c.organizationId,
        employeeId,
        kind,
        proposedEnc: this.seal(c, employeeId, JSON.stringify(p)),
        proposedDisplay: this.display(kind, p),
        currentDisplay: (await this.currentDisplay(tx, c, employeeId, kind)) ?? Prisma.DbNull,
        reason,
        requestedBy: c.userId!,
        notifyContacts: await this.contactsOnFile(tx, c, employeeId),
      },
    });
    await audit(tx, c, 'employee.profile_change.requested', 'employee', employeeId, { requestId: row.id, kind, by: 'preboarding' });
    return row.id;
  }

  private async sameAsOnFile(tx: Tx, c: CompanyContext, employeeId: string, kind: Kind, p: Proposal) {
    if (BANK[kind]) {
      const b = await tx.employeeBankAccount.findFirst({ where: { organizationId: c.organizationId, employeeId, purpose: BANK[kind], validTo: null } });
      return Boolean(b && b.accountHash === this.hash(c, 'bank', `${p.ifsc}:${p.accountNumber}`) && b.holderName === p.holderName);
    }
    const ids = await tx.employeeIdentifiers.findFirst({ where: { organizationId: c.organizationId, employeeId } });
    if (kind === 'legal_name') return ids?.legalName === p.legalName;
    // A renewed passport may keep its number: the expiry is part of what is on file.
    if (kind === 'passport') return ids?.passportHash === this.hash(c, 'passport', p.passport!) && (ids?.passportExpiresOn ? isoDate(ids.passportExpiresOn) : null) === p.passportExpiresOn;
    return ids?.[`${kind as Identifier}Hash`] === this.hash(c, kind as Identifier, p[kind as Identifier]!);
  }

  /** P02 §4.3: the queue shows one's own requests and those of the people one's identity keys reach. */
  listRequests(ctx: TenantContext, v: Viewer, status: string | undefined) {
    return this.history.run(ctx, async (tx, c) => {
      const own = await this.history.ownEmployeeId(tx, c, v);
      const today = Prisma.sql`${todayIst()}::date`;
      const reach = (k: 'employee.identity.approve' | 'employee.identity.manage') => this.history.scopeFilter(tx, c, v, k, Prisma.sql`r.employee_id`, today);
      const ids = await tx.$queryRaw<{ id: string }[]>`
        SELECT r.id::text FROM employee_profile_requests r
        WHERE r.organization_id = ${c.organizationId}::uuid ${status ? Prisma.sql`AND r.status = ${status}` : Prisma.empty}
          AND (r.employee_id = ${own}::uuid OR r.requested_by = ${v.userId}::uuid
               OR (${!v.actingForOther} AND (${await reach('employee.identity.approve')} OR ${await reach('employee.identity.manage')})))
        ORDER BY r.created_at DESC LIMIT 300`;
      const rows = await tx.employeeProfileRequest.findMany({ where: { organizationId: c.organizationId, id: { in: ids.map((r) => r.id) } }, orderBy: { createdAt: 'desc' } });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } } });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: rows.flatMap((r) => [r.requestedBy, r.decidedBy].filter((x): x is string => Boolean(x))) } }, select: { id: true, name: true, email: true } });
      return {
        rows: rows.map((r) =>
          this.requestView(
            r,
            new Map(people.map((p) => [p.id, displayName(p)])),
            new Map(users.map((u) => [u.id, u.name || u.email])),
            v,
          ),
        ),
      };
    });
  }

  private requestView(r: RequestRow, names: Map<string, string>, users: Map<string, string>, v: Viewer) {
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: names.get(r.employeeId) ?? null,
      kind: r.kind,
      label: LABEL[r.kind as Kind],
      proposed: r.proposedDisplay,
      current: r.currentDisplay,
      reason: r.reason,
      status: r.status,
      requestedBy: users.get(r.requestedBy) ?? null,
      requestedAt: r.createdAt,
      mine: r.requestedBy === v.userId,
      decidedBy: r.decidedBy ? (users.get(r.decidedBy) ?? null) : null,
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
      overrideReason: r.overrideReason,
    };
  }

  private async pendingRequest(tx: Tx, c: CompanyContext, id: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profile-request:${c.organizationId}:${id}`}))`;
    const r = await tx.employeeProfileRequest.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  /** Decided by someone who is neither the requester nor the person (YX-SEC-11) and whose approval grant reaches them. */
  private async mayDecide(tx: Tx, c: CompanyContext, v: Viewer, r: RequestRow) {
    if (!(await this.can(tx, c, v, 'employee.identity.approve', r.employeeId))) throw new NotFoundException('Request not found');
    if (r.requestedBy === c.userId) throw new ForbiddenException('You raised this change, so someone else decides it (YX-SEC-11).');
    if ((await this.history.ownEmployeeId(tx, c, v)) === r.employeeId) throw new ForbiddenException('A change to your own details is decided by someone else (YX-SEC-11).');
    if (r.status !== 'pending') throw new ConflictException(`This request is ${r.status}.`);
  }

  /**
   * Approve: the new value goes on file (a new bank account becomes usable for pay after the cooling period),
   * the person's contact on file is told (YX-SEC-13). A value another active employee already has blocks
   * approval unless a reason is given (YX-EMP-02).
   */
  async approve(ctx: TenantContext, v: Viewer, id: string, note: string | undefined, overrideReason: string | undefined) {
    const result = await this.history.run(ctx, async (tx, c) => {
      const r = await this.pendingRequest(tx, c, id);
      await this.mayDecide(tx, c, v, r);
      const kind = r.kind as Kind;
      const p = JSON.parse(this.open(c, r.employeeId, r.proposedEnc)) as Proposal;
      const conflicts = await this.duplicates(tx, c, v, r.employeeId, kind, p);
      if (conflicts.length && !overrideReason) {
        const who = conflicts.map((x) => (x.employeeCode ? `${x.name} (${x.employeeCode})` : x.name)).join(', ');
        throw new ConflictException({ statusCode: 409, code: 'DUPLICATE_IDENTIFIER', message: `${who} already ${conflicts.length > 1 ? 'have' : 'has'} this ${LABEL[kind]}. Check it, or give a reason to approve anyway.`, conflicts });
      }
      const now = new Date();
      if (BANK[kind]) {
        const purpose = BANK[kind];
        const old = await tx.employeeBankAccount.findFirst({ where: { organizationId: c.organizationId, employeeId: r.employeeId, purpose, validTo: null } });
        if (old) await tx.employeeBankAccount.update({ where: { id: old.id }, data: { validTo: now } });
        const employment = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId: r.employeeId }, orderBy: { joinedOn: 'desc' } });
        const hours = Number(await settingFor(tx, c, 'employee.bank_change.cooling_hours', { legalEntityId: employment?.legalEntityId ?? '' }));
        await tx.employeeBankAccount.create({
          data: {
            organizationId: c.organizationId,
            employeeId: r.employeeId,
            purpose,
            holderName: p.holderName!,
            ifsc: p.ifsc!,
            accountEnc: this.seal(c, r.employeeId, p.accountNumber!),
            accountHash: this.hash(c, 'bank', `${p.ifsc}:${p.accountNumber}`),
            accountLast4: last4(p.accountNumber!),
            validFrom: now,
            // The first account has nothing to protect; a replacement waits out the cooling period (§4.5).
            usableFrom: old ? new Date(now.getTime() + hours * 3_600_000) : now,
            requestId: r.id,
          },
        });
      } else {
        const data: Record<string, unknown> =
          kind === 'legal_name'
            ? { legalName: p.legalName }
            : { [`${kind}Enc`]: this.seal(c, r.employeeId, p[kind as Identifier]!), [`${kind}Hash`]: this.hash(c, kind as Identifier, p[kind as Identifier]!), [`${kind}Last4`]: last4(p[kind as Identifier]!), ...(kind === 'passport' ? { passportExpiresOn: new Date(`${p.passportExpiresOn}T00:00:00Z`) } : {}) };
        await tx.employeeIdentifiers.upsert({
          where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId: r.employeeId } },
          create: { organizationId: c.organizationId, employeeId: r.employeeId, ...data },
          update: data,
        });
      }
      await tx.employeeProfileRequest.update({ where: { id }, data: { status: 'approved', decidedBy: c.userId, decidedAt: now, decisionNote: note?.trim() || null, overrideReason: overrideReason?.trim() || null } });
      // YX-SEC-13: the contacts on file when it was raised (a personal email changed since cannot redirect it), and today's.
      const contacts = [...new Set([...r.notifyContacts, ...(await this.contactsOnFile(tx, c, r.employeeId))])];
      await audit(tx, c, 'employee.profile_change.approved', 'employee', r.employeeId, { requestId: id, kind, duplicateOverride: conflicts.length > 0, notified: contacts.length });
      return { id, status: 'approved' as const, kind, contacts, organizationId: c.organizationId };
    });
    // YX-SEC-13: tell the person through the contacts on file before the change (best effort, after commit).
    const subject = `Your ${LABEL[result.kind].toLowerCase()} on file was changed`;
    const html = `<p>Your ${LABEL[result.kind].toLowerCase()} on file at work was changed on ${todayIst()} after an approved request.</p><p>If you did not ask for this, contact HR at once.</p>`;
    await Promise.allSettled(result.contacts.map((to) => this.email.send({ to, subject, html, organizationId: result.organizationId }))).catch((e) => this.logger.error(e));
    return { id: result.id, status: result.status };
  }

  /** Work and personal email on file (the "previous contact"); `personal` overrides the stored personal email. */
  private async contactsOnFile(tx: Tx, c: CompanyContext, employeeId: string, personal?: string | null): Promise<string[]> {
    const e = await tx.employee.findFirstOrThrow({ where: { id: employeeId, organizationId: c.organizationId }, select: { workEmail: true } });
    const d = personal === undefined ? await tx.employeePersonalDetails.findFirst({ where: { organizationId: c.organizationId, employeeId }, select: { personalEmail: true } }) : { personalEmail: personal };
    return [...new Set([e.workEmail, d?.personalEmail].filter((x): x is string => Boolean(x)))];
  }

  /** YX-EMP-02: other employees with an open employment holding the same value. Names only for people the approver's view reaches. */
  private async duplicates(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, kind: Kind, p: Proposal) {
    if (kind === 'legal_name' || kind === 'esic' || (!BANK[kind] && !IDENTIFIERS.includes(kind as Identifier))) return [];
    const others = BANK[kind]
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT b.employee_id::text AS id FROM employee_bank_accounts b
          WHERE b.organization_id = ${c.organizationId}::uuid AND b.valid_to IS NULL AND b.employee_id <> ${employeeId}::uuid
            AND b.account_hash = ${this.hash(c, 'bank', `${p.ifsc}:${p.accountNumber}`)}`
      : await tx.$queryRaw<{ id: string }[]>`
          SELECT i.employee_id::text AS id FROM employee_identifiers i
          WHERE i.organization_id = ${c.organizationId}::uuid AND i.employee_id <> ${employeeId}::uuid
            AND ${Prisma.raw(`i.${kind}_hash`)} = ${this.hash(c, kind as Identifier, p[kind as Identifier]!)}`;
    if (!others.length) return [];
    const active = await tx.employment.findMany({ where: { organizationId: c.organizationId, employeeId: { in: others.map((o) => o.id) }, exitedOn: null }, select: { employeeId: true, employeeCode: true } });
    const visible = await this.history.reachedIds(tx, c, v, 'employee.profile.view', active.map((x) => x.employeeId));
    const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: [...visible] } } });
    return active.map((x) => {
      const person = people.find((p2) => p2.id === x.employeeId);
      return person ? { employeeId: x.employeeId, name: displayName(person), employeeCode: x.employeeCode } : { employeeId: null, name: 'Another employee', employeeCode: null };
    });
  }

  reject(ctx: TenantContext, v: Viewer, id: string, reason: string) {
    return this.history.run(ctx, async (tx, c) => {
      const r = await this.pendingRequest(tx, c, id);
      await this.mayDecide(tx, c, v, r);
      await tx.employeeProfileRequest.update({ where: { id }, data: { status: 'rejected', decidedBy: c.userId, decidedAt: new Date(), decisionNote: reason.trim() } });
      await audit(tx, c, 'employee.profile_change.rejected', 'employee', r.employeeId, { requestId: id, kind: r.kind });
      return { id, status: 'rejected' };
    });
  }

  /** Withdrawn by whoever raised it, or by the person it is about, while it waits. */
  cancel(ctx: TenantContext, v: Viewer, id: string, reason: string) {
    return this.history.run(ctx, async (tx, c) => {
      const r = await this.pendingRequest(tx, c, id);
      const own = await this.history.ownEmployeeId(tx, c, v);
      if (r.requestedBy !== c.userId && own !== r.employeeId) throw new NotFoundException('Request not found');
      if (r.status !== 'pending') throw new ConflictException(`This request is ${r.status}.`);
      await tx.employeeProfileRequest.update({ where: { id }, data: { status: 'cancelled', decidedBy: c.userId, decidedAt: new Date(), decisionNote: reason.trim() } });
      await audit(tx, c, 'employee.profile_change.cancelled', 'employee', r.employeeId, { requestId: id, kind: r.kind });
      return { id, status: 'cancelled' };
    });
  }

  // ================= who accessed my data (P02 §7, P08) =================

  /** Views of the signed-in person's Confidential / Special data by others; the company may hide the list (never the recording). */
  accessLog(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const own = await this.history.ownEmployeeId(tx, c, v);
      if (!own) throw new NotFoundException('You have no employee record in this company.');
      const enabled = (await settingFor(tx, c, 'privacy.who_accessed', { legalEntityId: '' })) === 'on';
      if (!enabled) return { enabled, entries: [] };
      const rows = await tx.auditLog.findMany({
        where: { organizationId: c.organizationId, entityType: 'employee', entityId: own, action: { in: [...SENSITIVE_VIEW_ACTIONS] }, NOT: { actorUserId: v.userId } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return {
        enabled,
        entries: rows.map((r) => {
          const meta = r.metadataJson ? (JSON.parse(r.metadataJson) as Record<string, unknown>) : {};
          return {
            id: r.id,
            at: r.createdAt,
            who: r.actorName || r.actorEmail || 'YukthiX system',
            what: r.action === 'employee.pay.viewed' ? 'Pay' : r.action === 'employee.aadhaar.viewed' ? 'Aadhaar' : (FIELD_LABEL[String(meta.field)] ?? 'Identity details'),
            className: r.action === 'employee.aadhaar.viewed' ? 'special' : 'confidential',
          };
        }),
      };
    });
  }
}

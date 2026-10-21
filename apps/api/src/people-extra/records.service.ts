import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { isoDate, todayIst } from '../org-structure/org-validation';
import { buildViewer, has, Viewer } from '../access/scope';
import { displayName, EmployeeHistoryService, HISTORY_KEYS, Key, RequestUser } from '../employee-history/employee-history.service';
import { sealValue } from '../people/profile.service';
import { settingFor } from '../people/probation';
import { compact, isBic, isIban, splitProblem } from './bank-check';

// On the person record (P21, Confidential unless said): the identity checks and their consent (PPL-34), work
// authorisations (PPL-45) and international bank accounts with split pay (PPL-46). Keys, checked against the person:
//   employee.identity.view     read them (every read is audited: "who accessed my data")
//   employee.identity.manage   record a check or a re-verification request, add a document, raise a bank change
//   employee.identity.approve  with employee.identity.manage (HR, founder 21 Oct 2026): approve a bank change, never
//                              one's own request or about oneself. Payroll reads the approved accounts but never decides.
// The person sees their own work authorisations and bank details, and raises their own bank change.

export const EXTRA_KEYS = [...HISTORY_KEYS, 'employee.disability.manage', 'compliance.officer'] as const;

const RESULTS = { captured: 'Captured (ID + selfie)', match: 'Match', mismatch: 'Mismatch: HR review', attested: 'Attested against the original ID', id_only: 'ID check only (face consent refused)', requested: 'Re-verification requested' } as const;
export type CheckResult = keyof typeof RESULTS;
const DOC_TYPES = ['Employment visa', 'Work permit', 'Residence permit', 'National ID', 'Emirates ID', 'Passport'] as const;
const VISA_LIKE = ['Employment visa', 'Work permit'];
const DAY = 86_400_000;
const daysTo = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const last4 = (s: string) => s.slice(-4);

export interface SplitAccountInput {
  kind: 'iban' | 'india';
  iban?: string;
  bic?: string;
  bankName?: string;
  bankAccountId?: string;
  rule: 'remainder' | 'fixed' | 'percent';
  value: number;
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  viewer(user: RequestUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, EXTRA_KEYS);
  }

  /** The employee, when `key` reaches them today or they are the viewer; else as if they did not exist. */
  private async subject(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, key: Key, selfToo: boolean) {
    const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId } });
    if (!e) throw new NotFoundException('Employee not found');
    const self = (await this.history.ownEmployeeId(tx, c, v)) === e.id;
    if (self && selfToo) return { e, self };
    if (v.actingForOther || !(await this.history.reaches(tx, c, v, key, e.id, todayIst()))) throw new NotFoundException('Employee not found');
    return { e, self };
  }

  private async userName(tx: Tx, c: CompanyContext, userId: string | null) {
    if (!userId) return null;
    const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId }, select: { givenName: true, familyName: true, preferredName: true } });
    if (e) return displayName(e);
    return (await tx.user.findFirst({ where: { id: userId }, select: { name: true, email: true } }).then((u) => u?.name ?? u?.email)) ?? null;
  }

  // ------------------------------------------------------------------------------------------ PPL-34 identity

  async identity(ctx: TenantContext, user: RequestUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e } = await this.subject(tx, c, v, employeeId, 'employee.identity.view', false);
      const rows = await tx.identityCheck.findMany({ where: { organizationId: c.organizationId, personId: e.personId }, orderBy: [{ checkedOn: 'asc' }, { createdAt: 'asc' }] });
      // Consent by jurisdiction: the latest answer recorded for each.
      const consent = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (r.jurisdiction && r.consent) consent.set(r.jurisdiction, r);
      await audit(tx, c, 'employee.identity.viewed', 'employee', e.id, { what: 'identity checks' });
      const names = new Map(await Promise.all([...new Set(rows.map((r) => r.byUserId).filter((x): x is string => Boolean(x)))].map(async (id) => [id, await this.userName(tx, c, id)] as const)));
      return {
        consent: [...consent.values()].map((r) => ({ jurisdiction: r.jurisdiction!, status: r.consent === 'given' ? 'Given' : 'Refused', point: r.point, on: isoDate(r.checkedOn) })),
        checks: rows.map((r) => ({ id: r.id, on: isoDate(r.checkedOn), point: r.point, result: RESULTS[r.result as CheckResult], kind: r.result, by: names.get(r.byUserId ?? '') ?? 'System', note: r.note })),
        canRecord: has(v, 'employee.identity.manage') && !v.actingForOther,
      };
    });
  }

  /** HR records a check (an attestation against the original ID, a day-1 match or mismatch) or asks for re-verification. */
  async recordCheck(ctx: TenantContext, user: RequestUser, employeeId: string, dto: { point: string; result: CheckResult; jurisdiction?: string | null; consent?: 'given' | 'refused' | null; note?: string | null }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e, self } = await this.subject(tx, c, v, employeeId, 'employee.identity.manage', false);
      if (self) throw new ForbiddenException('Someone else records checks about you.');
      if (dto.result === 'mismatch' && !dto.note?.trim()) throw new BadRequestException('Say what did not match.');
      if (dto.consent && !dto.jurisdiction) throw new BadRequestException('Say which law the consent was given under.');
      const row = await tx.identityCheck.create({ data: { organizationId: c.organizationId, personId: e.personId, point: dto.point.trim(), result: dto.result, jurisdiction: dto.jurisdiction?.trim() || null, consent: dto.consent ?? null, note: dto.note?.trim() || null, checkedOn: new Date(`${todayIst()}T00:00:00Z`), byUserId: c.userId ?? null } });
      await audit(tx, c, dto.result === 'requested' ? 'employee.identity.reverify_requested' : 'employee.identity.checked', 'employee', e.id, { checkId: row.id, point: row.point, result: row.result });
      return { id: row.id };
    });
  }

  // ------------------------------------------------------------------------------------------ PPL-45 work authorisations

  async workAuth(ctx: TenantContext, user: RequestUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e, self } = await this.subject(tx, c, v, employeeId, 'employee.identity.view', true);
      const rows = await tx.workAuthorisation.findMany({ where: { organizationId: c.organizationId, employeeId: e.id }, orderBy: { expiresOn: 'asc' } });
      const today = todayIst();
      const [a] = await tx.$queryRaw<{ designation: string | null }[]>`
        SELECT g.name::text AS designation FROM employee_assignments a JOIN designations g ON g.organization_id = a.organization_id AND g.id = a.designation_id
        WHERE a.organization_id = ${c.organizationId}::uuid AND a.employee_id = ${e.id}::uuid AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]') LIMIT 1`;
      if (!self && rows.length) await audit(tx, c, 'employee.identity.viewed', 'employee', e.id, { what: 'work authorisations' });
      return {
        designation: a?.designation ?? null,
        canAdd: !self && has(v, 'employee.identity.manage') && !v.actingForOther,
        rows: rows.map((r) => {
          const expires = isoDate(r.expiresOn);
          const left = daysTo(today, expires);
          return {
            id: r.id,
            country: r.country,
            type: r.docType,
            number: `XXXX${r.numberLast4}`,
            sponsor: r.sponsor,
            occupation: r.occupation,
            // A visa or permit for another job than the person does: a check for HR, not a block.
            occupationDiffers: Boolean(r.occupation && a?.designation && VISA_LIKE.includes(r.docType) && r.occupation.trim().toLowerCase() !== a.designation.toLowerCase()),
            issued: r.issuedOn ? isoDate(r.issuedOn) : null,
            expires,
            daysLeft: left,
            status: left < 0 ? 'Expired' : left <= 90 ? 'Expiring' : 'Valid',
          };
        }),
      };
    });
  }

  async addWorkAuth(ctx: TenantContext, user: RequestUser, employeeId: string, dto: { country: string; type: string; number: string; sponsor?: string | null; occupation?: string | null; issuedOn?: string | null; expiresOn: string }) {
    const v = await this.viewer(user);
    if (!(DOC_TYPES as readonly string[]).includes(dto.type)) throw new BadRequestException('Choose a document type from the list.');
    if (dto.issuedOn && dto.issuedOn >= dto.expiresOn) throw new BadRequestException('The expiry date is after the issue date.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e, self } = await this.subject(tx, c, v, employeeId, 'employee.identity.manage', false);
      if (self) throw new ForbiddenException('HR adds your documents.');
      const number = compact(dto.number);
      const row = await tx.workAuthorisation.create({
        data: { organizationId: c.organizationId, employeeId: e.id, country: dto.country, docType: dto.type, numberEnc: sealValue(this.crypto, c.organizationId, e.id, number), numberLast4: last4(number), sponsor: dto.sponsor?.trim() || null, occupation: dto.occupation?.trim() || null, issuedOn: dto.issuedOn ? new Date(`${dto.issuedOn}T00:00:00Z`) : null, expiresOn: new Date(`${dto.expiresOn}T00:00:00Z`), createdBy: c.userId ?? null },
      });
      await audit(tx, c, 'employee.work_auth.added', 'employee', e.id, { id: row.id, type: row.docType, country: row.country, expiresOn: dto.expiresOn });
      return { id: row.id };
    });
  }

  // ------------------------------------------------------------------------------------------ PPL-46 international bank

  private accountView(a: Record<string, unknown>, india: Map<string, { holderName: string; accountLast4: string }>) {
    const base = { rule: a.rule as string, value: Number(a.value) };
    if (a.kind === 'india') {
      const b = india.get(String(a.bankAccountId));
      return { ...base, kind: 'india', label: b ? `${b.holderName} · XXXX ${b.accountLast4}` : 'Indian account', bankAccountId: a.bankAccountId as string };
    }
    return { ...base, kind: 'iban', label: `${a.bankName ? `${a.bankName as string} · ` : ''}${String(a.ibanCountry)}•• •••• ${String(a.ibanLast4)}`, bic: a.bic as string };
  }

  async intlBank(ctx: TenantContext, user: RequestUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e, self } = await this.subject(tx, c, v, employeeId, 'employee.identity.view', true);
      const org = c.organizationId;
      const [live, pending, india] = await Promise.all([
        tx.paySplitRequest.findFirst({ where: { organizationId: org, employeeId: e.id, status: 'approved', validTo: null } }),
        tx.paySplitRequest.findFirst({ where: { organizationId: org, employeeId: e.id, status: 'pending' } }),
        tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: e.id, validTo: null }, select: { id: true, holderName: true, accountLast4: true } }),
      ]);
      const map = new Map(india.map((b) => [b.id, b]));
      const view = (r: typeof live) => (r ? { id: r.id, country: r.country, currency: r.currency, accounts: (r.accounts as Record<string, unknown>[]).map((a) => this.accountView(a, map)), usableFrom: r.usableFrom, requestedBy: null as string | null, version: r.version } : null);
      if (!self && (live || pending)) await audit(tx, c, 'employee.identity.viewed', 'employee', e.id, { what: 'international bank accounts' });
      const own = await this.history.ownEmployeeId(tx, c, v);
      const p = view(pending);
      if (p && pending) p.requestedBy = await this.userName(tx, c, pending.requestedBy);
      return {
        current: view(live),
        pending: p,
        indianAccounts: india.map((b) => ({ id: b.id, label: `${b.holderName} · XXXX ${b.accountLast4}` })),
        canRequest: self || (has(v, 'employee.identity.manage') && !v.actingForOther),
        canDecide: Boolean(pending) && !self && own !== e.id && has(v, 'employee.identity.approve') && has(v, 'employee.identity.manage') && !v.actingForOther && pending!.requestedBy !== v.userId,
      };
    });
  }

  /** A change to the international accounts and split, waiting for one approval (maker-checker). */
  async requestIntlBank(ctx: TenantContext, user: RequestUser, employeeId: string, dto: { country: string; currency: string; accounts: SplitAccountInput[] }) {
    const v = await this.viewer(user);
    const problem = splitProblem(dto.accounts.map((a) => ({ rule: a.rule, value: a.value })));
    if (problem) throw new BadRequestException(problem);
    if (dto.accounts[0]?.rule !== 'remainder' || dto.accounts[0].kind !== 'iban') throw new BadRequestException('The first account is the primary one: an IBAN that takes the remainder.');
    for (const a of dto.accounts) {
      if (a.kind === 'iban') {
        if (!a.iban || !isIban(a.iban)) throw new BadRequestException(`${a.iban ? compact(a.iban) : 'An IBAN'} is not a valid IBAN. Check the country, length and check digits.`);
        if (!a.bic || !isBic(a.bic)) throw new BadRequestException('Enter an 8 or 11 character BIC, like ECBKAEAD.');
      } else if (!a.bankAccountId) throw new BadRequestException('Choose the Indian account.');
    }
    if (compact(dto.accounts[0].iban!).slice(0, 2) !== dto.country) throw new BadRequestException('The primary IBAN is from the country of the account.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e, self } = await this.subject(tx, c, v, employeeId, 'employee.identity.manage', true);
      const org = c.organizationId;
      const india = await tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: e.id, validTo: null }, select: { id: true } });
      if (dto.accounts.some((a) => a.kind === 'india' && !india.some((b) => b.id === a.bankAccountId))) throw new BadRequestException('Choose one of their Indian accounts on file.');
      const ibans = dto.accounts.filter((a) => a.kind === 'iban').map((a) => compact(a.iban!));
      if (new Set(ibans).size !== ibans.length) throw new BadRequestException('An account is listed twice.');
      const accounts = dto.accounts.map((a) =>
        a.kind === 'india'
          ? { kind: 'india', bankAccountId: a.bankAccountId, rule: a.rule, value: a.value }
          : { kind: 'iban', ibanEnc: sealValue(this.crypto, org, e.id, compact(a.iban!)), ibanCountry: compact(a.iban!).slice(0, 2), ibanLast4: last4(compact(a.iban!)), bic: compact(a.bic!), bankName: a.bankName?.trim() || null, rule: a.rule, value: a.value },
      );
      try {
        const r = await tx.paySplitRequest.create({ data: { organizationId: org, employeeId: e.id, country: dto.country, currency: dto.currency, accounts: accounts as unknown as Prisma.InputJsonArray, requestedBy: c.userId! } });
        await audit(tx, c, 'employee.bank_split.requested', 'employee', e.id, { requestId: r.id, accounts: accounts.length, self });
        return { id: r.id };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('A change is already waiting for approval. Decide or cancel it first.');
        throw err;
      }
    });
  }

  /** Approve (the accounts are used after the company's cooling period) or reject, never by the maker or the person. */
  async decideIntlBank(ctx: TenantContext, user: RequestUser, employeeId: string, requestId: string, dto: { approve: boolean; note?: string | null; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { e, self } = await this.subject(tx, c, v, employeeId, 'employee.identity.approve', false);
      const org = c.organizationId;
      const r = await tx.paySplitRequest.findFirst({ where: { organizationId: org, id: requestId, employeeId: e.id } });
      if (!r) throw new NotFoundException('No such request.');
      if (r.status !== 'pending') throw new ConflictException(`This request is ${r.status}.`);
      if (r.version !== dto.version) throw new ConflictException('Someone else changed this request. Reload it.');
      if (self || r.requestedBy === c.userId) throw new ForbiddenException('Someone else approves this change.');
      if (!(await this.history.reaches(tx, c, v, 'employee.identity.manage', e.id, todayIst()))) throw new ForbiddenException('HR approves bank changes.');
      if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('Say why it is rejected.');
      const now = new Date();
      if (!dto.approve) {
        await tx.paySplitRequest.update({ where: { id: r.id }, data: { status: 'rejected', decidedBy: c.userId ?? null, decidedAt: now, decisionNote: dto.note!.trim(), version: { increment: 1 } } });
        await audit(tx, c, 'employee.bank_split.rejected', 'employee', e.id, { requestId: r.id });
        return { status: 'rejected' };
      }
      const employment = await tx.employment.findFirst({ where: { organizationId: org, employeeId: e.id }, orderBy: { joinedOn: 'desc' } });
      const hours = Number(await settingFor(tx, c, 'employee.bank_change.cooling_hours', { legalEntityId: employment?.legalEntityId ?? '' }));
      const old = await tx.paySplitRequest.findFirst({ where: { organizationId: org, employeeId: e.id, status: 'approved', validTo: null } });
      if (old) await tx.paySplitRequest.update({ where: { id: old.id }, data: { validTo: now, version: { increment: 1 } } });
      const usableFrom = old ? new Date(now.getTime() + hours * 3_600_000) : now;
      await tx.paySplitRequest.update({ where: { id: r.id }, data: { status: 'approved', decidedBy: c.userId ?? null, decidedAt: now, decisionNote: dto.note?.trim() || null, usableFrom, version: { increment: 1 } } });
      await audit(tx, c, 'employee.bank_split.approved', 'employee', e.id, { requestId: r.id, usableFrom: usableFrom.toISOString(), replaced: old?.id ?? null });
      return { status: 'approved', usableFrom };
    });
  }
}

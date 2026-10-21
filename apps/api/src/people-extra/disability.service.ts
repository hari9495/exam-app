import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { isoDate, todayIst } from '../org-structure/org-validation';
import { buildViewer, tenantWide, Viewer } from '../access/scope';
import { displayName, EmployeeHistoryService, Key, RequestUser } from '../employee-history/employee-history.service';
import { EXTRA_KEYS } from './records.service';

// PPL-38: the voluntary disability declaration (Special, RPwD Act 2016). The person declares it with consent, can
// withdraw it at any time, and the HR diversity role (employee.disability.manage) sees the list and verifies the
// certificate, never a declaration about themselves. Managers never see it. Every read and change is audited.

export const RPWD = ['Locomotor disability', 'Low vision', 'Blindness', 'Hard of hearing', 'Deaf', 'Specific learning disability', 'Autism spectrum disorder', 'Intellectual disability', 'Mental illness', 'Multiple disabilities', 'Other benchmark disability'] as const;
const KEY = 'employee.disability.manage' as Key;

@Injectable()
export class DisabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
  ) {}

  private viewer(user: RequestUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, EXTRA_KEYS);
  }

  private async own(tx: Tx, c: CompanyContext, v: Viewer) {
    const id = await this.history.ownEmployeeId(tx, c, v);
    if (!id) throw new ForbiddenException('Only employees declare a disability.');
    return id;
  }

  private view(d: Prisma.DisabilityDeclarationGetPayload<object>, certificate: { status: string } | null) {
    return {
      id: d.id,
      category: d.category,
      percent: d.percent,
      validUntil: d.validUntil ? isoDate(d.validUntil) : null,
      adjustments: d.adjustments,
      status: d.status as 'declared' | 'verified',
      consentOn: isoDate(d.consentAt),
      certificate: d.certificateDocumentId ? (certificate?.status ?? 'missing') : null,
      version: d.version,
    };
  }

  async mine(ctx: TenantContext, user: RequestUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await this.own(tx, c, v);
      const d = await tx.disabilityDeclaration.findFirst({ where: { organizationId: c.organizationId, employeeId: me, withdrawnAt: null } });
      const doc = d?.certificateDocumentId ? await tx.document.findFirst({ where: { organizationId: c.organizationId, id: d.certificateDocumentId }, select: { status: true } }) : null;
      const person = await tx.employee.findFirstOrThrow({ where: { id: me }, select: { personId: true } });
      return { declaration: d ? this.view(d, doc) : null, personId: person.personId, categories: RPWD };
    });
  }

  async declare(ctx: TenantContext, user: RequestUser, dto: { consent: boolean; category: string; percent: number; certificateDocumentId: string; validUntil?: string | null; adjustments?: string | null }) {
    const v = await this.viewer(user);
    if (!dto.consent) throw new BadRequestException('Agree to the notice first: the declaration is kept only with your consent.');
    if (!(RPWD as readonly string[]).includes(dto.category)) throw new BadRequestException('Choose a category from the RPwD Act list.');
    if (dto.validUntil && dto.validUntil <= todayIst()) throw new BadRequestException('The certificate is valid until a future date.');
    if (v.actingForOther) throw new ForbiddenException('Only the person declares this.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await this.own(tx, c, v);
      const person = await tx.employee.findFirstOrThrow({ where: { id: me }, select: { personId: true } });
      // The certificate is one the person uploaded themselves as a disability certificate.
      const doc = await tx.document.findFirst({ where: { organizationId: c.organizationId, id: dto.certificateDocumentId, personId: person.personId, typeKey: 'disability_certificate' } });
      if (!doc) throw new BadRequestException('Upload the disability certificate first.');
      try {
        const d = await tx.disabilityDeclaration.create({ data: { organizationId: c.organizationId, employeeId: me, category: dto.category, percent: dto.percent, certificateDocumentId: doc.id, validUntil: dto.validUntil ? new Date(`${dto.validUntil}T00:00:00Z`) : null, adjustments: dto.adjustments?.trim() || null, consentAt: new Date() } });
        await audit(tx, c, 'employee.disability.declared', 'employee', me, { declarationId: d.id });
        return { id: d.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You have a declaration already. Withdraw it to declare again.');
        throw e;
      }
    });
  }

  /** Withdrawing hides it from everyone; only the audit trail keeps that it existed. */
  async withdraw(ctx: TenantContext, user: RequestUser) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the person withdraws this.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await this.own(tx, c, v);
      const d = await tx.disabilityDeclaration.findFirst({ where: { organizationId: c.organizationId, employeeId: me, withdrawnAt: null } });
      if (!d) throw new NotFoundException('You have no declaration.');
      await tx.disabilityDeclaration.update({ where: { id: d.id }, data: { status: 'withdrawn', withdrawnAt: new Date(), adjustments: null, version: { increment: 1 } } });
      await audit(tx, c, 'employee.disability.withdrawn', 'employee', me, { declarationId: d.id });
      return { withdrawn: true };
    });
  }

  /** The HR diversity role's list: the people its grant reaches today. */
  async list(ctx: TenantContext, user: RequestUser) {
    const v = await this.viewer(user);
    if (v.actingForOther || !v.grants.has(KEY)) throw new ForbiddenException('Disability declarations are for the HR diversity role.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.disabilityDeclaration.findMany({ where: { organizationId: c.organizationId, withdrawnAt: null }, orderBy: { createdAt: 'desc' } });
      const reach = tenantWide(v, KEY) ? new Set(rows.map((r) => r.employeeId)) : await this.history.reachedIds(tx, c, v, KEY, rows.map((r) => r.employeeId));
      const shown = rows.filter((r) => reach.has(r.employeeId));
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: shown.map((r) => r.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const docs = await tx.document.findMany({ where: { organizationId: c.organizationId, id: { in: shown.map((r) => r.certificateDocumentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true } });
      const own = await this.history.ownEmployeeId(tx, c, v);
      await audit(tx, c, 'employee.disability.list_viewed', 'organization', c.organizationId, { rows: shown.length });
      const today = todayIst();
      return shown.map((r) => {
        const p = people.find((x) => x.id === r.employeeId);
        const until = r.validUntil ? isoDate(r.validUntil) : null;
        const soon = until !== null && Date.parse(`${until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) <= 90 * 86_400_000;
        return {
          ...this.view(r, docs.find((d) => d.id === r.certificateDocumentId) ?? null),
          employeeId: r.employeeId,
          name: p ? displayName(p) : '',
          shown: r.status === 'verified' ? (soon ? 'Expiring' : 'Verified') : 'Needs review',
          canVerify: r.status === 'declared' && r.employeeId !== own,
        };
      });
    });
  }

  /** Maker-checker: the person declares, the HR diversity role verifies the certificate (never their own). */
  async verify(ctx: TenantContext, user: RequestUser, id: string, version: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.disabilityDeclaration.findFirst({ where: { organizationId: c.organizationId, id, withdrawnAt: null } });
      if (!d || v.actingForOther || !(await this.history.reaches(tx, c, v, KEY, d.employeeId, todayIst()))) throw new NotFoundException('No such declaration.');
      if ((await this.history.ownEmployeeId(tx, c, v)) === d.employeeId) throw new ForbiddenException('Someone else verifies your declaration.');
      if (d.version !== version) throw new ConflictException('Someone else changed this declaration. Reload it.');
      if (d.status !== 'declared') throw new ConflictException('This declaration is verified already.');
      await tx.disabilityDeclaration.update({ where: { id }, data: { status: 'verified', verifiedBy: c.userId ?? null, verifiedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'employee.disability.verified', 'employee', d.employeeId, { declarationId: id });
      return { status: 'verified' };
    });
  }
}

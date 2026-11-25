import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { featureOn } from '../platform/features';
import { Prisma } from '@prisma/client';
import { AuditService, PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { asDate, todayIst } from '../org-structure/org-validation';
import { PLATFORM } from '../platform/platform.service';
import type { NewsAudience, WhatsNewEntryDto, WhatsNewUpdateDto } from './whats-new.dto';

type Tx = Prisma.TransactionClient;

/** The signed-in person, as the JWT carries them. */
export interface NewsReader {
  userId: string;
  role?: string;
  permissionProfileId?: string | null;
}

// Audiences come from keys and facts, never from role names (YX-SEC-02).
const HR_KEYS = ['lifecycle.onboarding.manage', 'leave.settings.manage'];
const PAYROLL_KEYS = ['payroll.run.prepare'];

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Founder answer 994: a person sees entries published in the last 6 months only (still at most 50), so a company that
 * joins today does not get the whole backlog. 31 Aug less 6 months is the last day of February.
 */
export function sixMonthsBefore(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const back = new Date(Date.UTC(y, m - 1 - 6, 1));
  const last = new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth() + 1, 0)).getUTCDate();
  back.setUTCDate(Math.min(d, last));
  return day(back);
}
const stateOf = (e: { publishOn: Date; withdrawnAt: Date | null }, today: string) => (e.withdrawnAt ? 'withdrawn' : day(e.publishOn) > today ? 'scheduled' : 'published');

/**
 * Help H-4, founder answer 943: What's new. YukthiX staff write the entries in the console (audited, platform data);
 * each person sees the published entries for their audiences and their company's products, newest first, with unread
 * marked; only entries from the last 6 months (answer 994). The company setting help.whats_new.show (default on) turns the list off for everyone at the company.
 */
@Injectable()
export class WhatsNewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  // ------------------------------------------------------------------------------------------ YukthiX staff (console)

  async list() {
    const today = todayIst();
    const [rows, products] = await this.tenantPrisma.forTenant(PLATFORM, (tx) =>
      Promise.all([tx.whatsNewEntry.findMany({ orderBy: [{ publishOn: 'desc' }, { createdAt: 'desc' }], take: 500 }), tx.product.findMany({ orderBy: { createdAt: 'asc' }, select: { code: true, name: true } })]),
    );
    return {
      today,
      products,
      entries: rows.map((e) => ({ id: e.id, title: e.title, body: e.body, products: e.products, audiences: e.audiences, publishOn: day(e.publishOn), state: stateOf(e, today), version: e.version, updatedAt: e.updatedAt })),
    };
  }

  private async checkProducts(tx: Tx, codes: string[]) {
    const known = new Set((await tx.product.findMany({ where: { code: { in: codes } }, select: { code: true } })).map((p) => p.code));
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) throw new BadRequestException(`Unknown product: ${unknown.join(', ')}.`);
  }

  private fields(dto: WhatsNewEntryDto) {
    const publishOn = asDate(dto.publishOn);
    if (Number.isNaN(publishOn.getTime()) || day(publishOn) !== dto.publishOn) throw new BadRequestException('Give a real publish date.');
    return { title: dto.title.trim(), body: dto.body.trim(), products: [...new Set(dto.products)], audiences: [...new Set(dto.audiences)], publishOn };
  }

  async create(actorUserId: string, dto: WhatsNewEntryDto) {
    const data = this.fields(dto);
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      await this.checkProducts(tx, data.products);
      const row = await tx.whatsNewEntry.create({ data: { ...data, createdBy: actorUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.whats_new.created', entityType: 'whats_new_entry', entityId: row.id, metadata: { title: data.title, products: data.products, audiences: data.audiences, publishOn: dto.publishOn } });
    });
    return this.list();
  }

  async update(actorUserId: string, id: string, dto: WhatsNewUpdateDto) {
    const data = this.fields(dto);
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const cur = await tx.whatsNewEntry.findUnique({ where: { id } });
      if (!cur) throw new NotFoundException('Entry not found.');
      if (cur.withdrawnAt) throw new ConflictException('This entry was withdrawn. Write a new one instead.');
      await this.checkProducts(tx, data.products);
      const done = await tx.whatsNewEntry.updateMany({ where: { id, version: dto.version }, data: { ...data, version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('Someone changed this entry since you opened it. Open it again.');
      await AuditService.recordIn(tx, PLATFORM, {
        actorUserId,
        action: 'platform.whats_new.updated',
        entityType: 'whats_new_entry',
        entityId: id,
        metadata: { before: { title: cur.title, products: cur.products, audiences: cur.audiences, publishOn: day(cur.publishOn) }, after: { title: data.title, products: data.products, audiences: data.audiences, publishOn: dto.publishOn } },
      });
    });
    return this.list();
  }

  async withdraw(actorUserId: string, id: string) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const cur = await tx.whatsNewEntry.findUnique({ where: { id } });
      if (!cur) throw new NotFoundException('Entry not found.');
      if (cur.withdrawnAt) throw new ConflictException('This entry was already withdrawn.');
      await tx.whatsNewEntry.update({ where: { id }, data: { withdrawnAt: new Date(), version: { increment: 1 } } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.whats_new.withdrawn', entityType: 'whats_new_entry', entityId: id, metadata: { title: cur.title } });
    });
    return this.list();
  }

  // ------------------------------------------------------------------------------------------ people (Help drawer)

  /** Who the person is for What's new: everyone, plus employee, manager, HR, payroll and System Admin from facts and keys. */
  async audiences(tx: Tx, org: string, me: NewsReader): Promise<NewsAudience[]> {
    const out: NewsAudience[] = ['everyone'];
    const emp = await tx.employee.findFirst({ where: { organizationId: org, userId: me.userId }, select: { id: true } });
    if (emp) {
      out.push('employee');
      const today = asDate(todayIst());
      const report = await tx.employeeAssignment.findFirst({ where: { organizationId: org, managerEmployeeId: emp.id, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, select: { id: true } });
      if (report) out.push('manager');
    }
    const keys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: me.role ?? '', organizationId: org, permissionProfileId: me.permissionProfileId ?? null, userId: me.userId }, [...HR_KEYS, ...PAYROLL_KEYS]);
    if (HR_KEYS.some((k) => keys.has(k))) out.push('hr');
    if (PAYROLL_KEYS.some((k) => keys.has(k))) out.push('payroll');
    if (me.role === 'org_admin') out.push('admin');
    return out;
  }

  /** The entries this person sees: published, not withdrawn, for one of their audiences and one of the company's products. */
  private async visible(tx: Tx, org: string, me: NewsReader) {
    const [audiences, codes] = await Promise.all([this.audiences(tx, org, me), tx.organizationProduct.findMany({ where: { organizationId: org }, select: { productCode: true } }).then((r) => r.map((p) => p.productCode))]);
    if (!codes.length) return { rows: [], codes };
    const today = todayIst();
    const rows = await tx.whatsNewEntry.findMany({ where: { withdrawnAt: null, publishOn: { lte: asDate(today), gte: asDate(sixMonthsBefore(today)) }, products: { hasSome: codes }, audiences: { hasSome: audiences } }, orderBy: [{ publishOn: 'desc' }, { createdAt: 'desc' }], take: 50 });
    return { rows, codes };
  }

  mine(ctx: TenantContext, me: NewsReader) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await featureOn(tx, c, 'help.whats_new'))) return { show: false, unread: 0, entries: [] };
      const { rows, codes } = await this.visible(tx, c.organizationId, me);
      const read = new Set((await tx.whatsNewRead.findMany({ where: { organizationId: c.organizationId, userId: me.userId, entryId: { in: rows.map((r) => r.id) } }, select: { entryId: true } })).map((r) => r.entryId));
      const names = new Map((await tx.product.findMany({ select: { code: true, name: true } })).map((p) => [p.code, p.name]));
      const entries = rows.map((e) => ({ id: e.id, title: e.title, body: e.body, date: day(e.publishOn), product: e.products.filter((p) => codes.includes(p)).map((p) => names.get(p) ?? p).join(' · '), unread: !read.has(e.id) }));
      return { show: true, unread: entries.filter((e) => e.unread).length, entries };
    });
  }

  /** Marks entries read: only ones the person sees (none given: all of them). A personal reading mark, not audited. */
  async markRead(ctx: TenantContext, me: NewsReader, ids?: string[]) {
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { rows } = await this.visible(tx, c.organizationId, me);
      const pick = rows.map((r) => r.id).filter((id) => !ids || ids.includes(id));
      if (pick.length) await tx.whatsNewRead.createMany({ data: pick.map((entryId) => ({ organizationId: c.organizationId, userId: me.userId, entryId })), skipDuplicates: true });
    });
    return this.mine(ctx, me);
  }
}

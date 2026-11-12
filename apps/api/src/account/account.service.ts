import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { UsageService } from '../billing/usage.service';
import { BillingCheckoutService } from '../billing/billing-checkout.service';
import { FileStore } from '../documents/file-store';
import { SYSTEM_ADMIN_ROLE } from '../users/system-admins';
import { MAX_ROWS_PER_TABLE, exportColumn, exportTable, ident } from './export-rules';

const PLATFORM = { organizationId: null, isSuperAdmin: true };
export const EXPORT_HOURS_KEY = 'account.export.link_hours';
export const KEEP_DAYS_KEY = 'account.closure.keep_days';
const DEFAULTS: Record<string, number> = { [EXPORT_HOURS_KEY]: 24, [KEEP_DAYS_KEY]: 30 };

export interface AccountUser {
  userId?: string;
  role: string;
}

/** A platform setting (YukthiX-wide, set in the console), else its default. */
export async function platformNumber(tenantPrisma: TenantPrismaService, key: string): Promise<number> {
  const v = Number((await tenantPrisma.forTenant(PLATFORM, (tx) => tx.platformSetting.findUnique({ where: { key } })))?.value);
  return Number.isInteger(v) && v > 0 ? v : DEFAULTS[key]!;
}

/** JSON for raw rows: big numbers and decimals as text. */
const json = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v instanceof Prisma.Decimal ? v.toString() : v);

/**
 * Settings group 8 (S-9, answers 1328 and 1332): the plan, usage and invoices read-only (billing key), and the
 * whole-company export and the closure request (System Admins only, with the security key at the controller).
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly usage: UsageService,
    private readonly checkout: BillingCheckoutService,
    private readonly files: FileStore,
  ) {}

  private systemAdmin(user: AccountUser) {
    if (user.role !== SYSTEM_ADMIN_ROLE || !user.userId) throw new ForbiddenException('Only a System Admin can do this.');
  }

  /** 8.1 to 8.3: what the company has. Invoices come from the payment provider; none (or it being unreachable) is no error. */
  async billing(ctx: TenantContext) {
    const head = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = await tx.organization.findFirstOrThrow({ where: { id: c.organizationId }, select: { lifecycle: true, trialEndsAt: true, plan: { select: { name: true, priceLabel: true, billingInterval: true } } } });
      const owned = await tx.organizationProduct.findMany({ where: { organizationId: c.organizationId }, orderBy: { addedAt: 'asc' } });
      return { org, owned };
    });
    const names = new Map((await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.product.findMany({ select: { code: true, name: true } }))).map((p) => [p.code, p.name]));
    const usage = await this.usage.getUsage(ctx);
    let invoices: Awaited<ReturnType<BillingCheckoutService['listInvoices']>> | null;
    try {
      invoices = await this.checkout.listInvoices(ctx);
    } catch (e) {
      this.logger.warn(`Invoices not read: ${e instanceof Error ? e.message : String(e)}`);
      invoices = null;
    }
    return {
      plan: head.org.plan,
      lifecycle: head.org.lifecycle,
      trialEndsAt: head.org.trialEndsAt?.toISOString().slice(0, 10) ?? null,
      products: head.owned.map((p) => ({ code: p.productCode, name: names.get(p.productCode) ?? p.productCode, since: p.addedAt.toISOString().slice(0, 10) })),
      usage: { seats: usage.seats, candidates: usage.candidates, aiCredits: usage.aiCredits, proctoringMinutes: usage.proctoringMinutes, periodStart: usage.periodStart.toISOString().slice(0, 10) },
      invoices: invoices?.map((i) => ({ number: i.number, status: i.status, amountPaid: i.amountPaid, currency: i.currency, createdAt: i.createdAt, invoicePdf: i.invoicePdf })) ?? null,
    };
  }

  /** 8.5: the last exports (with their link time) and the closure request, with the two platform periods. */
  async overview(ctx: TenantContext) {
    const [hours, keepDays] = [await platformNumber(this.tenantPrisma, EXPORT_HOURS_KEY), await platformNumber(this.tenantPrisma, KEEP_DAYS_KEY)];
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const exports = await tx.companyExport.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 5 });
      const closure = await tx.accountClosureRequest.findFirst({ where: { organizationId: c.organizationId, status: { in: ['requested', 'closed'] } }, orderBy: { createdAt: 'desc' } });
      const names = new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: [...exports.map((e) => e.requestedBy), ...(closure ? [closure.requestedBy] : [])] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name?.trim() || u.email]));
      const now = Date.now();
      const company = await tx.organization.findFirstOrThrow({ where: { id: c.organizationId }, select: { name: true } });
      return {
        companyName: company.name,
        linkHours: hours,
        keepDays,
        exports: exports.map((e) => ({ id: e.id, by: names.get(e.requestedBy) ?? 'Someone', at: e.createdAt.toISOString(), expiresAt: e.expiresAt.toISOString(), open: e.expiresAt.getTime() > now, sizeBytes: Number(e.sizeBytes), tables: e.tables, rows: e.rows, downloads: e.downloads })),
        closure: closure ? { id: closure.id, status: closure.status, by: names.get(closure.requestedBy) ?? 'Someone', at: closure.createdAt.toISOString(), reason: closure.reason, keepUntil: closure.keepUntil?.toISOString().slice(0, 10) ?? null } : null,
      };
    });
  }

  /** Every table with the company's rows, read under its own RLS and filtered by its id as well. */
  async startExport(ctx: TenantContext, user: AccountUser) {
    this.systemAdmin(user);
    const c = { ...ctx, organizationId: ctx.organizationId! } as CompanyContext;
    const cols = await inCompany(this.tenantPrisma, ctx, (tx) =>
      tx.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
        SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND has_table_privilege(current_user, format('%I.%I', c.table_schema, c.table_name), 'SELECT') AND c.table_name IN (SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organization_id')
        ORDER BY c.table_name, c.ordinal_position`,
    );
    const byTable = new Map<string, string[]>();
    for (const r of cols) if (exportTable(r.table_name) && exportColumn(r.column_name, r.data_type)) byTable.set(r.table_name, [...(byTable.get(r.table_name) ?? []), r.column_name]);
    const tables: Record<string, unknown[]> = {};
    const cut: string[] = [];
    let rows = 0;
    // One read-only pass in one transaction (a table a time would be slow); only tables this connection may read.
    await inCompany(
      this.tenantPrisma,
      ctx,
      async (tx) => {
        for (const [table, columns] of byTable) {
          const list = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${columns.map(ident).join(', ')} FROM ${ident(table)} WHERE organization_id::text = $1 LIMIT ${MAX_ROWS_PER_TABLE + 1}`, c.organizationId);
          if (list.length > MAX_ROWS_PER_TABLE) (cut.push(table), list.pop());
          if (list.length) (tables[table] = list, (rows += list.length));
        }
      },
      { timeout: 120_000 },
    );
    const hours = await platformNumber(this.tenantPrisma, EXPORT_HOURS_KEY);
    const createdAt = new Date();
    const manifest = { organizationId: c.organizationId, createdAt: createdAt.toISOString(), tables: Object.keys(tables).length, rows, cutAt: cut.length ? { rowsPerTable: MAX_ROWS_PER_TABLE, tables: cut } : null, leftOut: 'Sign-in material, secrets, encrypted fields and file contents are not in the export.' };
    const data = gzipSync(Buffer.from(JSON.stringify({ manifest, tables }, json)));
    const id = randomUUID();
    const fileRef = await this.files.put(`exports/${c.organizationId}/${id}.json.gz`, data);
    const expiresAt = new Date(createdAt.getTime() + hours * 3_600_000);
    return inCompany(this.tenantPrisma, ctx, async (tx) => {
      await tx.companyExport.create({ data: { id, organizationId: c.organizationId, requestedBy: user.userId!, fileRef, sizeBytes: BigInt(data.length), tables: manifest.tables, rows, createdAt, expiresAt } });
      await audit(tx, c, 'account.export.created', 'company_export', id, { tables: manifest.tables, rows, sizeBytes: data.length, expiresAt: expiresAt.toISOString(), cut });
      return { id, expiresAt: expiresAt.toISOString(), sizeBytes: data.length, tables: manifest.tables, rows };
    });
  }

  /** The file, while its link works (410 after). Every download is audited. */
  async download(ctx: TenantContext, user: AccountUser, id: string) {
    this.systemAdmin(user);
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await tx.companyExport.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!e) throw new NotFoundException('No such export.');
      if (e.expiresAt.getTime() <= Date.now()) throw new GoneException({ statusCode: 410, code: 'EXPORT_EXPIRED', message: 'This export link has expired. Start a new export.' });
      await tx.companyExport.update({ where: { id }, data: { downloads: { increment: 1 } } });
      await audit(tx, c, 'account.export.downloaded', 'company_export', id, { createdAt: e.createdAt.toISOString() });
      return e;
    });
    return { file: await this.files.get(row.fileRef), name: `yukthix-export-${row.createdAt.toISOString().slice(0, 10)}.json.gz` };
  }

  /** A System Admin asks YukthiX to close the account (typing the company name). Nothing closes until staff do it. */
  async requestClosure(ctx: TenantContext, user: AccountUser, dto: { companyName: string; reason: string }) {
    this.systemAdmin(user);
    return inCompany(this.tenantPrisma, ctx, async (tx: Tx, c) => {
      const org = await tx.organization.findFirstOrThrow({ where: { id: c.organizationId }, select: { name: true } });
      if (dto.companyName.trim().toLowerCase() !== org.name.trim().toLowerCase()) throw new BadRequestException('Type the company name exactly as it is shown.');
      if (await tx.accountClosureRequest.findFirst({ where: { organizationId: c.organizationId, status: 'requested' } })) throw new ConflictException('Closing this account is already asked for.');
      const r = await tx.accountClosureRequest.create({ data: { organizationId: c.organizationId, requestedBy: user.userId!, reason: dto.reason.trim() } });
      await audit(tx, c, 'account.closure.requested', 'account_closure_request', r.id, { reason: r.reason });
      return { id: r.id, status: r.status };
    });
  }

  async withdrawClosure(ctx: TenantContext, user: AccountUser) {
    this.systemAdmin(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.accountClosureRequest.findFirst({ where: { organizationId: c.organizationId, status: 'requested' } });
      if (!r) throw new NotFoundException('There is no closure request to withdraw.');
      await tx.accountClosureRequest.update({ where: { id: r.id }, data: { status: 'withdrawn', decidedBy: user.userId!, decidedAt: new Date() } });
      await audit(tx, c, 'account.closure.withdrawn', 'account_closure_request', r.id, {});
    });
  }
}

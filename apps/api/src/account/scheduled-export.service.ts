import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { configure, TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { NotificationsService } from '../notifications/notifications.service';
import { SYSTEM_ADMIN_ROLE } from '../users/system-admins';
import { AccountService, type AccountUser } from './account.service';
import { ExportStorageService, type DestinationKind, type Secret, type Target } from './export-storage.service';
import { MAX_ROWS_PER_TABLE } from './export-rules';

// T2-G 45 (answer 2744): the company's own scheduled data export. Every table it owns as CSV, in a zip encrypted with
// AES-256 (the password the System Admin set), sent to the company's storage on the company's schedule (weekly by
// default). The connection secret and the password are stored encrypted (OrgSecretsCryptoService), never shown again
// and never logged. Each run is in the export log; a failure tells the System Admins.

configure({ useWebWorkers: false });
const PLATFORM = { organizationId: null, isSuperAdmin: true };
const DAY = 86_400_000;
const FREQ_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
export const KIND_LABEL: Record<DestinationKind, string> = { s3: 'Amazon S3', azure_blob: 'Azure Blob', google_drive: 'Google Drive' };

export interface DestinationInput {
  kind: DestinationKind;
  bucket?: string;
  region?: string;
  accountName?: string;
  container?: string;
  prefix?: string;
  folderId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  accountKey?: string;
  clientEmail?: string;
  privateKey?: string;
  zipPassword: string;
}

/** Due when the last good run is older than the frequency, but at most one try a day after a failure. */
export function exportDue(frequency: string, lastSuccessAt: Date | null, lastAttemptAt: Date | null, now: Date): boolean {
  const days = FREQ_DAYS[frequency];
  if (!days) return false;
  if (lastAttemptAt && now.getTime() - lastAttemptAt.getTime() < 20 * 3_600_000) return false;
  return !lastSuccessAt || now.getTime() - lastSuccessAt.getTime() >= days * DAY - 3_600_000;
}

/** One CSV cell: text as is (formula-looking text quoted with '), dates in ISO, objects as JSON. */
export function csvCell(v: unknown): string {
  const t = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'bigint' || v instanceof Prisma.Decimal ? v.toString() : typeof v === 'object' ? JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)) : String(v);
  const safe = typeof v === 'string' && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export function toCsv(rows: Record<string, unknown>[]): string {
  const cols = Object.keys(rows[0] ?? {});
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/** The target and secret from the form, checked per kind (names as each provider allows them). */
export function checkDestination(d: DestinationInput): { target: Target; secret: Secret; label: string } {
  const need = (v: string | undefined, ok: RegExp, msg: string) => {
    const t = (v ?? '').trim();
    if (!ok.test(t)) throw new BadRequestException(msg);
    return t;
  };
  const prefix = need(d.prefix ?? '', /^(?!.*\.\.)[A-Za-z0-9/_.-]{0,200}$/, 'The folder path may have letters, numbers and / _ . - only.');
  if (d.zipPassword.length < 12 || d.zipPassword.length > 128) throw new BadRequestException('The zip password needs 12 to 128 characters.');
  if (d.kind === 's3') {
    const bucket = need(d.bucket, /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Enter the bucket name as it is in AWS.');
    const region = need(d.region, /^[a-z]{2}(-[a-z]+)+-\d$/, 'Enter the region, for example ap-south-1.');
    const accessKeyId = need(d.accessKeyId, /^[A-Z0-9]{16,128}$/, 'Enter the access key ID.');
    const secretAccessKey = need(d.secretAccessKey, /^\S{20,128}$/, 'Enter the secret access key.');
    return { target: { bucket, region, prefix }, secret: { accessKeyId, secretAccessKey }, label: `s3://${bucket}/${prefix}` };
  }
  if (d.kind === 'azure_blob') {
    const accountName = need(d.accountName, /^[a-z0-9]{3,24}$/, 'Enter the storage account name.');
    const container = need(d.container, /^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/, 'Enter the container name.');
    const accountKey = need(d.accountKey, /^[A-Za-z0-9+/=]{40,120}$/, 'Enter the storage account key.');
    return { target: { accountName, container, prefix }, secret: { accountKey }, label: `${accountName}/${container}/${prefix}` };
  }
  if (d.kind === 'google_drive') {
    const folderId = need(d.folderId, /^[A-Za-z0-9_-]{10,100}$/, 'Enter the shared drive folder ID.');
    const clientEmail = need(d.clientEmail, /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/, "Enter the service account's email (…iam.gserviceaccount.com).");
    const privateKey = (d.privateKey ?? '').trim().replace(/\\n/g, '\n');
    if (!/^-----BEGIN PRIVATE KEY-----[\s\S]{100,4000}-----END PRIVATE KEY-----$/.test(privateKey)) throw new BadRequestException("Paste the service account's private key.");
    return { target: { folderId }, secret: { clientEmail, privateKey }, label: `Drive folder ${folderId}` };
  }
  throw new BadRequestException('Choose Amazon S3, Azure Blob or Google Drive.');
}

const labelOf = (kind: string, t: Record<string, string>) => (kind === 's3' ? `s3://${t.bucket}/${t.prefix ?? ''}` : kind === 'azure_blob' ? `${t.accountName}/${t.container}/${t.prefix ?? ''}` : `Drive folder ${t.folderId}`);

@Injectable()
export class ScheduledExportService {
  private readonly logger = new Logger(ScheduledExportService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly account: AccountService,
    private readonly storage: ExportStorageService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  private systemAdmin(user: AccountUser) {
    if (user.role !== SYSTEM_ADMIN_ROLE || !user.userId) throw new ForbiddenException('Only a System Admin can do this.');
  }

  /** What 8.5 shows (no secret, ever): where it goes, the schedule and the last run. */
  async view(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.companyExportDestination.findFirst({ where: { organizationId: c.organizationId } });
      const frequency = await settingFor(tx, c, 'account.scheduled_export.frequency', { legalEntityId: '' });
      const by = d ? await tx.user.findFirst({ where: { id: d.setBy, organizationId: c.organizationId }, select: { name: true, email: true } }) : null;
      return {
        frequency,
        destination: d
          ? { kind: d.kind as DestinationKind, where: labelOf(d.kind, d.target as Record<string, string>), by: by?.name?.trim() || by?.email || 'Someone', at: d.updatedAt.toISOString(), lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null, lastSuccessAt: d.lastSuccessAt?.toISOString() ?? null, lastError: d.lastError }
          : null,
      };
    });
  }

  /** A System Admin connects (or replaces) the company's storage. Secrets are encrypted before they are saved. */
  async set(ctx: TenantContext, user: AccountUser, input: DestinationInput) {
    this.systemAdmin(user);
    const { target, secret, label } = checkDestination(input);
    const data = { kind: input.kind, target: target as unknown as Prisma.InputJsonValue, secretEncrypted: this.crypto.encrypt(JSON.stringify(secret)), zipPasswordEncrypted: this.crypto.encrypt(input.zipPassword), setBy: user.userId!, lastError: null, lastAttemptAt: null };
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await tx.companyExportDestination.upsert({ where: { organizationId: c.organizationId }, create: { organizationId: c.organizationId, ...data }, update: data });
      await audit(tx, c, 'account.export_destination.set', 'organization', c.organizationId, { kind: input.kind, where: label });
    });
    return this.view(ctx);
  }

  async remove(ctx: TenantContext, user: AccountUser) {
    this.systemAdmin(user);
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const d = await tx.companyExportDestination.findFirst({ where: { organizationId: c.organizationId } });
      if (!d) throw new NotFoundException('No storage is connected.');
      await tx.companyExportDestination.delete({ where: { id: d.id } });
      await audit(tx, c, 'account.export_destination.removed', 'organization', c.organizationId, { kind: d.kind });
    });
  }

  /** "Send now" (a System Admin, to check the connection). */
  async runNow(ctx: TenantContext, user: AccountUser) {
    this.systemAdmin(user);
    const d = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.companyExportDestination.findFirst({ where: { organizationId: c.organizationId }, select: { id: true } }));
    if (!d) throw new NotFoundException('No storage is connected.');
    return this.run(ctx.organizationId!);
  }

  /** The daily sweep: each company whose export is due on its schedule. Returns how many were sent. */
  async sweep(now = new Date()): Promise<number> {
    const all = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.companyExportDestination.findMany({ select: { organizationId: true, lastAttemptAt: true, lastSuccessAt: true } }));
    let sent = 0;
    for (const d of all) {
      const ctx = { organizationId: d.organizationId, isSuperAdmin: false, userId: null };
      const frequency = await inCompany(this.tenantPrisma, ctx, (tx, c) => settingFor(tx, c, 'account.scheduled_export.frequency', { legalEntityId: '' }));
      if (!exportDue(frequency, d.lastSuccessAt, d.lastAttemptAt, now)) continue;
      if ((await this.run(d.organizationId, now)).ok) sent++;
    }
    return sent;
  }

  /** One export: read, zip with the password, upload, record; a failure is recorded and the System Admins told. */
  async run(organizationId: string, now = new Date()): Promise<{ ok: boolean; error: string | null }> {
    const ctx = { organizationId, isSuperAdmin: false, userId: null };
    const d = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.companyExportDestination.findFirst({ where: { organizationId: c.organizationId } }));
    if (!d) return { ok: false, error: 'No storage is connected.' };
    const kind = d.kind as DestinationKind;
    const where = labelOf(kind, d.target as Record<string, string>);
    const name = `yukthix-data-${now.toISOString().slice(0, 10)}.zip`;
    try {
      const { tables, cut, rows } = await this.account.readTables(ctx);
      const zip = new ZipWriter(new Uint8ArrayWriter(), { password: this.crypto.decrypt(d.zipPasswordEncrypted), encryptionStrength: 3 });
      const manifest = { organizationId, createdAt: now.toISOString(), tables: Object.keys(tables).length, rows, cutAt: cut.length ? { rowsPerTable: MAX_ROWS_PER_TABLE, tables: cut } : null, leftOut: 'Sign-in material, secrets, encrypted fields and file contents are not in the export.' };
      await zip.add('manifest.json', new TextReader(JSON.stringify(manifest, null, 2)));
      for (const [table, list] of Object.entries(tables)) await zip.add(`${table}.csv`, new TextReader(toCsv(list)));
      const data = Buffer.from(await zip.close());
      await this.storage.upload(kind, d.target as unknown as Target, JSON.parse(this.crypto.decrypt(d.secretEncrypted)) as Secret, name, data);
      await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        await tx.companyExportDestination.update({ where: { id: d.id }, data: { lastAttemptAt: now, lastSuccessAt: now, lastError: null } });
        await audit(tx, c, 'account.export.sent', 'organization', organizationId, { kind, where, file: name, tables: manifest.tables, rows, sizeBytes: data.length });
      });
      return { ok: true, error: null };
    } catch (e) {
      // Only the kind of failure is logged; the provider's message is kept for the System Admin (it never holds the secret).
      this.logger.warn(`Scheduled export for ${organizationId} to ${kind} failed: ${e instanceof Error ? e.name : 'error'}`);
      const error = `${KIND_LABEL[kind]} did not take the file${e instanceof Error && e.message ? `: ${e.message.replace(/\s+/g, ' ').slice(0, 200)}` : '.'}`;
      const admins = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        await tx.companyExportDestination.update({ where: { id: d.id }, data: { lastAttemptAt: now, lastError: error.slice(0, 300) } });
        await audit(tx, c, 'account.export.failed', 'organization', organizationId, { kind, where, file: name });
        return tx.user.findMany({ where: { organizationId, role: SYSTEM_ADMIN_ROLE, status: 'active' }, select: { id: true } });
      });
      const text = `The scheduled data export to ${KIND_LABEL[kind]} did not go through. Check the connection in Settings › Data export & closure.`;
      await this.notifications
        .notifySystem(ctx, admins.map((a) => a.id), 'account.export.failed', { entityType: 'organization', entityId: organizationId, contextText: text, linkPath: '/yx/settings/account/data-export-and-closure' }, { subject: 'Your scheduled data export did not go through', html: `<p>${text}</p>` })
        .catch(() => undefined);
      return { ok: false, error };
    }
  }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { fromBuffer } from 'file-type';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { Scanner, scannerFromEnv } from '../common/scanner';
import { safeName } from '../service-desk/attachments.service';
import { FileStore, sha256 } from './file-store';

// LIFE-1.02 the shared file pipeline (P05 §4.1, YX-DOC-01/02/03): the real type is read from the bytes and must be on
// the caller's allow-list, the size is capped, the SHA-256 is kept, the bytes are stored encrypted, and nothing is
// served until the virus scanner calls it clean (fail closed: no scanner, or a scanner error, leaves it pending and
// the hourly sweep tries again). Infected files are quarantined for good.

export type FileRow = { id: string; organizationId: string; storageRef: string; fileName: string; mime: string; size: number; sha256: string; scanStatus: string };
const ALIASES: Record<string, string> = { jpeg: 'jpg' };
const EXT_OF: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };

/** The file's real type must be allowed and match its name's extension (a renamed HTML or EXE is refused). */
export async function checkUpload(name: string, data: Buffer, allowedMime: readonly string[], maxMb: number): Promise<{ ok: true; mime: string } | { ok: false; reason: string }> {
  if (!data.length) return { ok: false, reason: 'The file is empty.' };
  if (data.length > maxMb * 1024 * 1024) return { ok: false, reason: `Files can be up to ${maxMb} MB.` };
  const sniffed = await fromBuffer(data);
  const allowed = allowedMime.map((m) => EXT_OF[m]).filter(Boolean);
  if (!sniffed || !allowedMime.includes(sniffed.mime)) return { ok: false, reason: `Upload a ${allowed.map((e) => e.toUpperCase()).join(', ')} file.` };
  const ext = (name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] ?? '').toLowerCase();
  if ((ALIASES[ext] ?? ext) !== (ALIASES[sniffed.ext] ?? sniffed.ext)) return { ok: false, reason: `The file's content does not match its name (.${ext || 'no extension'}).` };
  return { ok: true, mime: sniffed.mime };
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly scanner: Scanner | null = scannerFromEnv();

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly store: FileStore,
  ) {}

  /** Checks and stores an upload inside the caller's transaction; scan it after the commit with scan(). */
  async storeIn(tx: Tx, c: CompanyContext, input: { area: string; name: string; data: Buffer; allowedMime: readonly string[]; maxMb: number; via: 'staff' | 'self' | 'preboarder' | 'system' }): Promise<FileRow> {
    const name = safeName(input.name);
    const check = await checkUpload(name, input.data, input.allowedMime, input.maxMb);
    if (!check.ok) throw new BadRequestException({ statusCode: 400, code: 'FILE_REFUSED', message: `${name} was not added. ${check.reason}` });
    const id = randomUUID();
    const ref = await this.store.put(`org/${c.organizationId}/${input.area}/${id}`, input.data);
    return tx.file.create({ data: { id, organizationId: c.organizationId, area: input.area, storageRef: ref, fileName: name, mime: check.mime, size: input.data.length, sha256: sha256(input.data), uploadedBy: c.userId ?? null, uploadedVia: input.via } });
  }

  /** Scan one pending file now; true when it ended clean. Errors leave it pending for the sweep. */
  async scan(organizationId: string, fileId: string): Promise<boolean> {
    const ctx = { organizationId, isSuperAdmin: false };
    const row = await this.tenantPrisma.forTenant(ctx, (tx) => tx.file.findFirst({ where: { organizationId, id: fileId } }));
    if (!row || row.scanStatus !== 'pending') return row?.scanStatus === 'clean';
    if (!this.scanner) return false;
    try {
      const result = await this.scanner.scan(await this.store.get(row.storageRef));
      if (result.verdict === 'error') throw new Error(result.detail);
      await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const res = await tx.file.updateMany({ where: { organizationId, id: row.id, scanStatus: 'pending' }, data: { scanStatus: result.verdict, scanDetail: result.detail.slice(0, 200), scannedAt: new Date() } });
        if (res.count) await AuditService.recordIn(tx, ctx, { actorUserId: null, action: `file.scan.${result.verdict}`, entityType: 'file', entityId: row.id, metadata: { area: row.area, scanner: this.scanner!.name } });
      });
      if (result.verdict === 'infected') this.logger.warn(`Infected file ${row.id} quarantined (${result.detail})`);
      return result.verdict === 'clean';
    } catch (e) {
      this.logger.warn(`Scan of file ${row.id} failed, retried by the sweep: ${(e as Error).message}`);
      return false;
    }
  }

  /** Hourly: every file still pending (scanner was down) gets another try. */
  async sweep(): Promise<number> {
    const pending = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.file.findMany({ where: { scanStatus: 'pending', createdAt: { lt: new Date(Date.now() - 60_000) } }, select: { id: true, organizationId: true }, take: 200 }),
    );
    let n = 0;
    for (const f of pending) if (await this.scan(f.organizationId, f.id)) n++;
    return n;
  }

  /** The bytes of a clean file (callers check permission first). */
  async bytes(row: FileRow): Promise<Buffer> {
    if (row.scanStatus !== 'clean') throw new BadRequestException(row.scanStatus === 'infected' ? 'This file failed the virus check and cannot be opened.' : 'This file is still being checked for viruses. Try again in a minute.');
    return this.store.get(row.storageRef);
  }
}

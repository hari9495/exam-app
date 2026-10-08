import { BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { createHash, hkdfSync, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { fromBuffer } from 'file-type';
import { AuditService, BlobStorageService, TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor, SEAT_REQUIRED, audit, canWork, deskSystem, has } from './desk-access';
import { BLOCKED_TYPES } from './desks.service';
import { Requester, RequesterService } from './requester.service';
import { Scanner, scannerFromEnv } from './scanner';
import { Ticket, TicketsService } from './tickets.service';

// SD-1.05 attachments (US-B-102, US-G-031, §14.2): the desk's allow-list of file types, the real type read from the
// bytes (file-type), a size ceiling, then a virus scan on BullMQ. A file is never served until it is clean, and only
// through a short-lived signed link, as a download with nosniff.

export const SCAN_QUEUE = 'sd-attachment-scan';
const ALIASES: Record<string, string> = { jpeg: 'jpg' };
const TEXT_TYPES: Record<string, string> = { txt: 'text/plain', csv: 'text/csv' };
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif']);
const LINK_SECONDS = 60;

export interface FileCheck {
  ok: boolean;
  reason?: string;
  contentType?: string;
}

/** True when a ZIP holds a password-protected entry (general purpose bit 0): it cannot be scanned, so it is refused. */
function zipEncrypted(buf: Buffer): boolean {
  for (let i = buf.indexOf('PK\u0003\u0004'); i >= 0 && i + 8 <= buf.length; i = buf.indexOf('PK\u0003\u0004', i + 4)) {
    if (buf.readUInt16LE(i + 6) & 1) return true;
  }
  return false;
}

/** US-G-031 / §14.2: the extension must be allowed and the bytes must really be that type. */
export async function checkFile(name: string, data: Buffer, allowed: readonly string[], maxMb: number): Promise<FileCheck> {
  if (!data.length) return { ok: false, reason: 'The file is empty.' };
  if (data.length > maxMb * 1024 * 1024) return { ok: false, reason: `Files can be up to ${maxMb} MB.` };
  const ext = (name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] ?? '').toLowerCase();
  if (!ext || BLOCKED_TYPES.has(ext) || !allowed.map((x) => x.toLowerCase()).includes(ext)) return { ok: false, reason: `This desk accepts ${allowed.join(', ')} files only.` };
  const sniffed = await fromBuffer(data);
  if (TEXT_TYPES[ext]) {
    // Text has no signature: refuse anything that looks binary or is not UTF-8.
    const text = data.toString('utf8');
    if (sniffed || data.includes(0) || Buffer.from(text, 'utf8').length !== data.length) return { ok: false, reason: `The file's content does not match its name (.${ext}).` };
    return { ok: true, contentType: TEXT_TYPES[ext] };
  }
  if (!sniffed || (ALIASES[sniffed.ext] ?? sniffed.ext) !== (ALIASES[ext] ?? ext)) return { ok: false, reason: `The file's content does not match its name (.${ext}).` };
  if (sniffed.ext === 'zip' && zipEncrypted(data)) return { ok: false, reason: 'Password-protected archives cannot be checked for viruses.' };
  return { ok: true, contentType: sniffed.mime };
}

/** A safe display name: the last path part, no control characters, at most 255 characters. */
export const safeName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? 'file')
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(-255) || 'file';

@Injectable()
export class AttachmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly scanner: Scanner | null = scannerFromEnv();
  private readonly links: JwtService;
  /** Laptop fallback when no blob storage is configured (never in production). */
  private readonly localDir = resolve(process.env.SD_LOCAL_FILES_DIR ?? join(process.cwd(), '.desk-files'));

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobs: BlobStorageService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
  ) {
    this.queue = logBullErrors(new Queue(SCAN_QUEUE, { connection }), SCAN_QUEUE);
    // A key of its own for file links, derived from the API secret, so a link can never pass as a sign-in token.
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is required');
    this.links = new JwtService({ secret: Buffer.from(hkdfSync('sha256', secret, 'yukthix', 'sd-file-link', 32)).toString('base64') });
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(SCAN_QUEUE, (job) => this.scanJob(job), { connection: this.connection }), SCAN_QUEUE);
    // Files left pending by a lost job (Redis restart) are queued again every ten minutes.
    await this.queue.upsertJobScheduler('sd-scan-sweep', { every: 10 * 60_000 }, { name: 'sweep', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  // ------------------------------------------------------------------------------------------ storage

  private async put(key: string, data: Buffer, type: string): Promise<string> {
    if (this.blobs.isConfigured()) return this.blobs.upload(key, data, type);
    if (process.env.NODE_ENV === 'production') throw new Error('Blob storage is not configured');
    const path = join(this.localDir, key);
    await fs.mkdir(join(path, '..'), { recursive: true });
    await fs.writeFile(path, data);
    return `local:${key}`;
  }

  private async get(ref: string): Promise<Buffer> {
    if (!ref.startsWith('local:')) return this.blobs.downloadToBuffer(ref);
    const path = resolve(this.localDir, ref.slice('local:'.length));
    if (!path.startsWith(this.localDir)) throw new Error('Bad file key');
    return fs.readFile(path);
  }

  // ------------------------------------------------------------------------------------------ upload

  private async store(tx: Tx, ctx: { organizationId: string }, t: Ticket, file: { originalname: string; buffer: Buffer }, side: 'agent' | 'requester', by: { userId?: string; personId?: string }) {
    const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: ctx.organizationId, id: t.deskId } });
    const name = safeName(file.originalname);
    const check = await checkFile(name, file.buffer, desk.attachmentTypes, desk.attachmentMaxMb);
    if (!check.ok) throw new BadRequestException({ statusCode: 400, code: 'FILE_REFUSED', message: `${name} was not added. ${check.reason}` });
    const id = randomUUID();
    const blobKey = await this.put(`desk/${ctx.organizationId}/${t.id}/${id}`, file.buffer, check.contentType!);
    const row = await tx.sdAttachment.create({
      data: {
        id,
        organizationId: ctx.organizationId,
        deskId: t.deskId,
        ticketId: t.id,
        side,
        uploadedByUserId: by.userId ?? null,
        uploadedByPersonId: by.personId ?? null,
        blobKey,
        fileName: name,
        contentType: check.contentType!,
        sizeBytes: file.buffer.length,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
      },
    });
    return row;
  }

  private async enqueue(organizationId: string, attachmentId: string) {
    await this.queue.add('scan', { organizationId, attachmentId }, { jobId: `scan-${attachmentId}`, attempts: 8, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true, removeOnFail: 100 });
  }

  /** An agent's file (or a collaborator's, for a note): internal until it is sent with a reply. */
  async uploadByAgent(a: DeskActor, ticketId: string, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('Choose a file.');
    const row = await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      const may = (access === 'agent' && canWork(a, t.deskId)) || ((access === 'agent' || access === 'collaborator') && has(a, 'desk.ticket.note'));
      if (!may) throw new ForbiddenException(SEAT_REQUIRED);
      const r = await this.store(tx, a.ctx, t, file, 'agent', { userId: a.userId });
      await audit(tx, a, 'desk.attachment.uploaded', 'sd_ticket', t.id, { attachmentId: r.id, fileName: r.fileName, sizeBytes: r.sizeBytes, contentType: r.contentType });
      return r;
    });
    await this.enqueue(a.ctx.organizationId, row.id);
    return this.tickets.attachmentView(row);
  }

  async uploadByRequester(r: Requester, ticketId: string, file: { originalname: string; buffer: Buffer } | undefined) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    if (!file) throw new BadRequestException('Choose a file.');
    const row = await this.tenantPrisma.forTenant(r.ctx, async (tx) => {
      const { t, personId } = await this.requesters.ownTicket(tx, r, ticketId);
      if (t.systemState === 'closed') throw new ConflictException('This ticket is closed. Raise a new ticket.');
      const x = await this.store(tx, r.ctx, t, file, 'requester', { personId });
      await audit(tx, r, 'desk.attachment.uploaded', 'sd_ticket', t.id, { attachmentId: x.id, fileName: x.fileName, sizeBytes: x.sizeBytes, byRequester: true });
      return x;
    });
    await this.enqueue(r.ctx.organizationId, row.id);
    return this.tickets.attachmentView(row);
  }

  // ------------------------------------------------------------------------------------------ scan

  async scanJob(job: Job<{ organizationId?: string; attachmentId?: string }>): Promise<void> {
    if (job.name === 'sweep') return this.sweep();
    const { organizationId, attachmentId } = job.data;
    if (!organizationId || !attachmentId) return;
    const ctx = { organizationId, isSuperAdmin: false };
    const row = await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdAttachment.findFirst({ where: { organizationId, id: attachmentId } }));
    if (!row || row.scanStatus !== 'pending') return;
    // No scanner: stay pending (fail closed) and try again later.
    if (!this.scanner) throw new Error('No virus scanner configured');
    const result = await this.scanner.scan(await this.get(row.blobKey));
    if (result.verdict === 'error') throw new Error(result.detail);
    await deskSystem(this.tenantPrisma, ctx, async (tx) => {
      const res = await tx.sdAttachment.updateMany({ where: { organizationId, id: row.id, scanStatus: 'pending' }, data: { scanStatus: result.verdict, scanDetail: result.detail.slice(0, 200), scannedAt: new Date() } });
      if (res.count) {
        await AuditService.recordIn(tx, ctx, { actorUserId: null, action: `desk.attachment.${result.verdict}`, entityType: 'sd_ticket', entityId: row.ticketId, metadata: { attachmentId: row.id, scanner: this.scanner!.name, detail: result.detail } });
      }
    });
    if (result.verdict === 'infected') this.logger.warn(`Infected desk attachment ${row.id} quarantined (${result.detail})`);
  }

  private async sweep() {
    const rows = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.sdAttachment.findMany({ where: { scanStatus: 'pending', createdAt: { lt: new Date(Date.now() - 5 * 60_000) } }, select: { id: true, organizationId: true }, take: 500 }),
    );
    for (const r of rows) await this.enqueue(r.organizationId, r.id);
  }

  // ------------------------------------------------------------------------------------------ download

  private linkFor(row: { id: string; organizationId: string; scanStatus: string }, userId: string) {
    if (row.scanStatus === 'pending') throw new ConflictException({ statusCode: 409, code: 'FILE_NOT_SCANNED', message: 'This file is still being checked for viruses. Try again in a minute.' });
    if (row.scanStatus !== 'clean') throw new GoneException({ statusCode: 410, code: 'FILE_BLOCKED', message: 'This file was blocked because it may be harmful.' });
    const token = this.links.sign({ a: row.id, o: row.organizationId, u: userId }, { expiresIn: LINK_SECONDS, audience: 'sd-file' });
    return { url: `/desk/files/${token}`, expiresInSeconds: LINK_SECONDS };
  }

  /** Agents, collaborators and desk admins who can open the ticket can open its files. */
  async linkForAgent(a: DeskActor, ticketId: string, attachmentId: string) {
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const { t } = await this.tickets.load(tx, a, ticketId);
      const row = await tx.sdAttachment.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: { in: [t.id, ...(await this.tickets.mergedIds(tx, a.ctx.organizationId, t.id))] }, id: attachmentId } });
      if (!row) throw new NotFoundException('No such file.');
      const link = this.linkFor(row, a.userId);
      await audit(tx, a, 'desk.attachment.opened', 'sd_ticket', t.id, { attachmentId: row.id });
      return link;
    });
  }

  /** A requester opens their own files and files sent to them in a reply, never an internal one. */
  async linkForRequester(r: Requester, ticketId: string, attachmentId: string) {
    return this.tenantPrisma.forTenant(r.ctx, async (tx) => {
      const { t } = await this.requesters.ownTicket(tx, r, ticketId);
      const row = await tx.sdAttachment.findFirst({ where: { organizationId: r.ctx.organizationId, ticketId: t.id, id: attachmentId } });
      const msg = row?.messageId ? await tx.sdTicketMessage.findFirst({ where: { organizationId: r.ctx.organizationId, id: row.messageId }, select: { kind: true } }) : null;
      if (!row || !(row.side === 'requester' || msg?.kind === 'reply')) throw new NotFoundException('No such file.');
      return this.linkFor(row, r.userId);
    });
  }

  /** GET /desk/files/:token. The token is the only key: short-lived, bound to one file, re-checked as clean. */
  async download(token: string): Promise<{ data: Buffer; fileName: string; contentType: string; inline: boolean }> {
    let claims: { a: string; o: string; u: string };
    try {
      claims = this.links.verify(token, { audience: 'sd-file' });
    } catch {
      throw new NotFoundException('This link has expired. Open the file again from the ticket.');
    }
    const row = await this.tenantPrisma.forTenant({ organizationId: claims.o, isSuperAdmin: false, userId: claims.u }, (tx) => tx.sdAttachment.findFirst({ where: { organizationId: claims.o, id: claims.a } }));
    if (!row || row.scanStatus !== 'clean') throw new NotFoundException('No such file.');
    return { data: await this.get(row.blobKey), fileName: row.fileName, contentType: row.contentType, inline: INLINE.has(row.contentType) };
  }
}

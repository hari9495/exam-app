import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { has, type ScopeUser } from '../access/scope';
import { dateOf } from '../time/time-core';
import { ConfirmationDto } from './dto';
import { PayFileStore, sha256 } from './pay-file-store';
import { entitiesFor, payScope, payViewer, requireSelf } from './pay-access';

// PAY-1.11 (YX-INT-03, US-E-281): one table for every generated file (bank, ECR, ESI, PT, LWF, Form 138 / 140,
// journals, registers, WPS). A file is stored encrypted with its SHA-256, row count and totals; it never changes
// (database trigger). Downloads go through a single-use link that lives 60 seconds and are audited with the hash; a
// release is done by a second person (maker ≠ checker, also enforced by the database) after a fresh second step.

const LINK_SECONDS = 60;
const KINDS = ['bank', 'ecr', 'esi', 'pt', 'lwf', 'form138', 'form140', 'journal', 'register', 'wps'] as const;
export type FileKind = (typeof KINDS)[number];
const KIND_LABEL: Record<FileKind, string> = { bank: 'Bank file', ecr: 'PF ECR', esi: 'ESI contributions', pt: 'Professional tax', lwf: 'Labour welfare fund', form138: 'Form 138 (TDS return)', form140: 'Form 140', journal: 'Accounting journal', register: 'Register', wps: 'WPS salary file' };
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

type File = Prisma.ExchangeFileGetPayload<object>;

@Injectable()
export class ExchangeFilesService {
  private readonly logger = new Logger(ExchangeFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: PayFileStore,
  ) {}

  /**
   * The primitive every writer uses (bank files in 5d, statutory files in 5f): stores the bytes, hash, rows and totals.
   * The caller's transaction must already have the pay guard open for the entity. A new file of the same kind and
   * owner supersedes the previous one, which is kept.
   */
  async generateIn(tx: Tx, c: CompanyContext, a: { legalEntityId: string; kind: FileKind; ownerType: string; ownerId: string | null; periodStart: string | null; fileName: string; contentType: string; data: Buffer; rows: number; totals: Record<string, string>; by: string }) {
    const org = c.organizationId;
    for (const v of Object.values(a.totals)) if (!/^-?\d{1,14}(\.\d{1,2})?$/.test(v)) throw new BadRequestException('File totals are amounts in rupees and paise.');
    const fileRef = await this.files.put(`exchange/${org}/${a.legalEntityId}/${randomBytes(12).toString('hex')}`, a.data);
    const f = await tx.exchangeFile.create({
      data: { organizationId: org, legalEntityId: a.legalEntityId, kind: a.kind, ownerType: a.ownerType, ownerId: a.ownerId, periodStart: a.periodStart ? new Date(`${a.periodStart}T00:00:00Z`) : null, fileName: a.fileName.slice(0, 200), contentType: a.contentType, fileRef, sha256: sha256(a.data), sizeBytes: a.data.length, rowCount: a.rows, totals: a.totals, generatedBy: a.by },
    });
    const older = await tx.exchangeFile.findMany({ where: { organizationId: org, legalEntityId: a.legalEntityId, kind: a.kind, ownerType: a.ownerType, ownerId: a.ownerId, periodStart: f.periodStart, id: { not: f.id }, status: { in: ['generated', 'release_pending'] } } });
    for (const o of older) await tx.exchangeFile.update({ where: { id: o.id }, data: { status: 'superseded', supersededBy: f.id } });
    await audit(tx, c, 'payroll.file.generated', 'exchange_file', f.id, { legalEntityId: a.legalEntityId, kind: a.kind, rows: a.rows, sha256: f.sha256, totals: a.totals, superseded: older.length });
    return f;
  }

  private view(f: File, names: Map<string, string>, me: string) {
    return {
      id: f.id,
      legalEntityId: f.legalEntityId,
      kind: f.kind,
      kindLabel: KIND_LABEL[f.kind as FileKind] ?? f.kind,
      month: f.periodStart ? dateOf(f.periodStart).slice(0, 7) : null,
      fileName: f.fileName,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      rows: f.rowCount,
      totals: f.totals,
      status: f.status,
      generatedBy: names.get(f.generatedBy) ?? '',
      generatedAt: f.generatedAt,
      releasedBy: f.releasedBy ? (names.get(f.releasedBy) ?? '') : null,
      releasedAt: f.releasedAt,
      madeByMe: f.generatedBy === me,
    };
  }

  async list(ctx: TenantContext, user: ScopeUser, legalEntityId?: string) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (!has(v, 'payroll.file.view')) throw new ForbiddenException('Payroll files need payroll.file.view.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = (await entitiesFor(tx, c, v, 'payroll.file.view')).filter((id) => !legalEntityId || id === legalEntityId);
      await payScope(tx, ids);
      const rows = await tx.exchangeFile.findMany({ where: { organizationId: org, legalEntityId: { in: ids } }, orderBy: { generatedAt: 'desc' }, take: 200 });
      const names = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: rows.flatMap((r) => [r.generatedBy, r.releasedBy]).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true } });
      const canRelease = new Set(await entitiesFor(tx, c, v, 'payroll.file.release'));
      return { entities, files: rows.map((r) => ({ ...this.view(r, names, v.userId!), canRelease: canRelease.has(r.legalEntityId) && r.generatedBy !== v.userId && r.status === 'generated' })) };
    });
  }

  /** A single-use link (60 seconds) to download one file; asking for it is audited. */
  async link(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.file.view'));
      const f = await tx.exchangeFile.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!f) throw new NotFoundException('Not found');
      // A bank file carries full account numbers (§12.5): only the people who make or release it may download it.
      if (f.kind === 'bank' && !(await entitiesFor(tx, c, v, 'payroll.bankfile.generate')).concat(await entitiesFor(tx, c, v, 'payroll.bankfile.release')).includes(f.legalEntityId)) throw new ForbiddenException('Bank files are downloaded by the people who generate or release them.');
      const token = randomBytes(32).toString('base64url');
      await tx.exchangeFileLink.create({ data: { organizationId: c.organizationId, legalEntityId: f.legalEntityId, fileId: f.id, tokenHash: tokenHash(token), userId: v.userId!, expiresAt: new Date(Date.now() + LINK_SECONDS * 1000) } });
      await audit(tx, c, 'payroll.file.link_issued', 'exchange_file', f.id, { legalEntityId: f.legalEntityId, kind: f.kind, sha256: f.sha256 });
      return { path: `/payroll/file-downloads/${token}`, expiresInSeconds: LINK_SECONDS };
    });
  }

  /**
   * Uses a link once, as the person it was made for (the signed-in session must be theirs). The bytes are checked
   * against the stored hash before they are served; the download is audited with the hash (YX-PAY-21).
   */
  async download(ctx: TenantContext, user: ScopeUser, token: string): Promise<{ file: Buffer; name: string; contentType: string }> {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.file.view'));
      const l = await tx.exchangeFileLink.findFirst({ where: { organizationId: c.organizationId, tokenHash: tokenHash(token) } });
      if (!l || l.userId !== v.userId || l.usedAt || l.expiresAt < new Date()) throw new NotFoundException('This link has been used or has expired. Ask for a new one.');
      const used = await tx.exchangeFileLink.updateMany({ where: { id: l.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!used.count) throw new NotFoundException('This link has been used or has expired. Ask for a new one.');
      const f = await tx.exchangeFile.findFirstOrThrow({ where: { organizationId: c.organizationId, id: l.fileId } });
      const file = await this.checked(f);
      await audit(tx, c, 'payroll.file.downloaded', 'exchange_file', f.id, { legalEntityId: f.legalEntityId, kind: f.kind, sha256: f.sha256 });
      return { file, name: f.fileName, contentType: f.contentType };
    });
  }

  private async checked(f: File) {
    const file = await this.files.get(f.fileRef);
    if (sha256(file) !== f.sha256) {
      this.logger.error(`Exchange file ${f.id} does not match its hash`);
      throw new ConflictException({ statusCode: 409, code: 'FILE_TAMPERED', message: 'This file does not match the one that was generated, so it cannot be used. Generate it again.' });
    }
    return file;
  }

  /**
   * The checker releases a file someone else generated (step-up by the route), after its hash is checked again. Bank
   * files have their own key and checks (batch 5d: its check runs in the same transaction); the generic route refuses them.
   */
  async release(ctx: TenantContext, user: ScopeUser, id: string, confirmation: ConfirmationDto, bank?: { check: (tx: Tx, c: CompanyContext, f: File) => Promise<void> }) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, bank ? 'payroll.bankfile.release' : 'payroll.file.release'));
      await tx.$queryRaw`SELECT id FROM exchange_files WHERE organization_id = ${c.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const f = await tx.exchangeFile.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!f) throw new NotFoundException('Not found');
      if ((f.kind === 'bank') !== Boolean(bank)) throw new ForbiddenException(f.kind === 'bank' ? 'Release a bank file from its payroll run (payroll.bankfile.release).' : 'Not a bank file.');
      if (f.generatedBy === v.userId) throw new ForbiddenException('You generated this file, so someone else must release it.');
      if (f.status !== 'generated') throw new ConflictException(f.status === 'released' ? 'This file is already released.' : 'A newer file replaced this one.');
      const phrase = `RELEASE ${f.rowCount}`;
      if (confirmation.phrase !== phrase) throw new BadRequestException(`Type ${phrase} to confirm.`);
      await this.checked(f);
      if (bank) await bank.check(tx, c, f);
      await tx.exchangeFile.update({ where: { id: f.id }, data: { status: 'released', releasedBy: v.userId!, releasedAt: new Date() } });
      await audit(tx, c, 'payroll.file.released', 'exchange_file', f.id, { legalEntityId: f.legalEntityId, kind: f.kind, sha256: f.sha256, rows: f.rowCount, totals: f.totals, confirmed: { phrase: confirmation.phrase, impact: confirmation.impact } });
      return { id: f.id, status: 'released' };
    });
  }
}

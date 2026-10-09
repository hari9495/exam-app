import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { NotificationsService } from '../notifications/notifications.service';
import { has, tenantWide, type ScopeUser, type Viewer } from '../access/scope';
import { ChainCursor, ChainRow, PLATFORM_CHAIN, ZERO_HASH, checkBatch } from './audit-chain';
import { AuditQueryDto, LegalHoldDto } from './dto';
import { PayFileStore, sha256 } from './pay-file-store';
import { entitiesFor, payViewer, requireSelf } from './pay-access';

// PAY-1.05 … PAY-1.08 (P08 Part B): the per-company hash chain with a daily check and anchors (YX-AUD-03), the audit
// viewer and record timelines in scope with Confidential values masked (YX-AUD-04…07), retention with archive and legal
// holds (YX-AUD-08). The database makes audit append-only (grants + a trigger) and links each row as it is written.

const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
const BATCH = 2000;
const MONTHS_ONLINE = 13;
const DEDUP_MINUTES = 30;

/** Restricted areas (YX-AUD-06): their audit is read only by that area's members (the key), never by audit.view alone. */
const RESTRICTED: { prefix: string; key: string }[] = [
  { prefix: 'posh.', key: 'posh.case.view' },
  { prefix: 'disciplinary.', key: 'disciplinary.case.view' },
  { prefix: 'grievance.', key: 'grievance.case.view' },
  { prefix: 'whistleblower.', key: 'whistleblower.case.view' },
  { prefix: 'leave.medical', key: 'leave.medical.view' },
];

/** Field-name parts that carry Confidential pay / identity values (P02 §4.4): masked without the field permission. */
const PAY_FIELDS = /(amount|salary|ctc|gross|^net$|netpay|net_pay|earning|deduction|bonus|allowance|compensation|paise|rupees|tax|tds)/i;
const ID_FIELDS = /(pan|aadhaar|uan|esic|ifsc|account(number|no)?$|bank|passport)/i;
const MASK = '•••• (hidden)';

/** Field churn and views never reach a record's timeline (YX-AUD-05): only business events do. */
const NOT_BUSINESS = [/\.viewed$/, /^step_up\./, /^login\./, /^super_admin\./, /^user\.impersonate/, /\.exported$/, /^audit\./, /^workflow\.request\.(submitted|skipped)$/];

export function maskMetadata(value: unknown, canPay: boolean, canIdentity: boolean, key = ''): unknown {
  if (key && !canPay && PAY_FIELDS.test(key)) return MASK;
  if (key && !canIdentity && ID_FIELDS.test(key)) return MASK;
  if (Array.isArray(value)) return value.map((v) => maskMetadata(v, canPay, canIdentity));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskMetadata(v, canPay, canIdentity, k)]));
  return value;
}

const parse = (s: string | null) => {
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return { text: s.slice(0, 500) };
  }
};
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  // A cell starting with = + - @ is read as a formula by spreadsheets: quoted and prefixed.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

@Injectable()
export class PayAuditService {
  private readonly logger = new Logger(PayAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: PayFileStore,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------------------------------ chain (PAY-1.05)

  /**
   * Walks one company's chain from its newest archive (or the start) to its last row, then writes an anchor. A broken
   * link, a gap, a changed row, or rows missing after the last good anchor all fail it and alert (YX-AUD-03).
   */
  async verifyChain(chainKey: string): Promise<{ result: 'ok' | 'broken'; lastSeq: string; rows: number; problem: string | null; brokenAtSeq: string | null }> {
    const archive = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.auditArchive.findFirst({ where: { chainKey }, orderBy: { toSeq: 'desc' } }));
    let cursor: ChainCursor = archive ? { seq: archive.toSeq, hash: archive.lastHash } : { seq: BigInt(0), hash: ZERO_HASH };
    let rows = 0;
    let problem: { seq: bigint; problem: string } | null = null;
    for (;;) {
      const batch = await this.tenantPrisma.forTenant(SUPER, (tx) =>
        tx.auditLog.findMany({
          where: { chainKey, chainSeq: { gt: cursor.seq } },
          orderBy: { chainSeq: 'asc' },
          take: BATCH,
          select: { id: true, chainKey: true, chainSeq: true, prevHash: true, rowHash: true, actorEmail: true, actorName: true, actorRole: true, action: true, entityType: true, entityId: true, metadataJson: true, createdAt: true },
        }),
      );
      if (!batch.length) break;
      const checked = checkBatch(cursor, batch as ChainRow[]);
      if ('problem' in checked) {
        problem = checked;
        break;
      }
      cursor = checked.cursor;
      rows += batch.length;
      if (batch.length < BATCH) break;
    }
    // Rows cut off the end since the last good check are a gap too (a truncated tail has no "next row" to notice it).
    if (!problem) {
      const last = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.auditAnchor.findFirst({ where: { chainKey, result: 'ok' }, orderBy: { verifiedAt: 'desc' } }));
      if (last && last.lastSeq > cursor.seq) problem = { seq: cursor.seq + BigInt(1), problem: `Rows ${cursor.seq + BigInt(1)} to ${last.lastSeq} were removed since the last check` };
      else if (last && last.lastSeq > BigInt(0)) {
        const at = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { chainKey, chainSeq: last.lastSeq }, select: { rowHash: true } }));
        if (at && at.rowHash !== last.lastHash) problem = { seq: last.lastSeq, problem: `Row ${last.lastSeq} no longer matches the last check` };
      }
    }
    const organizationId = chainKey === PLATFORM_CHAIN ? null : chainKey;
    await this.tenantPrisma.forTenant(SUPER, async (tx) => {
      const exists = organizationId ? await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } }) : null;
      await tx.auditAnchor.create({ data: { organizationId: exists ? organizationId : null, chainKey, lastSeq: cursor.seq, lastHash: cursor.hash, rowsChecked: BigInt(rows), result: problem ? 'broken' : 'ok', brokenAtSeq: problem?.seq ?? null, problem: problem?.problem ?? null } });
    });
    if (problem) await this.alert(chainKey, problem.problem);
    return { result: problem ? 'broken' : 'ok', lastSeq: cursor.seq.toString(), rows, problem: problem?.problem ?? null, brokenAtSeq: problem ? problem.seq.toString() : null };
  }

  /** The daily job: every chain. */
  async verifyAll(): Promise<number> {
    const chains = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ k: string }[]>`SELECT DISTINCT chain_key::text AS k FROM audit_logs`);
    let broken = 0;
    for (const { k } of chains) {
      try {
        if ((await this.verifyChain(k)).result === 'broken') broken++;
      } catch (e) {
        this.logger.error(`audit chain ${k}: ${(e as Error).message}`);
      }
    }
    return broken;
  }

  /** YukthiX security (error log + the platform audit) and the company's System Admins (in the app) hear at once. */
  private async alert(chainKey: string, problem: string) {
    this.logger.error(`AUDIT CHAIN BROKEN for ${chainKey}: ${problem}`);
    await this.tenantPrisma.forTenant(SUPER, (tx) => audit(tx, { organizationId: null, isSuperAdmin: true } as CompanyContext, 'audit.chain.broken', 'audit_chain', chainKey, { problem }));
    if (chainKey === PLATFORM_CHAIN) return;
    const admins = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.user.findMany({ where: { organizationId: chainKey, role: 'org_admin', status: 'active' }, select: { id: true } }));
    await this.notifications
      .notifySystem({ organizationId: chainKey, isSuperAdmin: false }, admins.map((a) => a.id), 'audit.chain.broken', { entityType: 'audit_chain', entityId: chainKey, contextText: 'The audit log check failed. YukthiX security has been told.', linkPath: '/yx/payroll/audit' }, { subject: 'The audit log check failed', html: '<p>The daily check of your company’s audit log found a problem. YukthiX security has been told and will contact you.</p>' })
      .catch((e) => this.logger.warn(`audit alert not sent: ${(e as Error).message}`));
  }

  /** The company's latest checks (for the viewer). */
  async chainStatus(ctx: TenantContext, user: ScopeUser) {
    const v = await this.requireAudit(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.auditAnchor.findMany({ where: { organizationId: c.organizationId }, orderBy: { verifiedAt: 'desc' }, take: 10 });
      return { canVerify: tenantWide(v, 'audit.view'), checks: rows.map((r) => ({ at: r.verifiedAt, result: r.result, lastSeq: r.lastSeq.toString(), rows: r.rowsChecked.toString(), problem: r.problem })) };
    });
  }

  /** "Check now" for the company's own chain (System Admin or auditor: company-wide audit.view). */
  async verifyNow(ctx: TenantContext, user: ScopeUser) {
    const v = await this.requireAudit(user);
    if (!tenantWide(v, 'audit.view')) throw new ForbiddenException('Checking the whole log needs company-wide audit access.');
    const res = await this.verifyChain(ctx.organizationId!);
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'audit.chain.verified', 'audit_chain', c.organizationId, { result: res.result, lastSeq: res.lastSeq }));
    return res;
  }

  // ------------------------------------------------------------------------------------------ viewer (PAY-1.06)

  private async requireAudit(user: ScopeUser): Promise<Viewer> {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (!has(v, 'audit.view')) throw new ForbiddenException('The audit log needs audit.view.');
    return v;
  }

  /** YX-AUD-06: company-wide holders read everything; an entity-scoped reader only events of its entities. */
  private async scopeWhere(tx: Tx, c: CompanyContext, v: Viewer): Promise<Prisma.AuditLogWhereInput> {
    const hidden = RESTRICTED.filter((r) => !has(v, r.key)).map((r) => ({ action: { startsWith: r.prefix } }));
    const base: Prisma.AuditLogWhereInput = { organizationId: c.organizationId, ...(hidden.length ? { NOT: hidden } : {}) };
    if (tenantWide(v, 'audit.view')) return base;
    const entities = await entitiesFor(tx, c, v, 'audit.view');
    return { ...base, OR: entities.length ? entities.map((id) => ({ metadataJson: { contains: `"legalEntityId":"${id}"` } })) : [{ id: '00000000-0000-0000-0000-000000000000' }] };
  }

  private where(q: AuditQueryDto): Prisma.AuditLogWhereInput {
    return {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:30`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999+05:30`) } : {}) } } : {}),
    };
  }

  // ponytail: values unmask only for company-wide holders; entity-scoped holders see them masked (the safe side).
  private masks(v: Viewer) {
    return { canPay: tenantWide(v, 'employee.salary.view'), canIdentity: tenantWide(v, 'employee.identity.view') };
  }

  private view(r: Prisma.AuditLogGetPayload<object>, m: { canPay: boolean; canIdentity: boolean }) {
    return { id: r.id, seq: r.chainSeq?.toString() ?? null, at: r.createdAt, action: r.action, entityType: r.entityType, entityId: r.entityId, actor: r.actorName || r.actorEmail || 'YukthiX system', actorRole: r.actorRole, details: maskMetadata(parse(r.metadataJson), m.canPay, m.canIdentity) };
  }

  /** Audit search in scope, newest first, by chain position (YX-AUD-06). */
  async search(ctx: TenantContext, user: ScopeUser, q: AuditQueryDto) {
    const v = await this.requireAudit(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const m = this.masks(v);
      const rows = await tx.auditLog.findMany({ where: { AND: [await this.scopeWhere(tx, c, v), this.where(q), q.before ? { chainSeq: { lt: BigInt(q.before) } } : {}] }, orderBy: { chainSeq: 'desc' }, take: 50 });
      return { entries: rows.map((r) => this.view(r, m)), next: rows.length === 50 ? rows[rows.length - 1].chainSeq!.toString() : null };
    });
  }

  /** A record's timeline: business events only (YX-AUD-05), masked like the log. */
  async timeline(ctx: TenantContext, user: ScopeUser, entityType: string, entityId: string) {
    const v = await this.requireAudit(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const m = this.masks(v);
      const rows = await tx.auditLog.findMany({ where: { AND: [await this.scopeWhere(tx, c, v), { entityType, entityId }] }, orderBy: { chainSeq: 'desc' }, take: 200 });
      return rows.filter((r) => !NOT_BUSINESS.some((x) => x.test(r.action))).map((r) => this.view(r, m));
    });
  }

  /** The audited, masked CSV export (YX-AUD-07): at most 5,000 rows; the export itself is an audit event. */
  async export(ctx: TenantContext, user: ScopeUser, q: AuditQueryDto): Promise<{ file: Buffer; name: string }> {
    const v = await this.requireAudit(user);
    if (!has(v, 'audit.export')) throw new ForbiddenException('Exporting the audit log needs audit.export.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const m = this.masks(v);
      const rows = await tx.auditLog.findMany({ where: { AND: [await this.scopeWhere(tx, c, v), this.where(q)] }, orderBy: { chainSeq: 'desc' }, take: 5000 });
      const lines = ['Position,When,Who,Role,What,Record type,Record,Details', ...rows.map((r) => this.view(r, m)).map((r) => [r.seq, r.at.toISOString(), r.actor, r.actorRole, r.action, r.entityType, r.entityId, r.details].map(csvCell).join(','))];
      const file = Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
      await audit(tx, c, 'audit.exported', 'audit_log', c.organizationId, { filters: q, rows: rows.length, sha256: sha256(file), masked: { pay: !m.canPay, identity: !m.canIdentity } });
      return { file, name: `audit-log-${new Date().toISOString().slice(0, 10)}.csv` };
    });
  }

  /**
   * YX-AUD-04: someone else's pay was viewed. One event per viewer × subject × class within 30 minutes, written in the
   * viewing transaction.
   */
  static async sensitiveView(tx: Tx, c: CompanyContext, viewerId: string, subjectType: string, subjectId: string, cls: string, metadata: Record<string, unknown>) {
    const action = `${cls}.viewed`;
    const since = new Date(Date.now() - DEDUP_MINUTES * 60_000);
    const recent = await tx.auditLog.findFirst({ where: { organizationId: c.organizationId, actorUserId: viewerId, action, entityType: subjectType, entityId: subjectId, createdAt: { gte: since } }, select: { id: true } });
    if (!recent) await audit(tx, c, action, subjectType, subjectId, metadata);
  }

  // ------------------------------------------------------------------------------------------ holds and retention (PAY-1.07)

  async holds(ctx: TenantContext, user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (!has(v, 'audit.hold.manage')) throw new ForbiddenException('Legal holds need audit.hold.manage.');
    return inCompany(this.tenantPrisma, ctx, (tx, c) => tx.auditLegalHold.findMany({ where: { organizationId: c.organizationId }, orderBy: { setAt: 'desc' }, take: 100 }));
  }

  async placeHold(ctx: TenantContext, user: ScopeUser, dto: LegalHoldDto) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (!tenantWide(v, 'audit.hold.manage')) throw new ForbiddenException('Legal holds need audit.hold.manage for the whole company.');
    if (dto.to < dto.from) throw new BadRequestException('The hold ends before it starts.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (dto.employeeId && !(await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: dto.employeeId }, select: { id: true } }))) throw new NotFoundException('Not found');
      const h = await tx.auditLegalHold.create({ data: { organizationId: c.organizationId, caseRef: dto.caseRef, employeeId: dto.employeeId ?? null, fromAt: new Date(`${dto.from}T00:00:00+05:30`), toAt: new Date(`${dto.to}T23:59:59.999+05:30`), reason: dto.reason, setBy: v.userId! } });
      await audit(tx, c, 'audit.hold.placed', 'audit_legal_hold', h.id, { caseRef: dto.caseRef, employeeId: dto.employeeId ?? null, from: dto.from, to: dto.to, reason: dto.reason });
      return { id: h.id };
    });
  }

  async releaseHold(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    if (!tenantWide(v, 'audit.hold.manage')) throw new ForbiddenException('Legal holds need audit.hold.manage for the whole company.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const h = await tx.auditLegalHold.findFirst({ where: { organizationId: c.organizationId, id, releasedAt: null } });
      if (!h) throw new NotFoundException('No such hold.');
      if (h.setBy === v.userId) throw new ForbiddenException('Someone other than the person who placed the hold must release it.');
      await tx.auditLegalHold.update({ where: { id }, data: { releasedAt: new Date(), releasedBy: v.userId! } });
      await audit(tx, c, 'audit.hold.released', 'audit_legal_hold', id, { caseRef: h.caseRef });
      return { id };
    });
  }

  /**
   * The archive job (YX-AUD-08): rows older than 13 months move to an encrypted archive file, up to the first row under a
   * legal hold; archives past the company's retention (at least 8 years) lose their file and a deletion record is kept.
   * ponytail: one archive per chain per run, capped at 50,000 rows; runs daily, so a backlog drains over days.
   */
  async archiveAll(now = new Date()): Promise<{ archived: number; deleted: number }> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS_ONLINE);
    let archived = 0;
    let deleted = 0;
    const chains = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ k: string }[]>`SELECT DISTINCT chain_key::text AS k FROM audit_logs WHERE created_at < ${cutoff}`);
    for (const { k } of chains) {
      try {
        archived += await this.archiveChain(k, cutoff);
      } catch (e) {
        this.logger.warn(`audit archive ${k}: ${(e as Error).message}`);
      }
    }
    const old = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.auditArchive.findMany({ where: { deletedAt: null, fileRef: { not: null } }, take: 500 }));
    for (const a of old) {
      const years = a.organizationId ? Number(await this.tenantPrisma.forTenant({ organizationId: a.organizationId, isSuperAdmin: false }, (tx) => settingFor(tx, { organizationId: a.organizationId!, isSuperAdmin: false }, 'audit.retention_years', { legalEntityId: '' }))) : 8;
      const until = new Date(a.newestAt);
      until.setUTCFullYear(until.getUTCFullYear() + years);
      if (until > now) continue;
      const held = a.organizationId ? await this.tenantPrisma.forTenant(SUPER, (tx) => tx.auditLegalHold.count({ where: { organizationId: a.organizationId!, releasedAt: null, fromAt: { lte: a.newestAt } } })) : 0;
      if (held) continue;
      await this.files.drop(a.fileRef!);
      await this.tenantPrisma.forTenant(SUPER, async (tx) => {
        await tx.auditArchive.update({ where: { id: a.id }, data: { deletedAt: now, fileRef: null } });
        await audit(tx, { organizationId: a.organizationId, isSuperAdmin: true } as CompanyContext, 'audit.archive.deleted', 'audit_archive', a.id, { fromSeq: a.fromSeq.toString(), toSeq: a.toSeq.toString(), rows: a.rows, keptYears: years });
      });
      deleted++;
    }
    return { archived, deleted };
  }

  async archiveChain(chainKey: string, cutoff: Date): Promise<number> {
    const org = chainKey === PLATFORM_CHAIN ? null : chainKey;
    const holds = org ? await this.tenantPrisma.forTenant(SUPER, (tx) => tx.auditLegalHold.findMany({ where: { organizationId: org, releasedAt: null }, select: { fromAt: true } })) : [];
    const firstHeld = holds.reduce<Date | null>((m, h) => (!m || h.fromAt < m ? h.fromAt : m), null);
    const until = firstHeld && firstHeld < cutoff ? firstHeld : cutoff;
    const rows = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { chainKey }, orderBy: { chainSeq: 'asc' }, take: 50_000 }));
    // The oldest contiguous run written before `until`.
    const take: typeof rows = [];
    for (const r of rows) {
      if (r.createdAt >= until) break;
      take.push(r);
    }
    if (!take.length) return 0;
    const body = Buffer.from(take.map((r) => JSON.stringify({ ...r, chainSeq: r.chainSeq?.toString() })).join('\n'), 'utf8');
    const last = take[take.length - 1];
    const ref = await this.files.put(`audit/${chainKey}/${take[0].chainSeq}-${last.chainSeq}.jsonl`, body);
    return this.tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.auditArchive.create({ data: { organizationId: org, chainKey, fromSeq: take[0].chainSeq!, toSeq: last.chainSeq!, lastHash: last.rowHash!, rows: take.length, newestAt: last.createdAt, fileRef: ref, sha256: sha256(body) } });
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT audit_archive_rows(${chainKey}::uuid, ${last.chainSeq}::bigint) AS n`;
      return Number(n);
    });
  }
}

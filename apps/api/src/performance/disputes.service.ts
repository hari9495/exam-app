import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../documents/files.service';
import { holdersOf } from '../time/time-core';
import { escalateBy, evidenceHash } from './b3-rules';
import type { DisputeDecisionDto, DisputeExportDto, LegalHoldDto, RaiseDisputeDto } from './b3-dto';

// PRF-15 dispute escalation and evidence export. After HR answers a disagreement (PRF-06) the employee may escalate it
// once per review, within perf.dispute.escalate_days of the answer (default 15). The rating stays as released.
//   who      the employee raises it and adds attachments while it is open; only holders of perf.dispute.manage (in
//            scope of the employee) read the case, never the employee's own case; the manager does not see it
//   audit    every view, legal hold change, decision, export and download is in the audit log with the actor
//   evidence every review entry, the stage history, calibration changes, the disagreement and HR's answer, the
//            escalation, attachments and the review's own audit trail, each with a SHA-256 of what is recorded now
//   export   a PDF (cover sheet with every item's hash, the electronic-records certificate page for the named signatory,
//            then each item as recorded) stored through the shared file pipeline (FilesService: SHA-256, virus scan)
//   decision upheld / not upheld / a fresh review; recording it never changes the rating: a changed rating goes through
//            HR's reopen with a reason (PRF-05)

/** The calendar day in India (IST) of a moment: the escalation window counts Indian days. */
const iso = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const num = (x: Prisma.Decimal | null) => (x === null ? null : Number(x.toString()));
const KEY = 'perf.dispute.manage';
const ATTACH_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_FILES = 5;
const SOUGHT: Record<string, string> = { rereview: 'A fresh review of the rating by someone independent', correct: 'Correction of a factual error in the review', other: 'Something else (see the grounds)' };
const DECISION: Record<string, string> = { upheld: 'Upheld: the rating changes through a reopened review', not_upheld: 'Not upheld: the rating stays', rereview: 'A fresh review by someone independent' };
const STAGE: Record<string, string> = { self: 'Self review', manager: 'Manager review', skip: 'Skip-level review', other: 'Other reviewer’s input' };
const ACTION: Record<string, string> = {
  'perf.dispute.raised': 'escalated the dispute',
  'perf.dispute.file_added': 'added an attachment',
  'perf.dispute.viewed': 'opened the case',
  'perf.dispute.legal_hold': 'changed the legal hold',
  'perf.dispute.decided': 'recorded the decision',
  'perf.dispute.exported': 'exported evidence',
  'perf.dispute.export_downloaded': 'downloaded an evidence export',
  'perf.dispute.file_downloaded': 'downloaded an attachment',
};

type Dispute = Prisma.PerfDisputeGetPayload<object>;
export interface EvidenceItem {
  id: string;
  kind: string;
  label: string;
  at: string;
  hash: string;
  content: unknown;
}

@Injectable()
export class PerformanceDisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [KEY]);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private async me(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  private async userNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    return new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  }

  private tell(org: string, users: (string | null)[], text: string, link: string) {
    const to = [...new Set(users.filter((u): u is string => Boolean(u)))];
    if (to.length) void this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, 'perf.dispute', { entityType: 'performance', entityId: org, contextText: text, linkPath: link }, { subject: text, html: `<p>${text}. Open YukthiX to see it.</p>` }).catch(() => undefined);
  }

  /** Users who handle disputes about this employee (perf.dispute.manage in scope), never the employee themself. */
  private async handlers(tx: Tx, org: string, employeeId: string) {
    const ids = await holdersOf(tx, org, KEY, employeeId, todayIst());
    const own = (await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { userId: true } }))?.userId;
    return ids.filter((u) => u !== own);
  }

  // ------------------------------------------------------------------------------------------ the employee's side

  /** The latest disagreement on my released review, and whether (and until when) I may escalate it. */
  private async mine(tx: Tx, c: CompanyContext, v: Viewer, reviewId: string) {
    const org = c.organizationId;
    const r = await tx.review.findFirst({ where: { organizationId: org, id: reviewId } });
    if (!r || !(await this.me(tx, org, v)) || (await this.me(tx, org, v)) !== r.employeeId) throw new NotFoundException('No such review.');
    const d = await tx.reviewDisagreement.findFirst({ where: { organizationId: org, reviewId }, orderBy: { createdAt: 'desc' } });
    const days = Number(await settingFor(tx, c, 'perf.dispute.escalate_days', { legalEntityId: r.legalEntityId }));
    const by = d?.decidedAt ? escalateBy(iso(d.decidedAt), days) : null;
    const dispute = await tx.perfDispute.findFirst({ where: { organizationId: org, reviewId } });
    const why = dispute
      ? 'You already escalated this review.'
      : !d
        ? 'Raise a disagreement on the review first. You can escalate once HR has answered it.'
        : d.status === 'open'
          ? 'HR has not answered your disagreement yet. You can escalate once they have.'
          : todayIst() > by!
            ? `Escalation closed on ${by}: it is open for ${days} days after HR’s answer.`
            : null;
    return { r, d, by, days, dispute, why };
  }

  private steps(tx: Tx, org: string, x: { d: Prisma.ReviewDisagreementGetPayload<object> | null; dispute: Dispute | null; employee: string }) {
    return (async () => {
      const users = await this.userNames(tx, org, [x.d?.decidedBy ?? null, x.dispute?.decidedBy ?? null]);
      const out: { id: string; label: string; status: 'done' | 'current' | 'pending'; approver?: string; at?: string; comment?: string }[] = [];
      if (x.d) out.push({ id: 'raised', label: 'Disagreement raised', status: 'done', approver: x.employee, at: x.d.createdAt.toISOString() });
      if (x.d) out.push({ id: 'answered', label: 'HR reply', status: x.d.decidedAt ? 'done' : 'current', approver: users.get(x.d.decidedBy ?? '') ?? undefined, at: x.d.decidedAt?.toISOString(), comment: x.d.hrNote ?? undefined });
      if (x.dispute) {
        out.push({ id: 'escalated', label: 'Escalated', status: 'done', approver: x.employee, at: x.dispute.createdAt.toISOString() });
        out.push({ id: 'decision', label: 'Decision', status: x.dispute.decidedAt ? 'done' : 'current', approver: users.get(x.dispute.decidedBy ?? '') ?? undefined, at: x.dispute.decidedAt?.toISOString(), comment: x.dispute.decision ? DECISION[x.dispute.decision] : undefined });
      }
      return out;
    })();
  }

  async myDispute(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const m = await this.mine(tx, c, v, reviewId);
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: m.r.cycleId }, select: { name: true } });
      const employee = (await this.names(tx, org, [m.r.employeeId])).get(m.r.employeeId) ?? '';
      const files = m.dispute ? await this.attachments(tx, org, m.dispute.id) : [];
      return {
        reviewId,
        cycle: cycle.name,
        // The employee sees the released rating only (YX-PERF-09).
        score: m.r.releasedAt ? (num(m.r.calibratedScore) ?? num(m.r.finalScore)) : null,
        band: m.r.releasedAt ? m.r.band : null,
        disagreement: m.d ? { raisedOn: iso(m.d.createdAt), answeredOn: m.d.decidedAt ? iso(m.d.decidedAt) : null, status: m.d.status, hrNote: m.d.hrNote } : null,
        escalateBy: m.by,
        canEscalate: !m.why,
        why: m.why,
        dispute: m.dispute ? { id: m.dispute.id, ref: m.dispute.ref, status: m.dispute.status, raisedOn: iso(m.dispute.createdAt), decision: m.dispute.decision, decisionNote: m.dispute.decisionNote, files: files.map(({ id, name }) => ({ id, name })) } : null,
        steps: await this.steps(tx, org, { d: m.d, dispute: m.dispute, employee }),
      };
    });
  }

  async raise(ctx: TenantContext, user: ScopeUser, reviewId: string, dto: RaiseDisputeDto) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${org}:perf_dispute`}))`;
      const m = await this.mine(tx, c, v, reviewId);
      if (m.why) throw new ConflictException(m.why);
      const n = (await tx.perfDispute.count({ where: { organizationId: org } })) + 1;
      const ref = `PRF-D-${String(n).padStart(4, '0')}`;
      const x = await tx.perfDispute.create({ data: { organizationId: org, ref, reviewId, disagreementId: m.d!.id, employeeId: m.r.employeeId, grounds: dto.grounds, sought: dto.sought, createdBy: v.userId! } });
      await audit(tx, c, 'perf.dispute.raised', 'perf_dispute', x.id, { reviewId, ref, sought: dto.sought });
      return { id: x.id, ref, to: await this.handlers(tx, org, m.r.employeeId) };
    });
    this.tell(ctx.organizationId!, out.to, `A rating dispute was escalated (${out.ref})`, `/yx/performance/disputes/${out.id}`);
    return this.myDispute(ctx, user, reviewId);
  }

  /** The employee adds an attachment to their open escalation (PDF, JPG or PNG, up to 10 MB, at most 5). */
  async addFile(ctx: TenantContext, user: ScopeUser, id: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Choose a file to attach.');
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await tx.perfDispute.findFirst({ where: { organizationId: org, id } });
      if (!x || (await this.me(tx, org, v)) !== x.employeeId) throw new NotFoundException('No such dispute.');
      if (x.status !== 'raised') throw new ConflictException('This dispute is decided. Attachments can no longer be added.');
      if ((await tx.perfDisputeFile.count({ where: { organizationId: org, disputeId: id } })) >= MAX_FILES) throw new ConflictException(`A dispute takes up to ${MAX_FILES} attachments.`);
      const stored = await this.files.storeIn(tx, c, { area: 'perf-dispute', name: file.originalname, data: file.buffer, allowedMime: ATTACH_MIME, maxMb: 10, via: 'self' });
      await tx.perfDisputeFile.create({ data: { organizationId: org, disputeId: id, fileId: stored.id } });
      await audit(tx, c, 'perf.dispute.file_added', 'perf_dispute', id, { fileId: stored.id, sha256: stored.sha256 });
      return { reviewId: x.reviewId, fileId: stored.id };
    });
    void this.files.scan(ctx.organizationId!, out.fileId).catch(() => undefined);
    return this.myDispute(ctx, user, out.reviewId);
  }

  // ------------------------------------------------------------------------------------------ HR's side (perf.dispute.manage)

  /** The case, if the caller handles disputes for this employee and is not the employee. Otherwise "not found". */
  private async handled(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    if (v.actingForOther) throw new NotFoundException('No such dispute.');
    const x = await tx.perfDispute.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!x || !v.userId || !(await this.handlers(tx, c.organizationId, x.employeeId)).includes(v.userId)) throw new NotFoundException('No such dispute.');
    return x;
  }

  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (v.actingForOther) return [];
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.perfDispute.findMany({ where: { organizationId: org }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 1000 });
      const mine: Dispute[] = [];
      for (const x of rows) if ((await this.handlers(tx, org, x.employeeId)).includes(v.userId!)) mine.push(x);
      const people = await this.names(tx, org, mine.map((x) => x.employeeId));
      const reviews = await tx.review.findMany({ where: { organizationId: org, id: { in: mine.map((x) => x.reviewId) } }, select: { id: true, cycleId: true } });
      const cycles = new Map((await tx.reviewCycle.findMany({ where: { organizationId: org, id: { in: reviews.map((r) => r.cycleId) } }, select: { id: true, name: true } })).map((y) => [y.id, y.name]));
      const cycleOf = new Map(reviews.map((r) => [r.id, cycles.get(r.cycleId) ?? '']));
      await audit(tx, c, 'perf.dispute.listed', 'perf_dispute', org, { count: mine.length });
      return mine.map((x) => ({ id: x.id, ref: x.ref, employee: people.get(x.employeeId) ?? '', cycle: cycleOf.get(x.reviewId) ?? '', raisedOn: iso(x.createdAt), status: x.status, legalHold: x.legalHold }));
    });
  }

  private async attachments(tx: Tx, org: string, disputeId: string) {
    const links = await tx.perfDisputeFile.findMany({ where: { organizationId: org, disputeId }, orderBy: { createdAt: 'asc' } });
    const files = await tx.file.findMany({ where: { organizationId: org, id: { in: links.map((l) => l.fileId) } } });
    return files.map((f) => ({ id: f.id, name: f.fileName, sha256: f.sha256, at: f.createdAt, scanStatus: f.scanStatus }));
  }

  /** Everything recorded about the review and the dispute, each item hashed as it is now. */
  private async evidence(tx: Tx, org: string, x: Dispute): Promise<EvidenceItem[]> {
    const r = await tx.review.findFirstOrThrow({ where: { organizationId: org, id: x.reviewId } });
    const items: EvidenceItem[] = [];
    const add = (id: string, kind: string, label: string, at: Date, content: unknown, hash?: string) => items.push({ id, kind, label, at: at.toISOString(), hash: hash ?? evidenceHash(content), content });
    add('review', 'Review as released', `Final score ${num(r.calibratedScore) ?? num(r.finalScore) ?? 'none'}${r.band ? ` · ${r.band}` : ''}`, r.releasedAt ?? r.updatedAt, { finalScore: num(r.finalScore), calibratedScore: num(r.calibratedScore), band: r.band, sectionScores: r.sectionScores, excludedSections: r.excludedSections, releasedAt: r.releasedAt, acknowledgedAt: r.acknowledgedAt, acknowledgeComment: r.acknowledgeComment, version: r.version });
    for (const e of await tx.reviewEntry.findMany({ where: { organizationId: org, reviewId: r.id }, orderBy: { createdAt: 'asc' } })) {
      add(`entry:${e.id}`, 'Review version', `${STAGE[e.stage] ?? e.stage} v${e.version} (${e.status})`, e.submittedAt ?? e.updatedAt, { stage: e.stage, status: e.status, answers: e.answers, overallRating: num(e.overallRating), comment: e.comment, sealed: Boolean(e.sealedAt), submittedAt: e.submittedAt, version: e.version });
    }
    const log = await tx.reviewStageLog.findMany({ where: { organizationId: org, reviewId: r.id }, orderBy: { at: 'asc' } });
    if (log.length) add('stage-log', 'Stage history', `${log.length} stage changes`, log[log.length - 1].at, log.map((l) => ({ stage: l.stage, event: l.event, from: l.fromOwner, to: l.toOwner, reason: l.reason, by: l.byUserId, at: l.at })));
    for (const k of await tx.calibrationChange.findMany({ where: { organizationId: org, reviewId: r.id }, orderBy: { at: 'asc' } })) {
      add(`calibration:${k.id}`, 'Calibration change', `Score ${num(k.fromScore) ?? '–'} → ${num(k.toScore)}, reason recorded`, k.at, { from: num(k.fromScore), to: num(k.toScore), fromBand: k.fromBand, toBand: k.toBand, reason: k.reason, by: k.byUserId, at: k.at });
    }
    for (const d of await tx.reviewDisagreement.findMany({ where: { organizationId: org, reviewId: r.id }, orderBy: { createdAt: 'asc' } })) {
      add(`disagreement:${d.id}`, 'Disagreement and HR reply', `Disagreement raised ${iso(d.createdAt)}${d.decidedAt ? `, answered ${iso(d.decidedAt)}` : ''}`, d.decidedAt ?? d.createdAt, { text: d.text, status: d.status, hrNote: d.hrNote, decidedBy: d.decidedBy, decidedAt: d.decidedAt, raisedAt: d.createdAt });
    }
    add('escalation', 'Escalation', `Grounds and outcome asked for (${x.ref})`, x.createdAt, { grounds: x.grounds, sought: SOUGHT[x.sought], raisedAt: x.createdAt });
    for (const f of await this.attachments(tx, org, x.id)) add(`file:${f.id}`, 'Attachment', f.name, f.at, { name: f.name, sha256: f.sha256 }, f.sha256);
    const trail = await tx.auditLog.findMany({ where: { organizationId: org, entityType: 'review', entityId: r.id }, orderBy: { createdAt: 'asc' }, select: { action: true, actorName: true, createdAt: true, metadataJson: true } });
    if (trail.length) add('audit', 'Audit log', `All changes to this review (${trail.length} entries)`, trail[trail.length - 1].createdAt, trail);
    return items;
  }

  private async record(tx: Tx, org: string, x: Dispute) {
    const people = await this.names(tx, org, [x.employeeId]);
    const employee = people.get(x.employeeId) ?? '';
    const r = await tx.review.findFirstOrThrow({ where: { organizationId: org, id: x.reviewId } });
    const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId }, select: { name: true } });
    const d = await tx.reviewDisagreement.findFirst({ where: { organizationId: org, id: x.disagreementId } });
    const evidence = await this.evidence(tx, org, x);
    const trail = await tx.auditLog.findMany({ where: { organizationId: org, entityType: 'perf_dispute', entityId: x.id, action: { not: 'perf.dispute.viewed' } }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, actorName: true, createdAt: true } });
    const exports = await tx.perfDisputeExport.findMany({ where: { organizationId: org, disputeId: x.id }, orderBy: { createdAt: 'desc' } });
    const signatories = await this.userNames(tx, org, await this.handlers(tx, org, x.employeeId));
    return {
      id: x.id,
      ref: x.ref,
      reviewId: x.reviewId,
      employee,
      cycle: cycle.name,
      score: num(r.calibratedScore) ?? num(r.finalScore),
      band: r.band,
      raisedOn: iso(x.createdAt),
      status: x.status,
      legalHold: x.legalHold,
      grounds: x.grounds,
      sought: SOUGHT[x.sought],
      decision: x.decision,
      decisionNote: x.decisionNote,
      steps: await this.steps(tx, org, { d, dispute: x, employee }),
      evidence: evidence.map(({ id, kind, label, at, hash }) => ({ id, kind, label, at, hash })),
      activity: trail.map((a) => ({ id: a.id, actor: a.actorName ?? 'Automatic', action: ACTION[a.action] ?? a.action, at: a.createdAt.toISOString() })),
      exports: exports.map((e) => ({ id: e.id, ref: e.ref, at: e.createdAt.toISOString(), items: (e.items as unknown[]).length })),
      signatories: [...signatories].map(([value, label]) => ({ value, label })),
      version: x.version,
    };
  }

  /** Every opening of the case is in the audit log. */
  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const x = await this.handled(tx, c, v, id);
      await audit(tx, c, 'perf.dispute.viewed', 'perf_dispute', id, {});
      return this.record(tx, c.organizationId, x);
    });
  }

  private versioned(x: Dispute, version: number) {
    if (x.version !== version) throw new ConflictException('Someone else changed this dispute. Reload it.');
  }

  async legalHold(ctx: TenantContext, user: ScopeUser, id: string, dto: LegalHoldDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const x = await this.handled(tx, c, v, id);
      this.versioned(x, dto.version);
      if (x.legalHold === dto.on) throw new ConflictException(dto.on ? 'The legal hold is already on.' : 'The legal hold is already off.');
      const next = await tx.perfDispute.update({ where: { id }, data: { legalHold: dto.on, version: { increment: 1 } } });
      await audit(tx, c, 'perf.dispute.legal_hold', 'perf_dispute', id, { from: x.legalHold, to: dto.on });
      return this.record(tx, c.organizationId, next);
    });
  }

  /** Records the decision; never changes the rating (a changed rating goes through HR's reopen of the review). */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, dto: DisputeDecisionDto) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const x = await this.handled(tx, c, v, id);
      this.versioned(x, dto.version);
      if (x.status === 'resolved') throw new ConflictException('This dispute already has a decision.');
      const next = await tx.perfDispute.update({ where: { id }, data: { status: 'resolved', decision: dto.decision, decisionNote: dto.note, decidedBy: v.userId, decidedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'perf.dispute.decided', 'perf_dispute', id, { decision: dto.decision });
      const to = (await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: x.employeeId }, select: { userId: true } }))?.userId ?? null;
      return { view: await this.record(tx, c.organizationId, next), to, reviewId: x.reviewId };
    });
    this.tell(ctx.organizationId!, [out.to], 'A decision was recorded on your rating dispute', `/yx/performance/reviews/${out.reviewId}/dispute`);
    return out.view;
  }

  /** The evidence pack: a PDF stored through the shared file pipeline, logged with every item's hash. */
  async export(ctx: TenantContext, user: ScopeUser, id: string, dto: DisputeExportDto) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${org}:perf_dispute_export:${id}`}))`;
      const x = await this.handled(tx, c, v, id);
      if (new Set(dto.items).size !== dto.items.length) throw new BadRequestException('Each item is listed once.');
      const all = await this.evidence(tx, org, x);
      const chosen = dto.items.map((i) => all.find((e) => e.id === i));
      if (chosen.some((e) => !e)) throw new BadRequestException('One of the items is not part of this case. Reload it.');
      const signers = await this.userNames(tx, org, await this.handlers(tx, org, x.employeeId));
      if (!signers.has(dto.signatoryUserId)) throw new BadRequestException('Choose a signatory who handles this dispute.');
      const n = (await tx.perfDisputeExport.count({ where: { organizationId: org, disputeId: id } })) + 1;
      const ref = `${x.ref}-EXP-${String(n).padStart(2, '0')}`;
      const company = (await tx.organization.findFirst({ where: { id: org }, select: { name: true } }))?.name ?? '';
      const exporter = (await this.userNames(tx, org, [v.userId])).get(v.userId!) ?? '';
      const r = await tx.review.findFirstOrThrow({ where: { id: x.reviewId }, select: { cycleId: true } });
      const cycle = (await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId }, select: { name: true } })).name;
      const employee = (await this.names(tx, org, [x.employeeId])).get(x.employeeId) ?? '';
      const pdf = await evidencePdf({ ref, caseRef: x.ref, company, employee, cycle, exporter, signatory: signers.get(dto.signatoryUserId)!, at: new Date(), items: chosen as EvidenceItem[] });
      const stored = await this.files.storeIn(tx, c, { area: 'perf-dispute', name: `${ref}.pdf`, data: pdf, allowedMime: ['application/pdf'], maxMb: 20, via: 'system' });
      const hashes = (chosen as EvidenceItem[]).map((e) => ({ id: e.id, kind: e.kind, label: e.label, sha256: e.hash }));
      const row = await tx.perfDisputeExport.create({ data: { organizationId: org, disputeId: id, ref, fileId: stored.id, items: hashes, signatoryUserId: dto.signatoryUserId, exportedBy: v.userId! } });
      await audit(tx, c, 'perf.dispute.exported', 'perf_dispute', id, { ref, exportId: row.id, fileSha256: stored.sha256, items: hashes.map((h) => ({ id: h.id, sha256: h.sha256 })), signatory: dto.signatoryUserId });
      return { exportId: row.id, ref, fileId: stored.id };
    });
    await this.files.scan(ctx.organizationId!, out.fileId).catch(() => undefined);
    return { exportId: out.exportId, ref: out.ref };
  }

  async exportFile(ctx: TenantContext, user: ScopeUser, id: string, exportId: string) {
    const v = await this.viewer(user);
    const row = await this.run(ctx, async (tx, c) => {
      await this.handled(tx, c, v, id);
      const e = await tx.perfDisputeExport.findFirst({ where: { organizationId: c.organizationId, disputeId: id, id: exportId } });
      if (!e) throw new NotFoundException('No such export.');
      const f = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: e.fileId } });
      await audit(tx, c, 'perf.dispute.export_downloaded', 'perf_dispute', id, { exportId, ref: e.ref });
      return f;
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  async attachmentFile(ctx: TenantContext, user: ScopeUser, id: string, fileId: string) {
    const v = await this.viewer(user);
    const row = await this.run(ctx, async (tx, c) => {
      await this.handled(tx, c, v, id);
      if (!(await tx.perfDisputeFile.findFirst({ where: { organizationId: c.organizationId, disputeId: id, fileId } }))) throw new NotFoundException('No such attachment.');
      await audit(tx, c, 'perf.dispute.file_downloaded', 'perf_dispute', id, { fileId });
      return tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }
}

// ------------------------------------------------------------------------------------------ the evidence PDF

const winAnsi = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff\n]/g, (ch) => (ch === '’' || ch === '‘' ? "'" : ch === '“' || ch === '”' ? '"' : ch === '–' || ch === '—' ? '-' : ch === '→' ? '->' : ch === '₹' ? 'Rs.' : ch === '·' ? '-' : '?'));

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsi(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      // A word wider than the line (a hash, a long id) is cut into pieces.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width) {
        let i = w.length;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        if (line) out.push(line);
        out.push(w.slice(0, i));
        line = '';
        w = w.slice(i);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Cover sheet, certificate page, then every item as recorded (plain A4 pages, Latin text). */
export async function evidencePdf(x: { ref: string; caseRef: string; company: string; employee: string; cycle: string; exporter: string; signatory: string; at: Date; items: EvidenceItem[] }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Evidence pack ${x.ref}`);
  pdf.setCreator('YukthiX');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const line = (text: string, o: { size?: number; f?: PDFFont; gap?: number } = {}) => {
    const size = o.size ?? 10;
    for (const l of wrap(text, o.f ?? font, size, 495)) {
      if (y < 60) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      page.drawText(l, { x: 50, y, size, font: o.f ?? font });
      y -= size + 4;
    }
    y -= o.gap ?? 2;
  };
  const newPage = () => {
    page = pdf.addPage([595, 842]);
    y = 790;
  };
  line(`Evidence pack ${x.ref}`, { size: 16, f: bold, gap: 8 });
  line(`Company: ${x.company}`);
  line(`Case: rating dispute ${x.caseRef}, ${x.employee}, ${x.cycle}`);
  line(`Exported on ${x.at.toISOString().replace('T', ' ').slice(0, 19)} UTC by ${x.exporter}`);
  line(`Authorised signatory: ${x.signatory}`, { gap: 10 });
  line('Items and their SHA-256 hashes (as recorded at export)', { size: 12, f: bold, gap: 4 });
  x.items.forEach((e, i) => {
    line(`${i + 1}. ${e.kind}: ${e.label} (recorded ${e.at.slice(0, 10)})`, { f: bold });
    line(`SHA-256 ${e.hash}`, { size: 8, gap: 4 });
  });
  newPage();
  line('Certificate for electronic records', { size: 14, f: bold, gap: 8 });
  line('(Bharatiya Sakshya Adhiniyam, 2023, section 63. The format follows what the company’s counsel confirms before first use.)', { size: 9, gap: 8 });
  line(`I, ${x.signatory}, state that the ${x.items.length} electronic records listed in evidence pack ${x.ref} were produced by the YukthiX system that the company uses in the ordinary course of its activities, that the system was operating properly when they were recorded and produced, and that the SHA-256 hash given for each record identifies it as held at the time of this export.`, { gap: 30 });
  line('Signature: ______________________________', { gap: 10 });
  line(`Name: ${x.signatory}`);
  line('Date and place: ______________________________');
  for (const e of x.items) {
    newPage();
    line(`${e.kind}: ${e.label}`, { size: 12, f: bold, gap: 2 });
    line(`Recorded ${e.at.slice(0, 10)} · SHA-256 ${e.hash}`, { size: 8, gap: 8 });
    line(e.id.startsWith('file:') ? 'The attachment is kept in YukthiX as uploaded; its SHA-256 above identifies the file.' : JSON.stringify(e.content, null, 2), { size: 8 });
  }
  return Buffer.from(await pdf.save());
}

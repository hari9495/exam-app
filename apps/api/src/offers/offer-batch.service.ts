import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, has, type ScopeUser } from '../access/scope';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';
import { OfferBuilderService } from './offer-builder.service';
import { OffersService } from './offers.service';
import { BAND_TEXT, bandPosition, conditionNames, planHolds } from './offer-rules';
import type { OfferBatchDto } from './dto/offer-batch.dto';

// HIR-28 bulk offers: one job, one letter, one salary structure, one joining day and a fixed CTC per candidate. Each row
// becomes an ordinary HIR-09 offer through OfferBuilderService (the pay key, the band check and its extra step, the
// company's route where the sender never approves, conditions, the template's e-sign) and is sent when its route
// approves it at once. Rows run one by one, each in its own transactions: one bad row never blocks or half-sends the
// others, and each row's result is kept on the batch. The batch key makes a retry resume, never send twice.
//   plan check  rows beyond the free places on the job's headcount-plan line are held, not made (company setting
//               hiring.bulk_offer.plan_check, starter 'hold'); a job with no plan line is not checked
//   expiry      a bulk offer expires hiring.offer.expiry_days after today (starter 7), never after the joining day

const PAY_KEY = 'ats.offer.compensation.view';
export const BATCH_MAX = 100;
type RowResult = { entryId: string; name: string; annualCtc: number; status: 'sent' | 'pending_approval' | 'approved' | 'draft' | 'held' | 'skipped' | 'failed'; offerId: string | null; reason: string | null };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (day: string, n: number) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

@Injectable()
export class OfferBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly builder: OfferBuilderService,
    private readonly offers: OffersService,
  ) {}

  private async needPay(user: ScopeUser) {
    if (!has(await buildViewer(this.prisma, this.tenantPrisma, user, [PAY_KEY]), PAY_KEY)) throw new ForbiddenException('Offer pay needs ats.offer.compensation.view. Ask HR to make the offers.');
  }

  /** Free places on the job's plan line: its count less hires and offers in play on every job of the line. */
  private async planFree(tx: Prisma.TransactionClient, org: string, lineId: string | null): Promise<number | null> {
    if (!lineId) return null;
    const line = await tx.headcountPlanLine.findFirst({ where: { organizationId: org, id: lineId }, select: { count: true } });
    if (!line) return null;
    const [{ used }] = await tx.$queryRaw<{ used: bigint }[]>`
      SELECT (SELECT count(*) FROM pipeline_entries e JOIN pipeline_statuses s ON s.id = e.status_id JOIN pipeline_stages st ON st.id = s.stage_id JOIN jobs j ON j.id = e.job_id
               WHERE j.organization_id = ${org}::uuid AND j.headcount_plan_line_id = ${lineId}::uuid AND st.category = 'hired')
           + (SELECT count(*) FROM offers o JOIN pipeline_entries e ON e.id = o.pipeline_entry_id JOIN jobs j ON j.id = e.job_id
               JOIN pipeline_statuses s ON s.id = e.status_id JOIN pipeline_stages st ON st.id = s.stage_id
               WHERE o.organization_id = ${org}::uuid AND j.headcount_plan_line_id = ${lineId}::uuid AND st.category <> 'hired'
                 AND o.status IN ('pending_approval', 'approved', 'sent', 'accepted')) AS used`;
    return Math.max(0, line.count - Number(used));
  }

  /** What the bulk screen needs for a job: the builder's facts plus the candidates who can get an offer now. */
  async setup(ctx: TenantContext, user: ScopeUser, jobId: string) {
    await this.needPay(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const job = await tx.job.findFirst({ where: { organizationId: org, id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('No such job.');
      const today = todayIst();
      const grade = job.gradeId ? await tx.grade.findFirst({ where: { organizationId: org, id: job.gradeId }, select: { name: true, code: true } }) : null;
      const band = await this.builder.band(tx, org, job.gradeId, job.legalEntityId, today);
      const entries = await tx.pipelineEntry.findMany({
        where: { organizationId: org, jobId, rejected: false, archivedAt: null, candidate: { erasedAt: null }, status: { stage: { category: { notIn: ['rejected', 'hired'] } } } },
        include: { candidate: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
        take: BATCH_MAX * 2,
      });
      const open = new Set((await tx.offer.findMany({ where: { organizationId: org, pipelineEntryId: { in: entries.map((e) => e.id) }, status: { in: ['draft', 'pending_approval', 'approved', 'sent', 'accepted'] } }, select: { pipelineEntryId: true } })).map((o) => o.pipelineEntryId));
      const check = await settingFor(tx, c, 'hiring.bulk_offer.plan_check', { legalEntityId: job.legalEntityId ?? '' });
      const free = check === 'hold' ? await this.planFree(tx, org, job.headcountPlanLineId) : null;
      const locations = await tx.location.findMany({ where: { organizationId: org, archivedAt: null, ...(job.legalEntityId ? { legalEntityId: job.legalEntityId } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 });
      const letters = await tx.offerTemplate.findMany({ where: { organizationId: org }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
      return {
        job: { id: job.id, title: job.title, locationId: job.locationId },
        company: (await tx.organization.findUnique({ where: { id: org }, select: { name: true } }))?.name ?? '',
        grade: grade ? grade.code || grade.name : null,
        band: band ? { min: Number(band.min), max: Number(band.max) } : null,
        structures: await this.builder.structuresFor(tx, org, job.legalEntityId, today),
        locations: locations.map((l) => ({ value: l.id, label: l.name })),
        letters: letters.length ? letters.map((t) => ({ value: t.id, label: t.name, esign: t.esign, subject: t.subject, body: t.body })) : [{ value: 'default', label: 'Default offer letter', esign: false, ...DEFAULT_OFFER_TEMPLATE }],
        defaultConditions: conditionNames(await settingFor(tx, c, 'hiring.offer.default_conditions', { legalEntityId: job.legalEntityId ?? '' })),
        expiryDays: Number(await settingFor(tx, c, 'hiring.offer.expiry_days', { legalEntityId: job.legalEntityId ?? '' })),
        plan: { check: check as 'hold' | 'off', linked: Boolean(job.headcountPlanLineId), free },
        route: await this.builder.routePreview(tx, c, job, user.userId ?? null),
        candidates: entries.filter((e) => !open.has(e.id)).slice(0, BATCH_MAX).map((e) => ({ entryId: e.id, name: e.candidate.name, email: e.candidate.email })),
      };
    });
  }

  /**
   * Makes and sends a batch. The same batch key returns the batch as it is (and finishes rows a stopped run left), never a
   * second set of offers. Rows run one at a time; each row's result is saved as soon as it is known.
   */
  async send(ctx: TenantContext, user: ScopeUser, dto: OfferBatchDto) {
    await this.needPay(user);
    const userId = user.userId!;
    if (new Set(dto.rows.map((r) => r.entryId)).size !== dto.rows.length) throw new BadRequestException('A candidate is in the list twice.');
    if (dto.startDate < todayIst()) throw new BadRequestException('The joining day cannot be in the past.');
    const prep = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const job = await tx.job.findFirst({ where: { organizationId: org, id: dto.jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('No such job.');
      const kept = await tx.offerBatch.findFirst({ where: { organizationId: org, batchKey: dto.batchKey } });
      if (kept && kept.jobId !== job.id) throw new ConflictException('This batch key belongs to another job.');
      const entries = await tx.pipelineEntry.findMany({ where: { organizationId: org, id: { in: dto.rows.map((r) => r.entryId) } }, select: { id: true, jobId: true, candidate: { select: { name: true } } } });
      // Another company's (or another job's) application is not found, as everywhere: refused before anything is made.
      const missing = dto.rows.filter((r) => !entries.some((e) => e.id === r.entryId && e.jobId === job.id));
      if (missing.length) throw new NotFoundException(`${missing.length} of these applications are not on this job.`);
      const check = await settingFor(tx, c, 'hiring.bulk_offer.plan_check', { legalEntityId: job.legalEntityId ?? '' });
      const free = kept ? null : check === 'hold' ? await this.planFree(tx, org, job.headcountPlanLineId) : null;
      const days = Number(await settingFor(tx, c, 'hiring.offer.expiry_days', { legalEntityId: job.legalEntityId ?? '' }));
      const expires = [plus(todayIst(), days), dto.startDate].sort()[0]!;
      const band = await this.builder.band(tx, org, job.gradeId, job.legalEntityId, dto.startDate);
      const batch =
        kept ??
        (await tx.offerBatch.create({
          data: {
            organizationId: org, jobId: job.id, batchKey: dto.batchKey, createdBy: userId,
            choices: { templateVersionId: dto.templateVersionId, templateId: dto.templateId ?? null, letterKind: dto.letterKind ?? 'offer', startDate: dto.startDate, expiresAt: expires, locationId: dto.locationId, addConditions: Boolean(dto.addConditions), planCheck: check },
            results: dto.rows.map((r, i): RowResult => {
              const name = entries.find((e) => e.id === r.entryId)!.candidate.name;
              const held = planHolds(i, free);
              return { entryId: r.entryId, name, annualCtc: Number(r.annualCtc), status: held ? 'held' : 'draft', offerId: null, reason: held ? 'No free place on the headcount-plan line. Held until the plan is revised.' : null };
            }) as unknown as Prisma.InputJsonValue,
          },
        }));
      if (!kept) await audit(tx, c, 'ats.offer_batch.started', 'offer_batch', batch.id, { jobId: job.id, rows: dto.rows.length, held: (batch.results as unknown as RowResult[]).filter((r) => r.status === 'held').length, band: band ? 'set' : 'none' });
      return { batch, expires };
    });
    const rows = prep.batch.results as unknown as RowResult[];
    const ch = prep.batch.choices as { templateVersionId: string; templateId: string | null; letterKind: 'offer' | 'loi'; startDate: string; expiresAt: string; locationId: string; addConditions: boolean };
    for (const row of rows) {
      if (row.status === 'held' || row.status === 'sent' || row.status === 'pending_approval' || row.status === 'skipped' || row.status === 'failed') continue;
      try {
        if (!row.offerId) {
          const made = await this.builder.create(ctx, user, { entryId: row.entryId, templateVersionId: ch.templateVersionId, annualCtc: String(row.annualCtc), locationId: ch.locationId, startDate: ch.startDate, expiresAt: `${ch.expiresAt}T23:59:00+05:30`, letterKind: ch.letterKind, ...(ch.templateId ? { templateId: ch.templateId } : {}), addConditions: ch.addConditions }, { batchId: prep.batch.id });
          row.offerId = made.id;
          await this.save(ctx, prep.batch.id, rows);
        }
        const o = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.offer.findFirstOrThrow({ where: { organizationId: c.organizationId, id: row.offerId! }, select: { status: true } }));
        let status = o.status;
        if (status === 'draft') status = (await this.builder.submit(ctx, userId, row.offerId!)).status;
        if (status === 'approved') status = (await this.offers.sendOffer(ctx, userId, row.offerId!)).status;
        row.status = (['sent', 'pending_approval', 'approved'].includes(status) ? status : 'failed') as RowResult['status'];
        row.reason = status === 'approved' ? 'Approved, but the email did not go. Send it from the offer.' : null;
      } catch (e) {
        const msg = (e as Error).message || 'Not made.';
        // An application that got an offer some other way is skipped, never offered twice.
        row.status = !row.offerId && e instanceof ConflictException && /already has an open offer/.test(msg) ? 'skipped' : 'failed';
        row.reason = msg.slice(0, 300);
      }
      await this.save(ctx, prep.batch.id, rows);
    }
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await tx.offerBatch.update({ where: { id: prep.batch.id }, data: { status: 'done', finishedAt: new Date() } });
      if (prep.batch.status !== 'done') await audit(tx, c, 'ats.offer_batch.finished', 'offer_batch', prep.batch.id, Object.fromEntries(['sent', 'pending_approval', 'approved', 'held', 'skipped', 'failed'].map((s) => [s, rows.filter((r) => r.status === s).length])));
    });
    return this.read(ctx, user, prep.batch.id);
  }

  private save(ctx: TenantContext, id: string, rows: RowResult[]) {
    return inCompany(this.tenantPrisma, ctx, (tx) => tx.offerBatch.update({ where: { id }, data: { results: rows as unknown as Prisma.InputJsonValue } }));
  }

  /** The batch with each row's result and its offer's status now; amounts only with the offer-pay key. */
  async read(ctx: TenantContext, user: ScopeUser, id: string) {
    const pay = has(await buildViewer(this.prisma, this.tenantPrisma, user, [PAY_KEY]), PAY_KEY);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const b = await tx.offerBatch.findFirst({ where: { organizationId: org, id } });
      if (!b) throw new NotFoundException('No such batch.');
      const job = await tx.job.findFirst({ where: { organizationId: org, id: b.jobId }, select: { title: true, gradeId: true, legalEntityId: true } });
      const rows = b.results as unknown as RowResult[];
      const offers = await tx.offer.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.offerId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true, esign: true } });
      const ch = b.choices as { startDate: string; expiresAt: string; letterKind: string };
      const band = job ? await this.builder.band(tx, org, job.gradeId, job.legalEntityId, ch.startDate) : null;
      return {
        id: b.id,
        status: b.status,
        job: { id: b.jobId, title: job?.title ?? '' },
        createdAt: b.createdAt,
        startDate: ch.startDate,
        expiresAt: ch.expiresAt,
        canSeePay: pay,
        rows: rows.map((r) => {
          const o = offers.find((x) => x.id === r.offerId);
          return { ...r, annualCtc: pay ? r.annualCtc : null, offerStatus: o?.status ?? null, esign: Boolean(o?.esign), band: pay ? BAND_TEXT[bandPosition(r.annualCtc, band)] : null };
        }),
      };
    });
  }
}

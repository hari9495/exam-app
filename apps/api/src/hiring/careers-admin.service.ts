import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany, type Tx } from '../org-structure/org-structure.service';
import type { CareersEntityDto, ConsentNoticeDto, RecruitingCostDto } from './hiring-dto';

// Recruitment batch AT3 (M10-BUILD-DESIGN §6, §13): the staff side of the careers site. Consent text is versioned:
// publishing makes a new version and never edits an old one, so every candidate's consent points at the exact words
// they accepted. Each legal entity can have its own careers page (slug, headline, intro, colour).
@Injectable()
export class CareersAdminService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  notices(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) =>
      tx.consentNotice.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ purpose: 'asc' }, { version: 'desc' }] }),
    );
  }

  publishNotice(ctx: TenantContext, dto: ConsentNoticeDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const last = await tx.consentNotice.findFirst({ where: { organizationId: c.organizationId, purpose: dto.purpose }, orderBy: { version: 'desc' }, select: { version: true } });
      const notice = await tx.consentNotice.create({
        data: { organizationId: c.organizationId, purpose: dto.purpose, version: (last?.version ?? 0) + 1, text: dto.text, publishedBy: c.userId ?? null },
      });
      // Walk-in and one-click re-apply still read the company's consent text; keep it the same words and version.
      if (dto.purpose === 'application') {
        await tx.organization.update({ where: { id: c.organizationId }, data: { applyConsentText: dto.text, applyConsentVersion: notice.version } });
      }
      await audit(tx, c, 'ats.consent_notice.published', 'consent_notice', notice.id, { purpose: notice.purpose, version: notice.version });
      return notice;
    });
  }

  entities(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => ({
      entities: await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      pages: await tx.careersEntityPage.findMany({ where: { organizationId: c.organizationId } }),
    }));
  }

  saveEntity(ctx: TenantContext, legalEntityId: string, dto: CareersEntityDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entity = await tx.legalEntity.findFirst({ where: { id: legalEntityId, organizationId: c.organizationId }, select: { id: true } });
      if (!entity) throw new NotFoundException('That company is not in your organisation.');
      const data = { slug: dto.slug, headline: dto.headline || null, intro: dto.intro || null, primaryColor: dto.primaryColor || null };
      const page = await tx.careersEntityPage.upsert({
        where: { organizationId_legalEntityId: { organizationId: c.organizationId, legalEntityId } },
        create: { organizationId: c.organizationId, legalEntityId, ...data },
        update: data,
      });
      await audit(tx, c, 'ats.careers_page.saved', 'careers_entity_page', page.id, { slug: page.slug });
      return page;
    });
  }

  removeEntity(ctx: TenantContext, legalEntityId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { count } = await tx.careersEntityPage.deleteMany({ where: { organizationId: c.organizationId, legalEntityId } });
      if (count) await audit(tx, c, 'ats.careers_page.removed', 'legal_entity', legalEntityId);
      return { removed: count > 0 };
    });
  }

  /**
   * HIR-11 recruiting costs (M10 §6): one line per cost, in rupees (Decimal 14,2, sent back as a number). Who entered it
   * and the job are joined for the list. Rows the system posts (payroll referral bonus, assessment cost) are read-only.
   */
  costs(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.recruitingCost.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }], take: 500 });
      const jobIds = [...new Set(rows.map((r) => r.jobId).filter((x): x is string => !!x))];
      const userIds = [...new Set(rows.map((r) => r.enteredBy).filter((x): x is string => !!x))];
      const jobs = new Map((await tx.job.findMany({ where: { organizationId: c.organizationId, id: { in: jobIds } }, select: { id: true, title: true } })).map((j) => [j.id, j.title]));
      const users = new Map((await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      return rows.map((r) => ({ ...r, amount: Number(r.amount), jobTitle: r.jobId ? jobs.get(r.jobId) ?? null : null, enteredByName: r.enteredBy ? users.get(r.enteredBy) ?? null : null }));
    });
  }

  /** HIR-11 tiles: this quarter in India time (Indian FY quarters line up with calendar ones), its hires, and the jobs to pick. */
  costsOverview(ctx: TenantContext, now = new Date()) {
    const { from, to } = quarterIst(now);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => ({
      from,
      to,
      // A hire = an application that entered a "hired" stage in the quarter and was not rejected (same rule as Hiring home).
      hires: await tx.pipelineEntry.count({ where: { organizationId: c.organizationId, rejected: false, stageEnteredAt: { gte: new Date(`${from}T00:00:00+05:30`), lt: new Date(`${nextDay(to)}T00:00:00+05:30`) }, status: { stage: { category: 'hired' } } } }),
      jobs: await tx.job.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 500, select: { id: true, title: true } }),
    }));
  }

  addCost(ctx: TenantContext, dto: RecruitingCostDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const data = await this.costData(tx, c.organizationId, dto, null);
      const cost = await tx.recruitingCost.create({ data: { organizationId: c.organizationId, ...data, enteredBy: c.userId ?? null } });
      await audit(tx, c, 'ats.cost.added', 'recruiting_cost', cost.id, { type: cost.costType, amount: dto.amount });
      return { ...cost, amount: Number(cost.amount) };
    });
  }

  updateCost(ctx: TenantContext, id: string, dto: RecruitingCostDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const before = await this.manualCost(tx, c.organizationId, id);
      const data = await this.costData(tx, c.organizationId, dto, before.period);
      const cost = await tx.recruitingCost.update({ where: { id }, data });
      await audit(tx, c, 'ats.cost.changed', 'recruiting_cost', id, { before: { ...pick(before), amount: Number(before.amount) }, after: { ...pick(data), amount: dto.amount } });
      return { ...cost, amount: Number(cost.amount) };
    });
  }

  removeCost(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const before = await this.manualCost(tx, c.organizationId, id);
      await tx.recruitingCost.delete({ where: { id } });
      await audit(tx, c, 'ats.cost.removed', 'recruiting_cost', id, { ...pick(before), amount: Number(before.amount) });
      return { removed: true };
    });
  }

  private async manualCost(tx: Tx, org: string, id: string) {
    const row = await tx.recruitingCost.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException('That cost is not in your company.');
    if (row.origin !== 'manual') throw new ConflictException('This cost was posted automatically. Change it where it came from.');
    return row;
  }

  /** `kept`: the row's month before an edit, which may stay as it is even when it is outside this quarter. */
  private async costData(tx: Tx, org: string, dto: RecruitingCostDto, kept: Date | null) {
    // Founder answer 206: a cost is for a month of the current quarter (India time).
    if (dto.period) {
      const q = quarterIst(new Date());
      const month = dto.period.slice(0, 7);
      const keptMonth = kept ? kept.toISOString().slice(0, 7) : null;
      if (month !== keptMonth && (month < q.from.slice(0, 7) || month > q.to.slice(0, 7))) throw new BadRequestException('Choose a month of this quarter.');
    }
    const board = dto.jobBoardId ? await tx.jobBoard.findFirst({ where: { id: dto.jobBoardId, organizationId: org }, select: { name: true } }) : null;
    if (dto.jobBoardId && !board) throw new NotFoundException('That job board is not in your organisation.');
    if (dto.jobId && !(await tx.job.findFirst({ where: { id: dto.jobId, organizationId: org }, select: { id: true } }))) throw new NotFoundException('That job is not in your organisation.');
    const source = board?.name ?? dto.source?.trim();
    if (!source) throw new BadRequestException('Say where the money went, for example Naukri.');
    return {
      jobId: dto.jobId ?? null,
      jobBoardId: dto.jobBoardId ?? null,
      source,
      costType: dto.costType ?? (dto.jobBoardId ? 'posting' : 'other'), // 'posting' = a board's cost (shown as Job board)
      amount: dto.amount,
      currency: dto.currency,
      period: dto.period ? new Date(dto.period) : null,
      note: dto.note || null,
    };
  }
}

const pick = (r: { source: string; costType: string; jobId: string | null; period: Date | null }) => ({ source: r.source, costType: r.costType, jobId: r.jobId, period: r.period });

const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The calendar quarter holding `now` in India time, as ISO dates (first and last day). */
export function quarterIst(now: Date): { from: string; to: string } {
  const [y, m] = istDay(now).split('-').map(Number) as [number, number];
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  const end = new Date(Date.UTC(y, q + 2, 0)).toISOString().slice(0, 10);
  return { from: `${y}-${String(q).padStart(2, '0')}-01`, to: end };
}

import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { platformRead, PLATFORM } from '../platform/platform.service';
import { audit, type DeskActor } from './desk-access';
import { KbService, PLATFORM_HELP_SPACE } from './kb.service';
import type { HelpArticleDto, HelpReviewDto, HelpSaveDto, HelpSettingsDto } from './help-centre.dto';

type Tx = Prisma.TransactionClient;

/** YX-11: the no-result search list (counts only) shows a term only once this many companies searched it, over these days. */
export const HELP_SETTINGS = {
  'helpcentre.gaps_min_companies': { label: 'Show a no-result search once this many companies searched it', default: 5, min: 5, max: 100 },
  'helpcentre.gaps_days': { label: 'No-result searches over the last (days)', default: 30, min: 7, max: 180 },
} as const;
type HelpKey = keyof typeof HELP_SETTINGS;

/** What staff act with in the YukthiX company's knowledge base: write, and publish what someone else wrote. */
const KB_KEYS = new Set(['desk.kb.view_internal', 'desk.kb.author', 'desk.kb.publish']);

/**
 * YukthiX console C-8, YX-11 (answer 1057): the help-centre editor. YukthiX staff write help articles every company
 * sees in Help › This page. They are ordinary knowledge-base articles of the platform company, in its public "YukthiX
 * help" space, written through the existing editor's rules: the H-1 pages link, and one person writes while a different
 * person publishes (four eyes). Staff act as the platform-company user linked to them (sd_console_agents, the same link
 * the YukthiX Support desk uses). The searches with no result across companies are counts only, and only for terms
 * that at least `helpcentre.gaps_min_companies` companies searched; never a company or a person.
 */
@Injectable()
export class HelpCentreService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly kb: KbService,
  ) {}

  /** The staff member as their linked platform-company user, allowed to write and publish help articles. */
  private async actor(staffUserId: string): Promise<DeskActor & { spaceId: string }> {
    const org = await this.kb.platformOrg();
    if (!org) throw new ServiceUnavailableException('The YukthiX company is not set up here.');
    const ctx = { organizationId: org, isSuperAdmin: false };
    const link = await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdConsoleAgent.findFirst({ where: { organizationId: org, staffUserId } }));
    if (!link) throw new ForbiddenException('You are not linked to the YukthiX company yet. Ask the support lead to add you.');
    const a: DeskActor = { ctx: { ...ctx, userId: link.userId }, userId: link.userId, keys: KB_KEYS, roles: new Map(), accounts: null };
    const spaceId = await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const found = await tx.sdKbSpace.findFirst({ where: { organizationId: org, slug: PLATFORM_HELP_SPACE }, select: { id: true } });
      if (found) return found.id;
      const s = await tx.sdKbSpace.create({ data: { organizationId: org, slug: PLATFORM_HELP_SPACE, name: 'YukthiX help', audience: 'public', languages: ['en'], createdBy: link.userId } });
      await audit(tx, a, 'desk.kb.space_created', 'sd_kb_space', s.id, { slug: s.slug, audience: s.audience, by: 'console' });
      return s.id;
    });
    return Object.assign(a, { spaceId });
  }

  private async settings(tx: Tx) {
    const rows = await tx.platformSetting.findMany({ where: { key: { in: Object.keys(HELP_SETTINGS) } } });
    const out = {} as Record<HelpKey, number>;
    for (const k of Object.keys(HELP_SETTINGS) as HelpKey[]) {
      const v = Number(rows.find((r) => r.key === k)?.value);
      out[k] = Number.isInteger(v) ? v : HELP_SETTINGS[k].default;
    }
    return out;
  }

  /** The articles, and the searches with no result across companies (counts only, audited cross-company read). */
  async overview(staffUserId: string) {
    const a = await this.actor(staffUserId);
    const listed = await this.kb.list(a, { spaceId: a.spaceId });
    const extra = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdKbArticle.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: listed.map((r) => r.id) } }, select: { id: true, pages: true, publishedAt: true } }));
    const byId = new Map(extra.map((r) => [r.id, r]));
    const articles = listed.map((r) => ({ id: r.id, number: r.number, title: r.title, state: r.state, waitingReview: r.waitingReview, pages: byId.get(r.id)?.pages ?? [], publishedAt: byId.get(r.id)?.publishedAt ?? null, updatedAt: r.updatedAt }));
    const { s, gaps } = await platformRead(this.tenantPrisma, staffUserId, 'helpcentre.no_result_searches', async (tx) => {
      const s = await this.settings(tx);
      const gaps = await tx.$queryRaw<{ query: string; companies: number; times: number }[]>`
        SELECT lower(query) AS query, count(DISTINCT organization_id)::int AS companies, count(*)::int AS times FROM sd_kb_events
        WHERE kind = 'search' AND results = 0 AND query IS NOT NULL AND created_at >= now() - make_interval(days => ${s['helpcentre.gaps_days']}::int)
        GROUP BY lower(query) HAVING count(DISTINCT organization_id) >= ${s['helpcentre.gaps_min_companies']}::int
        ORDER BY companies DESC, times DESC LIMIT 50`;
      return { s, gaps };
    });
    return {
      articles,
      gaps,
      settings: (Object.keys(HELP_SETTINGS) as HelpKey[]).map((key) => ({ key, label: HELP_SETTINGS[key].label, value: s[key], default: HELP_SETTINGS[key].default, min: HELP_SETTINGS[key].min, max: HELP_SETTINGS[key].max })),
    };
  }

  async get(staffUserId: string, id: string) {
    const a = await this.actor(staffUserId);
    return this.kb.get(a, id);
  }

  /** A new article in the YukthiX help space, with the pages it explains. */
  async create(staffUserId: string, dto: HelpArticleDto) {
    const a = await this.actor(staffUserId);
    const made = await this.kb.create(a, { spaceId: a.spaceId, title: dto.title, summary: dto.summary, bodyHtml: dto.bodyHtml });
    const art = await this.kb.get(a, made.id);
    await this.kb.updateMeta(a, made.id, { version: art.version, pages: dto.pages });
    return this.kb.get(a, made.id);
  }

  /** Saves the words as the working draft and the pages it explains. */
  async save(staffUserId: string, id: string, dto: HelpSaveDto) {
    const a = await this.actor(staffUserId);
    await this.kb.saveDraft(a, id, { title: dto.title, summary: dto.summary, bodyHtml: dto.bodyHtml, version: dto.draftVersion });
    const art = await this.kb.get(a, id);
    await this.kb.updateMeta(a, id, { version: art.version, pages: dto.pages });
    return this.kb.get(a, id);
  }

  async submit(staffUserId: string, id: string, version: number) {
    const a = await this.actor(staffUserId);
    await this.kb.submit(a, id, version);
    return this.kb.get(a, id);
  }

  /** Publish (or send back) a version someone else wrote; never one's own (the editor's four-eyes rule). */
  async review(staffUserId: string, id: string, dto: HelpReviewDto) {
    if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('Say what to change before sending it back.');
    const a = await this.actor(staffUserId);
    await this.kb.review(a, id, { version: dto.version, approve: dto.approve, note: dto.note });
    return this.kb.get(a, id);
  }

  async saveSettings(staffUserId: string, dto: HelpSettingsDto) {
    for (const [k, v] of Object.entries(dto.values)) {
      const def = HELP_SETTINGS[k as HelpKey];
      if (!def) throw new BadRequestException(`Unknown setting: ${k}.`);
      if (!Number.isInteger(v) || v < def.min || v > def.max) throw new BadRequestException(`${def.label}: give a whole number from ${def.min} to ${def.max}.`);
    }
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const before = await this.settings(tx);
      for (const [key, v] of Object.entries(dto.values)) await tx.platformSetting.upsert({ where: { key }, create: { key, value: String(v), updatedBy: staffUserId }, update: { value: String(v), updatedBy: staffUserId } });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId: staffUserId, action: 'platform.helpcentre.settings_changed', entityType: 'platform_setting', metadata: { before, after: await this.settings(tx) } });
    });
    return this.overview(staffUserId);
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantPrismaService, isOrganizationActive } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { addDays, todayIst } from '../org-structure/org-validation';
import { DeskActor, activeOn, audit, deskSystem, emit, has, isAgentOn, requireWork } from './desk-access';
import { ArticleDto, ArticleMetaDto, BlockDto, CategoryDto, DraftDto, KbFeedbackDto, KbListQueryDto, KbSpaceDto, ReviewDto, TemplateDto } from './dto-kb';
import { maskPii } from './pii';
import { KbSource, countKb, forAcknowledgement, portalFor, prefixQuery, readerUrl, searchIn } from './kb-search';

export { prefixQuery, type KbSource };
import { PortalSession } from './portal.service';
import { Requester } from './requester.service';
import { cleanHtml, htmlToText, textToHtml } from './rich-text';
import { Ticket, TicketsService } from './tickets.service';

// SD-1.24 / SD-1.25 knowledge (US-B-104 … US-B-107, US-G-023 … US-G-025, US-G-215 … US-G-217, US-G-222).
// Spaces have an audience: agents (internal), requesters (the people who raise to the space's desk; with no desk, the
// company's employees) or public (anyone, on the public help centre /yx/help/<company>/<space>). Every edit is a new
// version; a version is published only after someone other than its author approves it (four eyes, also a database
// check). Readers outside the desk read with app.kb_reader set (or as a portal session), so the database itself keeps
// them to published requester / public articles. Searches and views are counted without any user id (YX-GRO-07).

export const KB_LANGUAGES = ['en', 'hi', 'ta', 'te'] as const;
const REVIEW_MONTHS = 12; // YX-GRO-07: an article not reviewed for 12 months is flagged.
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
type Space = Prisma.SdKbSpaceGetPayload<object>;
type Article = Prisma.SdKbArticleGetPayload<object>;


/** A web address part from a title; titles in other scripts fall back to the article number. */
export function slugify(title: string, number: number): string {
  const s = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
  return s.length >= 3 ? s : `article-${number}`;
}

/** {{block:key}} shows the block's current text (US-G-025). Unknown keys disappear. */
export function renderBlocks(html: string, blocks: ReadonlyMap<string, string>): string {
  return html.replace(/\{\{\s*block:([a-z0-9-]{2,40})\s*\}\}/g, (_m, key: string) => blocks.get(key) ?? '');
}

/** A health score 0–100 from use, feedback and flags (US-G-023). */
export function healthScore(x: { views: number; solved: number; yes: number; no: number; outdated: boolean; reviewOverdue: boolean }): number {
  const votes = x.yes + x.no;
  const ratio = votes ? x.yes / votes : 0.5;
  const score = 50 + Math.min(20, x.solved * 4) + Math.min(10, Math.floor(x.views / 20)) + (ratio - 0.5) * 40 - (x.outdated ? 30 : 0) - (x.reviewOverdue ? 15 : 0);
  return Math.max(0, Math.min(100, Math.round(score)));
}

interface ReaderScope {
  org: string;
  /** Spaces this reader may search. */
  spaceIds: string[];
  source: KbSource;
  personId: string | null;
}

@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly tickets: TicketsService,
  ) {}

  /** The ticket as this agent sees it (404 when they do not). */
  private async ticketOf(tx: Tx, a: DeskActor, id: string): Promise<Ticket> {
    const { t, access } = await this.tickets.load(tx, a, id);
    if (access !== 'agent') throw new ForbiddenException('Only an agent of this desk does that.');
    return t;
  }

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ who may do what

  /** Staff reach a space of a desk they hold a seat on, or a company-wide space. The Service Desk admin reaches all. */
  private reaches(a: DeskActor, s: Space) {
    return !s.deskId || a.roles.has(s.deskId) || has(a, 'desk.desk.create');
  }
  private canRead(a: DeskActor, s: Space) {
    return this.reaches(a, s) && (has(a, 'desk.kb.view_internal') || has(a, 'desk.kb.author') || has(a, 'desk.kb.publish'));
  }
  private canAuthor(a: DeskActor, s: Space) {
    return this.reaches(a, s) && has(a, 'desk.kb.author') && (!s.deskId || a.roles.get(s.deskId) !== 'collaborator');
  }
  private canPublish(a: DeskActor, s: Space) {
    return this.reaches(a, s) && has(a, 'desk.kb.publish');
  }
  /** Spaces are set up by the desk's admin (desk.settings.manage) or the Service Desk admin (company-wide too). */
  private canManageSpace(a: DeskActor, deskId: string | null) {
    if (has(a, 'desk.desk.create')) return true;
    return Boolean(deskId) && has(a, 'desk.settings.manage') && a.roles.get(deskId!) === 'admin';
  }

  private async space(tx: Tx, org: string, id: string): Promise<Space> {
    const s = await tx.sdKbSpace.findFirst({ where: { organizationId: org, id } });
    if (!s) throw new NotFoundException('No such knowledge space.');
    return s;
  }

  private async article(tx: Tx, a: DeskActor, id: string, need: 'read' | 'author' | 'publish' = 'read'): Promise<{ art: Article; space: Space }> {
    const art = await tx.sdKbArticle.findFirst({ where: { organizationId: a.ctx.organizationId, id, deletedAt: null } });
    const space = art ? await this.space(tx, a.ctx.organizationId, art.spaceId) : null;
    if (!art || !space || !this.canRead(a, space)) throw new NotFoundException('No such article.');
    if (need === 'author' && !this.canAuthor(a, space)) throw new ForbiddenException('You cannot write articles in this space (desk.kb.author).');
    if (need === 'publish' && !this.canPublish(a, space)) throw new ForbiddenException('You cannot publish articles in this space (desk.kb.publish).');
    return { art, space };
  }

  // ------------------------------------------------------------------------------------------ spaces and categories (US-G-217)

  async spaces(a: DeskActor) {
    return this.tx(a, async (tx) => {
      const rows = await tx.sdKbSpace.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { name: 'asc' } });
      const cats = await tx.sdKbCategory.findMany({ where: { organizationId: a.ctx.organizationId, spaceId: { in: rows.map((r) => r.id) } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      const o = await tx.organization.findUnique({ where: { id: a.ctx.organizationId }, select: { slug: true } });
      return rows
        .filter((s) => this.canRead(a, s) || this.canManageSpace(a, s.deskId))
        .map((s) => ({
          ...this.spaceView(s),
          publicUrl: s.audience === 'public' ? `${webOrigin()}/yx/help/${o?.slug}/${s.slug}` : null,
          canAuthor: this.canAuthor(a, s),
          canPublish: this.canPublish(a, s),
          canManage: this.canManageSpace(a, s.deskId),
          categories: cats.filter((c) => c.spaceId === s.id).map((c) => ({ id: c.id, parentId: c.parentId, name: c.name, sortOrder: c.sortOrder })),
        }));
    });
  }

  private spaceView(s: Space) {
    return { id: s.id, deskId: s.deskId, slug: s.slug, name: s.name, audience: s.audience, languages: s.languages, status: s.status, version: s.version };
  }

  async saveSpace(a: DeskActor, id: string | null, dto: KbSpaceDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const cur = id ? await this.space(tx, org, id) : null;
      const deskId = cur ? cur.deskId : (dto.deskId ?? null);
      if (!this.canManageSpace(a, deskId)) throw new ForbiddenException('Desk admins set up the knowledge spaces of their desk; the Service Desk admin sets up company-wide ones.');
      if (deskId && !(await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active desk.');
      const languages = [...new Set(['en', ...(dto.languages ?? cur?.languages ?? ['en'])])];
      const data = { name: dto.name, slug: dto.slug, audience: dto.audience, languages, ...(dto.status ? { status: dto.status } : {}) };
      try {
        if (cur) {
          if (dto.version !== undefined && dto.version !== cur.version) throw new ConflictException({ statusCode: 409, code: 'KB_SPACE_CHANGED', message: 'Someone changed this space. Reload to see the latest.' });
          await tx.sdKbSpace.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 } } });
        }
        const row = cur ?? (await tx.sdKbSpace.create({ data: { organizationId: org, deskId, ...data, createdBy: a.userId } }));
        await audit(tx, a, cur ? 'desk.kb.space_updated' : 'desk.kb.space_created', 'sd_kb_space', row.id, { ...data, deskId });
        return { id: row.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another space uses that web address.');
        throw e;
      }
    });
  }

  async saveCategory(a: DeskActor, spaceId: string, id: string | null, dto: CategoryDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const s = await this.space(tx, org, spaceId);
      if (!this.canPublish(a, s) && !this.canManageSpace(a, s.deskId)) throw new ForbiddenException('You cannot arrange this space.');
      if (dto.parentId) {
        const parent = await tx.sdKbCategory.findFirst({ where: { organizationId: org, spaceId, id: dto.parentId } });
        if (!parent || parent.id === id) throw new BadRequestException('Choose a category of this space.');
        // Categories, sections and sub-sections: three levels at most.
        const grand = parent.parentId ? await tx.sdKbCategory.findFirst({ where: { organizationId: org, id: parent.parentId }, select: { parentId: true } }) : null;
        if (grand?.parentId) throw new BadRequestException('Categories go three levels deep at most.');
      }
      // A rename keeps the place in the tree unless a new parent or order is given.
      const data = id ? { name: dto.name, ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}), ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}) } : { name: dto.name, parentId: dto.parentId ?? null, sortOrder: dto.sortOrder ?? 0 };
      const row = id
        ? (await tx.sdKbCategory.updateMany({ where: { organizationId: org, spaceId, id }, data })).count
          ? { id }
          : null
        : await tx.sdKbCategory.create({ data: { organizationId: org, spaceId, ...data, createdBy: a.userId } });
      if (!row) throw new NotFoundException('No such category.');
      await audit(tx, a, id ? 'desk.kb.category_updated' : 'desk.kb.category_created', 'sd_kb_category', row.id, { spaceId, ...data });
      return { id: row.id };
    });
  }

  /** Drag to reorder: the new order of one level. */
  async reorderCategories(a: DeskActor, spaceId: string, ids: string[]) {
    return this.tx(a, async (tx) => {
      const s = await this.space(tx, a.ctx.organizationId, spaceId);
      if (!this.canPublish(a, s) && !this.canManageSpace(a, s.deskId)) throw new ForbiddenException('You cannot arrange this space.');
      for (const [i, id] of ids.entries()) await tx.sdKbCategory.updateMany({ where: { organizationId: a.ctx.organizationId, spaceId, id }, data: { sortOrder: i } });
      await audit(tx, a, 'desk.kb.categories_reordered', 'sd_kb_space', spaceId, { ids });
      return { ok: true };
    });
  }

  async deleteCategory(a: DeskActor, spaceId: string, id: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const s = await this.space(tx, org, spaceId);
      if (!this.canPublish(a, s) && !this.canManageSpace(a, s.deskId)) throw new ForbiddenException('You cannot arrange this space.');
      const used = (await tx.sdKbCategory.count({ where: { organizationId: org, parentId: id } })) + (await tx.sdKbArticle.count({ where: { organizationId: org, categoryId: id } }));
      if (used) throw new ConflictException('Move its articles and sections first.');
      const n = await tx.sdKbCategory.deleteMany({ where: { organizationId: org, spaceId, id } });
      if (!n.count) throw new NotFoundException('No such category.');
      await audit(tx, a, 'desk.kb.category_deleted', 'sd_kb_category', id, { spaceId });
      return { deleted: true };
    });
  }

  // ------------------------------------------------------------------------------------------ articles (staff)

  async list(a: DeskActor, q: KbListQueryDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const spaces = (await tx.sdKbSpace.findMany({ where: { organizationId: org, ...(q.spaceId ? { id: q.spaceId } : {}) } })).filter((s) => this.canRead(a, s));
      const ids = spaces.map((s) => s.id);
      let rows: Article[];
      const tsq = q.search ? prefixQuery(q.search) : null;
      if (tsq) {
        const hits = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM sd_kb_articles WHERE organization_id = ${org}::uuid AND space_id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
            AND (search @@ to_tsquery('simple', ${tsq}) OR title ILIKE ${'%' + q.search!.replace(/[%_\\]/g, '\\$&') + '%'})
            AND (${q.state ?? null}::text IS NULL OR state = ${q.state ?? null}) AND (${q.language ?? null}::text IS NULL OR language = ${q.language ?? null})
            AND (NOT ${Boolean(q.outdated)} OR outdated)
          ORDER BY ts_rank(search, to_tsquery('simple', ${tsq})) DESC LIMIT 200`;
        rows = await tx.sdKbArticle.findMany({ where: { organizationId: org, id: { in: hits.map((h) => h.id) } } });
        const order = new Map(hits.map((h, i) => [h.id, i]));
        rows.sort((x, y) => order.get(x.id)! - order.get(y.id)!);
      } else {
        rows = await tx.sdKbArticle.findMany({
          where: { organizationId: org, spaceId: { in: ids }, deletedAt: null, ...(q.state ? { state: q.state } : {}), ...(q.outdated ? { outdated: true } : {}), ...(q.language ? { language: q.language } : {}) },
          orderBy: { updatedAt: 'desc' },
          take: 300,
        });
      }
      const pending = await tx.sdKbArticleVersion.findMany({ where: { organizationId: org, articleId: { in: rows.map((r) => r.id) }, submittedAt: { not: null }, reviewedAt: null }, select: { articleId: true } });
      const waiting = new Set(pending.map((p) => p.articleId));
      const stats = await this.stats(tx, org, rows.map((r) => r.id));
      const users = await this.userNames(tx, org, rows.map((r) => r.ownerUserId));
      const today = todayIst();
      return rows.map((r) => ({
        id: r.id,
        number: r.number,
        spaceId: r.spaceId,
        categoryId: r.categoryId,
        title: r.title,
        language: r.language,
        translationOfId: r.translationOfId,
        state: r.state,
        audience: r.audience,
        featured: r.featured,
        outdated: r.outdated,
        waitingReview: waiting.has(r.id),
        owner: r.ownerUserId ? (users.get(r.ownerUserId) ?? null) : null,
        reviewDueOn: r.reviewDueOn,
        reviewOverdue: Boolean(r.reviewDueOn && r.reviewDueOn.toISOString().slice(0, 10) < today),
        health: healthScore({ ...(stats.get(r.id) ?? { views: 0, solved: 0, yes: 0, no: 0 }), outdated: r.outdated, reviewOverdue: Boolean(r.reviewDueOn && r.reviewDueOn.toISOString().slice(0, 10) < today) }),
        updatedAt: r.updatedAt,
      }));
    });
  }

  /** Views (90 days), "solved it" and feedback per article, for the health score. */
  private async stats(tx: Tx, org: string, ids: string[]) {
    if (!ids.length) return new Map<string, { views: number; solved: number; yes: number; no: number }>();
    const rows = await tx.$queryRaw<{ id: string; views: number; solved: number; yes: number; no: number }[]>`
      SELECT a.id,
        (SELECT count(*)::int FROM sd_kb_events e WHERE e.organization_id = a.organization_id AND e.article_id = a.id AND e.kind = 'view' AND e.created_at > now() - interval '90 days') AS views,
        ((SELECT count(*)::int FROM sd_kb_links l WHERE l.organization_id = a.organization_id AND l.article_id = a.id AND l.kind = 'solved')
          + (SELECT count(*)::int FROM sd_kb_events e WHERE e.organization_id = a.organization_id AND e.article_id = a.id AND e.kind = 'solved')) AS solved,
        (SELECT count(*)::int FROM sd_kb_feedback f WHERE f.organization_id = a.organization_id AND f.article_id = a.id AND f.helpful) AS yes,
        (SELECT count(*)::int FROM sd_kb_feedback f WHERE f.organization_id = a.organization_id AND f.article_id = a.id AND NOT f.helpful) AS no
      FROM sd_kb_articles a WHERE a.organization_id = ${org}::uuid AND a.id = ANY(${ids}::uuid[])`;
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async userNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(rows.map((u) => [u.id, u.name?.trim() || u.email]));
  }

  async get(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { art, space } = await this.article(tx, a, id);
      const versions = await tx.sdKbArticleVersion.findMany({ where: { organizationId: org, articleId: art.id }, orderBy: { version: 'desc' }, take: 50 });
      const users = await this.userNames(tx, org, [art.ownerUserId, ...versions.flatMap((v) => [v.authorUserId, v.reviewedBy])]);
      const translations = await tx.sdKbArticle.findMany({ where: { organizationId: org, deletedAt: null, OR: [{ translationOfId: art.translationOfId ?? art.id }, { id: art.translationOfId ?? art.id }] }, select: { id: true, language: true, state: true, number: true } });
      const source = art.sourceTicketId ? await tx.sdTicket.findFirst({ where: { organizationId: org, id: art.sourceTicketId }, select: { id: true, number: true } }) : null;
      const stats = (await this.stats(tx, org, [art.id])).get(art.id) ?? { views: 0, solved: 0, yes: 0, no: 0 };
      const following = Boolean(await tx.sdKbFollow.findFirst({ where: { organizationId: org, articleId: art.id, userId: a.userId } }));
      const blocks = await this.blocks(tx, org);
      const o = await tx.organization.findUnique({ where: { id: org }, select: { slug: true } });
      const reviewOverdue = Boolean(art.reviewDueOn && art.reviewDueOn.toISOString().slice(0, 10) < todayIst());
      return {
        ...this.articleView(art),
        space: this.spaceView(space),
        publicUrl: art.audience === 'public' && art.state === 'published' ? `${webOrigin()}/yx/help/${o?.slug}/${space.slug}/${art.slug}` : null,
        renderedHtml: renderBlocks(art.bodyHtml, blocks),
        owner: art.ownerUserId ? { id: art.ownerUserId, name: users.get(art.ownerUserId) ?? '' } : null,
        // US-B-106: the source ticket shows to agents only (the article's own readers never see it).
        sourceTicket: source,
        stats,
        health: healthScore({ ...stats, outdated: art.outdated, reviewOverdue }),
        reviewOverdue,
        following,
        translations: translations.filter((t) => t.id !== art.id),
        versions: versions.map((v) => ({
          version: v.version,
          title: v.title,
          summary: v.summary,
          bodyHtml: v.bodyHtml,
          note: v.note,
          author: users.get(v.authorUserId) ?? '',
          mine: v.authorUserId === a.userId,
          submittedAt: v.submittedAt,
          reviewedBy: v.reviewedBy ? (users.get(v.reviewedBy) ?? '') : null,
          reviewedAt: v.reviewedAt,
          reviewNote: v.reviewNote,
          publishedAt: v.publishedAt,
          createdAt: v.createdAt,
          state: v.publishedAt ? 'published' : v.reviewedAt ? (v.submittedAt ? 'approved' : 'sent_back') : v.submittedAt ? 'in_review' : 'draft',
        })),
        canAuthor: this.canAuthor(a, space),
        canPublish: this.canPublish(a, space),
      };
    });
  }

  private articleView(r: Article) {
    return {
      id: r.id,
      number: r.number,
      spaceId: r.spaceId,
      categoryId: r.categoryId,
      slug: r.slug,
      language: r.language,
      translationOfId: r.translationOfId,
      audience: r.audience,
      state: r.state,
      title: r.title,
      summary: r.summary,
      bodyHtml: r.bodyHtml,
      seoTitle: r.seoTitle,
      seoDescription: r.seoDescription,
      publishedVersion: r.publishedVersion,
      publishedAt: r.publishedAt,
      publishAt: r.publishAt,
      expiresAt: r.expiresAt,
      expiryAction: r.expiryAction,
      reviewDueOn: r.reviewDueOn,
      featured: r.featured,
      outdated: r.outdated,
      outdatedReason: r.outdatedReason,
      version: r.version,
      updatedAt: r.updatedAt,
    };
  }

  private async nextNumber(tx: Tx, org: string): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sd_kb_number:' + org}, 0))`;
    const [r] = await tx.$queryRaw<{ n: number }[]>`SELECT coalesce(max(number), 0)::int + 1 AS n FROM sd_kb_articles WHERE organization_id = ${org}::uuid`;
    return r.n;
  }

  private async freeSlug(tx: Tx, org: string, spaceId: string, language: string, want: string, articleId: string | null): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const slug = i ? `${want.slice(0, 74)}-${i + 1}` : want;
      const taken = await tx.sdKbArticle.findFirst({ where: { organizationId: org, spaceId, language, slug, ...(articleId ? { id: { not: articleId } } : {}) }, select: { id: true } });
      const old = await tx.sdKbSlugHistory.findFirst({ where: { organizationId: org, spaceId, language, slug, ...(articleId ? { articleId: { not: articleId } } : {}) }, select: { articleId: true } });
      if (!taken && !old) return slug;
    }
    throw new ConflictException('Choose another web address for this article.');
  }

  /** A new article (draft, version 1), from a template if chosen, or a translation of an English article. */
  async create(a: DeskActor, dto: ArticleDto) {
    return this.tx(a, (tx) => this.createIn(tx, a, dto, null));
  }

  private async createIn(tx: Tx, a: DeskActor, dto: ArticleDto, sourceTicketId: string | null) {
    const org = a.ctx.organizationId;
    const space = await this.space(tx, org, dto.spaceId);
    if (!this.canAuthor(a, space)) throw new ForbiddenException('You cannot write articles in this space (desk.kb.author).');
    if (space.status !== 'active') throw new BadRequestException('This space is switched off.');
    const language = dto.language ?? 'en';
    if (!space.languages.includes(language)) throw new BadRequestException('This space does not offer that language.');
    let translationOfId: string | null = null;
    if (language !== 'en') {
      const orig = dto.translationOfId ? await tx.sdKbArticle.findFirst({ where: { organizationId: org, id: dto.translationOfId, spaceId: space.id, language: 'en', deletedAt: null } }) : null;
      if (!orig) throw new BadRequestException('A translation starts from an English article of the same space.');
      translationOfId = orig.id;
    }
    if (dto.categoryId && !(await tx.sdKbCategory.findFirst({ where: { organizationId: org, spaceId: space.id, id: dto.categoryId }, select: { id: true } }))) throw new BadRequestException('Choose a category of this space.');
    let body = dto.bodyHtml ?? '';
    if (dto.templateId) {
      const tpl = await tx.sdKbTemplate.findFirst({ where: { organizationId: org, id: dto.templateId } });
      if (!tpl) throw new BadRequestException('No such template.');
      if (!htmlToText(body)) body = tpl.bodyHtml;
    }
    const bodyHtml = cleanHtml(body);
    const number = await this.nextNumber(tx, org);
    const slug = await this.freeSlug(tx, org, space.id, language, dto.slug ?? slugify(dto.title, number), null);
    try {
      const art = await tx.sdKbArticle.create({
        data: {
          organizationId: org,
          spaceId: space.id,
          categoryId: dto.categoryId ?? null,
          number,
          slug,
          language,
          translationOfId,
          audience: space.audience,
          state: 'draft',
          ownerUserId: a.userId,
          title: dto.title,
          summary: dto.summary ?? null,
          reviewDueOn: new Date(`${addDays(todayIst(), REVIEW_MONTHS * 30)}T00:00:00Z`),
          sourceTicketId,
          createdBy: a.userId,
        },
      });
      await tx.sdKbArticleVersion.create({ data: { organizationId: org, articleId: art.id, version: 1, title: dto.title, summary: dto.summary ?? null, bodyHtml, note: dto.note ?? null, authorUserId: a.userId } });
      await audit(tx, a, 'desk.kb.article_created', 'sd_kb_article', art.id, { number, spaceId: space.id, language, translationOfId, sourceTicketId });
      return { id: art.id, number };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That language already has a translation of this article.');
      throw e;
    }
  }

  /** Saves the words as a new version (a working draft of the same author is updated in place). */
  async saveDraft(a: DeskActor, id: string, dto: DraftDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { art } = await this.article(tx, a, id, 'author');
      const last = await tx.sdKbArticleVersion.findFirstOrThrow({ where: { organizationId: org, articleId: art.id }, orderBy: { version: 'desc' } });
      if (dto.version !== undefined && dto.version !== last.version) throw new ConflictException({ statusCode: 409, code: 'KB_ARTICLE_CHANGED', message: 'Someone saved a newer version. Reload to see it.' });
      const bodyHtml = cleanHtml(dto.bodyHtml ?? '');
      const data = { title: dto.title, summary: dto.summary ?? null, bodyHtml, note: dto.note ?? null };
      let version = last.version;
      if (!last.submittedAt && !last.publishedAt && last.authorUserId === a.userId && !last.reviewedAt) await tx.sdKbArticleVersion.update({ where: { id: last.id }, data });
      else version = (await tx.sdKbArticleVersion.create({ data: { organizationId: org, articleId: art.id, version: last.version + 1, ...data, authorUserId: a.userId } })).version;
      if (art.state !== 'published' && art.state !== 'retired') await tx.sdKbArticle.update({ where: { id: art.id }, data: { title: dto.title, summary: dto.summary ?? null, state: 'draft' } });
      await audit(tx, a, 'desk.kb.article_saved', 'sd_kb_article', art.id, { version });
      return { version };
    });
  }

  /** Category, address, search title and description, featured, review and publish / expiry dates, owner. */
  async updateMeta(a: DeskActor, id: string, dto: ArticleMetaDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { art, space } = await this.article(tx, a, id, 'author');
      if (dto.version !== art.version) throw new ConflictException({ statusCode: 409, code: 'KB_ARTICLE_CHANGED', message: 'Someone changed this article. Reload to see the latest.' });
      // Featured, schedule and owner are the publisher's calls.
      if ((dto.featured !== undefined || dto.publishAt !== undefined || dto.expiresAt !== undefined || dto.ownerUserId) && !this.canPublish(a, space)) throw new ForbiddenException('Only a publisher sets featured articles, dates and owners.');
      if (dto.categoryId && !(await tx.sdKbCategory.findFirst({ where: { organizationId: org, spaceId: space.id, id: dto.categoryId }, select: { id: true } }))) throw new BadRequestException('Choose a category of this space.');
      if (dto.ownerUserId && !(await tx.user.findFirst({ where: { organizationId: org, id: dto.ownerUserId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active colleague.');
      const data: Prisma.SdKbArticleUpdateInput = {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle || null } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription || null } : {}),
        ...(dto.featured !== undefined ? { featured: dto.featured } : {}),
        ...(dto.reviewDueOn !== undefined ? { reviewDueOn: dto.reviewDueOn ? new Date(`${dto.reviewDueOn}T00:00:00Z`) : null } : {}),
        ...(dto.publishAt !== undefined ? { publishAt: dto.publishAt ? new Date(dto.publishAt) : null } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
        ...(dto.expiryAction ? { expiryAction: dto.expiryAction } : {}),
        ...(dto.ownerUserId ? { ownerUserId: dto.ownerUserId } : {}),
        version: { increment: 1 },
      };
      if (dto.slug && dto.slug !== art.slug) {
        const slug = await this.freeSlug(tx, org, space.id, art.language, dto.slug, art.id);
        // US-G-215: the old address of a published article keeps working (permanent redirect).
        if (art.publishedAt) {
          await tx.sdKbSlugHistory.deleteMany({ where: { organizationId: org, spaceId: space.id, language: art.language, slug } });
          await tx.sdKbSlugHistory.upsert({
            where: { organizationId_spaceId_language_slug: { organizationId: org, spaceId: space.id, language: art.language, slug: art.slug } },
            update: { articleId: art.id },
            create: { organizationId: org, spaceId: space.id, language: art.language, slug: art.slug, articleId: art.id },
          });
        }
        data.slug = slug;
      }
      await tx.sdKbArticle.update({ where: { id: art.id }, data });
      await audit(tx, a, 'desk.kb.article_details_changed', 'sd_kb_article', art.id, { ...dto, version: undefined });
      return { ok: true };
    });
  }

  async submit(a: DeskActor, id: string, version: number) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { art } = await this.article(tx, a, id, 'author');
      const v = await tx.sdKbArticleVersion.findFirst({ where: { organizationId: org, articleId: art.id, version } });
      if (!v || v.publishedAt) throw new NotFoundException('No such draft.');
      if (!htmlToText(v.bodyHtml)) throw new BadRequestException('Write the article before sending it for review.');
      await tx.sdKbArticleVersion.update({ where: { id: v.id }, data: { submittedAt: new Date(), reviewedAt: null, reviewedBy: null, reviewNote: null } });
      if (art.state === 'draft') await tx.sdKbArticle.update({ where: { id: art.id }, data: { state: 'in_review' } });
      await audit(tx, a, 'desk.kb.article_submitted', 'sd_kb_article', art.id, { version });
      return { ok: true };
    });
  }

  /** Approve (publish now, or at the article's publish time) or send back with a note. Never one's own version. */
  async review(a: DeskActor, id: string, dto: ReviewDto) {
    const done = await this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { art } = await this.article(tx, a, id, 'publish');
      const v = await tx.sdKbArticleVersion.findFirst({ where: { organizationId: org, articleId: art.id, version: dto.version } });
      if (!v || v.publishedAt || !v.submittedAt || v.reviewedAt) throw new NotFoundException('No such version waiting for review.');
      if (v.authorUserId === a.userId) throw new ForbiddenException('Someone else reviews your changes (four eyes).');
      if (!dto.approve) {
        // Sent back: no longer submitted (an approved version keeps submitted_at and waits for its publish time).
        await tx.sdKbArticleVersion.update({ where: { id: v.id }, data: { submittedAt: null, reviewedBy: a.userId, reviewedAt: new Date(), reviewNote: dto.note ?? null } });
        if (art.state === 'in_review') await tx.sdKbArticle.update({ where: { id: art.id }, data: { state: 'draft' } });
        await audit(tx, a, 'desk.kb.article_sent_back', 'sd_kb_article', art.id, { version: v.version, note: dto.note ?? null });
        return null;
      }
      await tx.sdKbArticleVersion.update({ where: { id: v.id }, data: { reviewedBy: a.userId, reviewedAt: new Date(), reviewNote: dto.note ?? null } });
      await audit(tx, a, 'desk.kb.article_approved', 'sd_kb_article', art.id, { version: v.version });
      // US-G-222: an approved article with a publish time in the future waits for the publish job.
      if (art.publishAt && art.publishAt.getTime() > Date.now()) return null;
      return this.publishIn(tx, org, art, v.version, a.userId);
    });
    if (done) await this.tellFollowers(a.ctx.organizationId, done);
    return { ok: true, published: Boolean(done) };
  }

  /** Copies an approved version into the article (what readers and search see). */
  private async publishIn(tx: Tx, org: string, art: Article, version: number, by: string | null) {
    const v = await tx.sdKbArticleVersion.findFirstOrThrow({ where: { organizationId: org, articleId: art.id, version } });
    const blocks = await this.blocks(tx, org);
    const now = new Date();
    await tx.sdKbArticleVersion.update({ where: { id: v.id }, data: { publishedAt: now } });
    const updated = await tx.sdKbArticle.update({
      where: { id: art.id },
      data: { title: v.title, summary: v.summary, bodyHtml: v.bodyHtml, bodyText: htmlToText(renderBlocks(v.bodyHtml, blocks)).slice(0, 100_000), publishedVersion: v.version, publishedAt: now, state: 'published', outdated: false, outdatedReason: null, publishAt: null, version: { increment: 1 } },
    });
    await emit(tx, org, 'helpdesk.kb.article.published', { articleId: art.id, number: art.number, version: v.version });
    await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: by as string }, 'desk.kb.article_published', 'sd_kb_article', art.id, { version: v.version, number: art.number });
    return updated;
  }

  private async tellFollowers(org: string, art: Article) {
    try {
      const followers = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.sdKbFollow.findMany({ where: { organizationId: org, articleId: art.id }, select: { userId: true } }));
      if (!followers.length) return;
      await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, followers.map((f) => f.userId), 'helpdesk.kb.updated', { entityType: 'sd_kb_article', entityId: art.id, contextText: `KB-${art.number} · ${art.title}`, linkPath: `/yx/desk/knowledge?article=${art.id}` }, { subject: `Article updated: ${art.title}`, html: `<p>An article you follow has a new version: KB-${art.number} ${esc(art.title)}.</p>` });
    } catch (e) {
      this.logger.warn(`Followers not told: ${(e as Error).message}`);
    }
  }

  async retire(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const { art } = await this.article(tx, a, id, 'publish');
      if (art.state !== 'published') throw new ConflictException('Only a published article is retired.');
      await tx.sdKbArticle.update({ where: { id: art.id }, data: { state: 'retired', version: { increment: 1 } } });
      await audit(tx, a, 'desk.kb.article_retired', 'sd_kb_article', art.id, { number: art.number });
      return { ok: true };
    });
  }

  /** Puts a retired article back on the published version it had. */
  async republish(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const { art } = await this.article(tx, a, id, 'publish');
      if (art.state !== 'retired' || !art.publishedVersion) throw new ConflictException('Only a retired article is put back.');
      await tx.sdKbArticle.update({ where: { id: art.id }, data: { state: 'published', version: { increment: 1 } } });
      await audit(tx, a, 'desk.kb.article_put_back', 'sd_kb_article', art.id, { number: art.number });
      return { ok: true };
    });
  }

  /** US-G-218: into the recycle bin (restorable for the company's bin days). Translations go with their original. */
  async remove(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { art, space } = await this.article(tx, a, id, 'publish');
      const days = (await tx.sdPrivacySettings.findUnique({ where: { organizationId: org } }))?.binDays ?? 30;
      const now = new Date();
      const ids = [art.id, ...(await tx.sdKbArticle.findMany({ where: { organizationId: org, translationOfId: art.id, deletedAt: null }, select: { id: true } })).map((t) => t.id)];
      await tx.sdKbArticle.updateMany({ where: { organizationId: org, id: { in: ids } }, data: { deletedAt: now } });
      await tx.sdRecycleBin.create({ data: { organizationId: org, kind: 'kb_article', entityId: art.id, deskId: space.deskId, label: `KB-${art.number} ${art.title}`.slice(0, 200), data: { ids }, deletedBy: a.userId, purgeAfter: new Date(now.getTime() + days * 86_400_000) } });
      await audit(tx, a, 'desk.kb.article_deleted', 'sd_kb_article', art.id, { number: art.number, ids });
      return { deleted: true };
    });
  }

  async follow(a: DeskActor, id: string, on: boolean) {
    return this.tx(a, async (tx) => {
      const { art } = await this.article(tx, a, id);
      const key = { organizationId: a.ctx.organizationId, articleId: art.id, userId: a.userId };
      if (on) await tx.sdKbFollow.upsert({ where: { organizationId_articleId_userId: key }, update: {}, create: key });
      else await tx.sdKbFollow.deleteMany({ where: key });
      return { following: on };
    });
  }

  // ------------------------------------------------------------------------------------------ blocks and templates (US-G-025)

  private async blocks(tx: Tx, org: string): Promise<Map<string, string>> {
    return new Map((await tx.sdKbBlock.findMany({ where: { organizationId: org } })).map((b) => [b.key, b.bodyHtml]));
  }

  private requireAuthorAnywhere(a: DeskActor) {
    if (!has(a, 'desk.kb.author') && !has(a, 'desk.kb.publish')) throw new ForbiddenException('You cannot write help articles (desk.kb.author).');
  }

  async listBlocks(a: DeskActor) {
    this.requireAuthorAnywhere(a);
    return this.tx(a, (tx) => tx.sdKbBlock.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { name: 'asc' } })).then((rows) => rows.map((b) => ({ id: b.id, key: b.key, name: b.name, bodyHtml: b.bodyHtml, version: b.version, updatedAt: b.updatedAt })));
  }

  /** A block changes every article that shows it, so only publishers change blocks. */
  async saveBlock(a: DeskActor, id: string | null, dto: BlockDto) {
    if (!has(a, 'desk.kb.publish')) throw new ForbiddenException('Only a publisher changes shared blocks (desk.kb.publish).');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const data = { key: dto.key, name: dto.name, bodyHtml: cleanHtml(dto.bodyHtml) };
      try {
        let row: { id: string };
        if (id) {
          const cur = await tx.sdKbBlock.findFirst({ where: { organizationId: org, id } });
          if (!cur) throw new NotFoundException('No such block.');
          if (dto.version !== undefined && dto.version !== cur.version) throw new ConflictException('Someone changed this block. Reload to see the latest.');
          row = await tx.sdKbBlock.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        } else row = await tx.sdKbBlock.create({ data: { organizationId: org, ...data, createdBy: a.userId } });
        await audit(tx, a, id ? 'desk.kb.block_updated' : 'desk.kb.block_created', 'sd_kb_block', row.id, { key: dto.key });
        return { id: row.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another block uses that key.');
        throw e;
      }
    });
  }

  async listTemplates(a: DeskActor) {
    this.requireAuthorAnywhere(a);
    return this.tx(a, (tx) => tx.sdKbTemplate.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { name: 'asc' } })).then((rows) => rows.map((t) => ({ id: t.id, name: t.name, bodyHtml: t.bodyHtml })));
  }

  async saveTemplate(a: DeskActor, id: string | null, dto: TemplateDto) {
    if (!has(a, 'desk.kb.publish')) throw new ForbiddenException('Only a publisher changes article templates (desk.kb.publish).');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const data = { name: dto.name, bodyHtml: cleanHtml(dto.bodyHtml) };
      try {
        const row = id ? ((await tx.sdKbTemplate.updateMany({ where: { organizationId: org, id }, data })).count ? { id } : null) : await tx.sdKbTemplate.create({ data: { organizationId: org, ...data, createdBy: a.userId } });
        if (!row) throw new NotFoundException('No such template.');
        await audit(tx, a, id ? 'desk.kb.template_updated' : 'desk.kb.template_created', 'sd_kb_template', row.id, { name: dto.name });
        return { id: row.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another template has that name.');
        throw e;
      }
    });
  }

  // ------------------------------------------------------------------------------------------ agents at work (US-B-106, US-G-023)

  /** Articles an agent can insert in a reply on this desk: the requester must be able to open them. */
  async forReply(a: DeskActor, ticketId: string, q: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const t = await this.ticketOf(tx, a, ticketId);
      const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId }, select: { kind: true } });
      const spaces = (await tx.sdKbSpace.findMany({ where: { organizationId: org, status: 'active' } })).filter((s) => s.audience === 'public' || (s.audience === 'requesters' && (s.deskId === t.deskId || (!s.deskId && desk.kind !== 'customer_support'))));
      const found = await searchIn(tx, org, spaces.map((s) => s.id), q, 10);
      const o = await tx.organization.findUnique({ where: { id: org }, select: { slug: true } });
      const bySpace = new Map(spaces.map((s) => [s.id, s]));
      const portal = desk.kind === 'customer_support' ? await portalFor(tx, org, t.deskId) : null;
      return found.map((x) => ({ ...x, url: readerUrl(o?.slug ?? '', bySpace.get(x.spaceId)!, x, portal) }));
    });
  }

  /** Inserting an article in a reply (linked) or recording the one that solved the ticket (one per ticket). */
  async link(a: DeskActor, ticketId: string, articleId: string, kind: 'linked' | 'solved') {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const t = await this.ticketOf(tx, a, ticketId);
      requireWork(a, t.deskId);
      const art = await tx.sdKbArticle.findFirst({ where: { organizationId: org, id: articleId, deletedAt: null, state: 'published' } });
      if (!art) throw new NotFoundException('No such published article.');
      if (kind === 'solved') await tx.sdKbLink.deleteMany({ where: { organizationId: org, ticketId: t.id, kind: 'solved' } });
      await tx.sdKbLink.createMany({ data: [{ organizationId: org, articleId: art.id, ticketId: t.id, deskId: t.deskId, kind, byUserId: a.userId }], skipDuplicates: true });
      await audit(tx, a, kind === 'solved' ? 'desk.kb.solved_by' : 'desk.kb.linked', 'sd_ticket', t.id, { articleId: art.id, number: art.number });
      return { ok: true };
    });
  }

  async ticketArticles(a: DeskActor, ticketId: string) {
    return this.tx(a, async (tx) => {
      const t = (await this.tickets.load(tx, a, ticketId)).t;
      const links = await tx.sdKbLink.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id } });
      const arts = await tx.sdKbArticle.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: links.map((l) => l.articleId) } }, select: { id: true, number: true, title: true } });
      return links.map((l) => ({ kind: l.kind, ...arts.find((x) => x.id === l.articleId)! })).filter((x) => x.id);
    });
  }

  /** An agent flags an article out of date: the owner is told (and gets a task when the space has a desk). */
  async flagOutdated(a: DeskActor, id: string, reason: string) {
    if (!has(a, 'desk.ticket.work') && !has(a, 'desk.kb.author')) throw new ForbiddenException('Only agents and authors flag articles.');
    const art = await this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { art, space } = await this.article(tx, a, id);
      await tx.sdKbArticle.update({ where: { id: art.id }, data: { outdated: true, outdatedReason: reason } });
      if (space.deskId && art.ownerUserId) {
        const seat = await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId: space.deskId, userId: art.ownerUserId, role: { in: ['agent', 'lead', 'collaborator'] }, ...activeOn(todayIst()) }, select: { id: true } });
        if (seat) await tx.sdTask.create({ data: { organizationId: org, deskId: space.deskId, title: `Check article KB-${art.number}: ${art.title}`.slice(0, 200), note: reason, assigneeUserId: art.ownerUserId, dueAt: new Date(Date.now() + 7 * 86_400_000), createdBy: a.userId } });
      }
      await audit(tx, a, 'desk.kb.flagged_outdated', 'sd_kb_article', art.id, { reason });
      return art;
    });
    if (art.ownerUserId) {
      await this.notifications
        .notify(a.ctx, a.userId, [art.ownerUserId], 'helpdesk.kb.outdated', { entityType: 'sd_kb_article', entityId: art.id, contextText: `KB-${art.number} · ${art.title}`, linkPath: `/yx/desk/knowledge?article=${art.id}` })
        .catch((e) => this.logger.warn(`Owner not told: ${(e as Error).message}`));
    }
    return { ok: true };
  }

  /** US-B-106: a draft from a solved ticket: the question and the answer, without the requester's personal data. */
  async fromTicket(a: DeskActor, ticketId: string, spaceId: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const t = await this.ticketOf(tx, a, ticketId);
      requireWork(a, t.deskId);
      if (t.sensitive || t.private) throw new BadRequestException('Articles are not made from private or sensitive tickets.');
      if (!['solved', 'closed'].includes(t.systemState)) throw new BadRequestException('Make an article from a solved ticket.');
      const msgs = await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, kind: 'reply' }, orderBy: { createdAt: 'asc' } });
      const question = msgs.find((m) => m.side === 'requester') ?? msgs[0];
      const answer = [...msgs].reverse().find((m) => m.side === 'agent');
      const names = await this.namesOf(tx, org, [t.requesterPersonId, t.requestedForPersonId]);
      const scrub = (s: string) => maskPii(names.reduce((out, n) => out.split(n).join('the requester'), s)).text;
      const body = `<h3>Question</h3>${textToHtml(scrub(question?.bodyText ?? t.subject))}<h3>Answer</h3>${textToHtml(scrub(answer?.bodyText ?? ''))}`;
      return this.createIn(tx, a, { spaceId, title: scrub(t.subject).slice(0, 200), bodyHtml: body, note: `Made from ticket ${t.number}` }, t.id);
    });
  }

  private async namesOf(tx: Tx, org: string, ids: (string | null)[]): Promise<string[]> {
    const rows = await tx.person.findMany({ where: { organizationId: org, id: { in: ids.filter((x): x is string => Boolean(x)) } }, select: { givenName: true, familyName: true, primaryEmail: true } });
    return rows.flatMap((p) => [[p.givenName, p.familyName].filter(Boolean).join(' '), p.givenName, p.familyName ?? '', p.primaryEmail ?? '']).filter((x) => x && x.length >= 3);
  }

  // ------------------------------------------------------------------------------------------ readers (US-B-105, US-B-107)

  /** Spaces an employee reads in the app: requester or public spaces of employee desks and company-wide ones. */
  private async employeeScope(tx: Tx, org: string): Promise<string[]> {
    const desks = new Set((await tx.sdDesk.findMany({ where: { organizationId: org, kind: { not: 'customer_support' } }, select: { id: true } })).map((d) => d.id));
    return (await tx.sdKbSpace.findMany({ where: { organizationId: org, status: 'active', audience: { in: ['requesters', 'public'] } } })).filter((s) => !s.deskId || desks.has(s.deskId)).map((s) => s.id);
  }

  /** Spaces an outside customer reads in a portal: public ones, and requester spaces of the portal's desks. */
  private async portalScope(tx: Tx, org: string, deskIds: string[], signedIn: boolean): Promise<string[]> {
    return (await tx.sdKbSpace.findMany({ where: { organizationId: org, status: 'active', audience: { in: ['requesters', 'public'] } } }))
      .filter((s) => s.audience === 'public' || (signedIn && s.deskId && deskIds.includes(s.deskId)))
      .map((s) => s.id);
  }

  /** Requester and public reads run with app.kb_reader set: the database shows only published reader articles. */
  private asReader<T>(org: string, reader: 'requester' | 'public', fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.kb_reader', ${reader}, true)`;
      return fn(tx);
    });
  }

  private async suggestFor(tx: Tx, scope: ReaderScope, q: string, log: boolean) {
    const found = await searchIn(tx, scope.org, scope.spaceIds, q, 6);
    if (log && q.trim().length >= 3) await countKb(tx, scope.org, { kind: 'search', source: scope.source, spaceId: scope.spaceIds.length === 1 ? scope.spaceIds[0] : null, query: q, results: found.length });
    return found.map(({ id, number, slug, title, summary }) => ({ id, number, slug, title, summary }));
  }

  /** The article in the reader's language when there is a published translation, else English with a notice. */
  private async readIn(tx: Tx, org: string, spaceIds: string[], where: { number?: number; slug?: string; spaceId?: string }, language: string | undefined) {
    const base = await tx.sdKbArticle.findFirst({
      where: { organizationId: org, spaceId: { in: spaceIds }, deletedAt: null, state: 'published', ...(where.number ? { number: where.number } : {}), ...(where.slug ? { slug: where.slug, spaceId: where.spaceId } : {}) },
    });
    if (!base) return null;
    const original = base.translationOfId ? await tx.sdKbArticle.findFirst({ where: { organizationId: org, id: base.translationOfId, state: 'published', deletedAt: null } }) : base;
    const want = language && KB_LANGUAGES.includes(language as (typeof KB_LANGUAGES)[number]) ? language : base.language;
    const shown = want === base.language ? base : ((await tx.sdKbArticle.findFirst({ where: { organizationId: org, deletedAt: null, state: 'published', language: want, OR: [{ translationOfId: original?.id ?? base.id }, { id: original?.id ?? base.id }] } })) ?? original ?? base);
    const langs = await tx.sdKbArticle.findMany({ where: { organizationId: org, deletedAt: null, state: 'published', OR: [{ translationOfId: original?.id ?? base.id }, { id: original?.id ?? base.id }] }, select: { language: true } });
    const blocks = await this.blocks(tx, org);
    return {
      id: shown.id,
      number: shown.number,
      slug: shown.slug,
      spaceId: shown.spaceId,
      title: shown.title,
      summary: shown.summary,
      bodyHtml: renderBlocks(shown.bodyHtml, blocks),
      language: shown.language,
      languages: langs.map((l) => l.language),
      // YX-GRO-07: a missing translation shows the English article with a notice.
      fallback: Boolean(language && shown.language !== language),
      seoTitle: shown.seoTitle,
      seoDescription: shown.seoDescription,
      publishedAt: shown.publishedAt,
      updatedAt: shown.updatedAt,
      reviewedOn: shown.publishedAt,
    };
  }

  private async feedbackIn(tx: Tx, org: string, spaceIds: string[], articleId: string, dto: KbFeedbackDto, personId: string | null, source: KbSource) {
    const art = await tx.sdKbArticle.findFirst({ where: { organizationId: org, id: articleId, spaceId: { in: spaceIds }, state: 'published', deletedAt: null }, select: { id: true, spaceId: true } });
    if (!art) throw new NotFoundException('No such article.');
    if (dto.solved) await countKb(tx, org, { kind: 'solved', source, spaceId: art.spaceId, articleId: art.id });
    if (dto.helpful !== undefined) {
      const res = await tx.sdKbFeedback.createMany({ data: [{ organizationId: org, articleId: art.id, personId, helpful: dto.helpful, comment: dto.comment ? maskPii(dto.comment).text : null, source }], skipDuplicates: true });
      return { thanks: true, already: !res.count };
    }
    return { thanks: true };
  }

  // Employees in the app (implicit: any signed-in person of the company).

  async employeeSuggest(r: Requester, q: string, source: 'help' | 'drawer') {
    return this.asReader(r.ctx.organizationId, 'requester', async (tx) => this.suggestFor(tx, { org: r.ctx.organizationId, spaceIds: await this.employeeScope(tx, r.ctx.organizationId), source, personId: null }, q, true));
  }

  async employeeHome(r: Requester) {
    return this.asReader(r.ctx.organizationId, 'requester', async (tx) => {
      const org = r.ctx.organizationId;
      const ids = await this.employeeScope(tx, org);
      return this.homeOf(tx, org, ids);
    });
  }

  private async homeOf(tx: Tx, org: string, spaceIds: string[]) {
    const [spaces, cats, featured, recent] = await Promise.all([
      tx.sdKbSpace.findMany({ where: { organizationId: org, id: { in: spaceIds } }, orderBy: { name: 'asc' } }),
      tx.sdKbCategory.findMany({ where: { organizationId: org, spaceId: { in: spaceIds } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      tx.sdKbArticle.findMany({ where: { organizationId: org, spaceId: { in: spaceIds }, state: 'published', deletedAt: null, language: 'en', featured: true }, orderBy: { publishedAt: 'desc' }, take: 6 }),
      tx.sdKbArticle.findMany({ where: { organizationId: org, spaceId: { in: spaceIds }, state: 'published', deletedAt: null, language: 'en' }, orderBy: { publishedAt: 'desc' }, take: 50, select: { id: true, number: true, slug: true, title: true, summary: true, categoryId: true, spaceId: true } }),
    ]);
    // US-G-217: a reader sees only branches that hold articles they may read.
    const used = new Set(recent.map((x) => x.categoryId).filter(Boolean));
    const keep = new Set<string>();
    for (const c of cats) {
      if (!used.has(c.id)) continue;
      for (let cur: (typeof cats)[number] | undefined = c; cur; cur = cats.find((p) => p.id === cur!.parentId)) keep.add(cur.id);
    }
    return {
      spaces: spaces.map((s) => ({ id: s.id, slug: s.slug, name: s.name, languages: s.languages, categories: cats.filter((c) => c.spaceId === s.id && keep.has(c.id)).map((c) => ({ id: c.id, parentId: c.parentId, name: c.name })) })),
      featured: featured.map((x) => ({ id: x.id, number: x.number, slug: x.slug, title: x.title, summary: x.summary })),
      articles: recent,
    };
  }

  async employeeArticle(r: Requester, number: number, language?: string) {
    return this.asReader(r.ctx.organizationId, 'requester', async (tx) => {
      const org = r.ctx.organizationId;
      const ids = await this.employeeScope(tx, org);
      const art = await this.readIn(tx, org, ids, { number }, language);
      if (!art) throw new NotFoundException('No such article.');
      await countKb(tx, org, { kind: 'view', source: 'help', spaceId: art.spaceId, articleId: art.id });
      return art;
    });
  }

  async employeeFeedback(r: Requester, articleId: string, dto: KbFeedbackDto, personId: string | null) {
    return this.asReader(r.ctx.organizationId, 'requester', async (tx) => this.feedbackIn(tx, r.ctx.organizationId, await this.employeeScope(tx, r.ctx.organizationId), articleId, dto, personId, 'help'));
  }

  /** The article was opened from a search result (content-gap report: searches nobody clicked). */
  async employeeClick(r: Requester, q: string, articleId: string) {
    return this.asReader(r.ctx.organizationId, 'requester', async (tx) => {
      const org = r.ctx.organizationId;
      const art = await tx.sdKbArticle.findFirst({ where: { organizationId: org, id: articleId, spaceId: { in: await this.employeeScope(tx, org) } }, select: { id: true, spaceId: true } });
      if (art) await countKb(tx, org, { kind: 'click', source: 'help', spaceId: art.spaceId, articleId: art.id, query: q });
      return { ok: true };
    });
  }

  // Outside customers in a portal (signed in, or not: then public spaces only).

  async portalSuggest(org: string, deskIds: string[], s: PortalSession | null, q: string, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    return run(async (tx) => this.suggestFor(tx, { org, spaceIds: await this.portalScope(tx, org, deskIds, Boolean(s)), source: 'portal', personId: null }, q, true));
  }

  async portalArticle(org: string, deskIds: string[], s: PortalSession | null, number: number, language: string | undefined, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    return run(async (tx) => {
      const art = await this.readIn(tx, org, await this.portalScope(tx, org, deskIds, Boolean(s)), { number }, language);
      if (!art) throw new NotFoundException('No such article.');
      await countKb(tx, org, { kind: 'view', source: 'portal', spaceId: art.spaceId, articleId: art.id });
      return art;
    });
  }

  async portalFeedback(org: string, deskIds: string[], s: PortalSession | null, articleId: string, dto: KbFeedbackDto, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    return run(async (tx) => this.feedbackIn(tx, org, await this.portalScope(tx, org, deskIds, Boolean(s)), articleId, dto, s?.personId ?? null, 'portal'));
  }

  // The public help centre: /yx/help/<company>/<space> (no session; read-only; public spaces only).

  private async publicSpace(orgSlug: string, spaceSlug: string): Promise<{ org: { id: string; name: string; slug: string }; space: Space }> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true, slug: true, status: true } });
    if (!org || !isOrganizationActive(org.status)) throw new NotFoundException('No such help centre.');
    const space = await this.asReader(org.id, 'public', (tx) => tx.sdKbSpace.findFirst({ where: { organizationId: org.id, slug: spaceSlug, audience: 'public', status: 'active' } }));
    if (!space) throw new NotFoundException('No such help centre.');
    return { org, space };
  }

  async publicHome(orgSlug: string, spaceSlug: string) {
    const { org, space } = await this.publicSpace(orgSlug, spaceSlug);
    return this.asReader(org.id, 'public', async (tx) => ({ company: org.name, space: { name: space.name, slug: space.slug, languages: space.languages }, canonical: `${webOrigin()}/yx/help/${org.slug}/${space.slug}`, ...(await this.homeOf(tx, org.id, [space.id])) }));
  }

  async publicSearch(orgSlug: string, spaceSlug: string, q: string) {
    const { org, space } = await this.publicSpace(orgSlug, spaceSlug);
    return this.asReader(org.id, 'public', (tx) => this.suggestFor(tx, { org: org.id, spaceIds: [space.id], source: 'public', personId: null }, q, true));
  }

  /** By address (an old address answers with where the article lives now: a permanent redirect) or by short number. */
  async publicArticle(orgSlug: string, spaceSlug: string, key: string, language?: string) {
    const { org, space } = await this.publicSpace(orgSlug, spaceSlug);
    return this.asReader(org.id, 'public', async (tx) => {
      const byNumber = /^\d{1,9}$/.test(key) ? Number(key) : null;
      const art = byNumber ? await this.readIn(tx, org.id, [space.id], { number: byNumber }, language) : await this.readIn(tx, org.id, [space.id], { slug: key, spaceId: space.id }, language);
      if (!art && !byNumber) {
        const old = await tx.sdKbSlugHistory.findFirst({ where: { organizationId: org.id, spaceId: space.id, slug: key } });
        const now = old ? await tx.sdKbArticle.findFirst({ where: { organizationId: org.id, id: old.articleId, state: 'published', deletedAt: null }, select: { slug: true } }) : null;
        if (now) return { redirect: `/yx/help/${org.slug}/${space.slug}/${now.slug}`, permanent: true };
      }
      if (!art) throw new NotFoundException('No such article.');
      // A short number always answers with the article's own address (canonical).
      if (byNumber) return { redirect: `/yx/help/${org.slug}/${space.slug}/${art.slug}`, permanent: false };
      await countKb(tx, org.id, { kind: 'view', source: 'public', spaceId: space.id, articleId: art.id });
      return { company: org.name, space: { name: space.name, slug: space.slug }, canonical: `${webOrigin()}/yx/help/${org.slug}/${space.slug}/${art.slug}`, article: art };
    });
  }

  async publicFeedback(orgSlug: string, spaceSlug: string, articleId: string, dto: KbFeedbackDto) {
    const { org, space } = await this.publicSpace(orgSlug, spaceSlug);
    // Anonymous: thumbs and "solved" only, no comment (nobody to answer, and no free text from strangers).
    return this.asReader(org.id, 'public', (tx) => this.feedbackIn(tx, org.id, [space.id], articleId, { helpful: dto.helpful, solved: dto.solved }, null, 'public'));
  }

  /** US-G-215: the sitemap of a public help centre. Never an article of any other audience (the reader policy too). */
  async sitemap(orgSlug: string, spaceSlug: string): Promise<string> {
    const { org, space } = await this.publicSpace(orgSlug, spaceSlug);
    const rows = await this.asReader(org.id, 'public', (tx) => tx.sdKbArticle.findMany({ where: { organizationId: org.id, spaceId: space.id, state: 'published', deletedAt: null }, select: { slug: true, updatedAt: true, language: true }, orderBy: { number: 'asc' }, take: 50_000 }));
    const base = `${webOrigin()}/yx/help/${org.slug}/${space.slug}`;
    const urls = [`<url><loc>${esc(base)}</loc></url>`, ...rows.map((r) => `<url><loc>${esc(`${base}/${r.slug}${r.language === 'en' ? '' : `?lang=${r.language}`}`)}</loc><lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`)];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`;
  }

  forAcknowledgement(tx: Tx, org: string, deskId: string, text: string) {
    return forAcknowledgement(tx, org, deskId, text);
  }

  // ------------------------------------------------------------------------------------------ reports (US-G-024, US-G-223)

  /** Searches with no result, searches nobody clicked, and solved tickets with no article, by topic. */
  async contentGaps(a: DeskActor, from: string, to: string) {
    if (!has(a, 'desk.report.view') && !has(a, 'desk.kb.publish')) throw new ForbiddenException('You cannot see knowledge reports.');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const noResult = await tx.$queryRaw<{ query: string; times: number }[]>`
        SELECT query, count(*)::int AS times FROM sd_kb_events WHERE organization_id = ${org}::uuid AND kind = 'search' AND results = 0
          AND created_at >= ${from}::date AND created_at < ${to}::date + 1 AND query IS NOT NULL
        GROUP BY query ORDER BY times DESC LIMIT 50`;
      const noClick = await tx.$queryRaw<{ query: string; times: number }[]>`
        SELECT s.query, count(*)::int AS times FROM sd_kb_events s
        WHERE s.organization_id = ${org}::uuid AND s.kind = 'search' AND s.results > 0 AND s.query IS NOT NULL
          AND s.created_at >= ${from}::date AND s.created_at < ${to}::date + 1
          AND NOT EXISTS (SELECT 1 FROM sd_kb_events c WHERE c.organization_id = s.organization_id AND c.kind = 'click' AND c.query = s.query
                          AND c.created_at >= ${from}::date AND c.created_at < ${to}::date + 1)
        GROUP BY s.query ORDER BY times DESC LIMIT 50`;
      const desks = [...a.roles].filter(([, r]) => r === 'agent' || r === 'lead' || r === 'admin').map(([d]) => d);
      const noArticle = await tx.$queryRaw<{ desk: string; category: string | null; tickets: number }[]>`
        SELECT d.name AS desk, c.name AS category, count(*)::int AS tickets FROM sd_tickets t
        JOIN sd_desks d ON d.organization_id = t.organization_id AND d.id = t.desk_id
        LEFT JOIN sd_categories c ON c.organization_id = t.organization_id AND c.id = t.category_id
        WHERE t.organization_id = ${org}::uuid AND t.desk_id = ANY(${desks}::uuid[]) AND t.resolved_at >= ${from}::date AND t.resolved_at < ${to}::date + 1
          AND NOT t.sensitive AND NOT t.private
          AND NOT EXISTS (SELECT 1 FROM sd_kb_links l WHERE l.organization_id = t.organization_id AND l.ticket_id = t.id)
        GROUP BY d.name, c.name ORDER BY tickets DESC LIMIT 50`;
      return { noResult, noClick, noArticle };
    });
  }

  /** A gap becomes an article-request task for an author on that desk. */
  async gapTask(a: DeskActor, deskId: string, query: string, assigneeUserId?: string) {
    if (!has(a, 'desk.task.work') || !isAgentOn(a, deskId)) throw new ForbiddenException('Only agents of the desk add tasks.');
    return this.tx(a, async (tx) => {
      const t = await tx.sdTask.create({ data: { organizationId: a.ctx.organizationId, deskId, title: `Write an article: "${query}"`.slice(0, 200), assigneeUserId: assigneeUserId ?? a.userId, createdBy: a.userId } });
      await audit(tx, a, 'desk.kb.gap_task', 'sd_task', t.id, { query, deskId });
      return { id: t.id };
    });
  }

  // ------------------------------------------------------------------------------------------ jobs (US-G-222, YX-GRO-07)

  /** Publishes approved articles whose time has come; hides or flags expired ones; tells owners of reviews due. */
  async schedule(now = new Date()): Promise<number> {
    const rows = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string; what: string }[]>`
        SELECT a.id, a.organization_id, 'publish' AS what FROM sd_kb_articles a
        WHERE a.publish_at <= ${now} AND a.deleted_at IS NULL AND EXISTS (
          SELECT 1 FROM sd_kb_article_versions v WHERE v.organization_id = a.organization_id AND v.article_id = a.id AND v.submitted_at IS NOT NULL AND v.reviewed_at IS NOT NULL AND v.published_at IS NULL)
        UNION ALL
        SELECT a.id, a.organization_id, 'expire' FROM sd_kb_articles a WHERE a.expires_at <= ${now} AND a.state = 'published' AND a.deleted_at IS NULL
        UNION ALL
        SELECT a.id, a.organization_id, 'review' FROM sd_kb_articles a WHERE a.review_due_on = (${now}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND a.state = 'published' AND a.deleted_at IS NULL
        LIMIT 500`,
    );
    let n = 0;
    for (const r of rows) {
      const ctx = { organizationId: r.organization_id, isSuperAdmin: false };
      const art = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        const art = await tx.sdKbArticle.findFirst({ where: { organizationId: r.organization_id, id: r.id } });
        if (!art) return null;
        if (r.what === 'publish') {
          const v = await tx.sdKbArticleVersion.findFirst({ where: { organizationId: art.organizationId, articleId: art.id, submittedAt: { not: null }, reviewedAt: { not: null }, publishedAt: null }, orderBy: { version: 'desc' } });
          return v ? this.publishIn(tx, art.organizationId, art, v.version, null) : null;
        }
        if (r.what === 'expire') {
          await tx.sdKbArticle.update({ where: { id: art.id }, data: art.expiryAction === 'hide' ? { state: 'retired', expiresAt: null } : { outdated: true, outdatedReason: 'Past its expiry date', expiresAt: null } });
          await audit(tx, { ctx, userId: null as unknown as string }, 'desk.kb.article_expired', 'sd_kb_article', art.id, { action: art.expiryAction });
        }
        if (r.what === 'review') await emit(tx, art.organizationId, 'helpdesk.kb.article.review_due', { articleId: art.id, number: art.number });
        return art;
      });
      if (!art) continue;
      n++;
      if (r.what === 'publish') await this.tellFollowers(r.organization_id, art);
      else if (art.ownerUserId) {
        await this.notifications
          .notifySystem(ctx, [art.ownerUserId], r.what === 'review' ? 'helpdesk.kb.review_due' : 'helpdesk.kb.outdated', { entityType: 'sd_kb_article', entityId: art.id, contextText: `KB-${art.number} · ${art.title}`, linkPath: `/yx/desk/knowledge?article=${art.id}` }, { subject: r.what === 'review' ? `Please review: ${art.title}` : `Article expired: ${art.title}`, html: `<p>${r.what === 'review' ? 'It is time to check that this article is still right' : 'This article reached its expiry date'}: KB-${art.number} ${esc(art.title)}.</p>` })
          .catch((e) => this.logger.warn(`Owner not told: ${(e as Error).message}`));
      }
    }
    return n;
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

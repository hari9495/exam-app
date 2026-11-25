import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import type { ScopeUser } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { FeedService } from './feed.service';
import { KudosDto } from './dto';
import { blockedWord } from './engage-rules';

// Batch G2 item 73 (M09 Q4, ENG-08 / ENG-09; answer 2603): kudos, badges only. A kudos names 1 to 20 colleagues (never
// yourself), one of the company values and optionally a badge; it is a post on the company space (feed and wall) and
// the people thanked are told. A blocked word holds it for a moderator like any post.

const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

@Injectable()
export class KudosService {
  private readonly logger = new Logger(KudosService.name);
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly feed: FeedService,
  ) {}

  private async choices(tx: Tx, c: CompanyContext) {
    return { values: lines(await settingFor(tx, c, 'engage.values', ANY_ENTITY)), badges: lines(await settingFor(tx, c, 'engage.badges', ANY_ENTITY)) };
  }

  /** The composer's choices and the people I may thank (active colleagues, by name). */
  options(ctx: TenantContext, user: ScopeUser, q?: string) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const people = await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active', id: { not: me }, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 50 });
      return { ...(await this.choices(tx, c)), people: people.map((p) => ({ id: p.id, name: p.name ?? p.email })) };
    });
  }

  async give(ctx: TenantContext, user: ScopeUser, dto: KudosDto) {
    const me = user.userId;
    if (!me || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves gives kudos.');
    const to = [...new Set(dto.to)];
    if (to.includes(me)) throw new BadRequestException('You can’t thank yourself.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { values, badges } = await this.choices(tx, c);
      if (!values.includes(dto.value)) throw new BadRequestException('Pick one of the company values.');
      if (dto.badge && !badges.includes(dto.badge)) throw new BadRequestException('Pick one of the company badges.');
      if ((await tx.user.count({ where: { organizationId: org, id: { in: to }, status: 'active' } })) !== to.length) throw new BadRequestException('Thank active colleagues of this company.');
      const company = (await this.feed.spaces(tx, org)).find((s) => s.kind === 'company')!;
      const words = lines(await settingFor(tx, c, 'engage.blocked_words', ANY_ENTITY));
      const word = blockedWord(dto.message, words);
      const p = await tx.engPost.create({ data: { organizationId: org, kind: 'kudos', spaceId: company.id, authorUserId: me, body: dto.message, state: word ? 'held' : 'published', heldReason: word ? `Blocked word "${word}"` : null } });
      await tx.engKudos.create({ data: { organizationId: org, postId: p.id, giverUserId: me, receiverIds: to, value: dto.value, badge: dto.badge || null } });
      await audit(tx, c, 'engage.kudos.given', 'eng_post', p.id, { receivers: to.length, value: dto.value, badge: dto.badge ?? null, held: Boolean(word) });
      const giver = await tx.user.findFirst({ where: { organizationId: org, id: me }, select: { name: true, email: true } });
      return { id: p.id, held: Boolean(word), giver: giver?.name ?? giver?.email ?? 'A colleague' };
    });
    if (!out.held)
      await this.notifications
        .notifySystem(ctx, to, 'engage.kudos.received', { entityType: 'eng_post', entityId: out.id, contextText: `${out.giver} thanked you for ${dto.value}`, linkPath: '/yx/engage/recognition' }, { subject: 'Someone thanked you in YukthiX', html: '<p>A colleague thanked you in YukthiX. Open Recognition to read it.</p>' }, me)
        .catch((e: Error) => this.logger.warn(`kudos notice: ${e.message}`));
    return { id: out.id, held: out.held };
  }

  /** The recognition wall: published kudos, newest first (one value or all), with how many each value has. */
  wall(ctx: TenantContext, user: ScopeUser, value?: string) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { values } = await this.choices(tx, c);
      const all = await tx.engKudos.findMany({ where: { organizationId: org, post: { state: 'published' } }, orderBy: { createdAt: 'desc' }, take: 300, include: { post: { include: { _count: { select: { reactions: true, comments: { where: { state: 'published' } } } }, reactions: { where: { userId: me }, select: { id: true } } } } } });
      const ids = [...new Set(all.flatMap((k) => [k.giverUserId, ...k.receiverIds]))];
      const users = await tx.user.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, email: true, status: true } });
      const nm = (u: string) => users.find((x) => x.id === u)?.name ?? users.find((x) => x.id === u)?.email ?? 'Former user';
      const left = (u: string) => users.find((x) => x.id === u)?.status === 'inactive';
      return {
        values: values.map((v) => ({ value: v, count: all.filter((k) => k.value === v).length })),
        total: all.length,
        kudos: all
          .filter((k) => !value || k.value === value)
          .slice(0, 100)
          .map((k) => ({ id: k.postId, from: nm(k.giverUserId), fromLeft: left(k.giverUserId), to: k.receiverIds.map(nm), value: k.value, badge: k.badge, body: k.post.body, at: k.createdAt.toISOString(), likes: k.post._count.reactions, liked: k.post.reactions.length > 0, comments: k.post._count.comments, mine: k.giverUserId === me })),
      };
    });
  }
}

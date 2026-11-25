import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { companyKeyHolders } from '../access/key-holders';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AnnouncementsService } from './announcements.service';
import { CommentDto, ModerateDto, PostDto } from './dto';
import { blockedWord } from './engage-rules';

// Batch G2 item 100 (M09 Q1-Q2, ENG-01 / ENG-02 / ENG-11; answer 2601). Spaces: the company, each location, each
// department (made when the feed is first read). A person is in the company space and in the spaces of their job today.
// Posting: location and department spaces are open to their members unless a moderator switched on approval; on the
// company space engage.announce posts directly and others wait for approval. A blocked word holds a post or comment; the
// company's number of reports hides it. engage.moderate reviews the queue. Every action is audited.

const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
type Space = { id: string; kind: string; refId: string | null; name: string; approval: boolean };

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly announcements: AnnouncementsService,
  ) {}

  private me(user: ScopeUser, acting = false) {
    if (!user.userId) throw new ForbiddenException('Not signed in.');
    if (acting && (user.impersonatorUserId || user.actingSuperAdmin)) throw new ForbiddenException('Not available while acting for someone else.');
    return user.userId;
  }

  async companyWide(user: ScopeUser, key: 'engage.moderate' | 'engage.announce') {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, [key]);
    return tenantWide(v, key);
  }

  private async settings(tx: Tx, c: CompanyContext) {
    return {
      words: (await settingFor(tx, c, 'engage.blocked_words', ANY_ENTITY)).split('\n').map((w) => w.trim()).filter(Boolean),
      hideAfter: Number(await settingFor(tx, c, 'engage.hide_after_reports', ANY_ENTITY)) || 3,
    };
  }

  /** The company's spaces, made the first time: the company (approval on), each location and each department. */
  async spaces(tx: Tx, org: string): Promise<Space[]> {
    const [locations, departments, have] = await Promise.all([
      tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true } }),
      tx.department.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
      tx.engSpace.findMany({ where: { organizationId: org } }),
    ]);
    const missing = [
      ...(have.some((s) => s.kind === 'company') ? [] : [{ organizationId: org, kind: 'company', refId: null, name: 'Company', approval: true }]),
      ...locations.filter((l) => !have.some((s) => s.kind === 'location' && s.refId === l.id)).map((l) => ({ organizationId: org, kind: 'location', refId: l.id, name: l.name, approval: false })),
      ...departments.filter((d) => !have.some((s) => s.kind === 'department' && s.refId === d.id)).map((d) => ({ organizationId: org, kind: 'department', refId: d.id, name: d.name, approval: false })),
    ];
    if (missing.length) await tx.engSpace.createMany({ data: missing, skipDuplicates: true });
    const all = missing.length ? await tx.engSpace.findMany({ where: { organizationId: org } }) : have;
    // Names follow the location and department (renamed there); archived locations leave the list.
    const name = (s: (typeof all)[number]) => (s.kind === 'location' ? locations.find((l) => l.id === s.refId)?.name : s.kind === 'department' ? departments.find((d) => d.id === s.refId)?.name : 'Company');
    const order = ['company', 'location', 'department'];
    return all
      .filter((s) => name(s))
      .map((s) => ({ id: s.id, kind: s.kind, refId: s.refId, name: name(s)!, approval: s.approval }))
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name));
  }

  private members(tx: Tx, org: string, s: Space, userId?: string) {
    return this.announcements.audience(tx, org, s.kind === 'location' ? [s.refId!] : [], s.kind === 'department' ? [s.refId!] : [], userId);
  }

  /** The spaces I am in today. */
  private async mySpaces(tx: Tx, org: string, me: string) {
    const all = await this.spaces(tx, org);
    const mine: Space[] = [];
    for (const s of all) if ((await this.members(tx, org, s, me)).length) mine.push(s);
    return { all, mine };
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const users = await tx.user.findMany({ where: { organizationId: org, id: { in: ids.filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true, status: true } });
    return new Map(users.map((u) => [u.id, { name: u.name ?? u.email, left: u.status === 'inactive' }]));
  }

  /** The spaces directory: every space, its members today, who posts, and whether I am in it. */
  directory(ctx: TenantContext, user: ScopeUser) {
    const me = this.me(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { all, mine } = await this.mySpaces(tx, c.organizationId, me);
      const out = [];
      for (const s of all) out.push({ id: s.id, name: s.name, kind: s.kind, members: (await this.members(tx, c.organizationId, s)).length, approval: s.approval, joined: mine.some((m) => m.id === s.id) });
      return out;
    });
  }

  /** My feed: updates in my spaces (published, plus my own held or waiting ones), newest first, with likes and comments. */
  async feed(ctx: TenantContext, user: ScopeUser, spaceId?: string) {
    const me = this.me(user);
    const can = { announce: await this.companyWide(user, 'engage.announce'), moderate: await this.companyWide(user, 'engage.moderate') };
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { mine } = await this.mySpaces(tx, org, me);
      const ids = mine.map((s) => s.id).filter((id) => !spaceId || id === spaceId);
      if (spaceId && !ids.length) throw new NotFoundException('No such space.');
      const posts = await tx.engPost.findMany({
        where: { organizationId: org, kind: { in: ['update', 'kudos', 'poll'] }, spaceId: { in: ids }, OR: [{ state: 'published' }, { authorUserId: me, state: { in: ['pending', 'held'] } }] },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { _count: { select: { reactions: true, comments: { where: { state: 'published' } } } }, reactions: { where: { userId: me }, select: { id: true } }, kudos: true, votes: { select: { userId: true, option: true } } },
      });
      const who = await this.names(tx, org, [...posts.map((p) => p.authorUserId), ...posts.flatMap((p) => p.kudos?.receiverIds ?? [])]);
      return {
        // The composer warns before posting (the server holds the post anyway); what I may do here.
        blockedWords: (await this.settings(tx, c)).words,
        can,
        spaces: mine.map((s) => ({ id: s.id, name: s.name, kind: s.kind, approval: s.approval })),
        posts: posts.map((p) => ({
          id: p.id,
          kind: (p.kind === 'poll' ? 'poll' : 'update') as 'update' | 'poll',
          spaceId: p.spaceId,
          space: mine.find((s) => s.id === p.spaceId)?.name ?? '',
          body: p.body,
          author: who.get(p.authorUserId!)?.name ?? 'Former user',
          authorLeft: who.get(p.authorUserId!)?.left ?? false,
          mine: p.authorUserId === me,
          at: p.createdAt.toISOString(),
          state: p.state as 'published' | 'pending' | 'held',
          likes: p._count.reactions,
          liked: p.reactions.length > 0,
          comments: p._count.comments,
          // Batch G2 item 73: a kudos names the people thanked, the value and the badge.
          kudos: p.kudos ? { to: p.kudos.receiverIds.map((u) => who.get(u)?.name ?? 'Former user'), value: p.kudos.value, badge: p.kudos.badge } : null,
          // Item 75: the counts show to me only once I voted, or after the poll closed.
          poll: p.pollOptions ? this.pollView(p.pollOptions as string[], p.pollClosesOn!, p.votes, me) : null,
        })),
      };
    });
  }

  /** Posts an update to one of my spaces: published, waiting for approval, or held for a blocked word. */
  post(ctx: TenantContext, user: ScopeUser, dto: PostDto) {
    const me = this.me(user, true);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { mine } = await this.mySpaces(tx, org, me);
      const space = mine.find((s) => s.id === dto.spaceId);
      if (!space) throw new NotFoundException('You can post only in your own spaces.');
      const s = await this.settings(tx, c);
      // Item 75: a poll has 2 to 5 different options and closes today or later (within 90 days).
      if (dto.options) {
        const opts = dto.options.map((o) => o.trim());
        if (opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) throw new BadRequestException('Give 2 to 5 different options.');
        if (!dto.closesOn) throw new BadRequestException('Choose the day the poll closes.');
        if (dto.closesOn < todayIst() || dto.closesOn > new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)) throw new BadRequestException('The poll closes from today and within 90 days.');
      } else if (dto.closesOn) throw new BadRequestException('A closing day is only for a poll.');
      const word = blockedWord([dto.body, ...(dto.options ?? [])].join(' '), s.words);
      const direct = space.kind === 'company' ? await this.companyWide(user, 'engage.announce') : !space.approval;
      const state = word ? 'held' : direct ? 'published' : 'pending';
      const p = await tx.engPost.create({ data: { organizationId: org, kind: dto.options ? 'poll' : 'update', spaceId: space.id, authorUserId: me, body: dto.body, state, heldReason: word ? `Blocked word "${word}"` : state === 'pending' ? 'Needs approval' : null, ...(dto.options ? { pollOptions: dto.options.map((o) => o.trim()), pollClosesOn: new Date(`${dto.closesOn}T00:00:00Z`) } : {}) } });
      await audit(tx, c, 'engage.post.created', 'eng_post', p.id, { spaceId: space.id, state });
      return { id: p.id, state };
    });
  }

  /** A post I may read: in one of my spaces and published. */
  private async readable(tx: Tx, org: string, me: string, id: string) {
    const p = await tx.engPost.findFirst({ where: { organizationId: org, id, kind: { in: ['update', 'kudos', 'poll'] }, state: 'published' } });
    if (!p) throw new NotFoundException('No such post.');
    const space = (await this.spaces(tx, org)).find((s) => s.id === p.spaceId);
    if (!space || !(await this.members(tx, org, space, me)).length) throw new NotFoundException('No such post.');
    return p;
  }

  private pollView(options: string[], closesOn: Date, votes: { userId: string; option: number }[], me: string) {
    const mine = votes.find((v) => v.userId === me)?.option ?? null;
    const closed = closesOn.toISOString().slice(0, 10) < todayIst();
    return { options, closesOn: closesOn.toISOString().slice(0, 10), closed, myVote: mine, votes: mine !== null || closed ? options.map((_, i) => votes.filter((v) => v.option === i).length) : null };
  }

  /** Item 75: I vote once on an open poll I can read; then I see the counts. */
  vote(ctx: TenantContext, user: ScopeUser, id: string, option: number) {
    const me = this.me(user, true);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.readable(tx, c.organizationId, me, id);
      if (!p.pollOptions) throw new BadRequestException('This post is not a poll.');
      const options = p.pollOptions as string[];
      if (option >= options.length) throw new BadRequestException('Choose one of the poll’s options.');
      if (p.pollClosesOn!.toISOString().slice(0, 10) < todayIst()) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_POLL_CLOSED', message: 'This poll has closed.' });
      const made = await tx.engPollVote.createMany({ data: [{ organizationId: c.organizationId, postId: p.id, userId: me, option }], skipDuplicates: true });
      if (!made.count) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_ALREADY_VOTED', message: 'You have voted on this poll already.' });
      const votes = await tx.engPollVote.findMany({ where: { postId: p.id }, select: { userId: true, option: true } });
      return this.pollView(options, p.pollClosesOn!, votes, me);
    });
  }

  /** Like or unlike. */
  like(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = this.me(user, true);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.readable(tx, c.organizationId, me, id);
      const had = await tx.engReaction.deleteMany({ where: { postId: p.id, userId: me } });
      if (!had.count) await tx.engReaction.create({ data: { organizationId: c.organizationId, postId: p.id, userId: me } });
      return { liked: !had.count, likes: await tx.engReaction.count({ where: { postId: p.id } }) };
    });
  }

  comments(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = this.me(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.readable(tx, c.organizationId, me, id);
      const rows = await tx.engComment.findMany({ where: { postId: p.id, OR: [{ state: 'published' }, { authorUserId: me, state: 'held' }] }, orderBy: { createdAt: 'asc' }, take: 200 });
      const who = await this.names(tx, c.organizationId, rows.map((r) => r.authorUserId));
      return rows.map((r) => ({ id: r.id, author: who.get(r.authorUserId)?.name ?? 'Former user', mine: r.authorUserId === me, body: r.body, at: r.createdAt.toISOString(), held: r.state === 'held' }));
    });
  }

  comment(ctx: TenantContext, user: ScopeUser, id: string, dto: CommentDto) {
    const me = this.me(user, true);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await this.readable(tx, c.organizationId, me, id);
      const word = blockedWord(dto.body, (await this.settings(tx, c)).words);
      const r = await tx.engComment.create({ data: { organizationId: c.organizationId, postId: p.id, authorUserId: me, body: dto.body, state: word ? 'held' : 'published', heldReason: word ? `Blocked word "${word}"` : null } });
      await audit(tx, c, 'engage.comment.created', 'eng_comment', r.id, { postId: p.id, held: Boolean(word) });
      return { id: r.id, held: Boolean(word) };
    });
  }

  /** I report a post or comment (once); the company's number of reports hides it until a moderator reviews it. */
  report(ctx: TenantContext, user: ScopeUser, target: 'post' | 'comment', id: string) {
    const me = this.me(user, true);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const item = target === 'post' ? await this.readable(tx, org, me, id) : await tx.engComment.findFirst({ where: { organizationId: org, id, state: 'published' } });
      if (!item) throw new NotFoundException('Not found.');
      if (target === 'comment') await this.readable(tx, org, me, (item as { postId: string }).postId);
      if (item.authorUserId === me) throw new BadRequestException('You can’t report your own.');
      const made = await tx.engReport.createMany({ data: [{ organizationId: org, target, targetId: id, reporterUserId: me }], skipDuplicates: true });
      if (!made.count) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_ALREADY_REPORTED', message: 'You already reported this.' });
      const { hideAfter } = await this.settings(tx, c);
      const n = await tx.engReport.count({ where: { target, targetId: id } });
      const hide = n >= hideAfter;
      if (target === 'post') await tx.engPost.update({ where: { id }, data: { reports: n, ...(hide ? { state: 'hidden', heldReason: `${n} reports` } : {}) } });
      else await tx.engComment.update({ where: { id }, data: { reports: n, ...(hide ? { state: 'hidden', heldReason: `${n} reports` } : {}) } });
      await audit(tx, c, `engage.${target}.reported`, target === 'post' ? 'eng_post' : 'eng_comment', id, { reports: n, hidden: hide });
      return { reported: true, hidden: hide };
    });
  }

  // ------------------------------------------------------------------------------------------ moderation

  /** The queue: posts and comments held, hidden or waiting for approval, with the author's earlier moderation actions. */
  queue(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const spaces = await this.spaces(tx, org);
      const posts = await tx.engPost.findMany({ where: { organizationId: org, kind: { in: ['update', 'kudos', 'poll'] }, state: { in: ['pending', 'held', 'hidden'] } }, orderBy: { createdAt: 'asc' }, take: 200 });
      const comments = await tx.engComment.findMany({ where: { organizationId: org, state: { in: ['held', 'hidden'] } }, orderBy: { createdAt: 'asc' }, take: 200, include: { post: { select: { spaceId: true } } } });
      const authors = [...posts.map((p) => p.authorUserId), ...comments.map((x) => x.authorUserId)];
      const who = await this.names(tx, org, authors);
      const prior = await tx.engModAction.groupBy({ by: ['authorUserId'], where: { organizationId: org, authorUserId: { in: authors.filter((x): x is string => Boolean(x)) }, action: { in: ['hide', 'delete', 'warn'] } }, _count: true });
      const priorOf = (u: string | null) => prior.find((p) => p.authorUserId === u)?._count ?? 0;
      const space = (id: string | null) => spaces.find((s) => s.id === id)?.name ?? '';
      return [
        ...posts.map((p) => ({ id: p.id, kind: 'post' as const, author: who.get(p.authorUserId!)?.name ?? 'Former user', space: space(p.spaceId), text: p.body, reason: p.heldReason ?? '', reports: p.reports, state: p.state as 'pending' | 'held' | 'hidden', at: p.createdAt.toISOString(), priorActions: priorOf(p.authorUserId) })),
        ...comments.map((x) => ({ id: x.id, kind: 'comment' as const, author: who.get(x.authorUserId)?.name ?? 'Former user', space: space(x.post.spaceId), text: x.body, reason: x.heldReason ?? '', reports: x.reports, state: x.state as 'held' | 'hidden', at: x.createdAt.toISOString(), priorActions: priorOf(x.authorUserId) })),
      ];
    });
  }

  /** A moderator acts: approve or restore publishes; hide keeps it out; delete removes it for good; warn tells the author. */
  async moderate(ctx: TenantContext, target: 'post' | 'comment', id: string, dto: ModerateDto) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const item = target === 'post' ? await tx.engPost.findFirst({ where: { organizationId: org, id, kind: { in: ['update', 'kudos', 'poll'] }, state: { in: ['pending', 'held', 'hidden', 'published'] } } }) : await tx.engComment.findFirst({ where: { organizationId: org, id, state: { in: ['held', 'hidden', 'published'] } } });
      if (!item) throw new NotFoundException('Not found.');
      if (dto.action === 'warn' && !dto.note?.trim()) throw new BadRequestException('Write the note to the author.');
      if (dto.action === 'approve' && item.state !== 'pending') throw new ConflictException({ statusCode: 409, code: 'ENGAGE_NOT_WAITING', message: 'Only a post waiting for approval can be approved.' });
      if (dto.action === 'restore' && !['held', 'hidden'].includes(item.state)) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_NOT_HELD', message: 'Only a held or hidden item can be restored.' });
      const state = dto.action === 'approve' || dto.action === 'restore' ? 'published' : dto.action === 'hide' ? 'hidden' : dto.action === 'delete' ? 'deleted' : item.state;
      const data = { state, heldReason: state === 'published' ? null : item.heldReason, ...(dto.action === 'delete' ? { body: target === 'post' ? '(deleted)' : '(deleted)' } : {}) };
      if (target === 'post') await tx.engPost.update({ where: { id }, data });
      else await tx.engComment.update({ where: { id }, data });
      if (dto.action === 'restore') await tx.engReport.deleteMany({ where: { target, targetId: id } });
      await tx.engModAction.create({ data: { organizationId: org, target, targetId: id, authorUserId: item.authorUserId, action: dto.action, note: dto.note || null, byUserId: c.userId! } });
      // The audit row never carries the post's words; the author and the action do.
      await audit(tx, c, `engage.${target}.${dto.action}`, target === 'post' ? 'eng_post' : 'eng_comment', id, { author: item.authorUserId, noted: Boolean(dto.note) });
      return { authorUserId: item.authorUserId, state };
    });
    if (out.authorUserId && ['approve', 'hide', 'delete', 'warn'].includes(dto.action)) {
      const words = { approve: 'Your post was approved and is in the feed.', hide: `Your ${target} was hidden by a moderator.`, delete: `Your ${target} was removed by a moderator.`, warn: `A moderator wrote to you about your ${target}: ${dto.note}` }[dto.action as 'approve' | 'hide' | 'delete' | 'warn'];
      await this.notifications
        .notifySystem(ctx, [out.authorUserId], 'engage.moderation.outcome', { entityType: target === 'post' ? 'eng_post' : 'eng_comment', entityId: id, contextText: words, linkPath: '/yx/engage' }, null)
        .catch((e: Error) => this.logger.warn(`moderation notice: ${e.message}`));
    }
    return { state: out.state };
  }

  /**
   * Answer 2666: a moderator routes a repeat author to HR (holders of case.disciplinary.raise for the whole company): HR
   * is told the author and how many earlier moderation actions there are, never the post's words. Once per item.
   */
  async routeToHr(ctx: TenantContext, target: 'post' | 'comment', id: string) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const item = target === 'post' ? await tx.engPost.findFirst({ where: { organizationId: org, id, kind: { in: ['update', 'kudos', 'poll'] } } }) : await tx.engComment.findFirst({ where: { organizationId: org, id } });
      if (!item || !item.authorUserId) throw new NotFoundException('Not found.');
      if (await tx.engModAction.findFirst({ where: { organizationId: org, target, targetId: id, action: 'route_hr' }, select: { id: true } })) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_ROUTED', message: 'This was sent to HR already.' });
      const prior = await tx.engModAction.count({ where: { organizationId: org, authorUserId: item.authorUserId, action: { in: ['hide', 'delete', 'warn'] } } });
      const hr = (await companyKeyHolders(tx, org, 'case.disciplinary.raise', todayIst())).filter((u) => u !== item.authorUserId && u !== c.userId);
      if (!hr.length) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_NO_HR', message: 'Nobody in HR can take this (the key to raise a disciplinary case). Ask your System Admin.' });
      const author = (await this.names(tx, org, [item.authorUserId])).get(item.authorUserId)?.name ?? 'An employee';
      await tx.engModAction.create({ data: { organizationId: org, target, targetId: id, authorUserId: item.authorUserId, action: 'route_hr', byUserId: c.userId! } });
      await audit(tx, c, `engage.${target}.route_hr`, target === 'post' ? 'eng_post' : 'eng_comment', id, { author: item.authorUserId, prior, hr: hr.length });
      return { hr, text: `A feed moderator asks HR to look at ${author}: ${prior} earlier moderation ${prior === 1 ? 'action' : 'actions'} on their posts or comments.` };
    });
    await this.notifications
      .notifySystem(ctx, out.hr, 'engage.moderation.routed', { entityType: target === 'post' ? 'eng_post' : 'eng_comment', entityId: id, contextText: out.text, linkPath: '/yx/home' }, { subject: 'A feed moderator asks HR to look at someone', html: '<p>A feed moderator asks HR to look at someone. Open YukthiX to see who.</p>' })
      .catch((e: Error) => this.logger.warn(`route to HR notice: ${e.message}`));
    return { routed: out.hr.length };
  }

  /** M09 Q2: a moderator switches a space to approval (or back). The company space always needs approval for non-announcers. */
  setApproval(ctx: TenantContext, id: string, approval: boolean) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = (await this.spaces(tx, c.organizationId)).find((x) => x.id === id);
      if (!s) throw new NotFoundException('No such space.');
      if (s.kind === 'company') throw new BadRequestException('On the company space only announcers post without approval.');
      await tx.engSpace.update({ where: { id }, data: { approval } });
      await audit(tx, c, 'engage.space.approval', 'eng_space', id, { approval });
      return { approval };
    });
  }
}

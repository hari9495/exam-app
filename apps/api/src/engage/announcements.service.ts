import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { AnnouncementDto, AudienceDto } from './dto';
import { ownGroupIds } from '../user-groups/group-rules';
import { carriesAmount, reminderDue } from './engage-rules';
import { cleanHtml, htmlToText } from '../service-desk/rich-text';

// Batch G2 item 12 (M09, ENG-03; answers 2601-2602): announcements. engage.announce (company-wide) writes, publishes and
// tracks them; everyone in the audience reads and acknowledges them in the feed. The audience is read against people's
// jobs on the day (empty lists = everyone). Email carries the title and a link only, and never an amount.

export interface AudiencePerson {
  userId: string;
  name: string;
  department: string | null;
  location: string | null;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The key must be held for the whole company (announcements go across entities). */
  async companyWide(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['engage.announce']);
    if (!tenantWide(v, 'engage.announce')) throw new ForbiddenException('Announcements go to the whole company: this needs the key for the whole company, not one legal entity.');
  }

  /** People with a login whose job today is in the lists (empty = everyone); one person when userId is given. */
  async audience(tx: Tx, org: string, locationIds: string[], departmentIds: string[], userId?: string, groupIds: readonly string[] = []): Promise<AudiencePerson[]> {
    const today = todayIst();
    const one = userId ? Prisma.sql`AND e.user_id = ${userId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<{ user_id: string; given_name: string; family_name: string | null; dept: string | null; loc: string | null }[]>`
      SELECT DISTINCT ON (e.user_id) e.user_id::text, e.given_name, e.family_name, dpt.name::text AS dept, l.name::text AS loc
      FROM employee_assignments ea
      JOIN employees e ON e.organization_id = ea.organization_id AND e.id = ea.employee_id
      JOIN employments em ON em.organization_id = ea.organization_id AND em.id = ea.employment_id
      JOIN users u ON u.id = e.user_id AND u.status = 'active'
      LEFT JOIN departments dpt ON dpt.organization_id = ea.organization_id AND dpt.id = ea.department_id
      LEFT JOIN locations l ON l.organization_id = ea.organization_id AND l.id = ea.location_id
      WHERE ea.organization_id = ${org}::uuid AND ea.superseded_at IS NULL AND e.user_id IS NOT NULL
        AND ea.valid_from <= ${today}::date AND (ea.valid_to IS NULL OR ea.valid_to >= ${today}::date)
        AND (em.exited_on IS NULL OR em.exited_on >= ${today}::date)
        AND (cardinality(${locationIds}::uuid[]) = 0 OR ea.location_id = ANY(${locationIds}::uuid[]))
        AND (cardinality(${departmentIds}::uuid[]) = 0 OR EXISTS (SELECT 1 FROM unnest(${departmentIds}::uuid[]) x WHERE dpt.path LIKE '%/' || x::text || '/%'))
        AND (cardinality(${[...groupIds]}::uuid[]) = 0 OR EXISTS (SELECT 1 FROM user_group_members gm WHERE gm.organization_id = ea.organization_id AND gm.user_id = e.user_id AND gm.group_id = ANY(${[...groupIds]}::uuid[])))
        ${one}
      ORDER BY e.user_id, em.joined_on DESC`;
    return rows.map((r) => ({ userId: r.user_id, name: [r.given_name, r.family_name].filter(Boolean).join(' '), department: r.dept, location: r.loc }));
  }

  async checkLists(tx: Tx, org: string, dto: AudienceDto) {
    // T2-G 42: groups in the audience are the company's own.
    await ownGroupIds(tx, org, dto.groupIds);
    if (dto.locationIds.length && (await tx.location.count({ where: { organizationId: org, id: { in: dto.locationIds } } })) !== new Set(dto.locationIds).size) throw new BadRequestException('Choose the company’s own locations.');
    if (dto.departmentIds.length && (await tx.department.count({ where: { organizationId: org, id: { in: dto.departmentIds } } })) !== new Set(dto.departmentIds).size) throw new BadRequestException('Choose the company’s own departments.');
  }

  /** The composer's choices: locations and departments. */
  options(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const [locations, departments, everyone, groups] = await Promise.all([
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.department.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        this.audience(tx, org, [], []),
        // T2-G 42: the company's groups.
        tx.userGroup.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      ]);
      return { locations, departments, groups, everyone: everyone.length };
    });
  }

  /** How many people the lists reach today. */
  reach(ctx: TenantContext, dto: AudienceDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.checkLists(tx, c.organizationId, dto);
      return { count: (await this.audience(tx, c.organizationId, dto.locationIds, dto.departmentIds, undefined, dto.groupIds ?? [])).length };
    });
  }

  async create(ctx: TenantContext, dto: AnnouncementDto) {
    const now = new Date();
    const at = dto.publishAt ? new Date(dto.publishAt) : now;
    if (at.getTime() < now.getTime() - 60_000) throw new BadRequestException('Choose a time from now on, or publish now.');
    if (at.getTime() > now.getTime() + 90 * 86_400_000) throw new BadRequestException('Schedule it within 90 days.');
    if (dto.email && carriesAmount(dto.title)) throw new BadRequestException('Email never carries amounts: change the title, or send it in the app only.');
    // The message is simple formatting only (the desk's allow-list), cleaned before it is stored.
    const body = cleanHtml(dto.body);
    if (!htmlToText(body).trim()) throw new BadRequestException('Write the message.');
    if (!dto.ackRequired && dto.ackDueOn) throw new BadRequestException('A date to acknowledge by needs “Ask people to acknowledge”.');
    if (dto.ackRequired && dto.ackDueOn && dto.ackDueOn.slice(0, 10) < todayIst()) throw new BadRequestException('Choose a date from today on.');
    const id = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.checkLists(tx, c.organizationId, dto);
      if (!(await this.audience(tx, c.organizationId, dto.locationIds, dto.departmentIds, undefined, dto.groupIds ?? [])).length) throw new BadRequestException('Nobody is in that audience today. Choose other locations, departments or groups.');
      const p = await tx.engPost.create({
        data: {
          organizationId: c.organizationId,
          kind: 'announcement',
          authorUserId: c.userId ?? null,
          title: dto.title,
          body,
          locationIds: [...new Set(dto.locationIds)],
          departmentIds: [...new Set(dto.departmentIds)],
          groupIds: [...new Set(dto.groupIds ?? [])],
          email: dto.email,
          ackRequired: dto.ackRequired,
          ackDueOn: dto.ackRequired && dto.ackDueOn ? new Date(`${dto.ackDueOn.slice(0, 10)}T00:00:00Z`) : null,
          pinned: dto.pinned,
          publishAt: at,
        },
      });
      await audit(tx, c, 'engage.announcement.created', 'eng_post', p.id, { email: dto.email, ackRequired: dto.ackRequired, pinned: dto.pinned, scheduled: at > now, locations: dto.locationIds.length, departments: dto.departmentIds.length, groups: (dto.groupIds ?? []).length });
      return p.id;
    });
    if (at <= now) await this.publishDue(ctx.organizationId as string).catch((e: Error) => this.logger.warn(`announcement notice: ${e.message}`));
    return { id };
  }

  /** The announcements, newest first, with how far each has gone. */
  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const posts = await tx.engPost.findMany({ where: { organizationId: org, kind: 'announcement', state: { not: 'deleted' } }, orderBy: { publishAt: 'desc' }, take: 200, include: { reads: { select: { ackedAt: true } } } });
      const out = [];
      for (const p of posts) {
        const people = (await this.audience(tx, org, p.locationIds, p.departmentIds, undefined, p.groupIds)).length;
        out.push({ id: p.id, title: p.title!, publishAt: p.publishAt.toISOString(), scheduled: p.publishAt > new Date(), people, read: p.reads.length, acknowledged: p.reads.filter((r) => r.ackedAt).length, ackRequired: p.ackRequired, ackDueOn: p.ackDueOn ? p.ackDueOn.toISOString().slice(0, 10) : null, pinned: p.pinned });
      }
      return out;
    });
  }

  /** One announcement and, per person in its audience today, whether they read and acknowledged it. */
  detail(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await tx.engPost.findFirst({ where: { organizationId: c.organizationId, id, kind: 'announcement', state: { not: 'deleted' } }, include: { reads: true } });
      if (!p) throw new NotFoundException('No such announcement.');
      const people = await this.audience(tx, c.organizationId, p.locationIds, p.departmentIds, undefined, p.groupIds);
      const by = new Map(p.reads.map((r) => [r.userId, r]));
      const today = todayIst();
      return {
        id: p.id,
        title: p.title!,
        body: p.body,
        publishAt: p.publishAt.toISOString(),
        scheduled: p.publishAt > new Date(),
        ackRequired: p.ackRequired,
        ackDueOn: p.ackDueOn ? p.ackDueOn.toISOString().slice(0, 10) : null,
        email: p.email,
        pinned: p.pinned,
        canRemind: p.ackRequired && p.publishAt <= new Date() && (!p.remindedOn || p.remindedOn.toISOString().slice(0, 10) < today),
        rows: people.map((x) => ({ id: x.userId, name: x.name, department: x.department, location: x.location, read: by.get(x.userId)?.readAt.toISOString() ?? null, acked: by.get(x.userId)?.ackedAt?.toISOString() ?? null })),
      };
    });
  }

  /** "Remind N people": a notice to everyone in the audience who has not acknowledged; once a day. */
  async remind(ctx: TenantContext, id: string) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await tx.engPost.findFirst({ where: { organizationId: c.organizationId, id, kind: 'announcement', state: 'published' }, include: { reads: true } });
      if (!p) throw new NotFoundException('No such announcement.');
      if (!p.ackRequired) throw new BadRequestException('This announcement does not ask people to acknowledge.');
      if (p.publishAt > new Date()) throw new BadRequestException('It is not published yet.');
      const today = todayIst();
      if (p.remindedOn && p.remindedOn.toISOString().slice(0, 10) >= today) throw new ConflictException({ statusCode: 409, code: 'ENGAGE_REMINDED_TODAY', message: 'A reminder already went today. Try again tomorrow.' });
      const acked = new Set(p.reads.filter((r) => r.ackedAt).map((r) => r.userId));
      const users = (await this.audience(tx, c.organizationId, p.locationIds, p.departmentIds, undefined, p.groupIds)).map((x) => x.userId).filter((u) => !acked.has(u));
      await tx.engPost.update({ where: { id: p.id }, data: { remindedOn: new Date(`${today}T00:00:00Z`) } });
      await audit(tx, c, 'engage.announcement.reminded', 'eng_post', p.id, { people: users.length });
      return { p, users };
    });
    await this.tellReminder(ctx.organizationId as string, out.p, out.users);
    return { reminded: out.users.length };
  }

  // ------------------------------------------------------------------------------------------ the reader

  /** Announcements for me (published, in my audience today), pinned first, with whether I acknowledged; reading marks them read. */
  mine(ctx: TenantContext, user: ScopeUser) {
    const me = user.userId;
    if (!me) throw new ForbiddenException('Not signed in.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const posts = await tx.engPost.findMany({ where: { organizationId: org, kind: 'announcement', state: 'published', publishAt: { lte: new Date() } }, orderBy: { publishAt: 'desc' }, take: 100, include: { reads: { where: { userId: me } } } });
      const shown = [];
      for (const p of posts) if ((await this.audience(tx, org, p.locationIds, p.departmentIds, me, p.groupIds)).length) shown.push(p);
      // Reading through someone else's session (support, acting) never marks anything read.
      if (!user.impersonatorUserId && !user.actingSuperAdmin)
        await tx.engPostRead.createMany({ data: shown.filter((p) => !p.reads.length).map((p) => ({ organizationId: org, postId: p.id, userId: me })), skipDuplicates: true });
      const authors = await tx.user.findMany({ where: { organizationId: org, id: { in: shown.map((p) => p.authorUserId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true, status: true } });
      return shown
        .sort((a, b) => Number(b.pinned) - Number(a.pinned))
        .map((p) => {
          const a = authors.find((x) => x.id === p.authorUserId);
          return { id: p.id, kind: 'announcement' as const, title: p.title!, body: p.body, author: a?.name ?? a?.email ?? 'The company', authorLeft: a?.status === 'inactive', at: p.publishAt.toISOString(), pinned: p.pinned, ack: p.ackRequired ? { due: p.ackDueOn ? p.ackDueOn.toISOString().slice(0, 10) : null, done: Boolean(p.reads[0]?.ackedAt) } : null };
        });
    });
  }

  /** I acknowledge an announcement that asks for it (only my own; never while acting for someone else). */
  acknowledge(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = user.userId;
    if (!me || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves acknowledges.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.engPost.findFirst({ where: { organizationId: org, id, kind: 'announcement', state: 'published', publishAt: { lte: new Date() } } });
      if (!p || !(await this.audience(tx, org, p.locationIds, p.departmentIds, me, p.groupIds)).length) throw new NotFoundException('No such announcement.');
      if (!p.ackRequired) throw new BadRequestException('This announcement does not ask for acknowledgement.');
      const r = await tx.engPostRead.upsert({ where: { postId_userId: { postId: p.id, userId: me } }, create: { organizationId: org, postId: p.id, userId: me, ackedAt: new Date() }, update: {} });
      if (!r.ackedAt) await tx.engPostRead.update({ where: { id: r.id }, data: { ackedAt: new Date() } });
      await audit(tx, c, 'engage.announcement.acknowledged', 'eng_post', p.id, {});
      return { acknowledged: true };
    });
  }

  // ------------------------------------------------------------------------------------------ the jobs

  /** Announcements whose time has come and nobody was told yet: a notice (and the email when chosen) to the audience. */
  async publishDue(org?: string): Promise<number> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.engPost.findMany({ where: { kind: 'announcement', state: 'published', notifiedAt: null, publishAt: { lte: new Date() }, ...(org ? { organizationId: org } : {}) }, take: 200 }),
    );
    let n = 0;
    for (const p of due) {
      const c: CompanyContext = { organizationId: p.organizationId, isSuperAdmin: false, userId: null };
      const users = await this.tenantPrisma.forTenant(c, async (tx) => {
        const claimed = await tx.engPost.updateMany({ where: { id: p.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
        return claimed.count ? (await this.audience(tx, p.organizationId, p.locationIds, p.departmentIds, undefined, p.groupIds)).map((x) => x.userId) : [];
      });
      if (!users.length) continue;
      n++;
      const title = escapeHtml(p.title!);
      await this.notifications
        .notifySystem(c as TenantContext, users, 'engage.announcement.published', { entityType: 'eng_post', entityId: p.id, contextText: `Announcement: ${p.title}${p.ackRequired ? ' (please acknowledge)' : ''}`, linkPath: `/yx/engage?post=${p.id}` }, p.email ? { subject: `Announcement: ${p.title}`, html: `<p>${title}</p><p>Read it in YukthiX${p.ackRequired ? ' and acknowledge it' : ''}.</p>` } : null)
        .catch((e: Error) => this.logger.warn(`announcement ${p.id}: ${e.message}`));
    }
    return n;
  }

  /** Answer 2602: reminders on day 2 and day 5 to people who have not acknowledged (in-app; never more). */
  async remindDue(today = todayIst()): Promise<number> {
    const posts = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.engPost.findMany({ where: { kind: 'announcement', state: 'published', ackRequired: true, notifiedAt: { not: null }, remindersSent: { lt: 2 } }, include: { reads: { select: { userId: true, ackedAt: true } } }, take: 500 }),
    );
    let n = 0;
    for (const p of posts) {
      const published = new Date(p.publishAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);
      if (!reminderDue(published, today, p.remindersSent)) continue;
      if (p.ackDueOn && p.ackDueOn.toISOString().slice(0, 10) < today) continue;
      const c: CompanyContext = { organizationId: p.organizationId, isSuperAdmin: false, userId: null };
      const acked = new Set(p.reads.filter((r) => r.ackedAt).map((r) => r.userId));
      const users = await this.tenantPrisma.forTenant(c, async (tx) => {
        const claimed = await tx.engPost.updateMany({ where: { id: p.id, remindersSent: p.remindersSent }, data: { remindersSent: p.remindersSent + 1 } });
        return claimed.count ? (await this.audience(tx, p.organizationId, p.locationIds, p.departmentIds, undefined, p.groupIds)).map((x) => x.userId).filter((u) => !acked.has(u)) : [];
      });
      if (users.length) n++;
      await this.tellReminder(p.organizationId, p, users);
    }
    return n;
  }

  private async tellReminder(org: string, p: { id: string; title: string | null }, users: string[]) {
    if (!users.length) return;
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false } as TenantContext, users, 'engage.announcement.reminder', { entityType: 'eng_post', entityId: p.id, contextText: `Please acknowledge: ${p.title}`, linkPath: `/yx/engage?post=${p.id}` }, { subject: 'An announcement is waiting for you to acknowledge it', html: '<p>An announcement in YukthiX is waiting for you to acknowledge it.</p>' })
      .catch((e: Error) => this.logger.warn(`announcement reminder ${p.id}: ${e.message}`));
  }
}

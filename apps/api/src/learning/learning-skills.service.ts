import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, implicitSql, tenantWide } from '../access/scope';
import { LEARNING_KEYS, asDate, iso, jobsToday, ownEmployee } from './learning-core';
import { NotificationsService } from '../notifications/notifications.service';
import { randomUUID } from 'crypto';

// G3d (M07): skills (LRN-09 team matrix, LRN-10 profile, LRN-15 suggestions) on the company skills library that
// Settings › Performance keeps (company_skills), with the level each job title needs from the role map
// (role_competency_map). A completed course suggests its skills; a suggestion joins the profile only when the person or
// their manager confirms it, and a rejected one is never offered again from the same course. Training needs and
// department budgets (LRN-11) are L&D's (learning.manage).

/** The level a course skill gives when the course sets none (courses made before answer 2672). */
export const COURSE_SKILL_LEVEL = 2;

/** Answer 2672: a course's skills (trimmed, the first of each name kept) with the level each gives, in the same order. */
export function courseSkills(dto: { skills: string[]; skillLevels?: number[] }) {
  if (dto.skillLevels && dto.skillLevels.length !== dto.skills.length) throw new BadRequestException('Give a level for each skill.');
  const seen = new Set<string>();
  const skills: string[] = [];
  const skillLevels: number[] = [];
  dto.skills.forEach((raw, i) => {
    const s = raw.trim();
    if (!s || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase());
    skills.push(s);
    skillLevels.push(dto.skillLevels?.[i] ?? COURSE_SKILL_LEVEL);
  });
  return { skills, skillLevels };
}

/** On completion: each course skill that names an active library skill becomes a pending suggestion at the level the course gives (once per course). */
export async function suggestFromCourse(tx: Tx, c: CompanyContext, e: { id: string; employeeId: string }, course: { title: string; skills: string[]; skillLevels: number[] }) {
  if (!course.skills.length) return 0;
  const lib = await tx.companySkill.findMany({ where: { organizationId: c.organizationId, status: 'active', kind: { not: 'domain' } }, select: { id: true, name: true } });
  const wanted = new Map(course.skills.map((s, i) => [s.trim().toLowerCase(), course.skillLevels[i] ?? COURSE_SKILL_LEVEL]));
  const hits = lib.filter((s) => wanted.has(s.name.toLowerCase())).map((s) => ({ ...s, level: wanted.get(s.name.toLowerCase())! }));
  if (!hits.length) return 0;
  const held = await tx.learningSkillLevel.findMany({ where: { organizationId: c.organizationId, employeeId: e.employeeId, companySkillId: { in: hits.map((h) => h.id) } } });
  const rows = hits.filter((h) => (held.find((x) => x.companySkillId === h.id)?.level ?? 0) < h.level);
  const made = await tx.learningSkillSuggestion.createMany({ data: rows.map((h) => ({ organizationId: c.organizationId, employeeId: e.employeeId, companySkillId: h.id, level: h.level, source: 'course', sourceRef: e.id, evidence: course.title.slice(0, 200) })), skipDuplicates: true });
  return made.count;
}

/** The financial year (April to March) a day falls in, by its April's year. */
export const fyOf = (day: string) => (Number(day.slice(5, 7)) >= 4 ? Number(day.slice(0, 4)) : Number(day.slice(0, 4)) - 1);

type Need = Prisma.LearningNeedGetPayload<object>;
const SOURCE_WORDS = { course: 'Course', manager: 'Manager', self: 'Self, confirmed by the manager' } as const;
const NEED_WORDS = { source: { skill_gap: 'Skill gap', manager: 'Manager request', compliance: 'Compliance', review: 'Review gap' }, priority: { high: 'High', medium: 'Medium', low: 'Low' }, status: { new: 'New', planned: 'Planned', in_progress: 'In progress', closed: 'Closed' } } as const;

@Injectable()
export class LearningSkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, LEARNING_KEYS);
  }

  private ld(v: Viewer) {
    return tenantWide(v, 'learning.manage') && !v.actingForOther;
  }

  /** Self, their manager chain (today), or L&D; anyone else: 404. `manager` is true for the chain only. */
  private async access(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string) {
    if (!(await tx.employee.count({ where: { organizationId: c.organizationId, id: employeeId } }))) throw new NotFoundException('Not found');
    const me = await ownEmployee(tx, c);
    if (me === employeeId && !v.actingForOther) return { self: true, manager: false };
    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT (${await implicitSql(tx, c, v.actingForOther ? null : me, Prisma.sql`${employeeId}::uuid`, Prisma.sql`${todayIst()}::date`)}) AS ok`;
    if (row?.ok) return { self: false, manager: true };
    if (this.ld(v)) return { self: false, manager: false };
    throw new NotFoundException('Not found');
  }

  /** The skills the job title needs today (from the role map): skill id to the required level. */
  private async required(tx: Tx, c: CompanyContext, designationIds: string[], today: string) {
    if (!designationIds.length) return [];
    const rows = await tx.$queryRaw<{ designation_id: string; company_skill_id: string; expected_level: number }[]>`
      SELECT m.designation_id::text, k.company_skill_id::text, m.expected_level
      FROM role_competency_map m JOIN competencies k ON k.organization_id = m.organization_id AND k.id = m.competency_id AND k.status = 'active'
      WHERE m.organization_id = ${c.organizationId}::uuid AND m.designation_id = ANY(${designationIds}::uuid[])
        AND m.valid_from <= ${today}::date AND (m.valid_to IS NULL OR m.valid_to >= ${today}::date)`;
    return rows;
  }

  private async designationsOf(tx: Tx, c: CompanyContext, ids: string[], today: string) {
    if (!ids.length) return new Map<string, string>();
    const rows = await tx.$queryRaw<{ employee_id: string; designation_id: string }[]>`
      SELECT DISTINCT ON (a.employee_id) a.employee_id::text, a.designation_id::text FROM employee_assignments a
      WHERE a.organization_id = ${c.organizationId}::uuid AND a.employee_id = ANY(${ids}::uuid[]) AND a.superseded_at IS NULL
        AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
      ORDER BY a.employee_id, a.valid_from DESC`;
    return new Map(rows.map((r) => [r.employee_id, r.designation_id]));
  }

  /** LRN-10: a person's skills (confirmed levels, what the job needs, the gaps) and pending suggestions (LRN-15). */
  async profile(ctx: TenantContext, user: ScopeUser, employeeId: string | 'me') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const id = employeeId === 'me' ? await ownEmployee(tx, c) : employeeId;
      if (!id) throw new NotFoundException('Not found');
      const who = await this.access(tx, c, v, id);
      const today = todayIst();
      const [job] = await jobsToday(tx, c, today, [id]);
      const des = (await this.designationsOf(tx, c, [id], today)).get(id);
      const req = des ? await this.required(tx, c, [des], today) : [];
      const levels = await tx.learningSkillLevel.findMany({ where: { organizationId: c.organizationId, employeeId: id } });
      const pending = await tx.learningSkillSuggestion.findMany({ where: { organizationId: c.organizationId, employeeId: id, status: 'pending' }, orderBy: { createdAt: 'asc' } });
      const skillIds = [...new Set([...req.map((r) => r.company_skill_id), ...levels.map((l) => l.companySkillId), ...pending.map((p) => p.companySkillId)])];
      const names = new Map((await tx.companySkill.findMany({ where: { organizationId: c.organizationId, id: { in: skillIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
      const skills = skillIds
        .filter((s) => req.some((r) => r.company_skill_id === s) || levels.some((l) => l.companySkillId === s))
        .map((s) => {
          const l = levels.find((x) => x.companySkillId === s);
          return { id: s, name: names.get(s) ?? '', level: l?.level ?? null, required: req.find((r) => r.company_skill_id === s)?.expected_level ?? null, source: l ? SOURCE_WORDS[l.source as keyof typeof SOURCE_WORDS] : 'Not assessed', evidence: l?.evidence ?? '', updated: iso(l?.updatedAt) };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        employeeId: id,
        person: job?.name ?? '',
        role: job?.designation ?? '',
        self: who.self,
        canAssess: who.manager,
        canDecide: who.self || who.manager,
        skills,
        // Answer 2673: a skill the person added waits for the manager; the person sees it but cannot confirm it.
        suggestions: who.self || who.manager ? pending.map((p) => ({ id: p.id, skillId: p.companySkillId, skill: names.get(p.companySkillId) ?? '', level: p.level, from: p.source === 'self' ? 'Added by the person' : 'Course', evidence: p.evidence, canDecide: p.source === 'self' ? who.manager : true })) : [],
        library: who.manager || who.self ? (await tx.companySkill.findMany({ where: { organizationId: c.organizationId, status: 'active', kind: { not: 'domain' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })) : [],
      };
    });
  }

  /** LRN-15: the person or their manager confirms (the level joins the profile, never lowering it) or rejects. */
  async decide(ctx: TenantContext, user: ScopeUser, suggestionId: string, confirm: boolean) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await tx.learningSkillSuggestion.findFirst({ where: { organizationId: c.organizationId, id: suggestionId } });
      if (!s) throw new NotFoundException('No such suggestion.');
      const who = await this.access(tx, c, v, s.employeeId);
      if (!who.self && !who.manager) throw new NotFoundException('No such suggestion.');
      if (s.source === 'self' && !who.manager) throw new ForbiddenException('Your manager confirms a skill you added.');
      const moved = await tx.learningSkillSuggestion.updateMany({ where: { id: s.id, status: 'pending' }, data: { status: confirm ? 'confirmed' : 'rejected', decidedBy: c.userId, decidedAt: new Date() } });
      if (!moved.count) throw new ConflictException('This suggestion was decided already.');
      if (confirm) {
        const cur = await tx.learningSkillLevel.findUnique({ where: { employeeId_companySkillId: { employeeId: s.employeeId, companySkillId: s.companySkillId } } });
        if (!cur || cur.level < s.level)
          await tx.learningSkillLevel.upsert({
            where: { employeeId_companySkillId: { employeeId: s.employeeId, companySkillId: s.companySkillId } },
            create: { organizationId: c.organizationId, employeeId: s.employeeId, companySkillId: s.companySkillId, level: s.level, source: s.source, evidence: s.evidence, setBy: c.userId },
            update: { level: s.level, source: s.source, evidence: s.evidence, setBy: c.userId, updatedAt: new Date() },
          });
      }
      await audit(tx, c, confirm ? 'learning.skill.confirmed' : 'learning.skill.rejected', 'learning_skill_suggestion', s.id, { by: who.self ? 'self' : 'manager' });
      return { ok: true };
    });
  }

  /** LRN-10: the manager (chain) sets a report's level of a library skill. */
  async assess(ctx: TenantContext, user: ScopeUser, employeeId: string, dto: { skillId: string; level: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const who = await this.access(tx, c, v, employeeId);
      if (!who.manager) throw new ForbiddenException('Their manager sets a confirmed level.');
      if (!(await tx.companySkill.count({ where: { organizationId: c.organizationId, id: dto.skillId, status: 'active', kind: { not: 'domain' } } }))) throw new BadRequestException('Choose a skill from the library.');
      await tx.learningSkillLevel.upsert({
        where: { employeeId_companySkillId: { employeeId, companySkillId: dto.skillId } },
        create: { organizationId: c.organizationId, employeeId, companySkillId: dto.skillId, level: dto.level, source: 'manager', evidence: 'Assessed by the manager', setBy: c.userId },
        update: { level: dto.level, source: 'manager', evidence: 'Assessed by the manager', setBy: c.userId, updatedAt: new Date() },
      });
      await audit(tx, c, 'learning.skill.assessed', 'employee', employeeId, { skillId: dto.skillId, level: dto.level });
      return { ok: true };
    });
  }

  /** Answer 2673: a person adds a library skill at a level to their own profile; it waits for their manager. */
  async addOwn(ctx: TenantContext, user: ScopeUser, dto: { skillId: string; level: number; note?: string }) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the person adds their own skills.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await ownEmployee(tx, c);
      if (!me) throw new NotFoundException('Not found');
      const skill = await tx.companySkill.findFirst({ where: { organizationId: org, id: dto.skillId, status: 'active', kind: { not: 'domain' } }, select: { id: true, name: true } });
      if (!skill) throw new BadRequestException('Choose a skill from the library.');
      const cur = await tx.learningSkillLevel.findUnique({ where: { employeeId_companySkillId: { employeeId: me, companySkillId: skill.id } } });
      if (cur && cur.level >= dto.level) throw new BadRequestException(`Your profile already has ${skill.name} at level ${cur.level}.`);
      if (await tx.learningSkillSuggestion.count({ where: { organizationId: org, employeeId: me, companySkillId: skill.id, source: 'self', status: 'pending' } })) throw new ConflictException(`${skill.name} is already waiting for your manager.`);
      const s = await tx.learningSkillSuggestion.create({ data: { organizationId: org, employeeId: me, companySkillId: skill.id, level: dto.level, source: 'self', sourceRef: randomUUID(), evidence: dto.note?.trim().slice(0, 200) || 'Added by the person' } });
      await audit(tx, c, 'learning.skill.self_added', 'learning_skill_suggestion', s.id, { skillId: skill.id, level: dto.level });
      const [job] = await jobsToday(tx, c, todayIst(), [me]);
      const mgr = job?.managerEmployeeId ? await tx.employee.findFirst({ where: { organizationId: org, id: job.managerEmployeeId }, select: { userId: true } }) : null;
      return { id: s.id, managerUserId: mgr?.userId ?? null, text: `${job?.name ?? 'Someone on your team'} added ${skill.name} at level ${dto.level} to their skills. Confirm or reject it.`, me };
    });
    if (out.managerUserId)
      await this.notifications
        .notifySystem(ctx, [out.managerUserId], 'learning.skill_added', { entityType: 'learning_skill_suggestion', entityId: out.id, contextText: out.text, linkPath: `/yx/learning/skills/people/${out.me}/suggestions` }, { subject: out.text, html: `<p>${out.text} Open YukthiX to decide.</p>` })
        .catch(() => undefined);
    return { id: out.id, manager: Boolean(out.managerUserId) };
  }

  /** Answer 2675: a manager raises a training need for someone in their team (chain), from the team skills. Once per open need. */
  async raiseNeed(ctx: TenantContext, user: ScopeUser, dto: { employeeId: string; skillId?: string; title: string; priority: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const who = await this.access(tx, c, v, dto.employeeId);
      if (!who.manager) throw new ForbiddenException('Their manager raises a training need here.');
      if (dto.skillId && !(await tx.companySkill.count({ where: { organizationId: org, id: dto.skillId, status: 'active' } }))) throw new BadRequestException('Choose a skill from the library.');
      if (dto.skillId && (await tx.learningNeed.count({ where: { organizationId: org, employeeId: dto.employeeId, companySkillId: dto.skillId, status: { not: 'closed' } } }))) throw new ConflictException('There is already an open training need for this skill.');
      const n = await tx.learningNeed.create({ data: { organizationId: org, title: dto.title.trim(), employeeId: dto.employeeId, companySkillId: dto.skillId ?? null, source: dto.skillId ? 'skill_gap' : 'manager', priority: dto.priority, estCost: 0, raisedBy: c.userId! } });
      await audit(tx, c, 'learning.need.raised', 'learning_need', n.id, { employeeId: dto.employeeId, skillId: dto.skillId ?? null, by: 'manager' });
      return { id: n.id };
    });
  }

  /** LRN-09: my direct reports today × the skills their job titles need, with their confirmed levels. */
  team(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      if (!me) return { skills: [], people: [] };
      const today = todayIst();
      const team = (await jobsToday(tx, c, today)).filter((j) => j.managerEmployeeId === me);
      const des = await this.designationsOf(tx, c, team.map((t) => t.employeeId), today);
      const req = await this.required(tx, c, [...new Set(des.values())], today);
      const skillIds = [...new Set(req.map((r) => r.company_skill_id))];
      const names = new Map((await tx.companySkill.findMany({ where: { organizationId: c.organizationId, id: { in: skillIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
      const order = skillIds.sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? ''));
      const levels = await tx.learningSkillLevel.findMany({ where: { organizationId: c.organizationId, employeeId: { in: team.map((t) => t.employeeId) }, companySkillId: { in: order } } });
      return {
        skills: order.map((s) => names.get(s) ?? ''),
        skillIds: order,
        people: team
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({
            employeeId: t.employeeId,
            name: t.name,
            role: t.designation,
            levels: order.map((s) => levels.find((l) => l.employeeId === t.employeeId && l.companySkillId === s)?.level ?? null),
            required: order.map((s) => req.find((r) => r.designation_id === des.get(t.employeeId) && r.company_skill_id === s)?.expected_level ?? 0),
          })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ LRN-11 needs and budgets

  private async needL(user: ScopeUser) {
    const v = await this.viewer(user);
    if (!this.ld(v)) throw new ForbiddenException('Training needs and budgets need learning.manage.');
  }

  async needs(ctx: TenantContext, user: ScopeUser) {
    await this.needL(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.learningNeed.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 1000 });
      return this.needRows(tx, c, rows);
    });
  }

  private async needRows(tx: Tx, c: CompanyContext, rows: Need[]) {
    const people = new Map((await jobsToday(tx, c, todayIst(), rows.flatMap((r) => (r.employeeId ? [r.employeeId] : [])))).map((j) => [j.employeeId, j.name]));
    const depts = new Map((await tx.department.findMany({ where: { organizationId: c.organizationId, id: { in: rows.flatMap((r) => (r.departmentId ? [r.departmentId] : [])) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
    const skills = new Map((await tx.companySkill.findMany({ where: { organizationId: c.organizationId, id: { in: rows.flatMap((r) => (r.companySkillId ? [r.companySkillId] : [])) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const courses = new Map((await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: rows.flatMap((r) => (r.courseId ? [r.courseId] : [])) } }, select: { id: true, title: true } })).map((s) => [s.id, s.title]));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      who: r.employeeId ? (people.get(r.employeeId) ?? 'Former employee') : `${depts.get(r.departmentId!) ?? 'A department'} (department)`,
      source: NEED_WORDS.source[r.source as keyof typeof NEED_WORDS.source],
      skill: r.companySkillId ? (skills.get(r.companySkillId) ?? '') : '',
      priority: NEED_WORDS.priority[r.priority as keyof typeof NEED_WORDS.priority],
      status: NEED_WORDS.status[r.status as keyof typeof NEED_WORDS.status],
      plan: r.courseId ? courses.get(r.courseId) : undefined,
      estCost: Number(r.estCost),
      version: r.version,
    }));
  }

  async addNeed(ctx: TenantContext, user: ScopeUser, dto: { title: string; employeeId?: string; departmentId?: string; skillId?: string; source: string; priority: string; estCost: number }) {
    await this.needL(user);
    if (Boolean(dto.employeeId) === Boolean(dto.departmentId)) throw new BadRequestException('Choose a person or a department.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (dto.employeeId && !(await tx.employee.count({ where: { organizationId: org, id: dto.employeeId } }))) throw new BadRequestException('Choose a person of this company.');
      if (dto.departmentId && !(await tx.department.count({ where: { organizationId: org, id: dto.departmentId } }))) throw new BadRequestException('Choose a department of this company.');
      if (dto.skillId && !(await tx.companySkill.count({ where: { organizationId: org, id: dto.skillId, status: 'active' } }))) throw new BadRequestException('Choose a skill from the library.');
      const n = await tx.learningNeed.create({ data: { organizationId: org, title: dto.title.trim(), employeeId: dto.employeeId ?? null, departmentId: dto.departmentId ?? null, companySkillId: dto.skillId ?? null, source: dto.source, priority: dto.priority, estCost: dto.estCost, raisedBy: c.userId! } });
      await audit(tx, c, 'learning.need.added', 'learning_need', n.id, { title: n.title });
      return { id: n.id };
    });
  }

  /** Plan needs with a course (planned), or move their status; one version at a time. */
  async updateNeeds(ctx: TenantContext, user: ScopeUser, dto: { ids: string[]; status: 'new' | 'planned' | 'in_progress' | 'closed'; courseId?: string }) {
    await this.needL(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (dto.courseId && !(await tx.learningCourse.count({ where: { organizationId: c.organizationId, id: dto.courseId, status: { not: 'retired' } } }))) throw new BadRequestException('Choose a course of this company.');
      if (dto.status === 'planned' && !dto.courseId) throw new BadRequestException('A plan needs its course.');
      const moved = await tx.learningNeed.updateMany({ where: { organizationId: c.organizationId, id: { in: dto.ids } }, data: { status: dto.status, ...(dto.courseId ? { courseId: dto.courseId } : {}), version: { increment: 1 } } });
      if (moved.count !== dto.ids.length) throw new NotFoundException('Some of these needs are not here.');
      await audit(tx, c, 'learning.need.updated', 'organization', c.organizationId, { needs: dto.ids.length, status: dto.status });
      return { updated: moved.count };
    });
  }

  /** Each department's budget for the financial year, with spent (completed, external approved) and committed (open). */
  async budgets(ctx: TenantContext, user: ScopeUser, year?: number) {
    await this.needL(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const fy = year ?? fyOf(today);
      const from = asDate(`${fy}-04-01`);
      const to = asDate(`${fy + 1}-04-01`);
      const depts = await tx.department.findMany({ where: { organizationId: c.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const plans = await tx.learningBudget.findMany({ where: { organizationId: c.organizationId, year: fy } });
      const deptOf = new Map((await jobsToday(tx, c, today)).map((j) => [j.employeeId, j.departmentId]));
      const courses = new Map((await tx.learningCourse.findMany({ where: { organizationId: c.organizationId }, select: { id: true, cost: true } })).map((x) => [x.id, Number(x.cost)]));
      const done = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, status: 'completed', completedAt: { gte: from, lt: to } }, select: { employeeId: true, courseId: true } });
      const open = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, status: { in: ['enrolled', 'in_progress'] }, assignedOn: { gte: from, lt: to } }, select: { employeeId: true, courseId: true } });
      const ext = await tx.learningExternalRequest.findMany({ where: { organizationId: c.organizationId, status: 'approved', decidedAt: { gte: from, lt: to } }, select: { employeeId: true, cost: true } });
      const sum = (rows: { employeeId: string; amount: number }[], d: string) => rows.filter((r) => deptOf.get(r.employeeId) === d).reduce((a, r) => a + r.amount, 0);
      const spentRows = [...done.map((e) => ({ employeeId: e.employeeId, amount: courses.get(e.courseId) ?? 0 })), ...ext.map((e) => ({ employeeId: e.employeeId, amount: Number(e.cost) }))];
      const openRows = open.map((e) => ({ employeeId: e.employeeId, amount: courses.get(e.courseId) ?? 0 }));
      return {
        year: fy,
        rows: depts
          .map((d) => ({ departmentId: d.id, dept: d.name, planned: Number(plans.find((p) => p.departmentId === d.id)?.amount ?? 0), spent: sum(spentRows, d.id), committed: sum(openRows, d.id) }))
          .filter((r) => r.planned || r.spent || r.committed),
        departments: depts.map((d) => ({ value: d.id, label: d.name })),
        skills: (await tx.companySkill.findMany({ where: { organizationId: c.organizationId, status: 'active', kind: { not: 'domain' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })).map((s) => ({ value: s.id, label: s.name })),
      };
    });
  }

  /** Answer 2676: the year's budgets as CSV (text that starts like a formula is written as text); audited. */
  async budgetsCsv(ctx: TenantContext, user: ScopeUser, year?: number) {
    const b = await this.budgets(ctx, user, year);
    const cell = (v: string | number) => {
      const t = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
      return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [['Department', `Budget FY ${b.year}-${String(b.year + 1).slice(2)}`, 'Spent', 'Committed', 'Left'], ...b.rows.map((r) => [r.dept, r.planned, r.spent, r.committed, r.planned - r.spent - r.committed])];
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'learning.budgets.exported', 'organization', c.organizationId, { year: b.year, rows: b.rows.length }));
    return { year: b.year, csv: `${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n` };
  }

  async setBudget(ctx: TenantContext, user: ScopeUser, dto: { departmentId: string; year: number; amount: number }) {
    await this.needL(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await tx.department.count({ where: { organizationId: c.organizationId, id: dto.departmentId } }))) throw new BadRequestException('Choose a department of this company.');
      await tx.learningBudget.upsert({
        where: { departmentId_year: { departmentId: dto.departmentId, year: dto.year } },
        create: { organizationId: c.organizationId, departmentId: dto.departmentId, year: dto.year, amount: dto.amount, updatedBy: c.userId! },
        update: { amount: dto.amount, updatedBy: c.userId!, updatedAt: new Date() },
      });
      await audit(tx, c, 'learning.budget.set', 'department', dto.departmentId, { year: dto.year, amount: dto.amount });
      return { ok: true };
    });
  }
}

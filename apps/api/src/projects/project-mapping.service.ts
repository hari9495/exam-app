import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, has, type ScopeUser } from '../access/scope';
import { settingFor } from '../people/probation';
import { TOOL_LABEL, TOOL_PROVIDERS, WORK_TOOLS, type ToolProvider, type WorkToolConnector } from '../time/providers/work-tools';
import { addDays } from '../time/time-maths';
import { mondayOf } from '../time/time-rules';
import { inOrder, MAX_STARS, ruleFor } from './mapping-rules';
import { ProjectsService } from './projects.service';
import type { MappingRuleDto } from './dto';

// Projects P-3 (PRJ-08, founder answers 1409, 1410): the company's timesheet mapping rules. Projects managers
// (projects.manage) and System Admins (org.settings.manage) read and change them; nobody else. Projects must be on.
// "Test against last week" runs the saved rules over the editor's own connected tools (their own items only: raw
// activity is never shown to anyone else). Pre-fill itself (timesheet.tool_suggestions) stays off by default (1409);
// the System Admin switches it in Settings › Projects & timesheets.

const MAX_RULES = 200;
const PREFILL = 'timesheet.tool_suggestions';

@Injectable()
export class ProjectMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(WORK_TOOLS) private readonly tools: WorkToolConnector,
  ) {}

  private async editor(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['projects.manage', 'org.settings.manage']);
    if (!has(v, 'projects.manage') && !has(v, 'org.settings.manage')) throw new ForbiddenException('Only Projects managers and System Admins see and change the timesheet mapping rules.');
    return { admin: has(v, 'org.settings.manage') };
  }

  private async needOn(tx: Tx, c: CompanyContext) {
    if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company. A System Admin switches it on in Settings › Projects & timesheets.' });
  }

  /** The rules in the order they are tried, the projects (with tasks) to choose from and the pre-fill switch. */
  async list(ctx: TenantContext, user: ScopeUser) {
    const e = await this.editor(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const [rules, projects, tasks] = await Promise.all([
        tx.projectMappingRule.findMany({ where: { organizationId: org } }),
        tx.timesheetProject.findMany({ where: { organizationId: org }, select: { id: true, code: true, name: true, status: true }, orderBy: { code: 'asc' } }),
        tx.projectTask.findMany({ where: { organizationId: org }, select: { id: true, projectId: true, name: true, active: true }, orderBy: { name: 'asc' } }),
      ]);
      const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime());
      return {
        canEdit: true,
        canSwitchPrefill: e.admin,
        prefillOn: (await settingFor(tx, c, PREFILL, { legalEntityId: '' })) === 'on',
        sources: TOOL_PROVIDERS.map((p) => ({ value: p, label: TOOL_LABEL[p] })),
        rules: ordered.map((r) => {
          const p = projects.find((x) => x.id === r.projectId)!;
          const t = tasks.find((x) => x.id === r.taskId);
          // A rule to a project that is not active (or a task not in use) is kept but never applies.
          const problem = p.status !== 'active' ? `${p.code} is not active` : t && !t.active ? `${t.name} is not in use` : null;
          return { id: r.id, source: r.source, pattern: r.pattern, projectId: r.projectId, project: p.code, taskId: r.taskId, task: t?.name ?? null, priority: r.priority, enabled: r.enabled, version: r.version, problem };
        }),
        projects: projects.filter((p) => p.status !== 'closed').map((p) => ({ id: p.id, code: p.code, name: p.name, tasks: tasks.filter((t) => t.projectId === p.id && t.active).map((t) => ({ id: t.id, name: t.name })) })),
      };
    });
  }

  private async check(tx: Tx, org: string, dto: MappingRuleDto) {
    if ((dto.pattern.match(/\*/g)?.length ?? 0) > MAX_STARS) throw new BadRequestException(`A pattern has at most ${MAX_STARS} * in it.`);
    if (!dto.pattern.replace(/\*/g, '').trim()) throw new BadRequestException('A pattern needs some text besides *.');
    const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id: dto.projectId }, select: { status: true, code: true } });
    if (!p) throw new BadRequestException('Choose a project of this company.');
    if (p.status === 'closed') throw new BadRequestException(`${p.code} is closed. Choose an open project.`);
    if (dto.taskId) {
      const t = await tx.projectTask.findFirst({ where: { organizationId: org, id: dto.taskId, projectId: dto.projectId }, select: { active: true } });
      if (!t) throw new BadRequestException("Choose one of the project's tasks.");
      if (!t.active) throw new BadRequestException('That task is not in use. Choose another.');
    }
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: MappingRuleDto) {
    await this.editor(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      await this.check(tx, org, dto);
      if ((await tx.projectMappingRule.count({ where: { organizationId: org } })) >= MAX_RULES) throw new ConflictException(`A company has at most ${MAX_RULES} rules. Remove one first.`);
      const r = await tx.projectMappingRule.create({ data: { organizationId: org, source: dto.source, pattern: dto.pattern, projectId: dto.projectId, taskId: dto.taskId ?? null, priority: dto.priority, enabled: dto.enabled ?? true, createdBy: c.userId ?? null } });
      await audit(tx, c, 'projects.mapping_rule.created', 'project_mapping_rule', r.id, { source: r.source, pattern: r.pattern, projectId: r.projectId, taskId: r.taskId, priority: r.priority });
      return { id: r.id };
    });
  }

  async update(ctx: TenantContext, user: ScopeUser, id: string, dto: MappingRuleDto & { version: number }) {
    await this.editor(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const old = await tx.projectMappingRule.findFirst({ where: { organizationId: org, id } });
      if (!old) throw new NotFoundException('No such rule.');
      await this.check(tx, org, dto);
      const { count } = await tx.projectMappingRule.updateMany({ where: { id, version: dto.version }, data: { source: dto.source, pattern: dto.pattern, projectId: dto.projectId, taskId: dto.taskId ?? null, priority: dto.priority, enabled: dto.enabled ?? old.enabled, version: { increment: 1 }, updatedAt: new Date() } });
      if (!count) throw new ConflictException('Someone changed this rule just now. Refresh and try again.');
      await audit(tx, c, 'projects.mapping_rule.changed', 'project_mapping_rule', id, { from: { source: old.source, pattern: old.pattern, projectId: old.projectId, taskId: old.taskId, priority: old.priority, enabled: old.enabled }, to: { source: dto.source, pattern: dto.pattern, projectId: dto.projectId, taskId: dto.taskId ?? null, priority: dto.priority, enabled: dto.enabled ?? old.enabled } });
      return { id, version: dto.version + 1 };
    });
  }

  async remove(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    await this.editor(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const old = await tx.projectMappingRule.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!old) throw new NotFoundException('No such rule.');
      const { count } = await tx.projectMappingRule.deleteMany({ where: { id, version } });
      if (!count) throw new ConflictException('Someone changed this rule just now. Refresh and try again.');
      await audit(tx, c, 'projects.mapping_rule.removed', 'project_mapping_rule', id, { source: old.source, pattern: old.pattern, projectId: old.projectId, priority: old.priority });
      return { id };
    });
  }

  /** The saved rules over last week's items from the editor's own connected tools. Nothing when pre-fill is off. */
  async test(ctx: TenantContext, user: ScopeUser) {
    await this.editor(user);
    const week = addDays(mondayOf(todayIst()), -7);
    const found = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.needOn(tx, c);
      const org = c.organizationId;
      const prefillOn = (await settingFor(tx, c, PREFILL, { legalEntityId: '' })) === 'on';
      if (!prefillOn) return null;
      const [rules, projects, tasks, live] = await Promise.all([
        tx.projectMappingRule.findMany({ where: { organizationId: org } }),
        tx.timesheetProject.findMany({ where: { organizationId: org, status: 'active' }, select: { id: true, code: true } }),
        tx.projectTask.findMany({ where: { organizationId: org, active: true }, select: { id: true, name: true } }),
        tx.toolConnection.findMany({ where: { organizationId: org, userId: c.userId!, status: 'connected' }, select: { provider: true } }),
      ]);
      return { rules: inOrder(rules), projects, tasks, providers: live.map((x) => x.provider as ToolProvider) };
    });
    if (!found) return { week, prefillOn: false, connected: false, items: [] };
    const items = [];
    for (const provider of found.providers) {
      for (const [i, l] of (await this.tools.suggestions(user.userId!, provider, week, addDays(week, 6))).entries()) {
        const r = ruleFor(found.rules, provider, [l.projectHint, l.source], (pid) => found.projects.some((p) => p.id === pid));
        items.push({ id: `${provider}-${l.date}-${i}`, source: provider, text: l.projectHint ?? l.source, hours: Math.round((l.minutes / 60) * 100) / 100, ruleId: r?.id ?? null, priority: r?.priority ?? null, project: r ? found.projects.find((p) => p.id === r.projectId)!.code : null, task: r?.taskId ? (found.tasks.find((t) => t.id === r.taskId)?.name ?? null) : null });
      }
    }
    return { week, prefillOn: true, connected: found.providers.length > 0, items };
  }
}

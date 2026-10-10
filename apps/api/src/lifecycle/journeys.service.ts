import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, covers, grantPeriods, started, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationService } from '../rules-engine/automation.service';
import { FormDef, checkAnswers, parseForm } from '../rules-engine/forms';
import { JourneysService as DeskJourneysService } from '../service-desk/journeys.service';
import { joinerInScope, ownOf } from '../documents/person-access';
import { TaskStatus, addDays, checkTemplateTasks, contentConfig, daysBetween, dueOn, openable, progress, surveyAnswers } from './journey-rules';
import { LOCKED_STARTER_KEYS, STARTERS, isLifeEvent, type JourneyKind, type OwnerType, type TaskKind } from './starters';

// LIFE-1.04 / 1.05 the journey engine (M01 §3.5, design §7): one checklist per joiner (anchored on the joining day) or
// leaver (on the last working day), made from the company's most specific active template.
//   owners   manager = the planned / current manager's login; person = the joiner / leaver; user / group = named;
//            hr, it, admin, finance, payroll = the template's group when set, else the HR person who owns the journey;
//   kinds    tick and form are done by hand; document closes when the person's document is in (verified when the
//            type needs it); desk_request raises a Service Desk request and closes when the desk fulfils it (D1);
//            letter is ticked by HR with the letter's reference until the letters engine lands (batch 6b);
//   moves    a new anchor day moves every unfinished task by the same days (YX-LC-13); done work never moves;
//   law      locked tasks (the appointment letter, YX-LC-26) cannot be skipped or removed from a template.

export const LIFE_KEYS = ['lifecycle.onboarding.view', 'lifecycle.onboarding.manage', 'lifecycle.journey.template.manage'] as const;
type Template = Prisma.JourneyTemplateGetPayload<object>;
type Task = Prisma.JourneyTaskGetPayload<object>;
type Journey = Prisma.JourneyGetPayload<object>;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const OWNER_LABEL: Record<OwnerType, string> = { hr: 'HR', it: 'IT', admin: 'Admin', finance: 'Finance', payroll: 'Payroll', manager: 'Manager', person: 'The joiner', user: 'Named person', group: 'Team', buddy: 'Buddy' };

export interface TemplateTaskInput {
  key: string;
  title: string;
  ownerType: OwnerType;
  ownerUserId?: string | null;
  ownerGroupId?: string | null;
  kind: TaskKind;
  config?: Record<string, unknown>;
  dueOffsetDays: number;
  dependsOn?: string[];
  required?: boolean;
  locked?: boolean;
}
export interface StartInput {
  kind: JourneyKind;
  personId: string;
  subjectType: 'preboarding' | 'exit_case' | 'employment' | 'employee_change' | 'leave_request';
  subjectId: string;
  anchorOn: string;
  templateId?: string | null;
  place: { legalEntityId: string; locationId: string; departmentId: string | null };
  ownerUserId: string | null;
  managerEmployeeId: string | null;
  personUserId: string | null;
}

@Injectable()
export class LifecycleJourneysService implements OnModuleInit {
  private readonly logger = new Logger(LifecycleJourneysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly automation: AutomationService,
    private readonly notifications: NotificationsService,
    private readonly desk: DeskJourneysService,
  ) {}

  onModuleInit() {
    // Linked tasks close themselves: a fulfilled desk request, a document in.
    this.automation.subscribe(async (ev) => {
      const ctx = { organizationId: ev.organizationId, isSuperAdmin: false };
      if (ev.type === 'helpdesk.request.fulfilled' && typeof ev.payload.ticketId === 'string') await this.closeLinked(ctx, 'sd_ticket', ev.payload.ticketId);
      // YX-LC-26: the letter task closes from the issued letter itself (batch 6b), never from a typed reference.
      if (ev.type === 'document.issued' && typeof ev.payload.personId === 'string' && typeof ev.payload.letterType === 'string' && typeof ev.payload.letterIssueId === 'string') {
        await this.closeLetterTasks(ctx, ev.payload.personId, ev.payload.letterType, ev.payload.letterIssueId);
      }
      if ((ev.type === 'document.uploaded' || ev.type === 'document.verified') && typeof ev.payload.personId === 'string' && typeof ev.payload.typeKey === 'string') {
        await this.closeDocumentTasks(ctx, ev.payload.personId, ev.payload.typeKey);
      }
    });
  }

  viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...LIFE_KEYS, 'employee.profile.view']);
  }

  // ------------------------------------------------------------------------------------------ templates

  private templateView(t: Template, tasks: Prisma.JourneyTemplateTaskGetPayload<object>[]) {
    return {
      id: t.id,
      kind: t.kind,
      name: t.name,
      legalEntityId: t.legalEntityId,
      locationId: t.locationId,
      departmentId: t.departmentId,
      starterKey: t.starterKey,
      active: t.active,
      version: t.version,
      tasks: tasks
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((x) => ({ key: x.key, title: x.title, ownerType: x.ownerType, ownerLabel: OWNER_LABEL[x.ownerType as OwnerType], ownerUserId: x.ownerUserId, ownerGroupId: x.ownerGroupId, kind: x.kind, config: x.config, dueOffsetDays: x.dueOffsetDays, dependsOn: x.dependsOn, required: x.required, locked: x.locked })),
    };
  }

  async templates(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.journeyTemplate.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
      const tasks = await tx.journeyTemplateTask.findMany({ where: { organizationId: c.organizationId, templateId: { in: rows.map((r) => r.id) } } });
      return {
        templates: rows.map((r) => this.templateView(r, tasks.filter((x) => x.templateId === r.id))),
        starters: STARTERS.map((s) => ({ key: s.key, kind: s.kind, name: s.name, summary: s.summary, tasks: s.tasks.length, copied: rows.some((r) => r.starterKey === s.key) })),
      };
    });
  }

  /** What the template editor offers: teams (user groups) and the published catalogue items a desk task can raise (D1). */
  async templateOptions(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const teams = await tx.userGroup.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const items = await tx.sdCatalogItem.findMany({ where: { organizationId: org, state: 'published' }, select: { id: true, name: true, deskId: true }, orderBy: { name: 'asc' } });
      const desks = await tx.sdDesk.findMany({ where: { organizationId: org, id: { in: items.map((i) => i.deskId) } }, select: { id: true, name: true } });
      return { teams: teams.map((t) => ({ value: t.id, label: t.name })), catalogItems: items.map((i) => ({ value: i.id, label: i.name, desk: desks.find((d) => d.id === i.deskId)?.name ?? '' })) };
    });
  }

  /** A legal-entity grant edits only that entity's checklists; company-wide ones need the company-wide grant. */
  private async mayEditTemplate(user: ScopeUser, legalEntityId: string | null | undefined) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['lifecycle.journey.template.manage']);
    if (tenantWide(v, 'lifecycle.journey.template.manage')) return;
    if (legalEntityId && (v.scopes.get('lifecycle.journey.template.manage') ?? []).some((s) => s.type === 'legal_entity' && s.id === legalEntityId)) return;
    throw new ForbiddenException(legalEntityId ? 'You cannot change checklists of that legal entity.' : 'Only a company-wide checklist admin can change company-wide checklists.');
  }

  async copyStarter(ctx: TenantContext, user: ScopeUser, starterKey: string) {
    await this.mayEditTemplate(user, null);
    const s = STARTERS.find((x) => x.key === starterKey);
    if (!s) throw new NotFoundException('No such starter.');
    // 6f: a life-event journey is off until the company turns it on (gap pass O1).
    return this.saveTemplate(ctx, user, null, { kind: s.kind, name: s.name.replace(' (starter)', ''), starterKey: s.key, active: !isLifeEvent(s.kind), tasks: s.tasks.map((t) => ({ ...t, config: t.config ?? {} })) });
  }

  async saveTemplate(ctx: TenantContext, user: ScopeUser, id: string | null, dto: { kind: JourneyKind; name: string; legalEntityId?: string | null; locationId?: string | null; departmentId?: string | null; starterKey?: string; active: boolean; version?: number; tasks: TemplateTaskInput[] }) {
    await this.mayEditTemplate(user, dto.legalEntityId);
    const problem = checkTemplateTasks(dto.tasks.map((t) => ({ key: t.key, dependsOn: t.dependsOn ?? [], dueOffsetDays: t.dueOffsetDays })));
    if (problem) throw new BadRequestException(problem);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      let t: Template;
      if (id) {
        const cur = await tx.journeyTemplate.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such checklist.');
        if (cur.legalEntityId !== (dto.legalEntityId ?? null)) await this.mayEditTemplate(user, cur.legalEntityId);
        if (cur.kind !== dto.kind) throw new BadRequestException('A checklist cannot change what it is for.');
        const n = await tx.journeyTemplate.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { name: dto.name, legalEntityId: dto.legalEntityId ?? null, locationId: dto.locationId ?? null, departmentId: dto.departmentId ?? null, active: dto.active, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this checklist. Reload it.');
        t = await tx.journeyTemplate.findFirstOrThrow({ where: { organizationId: org, id } });
      } else {
        t = await tx.journeyTemplate.create({ data: { organizationId: org, kind: dto.kind, name: dto.name, legalEntityId: dto.legalEntityId ?? null, locationId: dto.locationId ?? null, departmentId: dto.departmentId ?? null, starterKey: dto.starterKey ?? null, active: dto.active, createdBy: c.userId ?? null } });
      }
      // Only the law's tasks are locked, and they stay in every copy of a starter, locked; only their owner and day may change.
      for (const x of dto.tasks) x.locked = false;
      for (const key of LOCKED_STARTER_KEYS.get(t.starterKey ?? '') ?? []) {
        const kept = dto.tasks.find((x) => x.key === key);
        if (!kept) throw new BadRequestException('The appointment letter task is required by law and cannot be removed. You can change its owner and day.');
        kept.locked = true;
        kept.required = true;
      }
      await this.checkTasks(tx, org, dto.tasks);
      await tx.journeyTemplateTask.deleteMany({ where: { organizationId: org, templateId: t.id } });
      await tx.journeyTemplateTask.createMany({
        data: dto.tasks.map((x, i) => ({
          organizationId: org,
          templateId: t.id,
          key: x.key,
          title: x.title,
          ownerType: x.ownerType,
          ownerUserId: x.ownerType === 'user' ? (x.ownerUserId ?? null) : null,
          ownerGroupId: ['group', 'hr', 'it', 'admin', 'finance', 'payroll'].includes(x.ownerType) ? (x.ownerGroupId ?? null) : null,
          kind: x.kind,
          config: (x.config ?? {}) as Prisma.InputJsonValue,
          dueOffsetDays: x.dueOffsetDays,
          dependsOn: x.dependsOn ?? [],
          required: x.locked ? true : (x.required ?? true),
          locked: Boolean(x.locked),
          sortOrder: i,
        })),
      });
      await audit(tx, c, id ? 'journey.template.updated' : 'journey.template.created', 'journey_template', t.id, { kind: t.kind, tasks: dto.tasks.length, starterKey: t.starterKey });
      return this.templateView(t, await tx.journeyTemplateTask.findMany({ where: { organizationId: org, templateId: t.id } }));
    });
  }

  /** Owners, groups, forms, document types and catalogue items named by a template must exist in this company. */
  private async checkTasks(tx: Tx, org: string, tasks: TemplateTaskInput[]) {
    for (const x of tasks) {
      if (x.ownerType === 'user' && !(x.ownerUserId && (await tx.user.findFirst({ where: { organizationId: org, id: x.ownerUserId }, select: { id: true } })))) throw new BadRequestException(`Choose who does "${x.title}".`);
      if (x.ownerType === 'group' && !x.ownerGroupId) throw new BadRequestException(`Choose the team that does "${x.title}".`);
      if (x.ownerGroupId && !(await tx.userGroup.findFirst({ where: { organizationId: org, id: x.ownerGroupId }, select: { id: true } }))) throw new BadRequestException(`The team for "${x.title}" does not exist.`);
      const cfg = x.config ?? {};
      if (x.kind === 'form') {
        try {
          x.config = { form: parseForm(cfg.form) };
        } catch (e) {
          throw new BadRequestException(`The form of "${x.title}": ${(e as Error).message}`);
        }
      }
      if (x.kind === 'document') {
        const typeKey = typeof cfg.typeKey === 'string' ? cfg.typeKey : '';
        if (!(await tx.documentType.findFirst({ where: { key: typeKey, active: true, OR: [{ organizationId: null }, { organizationId: org }] }, select: { id: true } }))) throw new BadRequestException(`Choose the document "${x.title}" asks for.`);
        x.config = { typeKey };
      }
      if (x.kind === 'desk_request') {
        const itemId = typeof cfg.itemId === 'string' ? cfg.itemId : null;
        if (itemId && !(await tx.sdCatalogItem.findFirst({ where: { organizationId: org, id: itemId, state: 'published' }, select: { id: true } }))) throw new BadRequestException(`The catalogue item for "${x.title}" is not published.`);
        x.config = itemId ? { itemId } : {};
      }
      if (x.kind === 'letter') x.config = { letterType: typeof cfg.letterType === 'string' ? cfg.letterType.slice(0, 40) : 'other' };
      if (x.kind === 'tick') x.config = {};
      if (x.kind === 'read' || x.kind === 'watch' || x.kind === 'survey') {
        const r = contentConfig(x.kind, cfg);
        if ('problem' in r) throw new BadRequestException(`"${x.title}" ${r.problem}.`);
        x.config = r.config;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ starting

  /** The most specific active template for the place: entity + location + department beats entity only beats company-wide. */
  async pickTemplate(tx: Tx, org: string, kind: string, place: StartInput['place'], templateId?: string | null): Promise<Template> {
    if (templateId) {
      const t = await tx.journeyTemplate.findFirst({ where: { organizationId: org, id: templateId, kind, active: true } });
      if (!t) throw new BadRequestException('Choose an active checklist.');
      return t;
    }
    const all = await tx.journeyTemplate.findMany({ where: { organizationId: org, kind, active: true }, orderBy: { createdAt: 'desc' } });
    const fits = all.filter((t) => (!t.legalEntityId || t.legalEntityId === place.legalEntityId) && (!t.locationId || t.locationId === place.locationId) && (!t.departmentId || t.departmentId === place.departmentId));
    const score = (t: Template) => Number(Boolean(t.legalEntityId)) + Number(Boolean(t.locationId)) * 2 + Number(Boolean(t.departmentId)) * 2;
    const best = fits.sort((a, b) => score(b) - score(a))[0];
    if (!best) throw new BadRequestException(kind === 'onboarding' ? 'There is no active onboarding checklist yet. Set one up in Settings › Onboarding checklists (start from the YukthiX starter).' : 'There is no active offboarding checklist yet.');
    return best;
  }

  /** Creates the journey and its tasks in the caller's transaction; raise desk requests after commit with afterStart(). */
  async startIn(tx: Tx, c: CompanyContext, input: StartInput): Promise<Journey> {
    const org = c.organizationId;
    const t = await this.pickTemplate(tx, org, input.kind, input.place, input.templateId);
    const tt = (await tx.journeyTemplateTask.findMany({ where: { organizationId: org, templateId: t.id } })).sort((a, b) => a.sortOrder - b.sortOrder);
    const managerUserId = input.managerEmployeeId ? ((await tx.employee.findFirst({ where: { organizationId: org, id: input.managerEmployeeId }, select: { userId: true } }))?.userId ?? null) : null;
    const j = await tx.journey.create({ data: { organizationId: org, kind: input.kind, personId: input.personId, subjectType: input.subjectType, subjectId: input.subjectId, templateId: t.id, templateVersion: t.version, anchorOn: asDate(input.anchorOn), status: 'active', ownerUserId: input.ownerUserId } });
    const status = openable(tt.map((x) => ({ key: x.key, dueOffsetDays: x.dueOffsetDays, dependsOn: x.dependsOn, required: x.required, status: 'waiting' as TaskStatus })));
    for (const x of tt) {
      const owner = x.ownerType as OwnerType;
      const assigneeUserId = owner === 'user' ? x.ownerUserId : owner === 'manager' ? (managerUserId ?? input.ownerUserId) : owner === 'person' ? input.personUserId : x.ownerGroupId ? null : input.ownerUserId;
      await tx.journeyTask.create({
        data: { organizationId: org, journeyId: j.id, key: x.key, title: x.title, kind: x.kind, config: x.config as Prisma.InputJsonValue, ownerType: owner, assigneeUserId, assigneeGroupId: x.ownerGroupId, dueOffsetDays: x.dueOffsetDays, dueOn: asDate(dueOn(input.anchorOn, x.dueOffsetDays)), dependsOn: x.dependsOn, required: x.required, locked: x.locked, sortOrder: x.sortOrder, status: status.get(x.key) ?? 'open' },
      });
    }
    await audit(tx, c, 'journey.started', 'journey', j.id, { kind: input.kind, templateId: t.id, anchorOn: input.anchorOn, tasks: tt.length });
    await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'journey.started', payload: { journeyId: j.id, kind: input.kind, personId: input.personId } } });
    // A document already in (say, uploaded before) closes its task at once.
    for (const d of await tx.document.findMany({ where: { organizationId: org, personId: input.personId, status: { in: ['uploaded', 'verified'] } } })) await this.closeDocumentTasksIn(tx, c, input.personId, d.typeKey);
    return j;
  }

  /** After the journey's transaction: raise desk requests for open desk tasks and tell the assignees. */
  async afterStart(ctx: CompanyContext, journeyId: string, by: string | null, word = 'onboarding') {
    await this.raiseDeskRequests(ctx, journeyId, by);
    const tasks = await this.tenantPrisma.forTenant(ctx, (tx) => tx.journeyTask.findMany({ where: { organizationId: ctx.organizationId, journeyId, status: 'open' } }));
    const users = [...new Set(tasks.map((t) => t.assigneeUserId).filter((u): u is string => Boolean(u)))];
    if (users.length)
      await this.notifications
        .notifySystem(ctx, users, 'journey.task.assigned', { entityType: 'journey', entityId: journeyId, contextText: `You have new ${word} tasks`, linkPath: '/yx/people/my-tasks' }, { subject: `You have new ${word} tasks`, html: `<p>New ${word} tasks are waiting for you in YukthiX.</p>` })
        .catch(() => undefined);
  }

  private async raiseDeskRequests(ctx: CompanyContext, journeyId: string, by: string | null) {
    const org = ctx.organizationId;
    const { j, tasks, name } = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const j = await tx.journey.findFirstOrThrow({ where: { organizationId: org, id: journeyId } });
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: j.personId } });
      const tasks = await tx.journeyTask.findMany({ where: { organizationId: org, journeyId, kind: 'desk_request', status: 'open', linkId: null } });
      return { j, tasks, name: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') };
    });
    for (const t of tasks) {
      const itemId = (t.config as { itemId?: string }).itemId;
      if (!itemId) continue;
      try {
        const when = new Date(`${iso(j.anchorOn)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        const r = await this.desk.raiseFor(ctx, { personId: j.personId, itemId, dueOn: iso(t.dueOn), subject: `${t.title}: ${name}`, note: `${name} ${j.kind === 'onboarding' ? 'joins' : 'leaves'} on ${when}. Raised by YukthiX from the HR checklist.`, by, tag: j.kind === 'onboarding' ? 'joiner' : 'leaver' });
        await this.tenantPrisma.forTenant(ctx, (tx) => tx.journeyTask.updateMany({ where: { organizationId: org, id: t.id, linkId: null }, data: { linkType: 'sd_ticket', linkId: r.ticketId, version: { increment: 1 } } }));
      } catch (e) {
        this.logger.warn(`desk request for task ${t.id}: ${(e as Error).message}`);
      }
    }
  }

  /** YX-LC-13: a new anchor day moves every unfinished task by the same number of days. */
  async reanchorIn(tx: Tx, c: CompanyContext, journeyId: string, newAnchor: string) {
    const j = await tx.journey.findFirstOrThrow({ where: { organizationId: c.organizationId, id: journeyId } });
    const delta = daysBetween(iso(j.anchorOn), newAnchor);
    if (!delta) return 0;
    await tx.journey.update({ where: { id: j.id }, data: { anchorOn: asDate(newAnchor) } });
    const open = await tx.journeyTask.findMany({ where: { organizationId: c.organizationId, journeyId, status: { in: ['waiting', 'open'] } } });
    for (const t of open) await tx.journeyTask.update({ where: { id: t.id }, data: { dueOn: asDate(addDays(iso(t.dueOn), delta)), remindedOn: null, escalatedOn: null, version: { increment: 1 } } });
    await audit(tx, c, 'journey.reanchored', 'journey', journeyId, { from: iso(j.anchorOn), to: newAnchor, moved: open.length });
    return open.length;
  }

  // ------------------------------------------------------------------------------------------ access

  /** What the viewer may do on a journey: HR in scope runs it; the manager and assignees see it. */
  async access(tx: Tx, c: CompanyContext, v: Viewer, j: Journey): Promise<{ manage: boolean; see: boolean; own: { employeeId: string | null; personId: string | null }; groups: string[] }> {
    const own = await ownOf(tx, c, v);
    const groups = v.userId ? (await tx.userGroupMember.findMany({ where: { organizationId: c.organizationId, userId: v.userId }, select: { groupId: true } })).map((g) => g.groupId) : [];
    const reach = async (key: string) => {
      if (!v.grants.has(key)) return false;
      if (j.subjectType === 'preboarding') {
        const p = await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, id: j.subjectId } });
        return Boolean(p && (await joinerInScope(tx, c, v, key, p)));
      }
      const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, personId: j.personId }, select: { id: true } });
      return Boolean(e && covers(started(await grantPeriods(tx, c, v, key, e.id, own.employeeId), todayIst()), todayIst()));
    };
    const manage = !v.actingForOther && own.personId !== j.personId && (await reach('lifecycle.onboarding.manage'));
    let see = manage || (await reach('lifecycle.onboarding.view'));
    if (!see && v.userId) see = Boolean(await tx.journeyTask.findFirst({ where: { organizationId: c.organizationId, journeyId: j.id, OR: [{ assigneeUserId: v.userId }, ...(groups.length ? [{ assigneeGroupId: { in: groups } }] : [])] }, select: { id: true } }));
    if (!see && own.employeeId && j.subjectType === 'preboarding') see = Boolean(await tx.preboarding.findFirst({ where: { organizationId: c.organizationId, id: j.subjectId, managerEmployeeId: own.employeeId }, select: { id: true } }));
    return { manage, see, own, groups };
  }

  private canDo(t: Task, v: Viewer, a: { manage: boolean; groups: string[] }) {
    return a.manage || (v.userId !== null && t.assigneeUserId === v.userId) || (t.assigneeGroupId !== null && a.groups.includes(t.assigneeGroupId));
  }

  private async names(tx: Tx, org: string, userIds: (string | null)[], groupIds: (string | null)[]) {
    const users = await tx.user.findMany({ where: { organizationId: org, id: { in: userIds.filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
    const groups = await tx.userGroup.findMany({ where: { organizationId: org, id: { in: groupIds.filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
    return { user: (id: string | null) => users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? null, group: (id: string | null) => groups.find((g) => g.id === id)?.name ?? null };
  }

  private taskView(t: Task, n: { user: (id: string | null) => string | null; group: (id: string | null) => string | null }, can: boolean, today: string, seeSurvey = true) {
    const due = iso(t.dueOn);
    const manualKinds = ['tick', 'form', 'read', 'watch', 'survey'];
    const deskWithoutItem = t.kind === 'desk_request' && !(t.config as { itemId?: string }).itemId;
    return {
      id: t.id,
      key: t.key,
      title: t.title,
      kind: t.kind,
      ownerType: t.ownerType,
      ownerLabel: OWNER_LABEL[t.ownerType as OwnerType],
      assignee: n.user(t.assigneeUserId) ?? n.group(t.assigneeGroupId) ?? (t.ownerType === 'person' ? 'The joiner' : null),
      dueOn: due,
      dueOffsetDays: t.dueOffsetDays,
      status: t.status,
      overdue: (t.status === 'open' || t.status === 'waiting') && due < today,
      required: t.required,
      locked: t.locked,
      form: t.kind === 'form' ? ((t.config as { form?: FormDef }).form ?? null) : null,
      documentType: t.kind === 'document' ? ((t.config as { typeKey?: string }).typeKey ?? null) : null,
      letterType: t.kind === 'letter' ? ((t.config as { letterType?: string }).letterType ?? null) : null,
      // 6f: read / watch / survey content for the step; survey ratings only for HR running it and the person (§7.5).
      content: ['read', 'watch', 'survey'].includes(t.kind) ? t.config : null,
      answers: t.kind === 'survey' && !seeSurvey ? null : (t.answers ?? null),
      link: t.linkType ? { type: t.linkType, id: t.linkId } : null,
      completedAt: t.completedAt?.toISOString() ?? null,
      completedBy: n.user(t.completedBy),
      skipReason: t.skipReason,
      canComplete: can && t.status === 'open' && (manualKinds.includes(t.kind) || deskWithoutItem),
      canSkip: can && (t.status === 'open' || t.status === 'waiting') && !t.locked && !t.required,
      version: t.version,
    };
  }

  async journey(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const j = await tx.journey.findFirst({ where: { organizationId: org, id } });
      if (!j) throw new NotFoundException('No such checklist.');
      const a = await this.access(tx, c, v, j);
      if (!a.see) throw new ForbiddenException('You cannot see this checklist.');
      const tasks = (await tx.journeyTask.findMany({ where: { organizationId: org, journeyId: id } })).sort((x, y) => x.sortOrder - y.sortOrder);
      const n = await this.names(tx, org, [...tasks.map((t) => t.assigneeUserId), ...tasks.map((t) => t.completedBy), j.ownerUserId], tasks.map((t) => t.assigneeGroupId));
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: j.personId } });
      const t = await tx.journeyTemplate.findFirst({ where: { organizationId: org, id: j.templateId }, select: { name: true } });
      const today = todayIst();
      return {
        id: j.id,
        kind: j.kind,
        person: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' '),
        personId: j.personId,
        subjectType: j.subjectType,
        subjectId: j.subjectId,
        anchorOn: iso(j.anchorOn),
        status: j.status,
        progress: j.progress,
        template: t?.name ?? '',
        owner: n.user(j.ownerUserId),
        canManage: a.manage,
        today,
        tasks: tasks.map((x) => this.taskView(x, n, this.canDo(x, v, a), today, a.manage || (v.userId !== null && x.completedBy === v.userId))),
      };
    });
  }

  /** My tasks across active journeys: mine and my teams' (IT, Admin, Finance owners; founder D1). */
  async myTasks(ctx: TenantContext, user: ScopeUser) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!user.userId) return { today: todayIst(), tasks: [] };
      const groups = (await tx.userGroupMember.findMany({ where: { organizationId: org, userId: user.userId }, select: { groupId: true } })).map((g) => g.groupId);
      const tasks = await tx.journeyTask.findMany({ where: { organizationId: org, status: { in: ['open', 'waiting'] }, OR: [{ assigneeUserId: user.userId }, ...(groups.length ? [{ assigneeGroupId: { in: groups } }] : [])] }, orderBy: { dueOn: 'asc' }, take: 300 });
      const journeys = await tx.journey.findMany({ where: { organizationId: org, id: { in: [...new Set(tasks.map((t) => t.journeyId))] }, status: 'active' } });
      const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: journeys.map((j) => j.personId) } } });
      const n = await this.names(tx, org, tasks.map((t) => t.assigneeUserId), tasks.map((t) => t.assigneeGroupId));
      const today = todayIst();
      return {
        today,
        tasks: tasks
          .filter((t) => journeys.some((j) => j.id === t.journeyId))
          .map((t) => {
            const j = journeys.find((x) => x.id === t.journeyId)!;
            const p = persons.find((x) => x.id === j.personId)!;
            return { ...this.taskView(t, n, true, today), journeyId: j.id, journeyKind: j.kind, person: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' '), anchorOn: iso(j.anchorOn) };
          }),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ doing tasks

  private async finishIn(tx: Tx, c: CompanyContext, t: Task, data: Prisma.JourneyTaskUpdateManyMutationInput, expectVersion: number | null) {
    const n = await tx.journeyTask.updateMany({ where: { organizationId: c.organizationId, id: t.id, status: { in: ['open', 'waiting'] }, ...(expectVersion === null ? {} : { version: expectVersion }) }, data: { ...data, version: { increment: 1 } } });
    if (!n.count) {
      if (expectVersion === null) return false;
      throw new ConflictException('Someone else changed this task. Reload it.');
    }
    await this.refresh(tx, c, t.journeyId);
    return true;
  }

  /** Opens tasks whose dependencies are now finished, recomputes progress and closes the journey when all is done. */
  private async refresh(tx: Tx, c: CompanyContext, journeyId: string) {
    const tasks = await tx.journeyTask.findMany({ where: { organizationId: c.organizationId, journeyId } });
    const next = openable(tasks.map((t) => ({ key: t.key, dueOffsetDays: t.dueOffsetDays, dependsOn: t.dependsOn, required: t.required, status: t.status as TaskStatus })));
    for (const t of tasks) if (next.get(t.key) && next.get(t.key) !== t.status) await tx.journeyTask.update({ where: { id: t.id }, data: { status: next.get(t.key), version: { increment: 1 } } });
    const p = progress(tasks.map((t) => ({ key: t.key, dueOffsetDays: 0, dependsOn: [], required: t.required, status: t.status as TaskStatus })));
    const allFinished = tasks.every((t) => ['done', 'skipped', 'cancelled'].includes(t.status) || !t.required);
    await tx.journey.updateMany({ where: { organizationId: c.organizationId, id: journeyId, status: 'active' }, data: { progress: p, ...(allFinished ? { status: 'done' } : {}) } });
  }

  async complete(ctx: TenantContext, user: ScopeUser, taskId: string, dto: { version: number; answers?: Record<string, unknown>; note?: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await tx.journeyTask.findFirst({ where: { organizationId: c.organizationId, id: taskId } });
      if (!t) throw new NotFoundException('No such task.');
      const j = await tx.journey.findFirstOrThrow({ where: { organizationId: c.organizationId, id: t.journeyId } });
      if (j.status !== 'active') throw new ConflictException('This checklist is closed.');
      const a = await this.access(tx, c, v, j);
      if (!this.canDo(t, v, a)) throw new ForbiddenException('This task is not yours.');
      if (t.status !== 'open') throw new ConflictException(t.status === 'waiting' ? 'This task waits for an earlier one.' : 'This task is already finished.');
      let answers: Prisma.InputJsonValue | undefined;
      if (t.kind === 'form') {
        const res = checkAnswers((t.config as unknown as { form: FormDef }).form, dto.answers ?? {});
        if (Object.keys(res.errors).length) throw new BadRequestException({ statusCode: 400, code: 'FORM_INVALID', message: 'Some answers need fixing.', errors: res.errors });
        answers = res.values as Prisma.InputJsonValue;
      } else if (t.kind === 'survey') {
        const ok = surveyAnswers((t.config as { questions?: string[] }).questions ?? [], dto.answers ?? {});
        if (!ok) throw new BadRequestException('Rate every statement from 1 to 5.');
        answers = ok as Prisma.InputJsonValue;
      } else if (t.kind === 'letter' || t.kind === 'document' || (t.kind === 'desk_request' && (t.config as { itemId?: string }).itemId)) {
        throw new ConflictException(t.kind === 'letter' ? 'This task closes itself when the letter is issued (YX-LC-26).' : t.kind === 'document' ? 'This task closes itself when the document is in.' : 'This task closes itself when the desk fulfils the request.');
      } else if (dto.note?.trim()) answers = { note: dto.note.trim().slice(0, 300) };
      await this.finishIn(tx, c, t, { status: 'done', completedBy: c.userId ?? null, completedAt: new Date(), ...(answers === undefined ? {} : { answers }) }, dto.version);
      await audit(tx, c, 'journey.task.done', 'journey', j.id, { taskKey: t.key });
      return { ok: true };
    });
  }

  async skip(ctx: TenantContext, user: ScopeUser, taskId: string, dto: { version: number; reason: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await tx.journeyTask.findFirst({ where: { organizationId: c.organizationId, id: taskId } });
      if (!t) throw new NotFoundException('No such task.');
      const j = await tx.journey.findFirstOrThrow({ where: { organizationId: c.organizationId, id: t.journeyId } });
      const a = await this.access(tx, c, v, j);
      if (!this.canDo(t, v, a)) throw new ForbiddenException('This task is not yours.');
      if (t.locked) throw new BadRequestException('This task is required by law and cannot be skipped.');
      if (t.required) throw new BadRequestException('A required task cannot be skipped.');
      await this.finishIn(tx, c, t, { status: 'skipped', skipReason: dto.reason.trim().slice(0, 300), completedBy: c.userId ?? null, completedAt: new Date() }, dto.version);
      await audit(tx, c, 'journey.task.skipped', 'journey', j.id, { taskKey: t.key });
      return { ok: true };
    });
  }

  async reassign(ctx: TenantContext, user: ScopeUser, taskId: string, dto: { version: number; userId: string }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const t = await tx.journeyTask.findFirst({ where: { organizationId: c.organizationId, id: taskId } });
      if (!t) throw new NotFoundException('No such task.');
      const j = await tx.journey.findFirstOrThrow({ where: { organizationId: c.organizationId, id: t.journeyId } });
      if (!(await this.access(tx, c, v, j)).manage) throw new ForbiddenException('Only HR can hand a task to someone else.');
      if (!(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: dto.userId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active user.');
      const n = await tx.journeyTask.updateMany({ where: { organizationId: c.organizationId, id: t.id, version: dto.version, status: { in: ['open', 'waiting'] } }, data: { assigneeUserId: dto.userId, assigneeGroupId: null, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this task. Reload it.');
      await audit(tx, c, 'journey.task.reassigned', 'journey', j.id, { taskKey: t.key, to: dto.userId });
      return j.id;
    });
    void this.notifications.notify(ctx, user.userId!, [dto.userId], 'journey.task.assigned', { entityType: 'journey', entityId: res, contextText: 'A checklist task was handed to you', linkPath: '/yx/people/my-tasks' }).catch(() => undefined);
    return { ok: true };
  }

  // ------------------------------------------------------------------------------------------ linked tasks

  private async closeLinked(ctx: TenantContext & { organizationId: string }, linkType: string, linkId: string) {
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const c = ctx as CompanyContext;
      for (const t of await tx.journeyTask.findMany({ where: { organizationId: ctx.organizationId, linkType, linkId, status: 'open' } })) {
        if (await this.finishIn(tx, c, t, { status: 'done', completedAt: new Date() }, null)) await audit(tx, c, 'journey.task.done', 'journey', t.journeyId, { taskKey: t.key, by: linkType });
      }
    });
  }

  private async closeLetterTasks(ctx: TenantContext & { organizationId: string }, personId: string, letterType: string, letterIssueId: string) {
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const c = ctx as CompanyContext;
      const journeys = await tx.journey.findMany({ where: { organizationId: c.organizationId, personId, status: 'active' }, select: { id: true } });
      const tasks = await tx.journeyTask.findMany({ where: { organizationId: c.organizationId, journeyId: { in: journeys.map((j) => j.id) }, kind: 'letter', status: { in: ['open', 'waiting'] } } });
      for (const t of tasks.filter((x) => (x.config as { letterType?: string }).letterType === letterType)) {
        if (await this.finishIn(tx, c, t, { status: 'done', completedAt: new Date(), linkType: 'letter_issue', linkId: letterIssueId }, null)) await audit(tx, c, 'journey.task.done', 'journey', t.journeyId, { taskKey: t.key, by: 'letter' });
      }
    });
  }

  private async closeDocumentTasks(ctx: TenantContext & { organizationId: string }, personId: string, typeKey: string) {
    await this.tenantPrisma.forTenant(ctx, (tx) => this.closeDocumentTasksIn(tx, ctx as CompanyContext, personId, typeKey));
  }

  /** A document task closes when the document is in: verified, or uploaded when its type needs no verification. */
  private async closeDocumentTasksIn(tx: Tx, c: CompanyContext, personId: string, typeKey: string) {
    const org = c.organizationId;
    const d = await tx.document.findFirst({ where: { organizationId: org, personId, typeKey } });
    if (d?.status !== 'verified') return;
    const journeys = await tx.journey.findMany({ where: { organizationId: org, personId, status: 'active' }, select: { id: true } });
    const tasks = await tx.journeyTask.findMany({ where: { organizationId: org, journeyId: { in: journeys.map((j) => j.id) }, kind: 'document', status: { in: ['open', 'waiting'] } } });
    for (const t of tasks.filter((x) => (x.config as { typeKey?: string }).typeKey === typeKey)) {
      if (await this.finishIn(tx, c, t, { status: 'done', completedAt: new Date(), linkType: 'document', linkId: d.id }, null)) await audit(tx, c, 'journey.task.done', 'journey', t.journeyId, { taskKey: t.key, by: 'document' });
    }
  }

  // ------------------------------------------------------------------------------------------ reminders (hourly)

  /** Desk tasks whose request could not be raised at start (desk down, or seeded data) are raised now. */
  async raisePending(): Promise<number> {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.journeyTask.findMany({ where: { kind: 'desk_request', status: 'open', linkId: null, config: { path: ['itemId'], not: Prisma.AnyNull } }, distinct: ['journeyId'], select: { journeyId: true, organizationId: true }, take: 200 }),
    );
    for (const r of rows) await this.raiseDeskRequests({ organizationId: r.organizationId, isSuperAdmin: false }, r.journeyId, null);
    return rows.length;
  }

  /** Due today: the assignee is reminded once. Overdue by 2 days: the journey owner (HR) is told once. */
  async sweep(today = todayIst()): Promise<{ reminded: number; escalated: number }> {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.journeyTask.findMany({ where: { status: 'open', dueOn: { lte: asDate(today) }, OR: [{ remindedOn: null }, { escalatedOn: null, dueOn: { lte: asDate(addDays(today, -2)) } }] }, take: 1000 }),
    );
    let reminded = 0;
    let escalated = 0;
    for (const t of rows) {
      const ctx = { organizationId: t.organizationId, isSuperAdmin: false };
      const out = await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const j = await tx.journey.findFirst({ where: { organizationId: t.organizationId, id: t.journeyId, status: 'active' } });
        if (!j) return null;
        const remind = !t.remindedOn ? ((await tx.journeyTask.updateMany({ where: { id: t.id, remindedOn: null }, data: { remindedOn: asDate(today) } })).count ? t.assigneeUserId : null) : null;
        const escalate = iso(t.dueOn) <= addDays(today, -2) && !t.escalatedOn && (await tx.journeyTask.updateMany({ where: { id: t.id, escalatedOn: null }, data: { escalatedOn: asDate(today) } })).count ? j.ownerUserId : null;
        return { remind, escalate, journeyId: j.id };
      });
      if (!out) continue;
      if (out.remind) {
        reminded++;
        await this.notifications.notifySystem(ctx, [out.remind], 'journey.task.due', { entityType: 'journey', entityId: out.journeyId, contextText: `Due today: ${t.title}`, linkPath: '/yx/people/my-tasks' }, { subject: 'A checklist task is due today', html: '<p>A checklist task is due today. Open YukthiX to see it.</p>' }).catch(() => undefined);
      }
      if (out.escalate) {
        escalated++;
        await this.notifications.notifySystem(ctx, [out.escalate], 'journey.task.overdue', { entityType: 'journey', entityId: out.journeyId, contextText: `Overdue: ${t.title}`, linkPath: `/yx/people/onboarding/${out.journeyId}` }, { subject: 'A checklist task is overdue', html: '<p>A checklist task you own is overdue. Open YukthiX to see it.</p>' }).catch(() => undefined);
      }
    }
    return { reminded, escalated };
  }
}

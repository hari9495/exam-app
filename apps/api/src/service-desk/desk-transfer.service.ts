import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TenantPrismaService } from '@exam-platform/shared';
import { DeskActor, audit, requireSetUp } from './desk-access';
import { CategoryDto, SlaPolicyDto, TemplateDto } from './dto';
import { RuleDto } from './dto-esm';
import { DesksService } from './desks.service';
import { SlaService } from './sla.service';
import { WorkService } from './work.service';
import { DESK_TICKET, DeskAutomation } from './desk-automation';

// Batch F GLPI 10 (answer 2574): a desk's set-up as a file, to move it from a trial company to the live one, or between
// desks. It carries categories, SLA and OLA policies (the current version), templates and rules: never people, tickets
// or files. References to groups, categories and ticket types travel by name and are matched by name on import. An
// import adds what is missing and skips what is already there (by name); a dry run says what it would do and writes
// nothing. Every item is checked by the same service that saves it by hand, so an import can never do more than the
// screens can.

export const DESK_SETUP_FORMAT = 'yukthix-desk-setup';
const MAX_ITEMS = 500;

type Outcome = { kind: 'category' | 'sla' | 'template' | 'rule'; name: string; outcome: 'add' | 'added' | 'skip' | 'failed'; note: string | null };
type Named = { name?: unknown };
const asList = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x.filter((i) => i && typeof i === 'object') as Record<string, unknown>[]) : []);
const key = (s: unknown) => String(s ?? '').trim().toLowerCase();

@Injectable()
export class DeskTransferService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly desks: DesksService,
    private readonly sla: SlaService,
    private readonly work: WorkService,
    private readonly rules: DeskAutomation,
  ) {}

  /** The desk's set-up as a file (desk.settings.manage on the desk). Audited. */
  async export(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { name: true, kind: true } });
      if (!desk) throw new NotFoundException('No such desk.');
      const [groups, cats, types, policies, templates, rules] = await Promise.all([
        tx.sdGroup.findMany({ where: { organizationId: org, deskId }, select: { id: true, name: true } }),
        tx.sdCategory.findMany({ where: { organizationId: org, deskId }, orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }] }),
        tx.sdTicketType.findMany({ where: { organizationId: org, deskId }, select: { id: true, name: true } }),
        tx.sdSlaPolicy.findMany({ where: { organizationId: org, deskId }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }),
        tx.sdTemplate.findMany({ where: { organizationId: org, deskId }, orderBy: { name: 'asc' } }),
        tx.rule.findMany({ where: { organizationId: org, recordType: DESK_TICKET, scopeId: deskId, status: { not: 'retired' } }, orderBy: { sortOrder: 'asc' } }),
      ]);
      const groupName = (id: unknown) => (typeof id === 'string' ? (groups.find((g) => g.id === id)?.name ?? null) : null);
      const catName = (id: unknown) => (typeof id === 'string' ? (cats.find((c) => c.id === id)?.name ?? null) : null);
      const versions = await Promise.all(policies.map((p) => tx.sdSlaPolicyVersion.findFirst({ where: { organizationId: org, policyId: p.id }, orderBy: { version: 'desc' } })));
      const ruleVersions = await Promise.all(rules.map((r) => tx.ruleVersion.findFirstOrThrow({ where: { organizationId: org, ruleId: r.id, version: r.currentVersion } })));
      const file = {
        format: DESK_SETUP_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        desk: { name: desk.name, kind: desk.kind },
        categories: cats.map((c) => ({ name: c.name, parent: catName(c.parentId), sensitive: c.sensitive, answeredBy: c.answeredBy, defaultGroup: groupName(c.defaultGroupId), defaultPriority: c.defaultPriority, skills: c.skills, active: c.active, sortOrder: c.sortOrder })),
        slaPolicies: policies.map((p, i) => {
          const v = versions[i];
          // A named calendar belongs to its company: the policy follows the desk's calendar where it lands.
          const targets = ((v?.targets ?? []) as { metric: string; minutes: (number | null)[]; milestones?: { percent: number; actions: { type: string; groupId?: string }[] }[] }[]).map((t) => ({ ...t, milestones: (t.milestones ?? []).map((m) => ({ ...m, actions: m.actions.map((x) => (x.groupId ? { type: x.type, group: groupName(x.groupId) } : { type: x.type })) })) }));
          return { name: p.name, kind: p.kind, sortOrder: p.sortOrder, active: p.active, scope: v?.scope ?? { match: 'all', rules: [] }, calendarSource: v?.calendarSource === 'calendar' ? 'desk' : (v?.calendarSource ?? 'desk'), targets, pauseStates: v?.pauseStates ?? [], recount: v?.recount ?? 'keep' };
        }),
        templates: templates.map((t) => {
          const d = (t.defaults ?? {}) as { categoryId?: string; groupId?: string; priority?: number; tags?: string[] };
          return { name: t.name, ticketType: types.find((x) => x.id === t.ticketTypeId)?.name ?? null, defaults: { category: catName(d.categoryId), group: groupName(d.groupId), priority: d.priority ?? null, tags: d.tags ?? [] }, checklist: t.checklist, active: t.active, preApproved: t.preApproved };
        }),
        rules: rules.map((r, i) => ({ name: r.name, description: r.description ?? '', trigger: ruleVersions[i]!.trigger, condition: ruleVersions[i]!.condition, actions: ruleVersions[i]!.actions, stopAfter: r.stopAfter, sortOrder: r.sortOrder })),
      };
      await audit(tx, a, 'desk.setup.exported', 'sd_desk', deskId, { categories: file.categories.length, slaPolicies: file.slaPolicies.length, templates: file.templates.length, rules: file.rules.length });
      return file;
    });
  }

  /**
   * Imports a set-up file into this desk: adds what is missing (by name), skips what is there. With dryRun nothing is
   * written and the list says what would happen. Items are saved one by one through their own services (their own
   * checks and keys); one that fails is said and the rest go on.
   */
  async import(a: DeskActor, deskId: string, file: unknown, dryRun: boolean) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const f = (file ?? {}) as Record<string, unknown>;
    if (f.format !== DESK_SETUP_FORMAT || f.version !== 1) throw new BadRequestException('This is not a YukthiX desk set-up file. Export one from a desk first.');
    const lists = { categories: asList(f.categories), slaPolicies: asList(f.slaPolicies), templates: asList(f.templates), rules: asList(f.rules) };
    if (Object.values(lists).some((l) => l.length > MAX_ITEMS)) throw new BadRequestException(`A file holds at most ${MAX_ITEMS} of each kind.`);
    const org = a.ctx.organizationId;
    const here = await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      if (!(await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { id: true } }))) throw new NotFoundException('No such desk.');
      return {
        groups: await tx.sdGroup.findMany({ where: { organizationId: org, deskId }, select: { id: true, name: true } }),
        cats: await tx.sdCategory.findMany({ where: { organizationId: org, deskId }, select: { id: true, name: true } }),
        types: await tx.sdTicketType.findMany({ where: { organizationId: org, deskId }, select: { id: true, name: true } }),
        policies: await tx.sdSlaPolicy.findMany({ where: { organizationId: org, deskId }, select: { name: true } }),
        templates: await tx.sdTemplate.findMany({ where: { organizationId: org, deskId }, select: { name: true } }),
        rules: await tx.rule.findMany({ where: { organizationId: org, recordType: DESK_TICKET, scopeId: deskId, status: { not: 'retired' } }, select: { name: true } }),
      };
    });
    const out: Outcome[] = [];
    const groupId = (n: unknown) => (n == null ? null : (here.groups.find((g) => key(g.name) === key(n))?.id ?? undefined));
    const catId = (n: unknown) => (n == null ? null : (here.cats.find((c) => key(c.name) === key(n))?.id ?? undefined));
    const has = (xs: Named[], n: unknown) => xs.some((x) => key(x.name) === key(n));
    const check = async <T extends object>(cls: new () => T, plain: object): Promise<string | null> => {
      const errors = await validate(plainToInstance(cls, plain) as object, { whitelist: true, forbidNonWhitelisted: true });
      return errors.length ? `Not valid: ${errors.map((e) => e.property).join(', ')}.` : null;
    };
    const run = async (kind: Outcome['kind'], name: unknown, problem: string | null, save: () => Promise<unknown>) => {
      const n = String(name ?? '').slice(0, 100);
      if (problem) return void out.push({ kind, name: n, outcome: 'failed', note: problem });
      if (dryRun) return void out.push({ kind, name: n, outcome: 'add', note: null });
      try {
        await save();
        out.push({ kind, name: n, outcome: 'added', note: null });
      } catch (e) {
        out.push({ kind, name: n, outcome: 'failed', note: e instanceof Error ? e.message : 'Not saved.' });
      }
    };

    // Categories: parents first, so a sub-category finds its parent (added earlier in this run, or already here).
    const ordered = [...lists.categories].sort((x, y) => Number(Boolean(x.parent)) - Number(Boolean(y.parent)));
    for (const c of ordered) {
      if (has(here.cats, c.name)) {
        out.push({ kind: 'category', name: String(c.name), outcome: 'skip', note: 'Already on this desk.' });
        continue;
      }
      const g = groupId(c.defaultGroup);
      const parentWillExist = c.parent == null || has(here.cats, c.parent) || ordered.some((x) => !x.parent && key(x.name) === key(c.parent));
      const dto = { name: c.name, parentId: null as string | null, sensitive: Boolean(c.sensitive), answeredBy: c.answeredBy === 'manager' ? 'manager' : 'desk', defaultGroupId: g ?? null, defaultPriority: c.defaultPriority ?? null, active: c.active !== false, sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : 0, skills: Array.isArray(c.skills) ? c.skills : [] };
      const problem = (await check(CategoryDto, dto)) ?? (g === undefined ? `No group named "${String(c.defaultGroup)}" on this desk.` : !parentWillExist ? `Its parent "${String(c.parent)}" is not in the file or on this desk.` : null);
      await run('category', c.name, problem, async () => {
        const saved = await this.desks.saveCategory(a, deskId, null, { ...dto, parentId: c.parent == null ? null : (catId(c.parent) ?? null) } as CategoryDto);
        here.cats.push({ id: (saved as { id: string }).id, name: String(c.name) });
      });
    }

    for (const p of lists.slaPolicies) {
      if (has(here.policies, p.name)) {
        out.push({ kind: 'sla', name: String(p.name), outcome: 'skip', note: 'Already on this desk.' });
        continue;
      }
      let missing: string | null = null;
      const targets = asList(p.targets).map((t) => ({ ...t, milestones: asList(t.milestones).map((m) => ({ ...m, actions: asList(m.actions).map((x) => { if (x.group == null) return { type: x.type }; const id = groupId(x.group); if (!id) missing = String(x.group); return { type: x.type, groupId: id }; }) })) }));
      const dto = { name: p.name, kind: p.kind, sortOrder: p.sortOrder, scope: p.scope, calendarSource: p.calendarSource === 'calendar' ? 'desk' : p.calendarSource, targets, pauseStates: p.pauseStates, recount: p.recount };
      const problem = (await check(SlaPolicyDto, dto)) ?? (missing ? `No group named "${missing}" on this desk.` : null);
      await run('sla', p.name, problem, () => this.sla.createPolicy(a, deskId, plainToInstance(SlaPolicyDto, dto)));
    }

    for (const t of lists.templates) {
      if (has(here.templates, t.name)) {
        out.push({ kind: 'template', name: String(t.name), outcome: 'skip', note: 'Already on this desk.' });
        continue;
      }
      const d = (t.defaults ?? {}) as Record<string, unknown>;
      const typeId = t.ticketType == null ? null : (here.types.find((x) => key(x.name) === key(t.ticketType))?.id ?? undefined);
      const cid = catId(d.category);
      const gid = groupId(d.group);
      const dto = { name: t.name, ticketTypeId: typeId ?? null, defaults: { ...(cid ? { categoryId: cid } : {}), ...(gid ? { groupId: gid } : {}), ...(typeof d.priority === 'number' ? { priority: d.priority } : {}), ...(Array.isArray(d.tags) ? { tags: d.tags } : {}) }, checklist: Array.isArray(t.checklist) ? t.checklist : [], active: t.active !== false, preApproved: Boolean(t.preApproved) };
      const problem = (await check(TemplateDto, dto)) ?? (typeId === undefined ? `No ticket type named "${String(t.ticketType)}" on this desk.` : cid === undefined ? `No category named "${String(d.category)}" on this desk.` : gid === undefined ? `No group named "${String(d.group)}" on this desk.` : null);
      await run('template', t.name, problem, () => this.work.saveTemplate(a, deskId, null, plainToInstance(TemplateDto, dto)));
    }

    for (const r of lists.rules) {
      if (has(here.rules, r.name)) {
        out.push({ kind: 'rule', name: String(r.name), outcome: 'skip', note: 'Already on this desk.' });
        continue;
      }
      // A rule lands as a draft; it is switched on by hand after a look.
      const dto = { deskId, name: r.name, description: r.description ?? '', trigger: r.trigger, ...(r.condition ? { condition: r.condition } : {}), actions: r.actions, stopAfter: Boolean(r.stopAfter), ...(typeof r.sortOrder === 'number' ? { sortOrder: r.sortOrder } : {}) };
      await run('rule', r.name, await check(RuleDto, dto), () => this.rules.create(a, plainToInstance(RuleDto, dto)));
    }

    if (!dryRun)
      await this.tenantPrisma.forTenant(a.ctx, (tx) =>
        audit(tx, a, 'desk.setup.imported', 'sd_desk', deskId, { added: out.filter((x) => x.outcome === 'added').length, skipped: out.filter((x) => x.outcome === 'skip').length, failed: out.filter((x) => x.outcome === 'failed').length, from: (f.desk as { name?: string } | undefined)?.name ?? null }),
      );
    return { dryRun, items: out };
  }
}

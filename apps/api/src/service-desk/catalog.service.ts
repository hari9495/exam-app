import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { FieldDef, Group, RecordValues, RuleError, evaluate, parseGroup } from '../rules-engine/conditions';
import { Answers, EMPTY_FORM, FormDef, FormField, FormRule, REQUESTER_FIELDS, checkAnswers, expandQuestionnaires, formSchema, parseForm, pickedIds, summarise } from '../rules-engine/forms';
import { ApprovalsEngine, Notice, Outcome, StepSpec, parseSteps } from '../workflow/approvals-engine.service';
import { DESK_KEYS, DeskActor, audit, emit, has, requireDesk, requireSetUp, requireWork } from './desk-access';
import { AdhocApprovalDto, CatalogItemDto, CheckoutDto, ItemDraftDto, OrderGuideDto, QuestionnaireDto, UpdateCatalogItemDto } from './dto-esm';
import { Requester, RequesterService } from './requester.service';
import { cleanHtml, htmlToText } from './rich-text';
import { OPEN_STATES, Ticket, TicketsService } from './tickets.service';

// SD-2.01 … SD-2.05: the service catalogue on the shared engines. Items have a draft and immutable published versions
// (P18 form, rich page, P03 approval steps, fulfilment plan for several teams with OLAs) and a P19 audience. A cart is
// one request ticket per desk with one request item per line; every item has its own approval (P03) and tasks; when an
// item's tasks are all done it is delivered, and when every item is settled the ticket resolves by itself. Requesters
// cancel before fulfilment starts. Live-data pickers (people, locations, cost centres) answer only from the company.

export interface Media {
  kind: 'image' | 'video' | 'document';
  title: string;
  url: string;
}
export interface FulfilmentTask {
  title: string;
  groupId: string;
  olaHours?: number;
  note?: string;
}
interface Draft {
  bodyHtml: string;
  media: Media[];
  form: FormDef;
  approval: StepSpec[];
  fulfilment: FulfilmentTask[];
}
type Item = Prisma.SdCatalogItemGetPayload<object>;
type Version = Prisma.SdCatalogItemVersionGetPayload<object>;
type ReqItem = Prisma.SdRequestItemGetPayload<object>;

export const ITEM_REQUEST = 'desk.request_item';
export const TICKET_APPROVAL = 'desk.ticket_approval';
const EXTRA_FIELDS: FieldDef[] = [
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'total_cost', label: 'Total cost', type: 'money' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

/** A rule or form problem the admin must fix: 400 with the plain message (sync or async). */
function plain<T>(fn: () => T): T {
  const map = (e: unknown) => {
    if (e instanceof RuleError) throw new BadRequestException(e.message);
    throw e;
  };
  try {
    const r = fn();
    return (r instanceof Promise ? r.catch(map) : r) as T;
  } catch (e) {
    return map(e);
  }
}

/** The desk acting by itself (rules, approvals, the catalogue's own steps): a lead's rights on that desk, no person. */
export function deskRobot(a: { ctx: DeskActor['ctx'] }, deskId: string): DeskActor {
  return { ctx: a.ctx, userId: null as unknown as string, keys: new Set(DESK_KEYS), roles: new Map([[deskId, 'lead']]) };
}

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly approvals: ApprovalsEngine,
  ) {}

  onModuleInit() {
    // P03 request types the desk registers (P03 §4.1). Ordering a catalogue item is normal risk: auto-actions after a
    // timeout are allowed where the item says so. Ad-hoc approvals on a ticket never auto-decide.
    this.approvals.register({
      key: ITEM_REQUEST,
      label: 'Service request',
      risk: 'normal',
      autoActions: true,
      onDecided: (tx, req, outcome) => this.itemDecided(tx, req, outcome),
      requesterLink: (req) => `/yx/desk/help?request=${req.subjectId}`,
    });
    this.approvals.register({
      key: TICKET_APPROVAL,
      label: 'Approval on a ticket',
      risk: 'high',
      autoActions: false,
      onDecided: (tx, req, outcome) => this.adhocDecided(tx, req, outcome),
      requesterLink: (req) => `/yx/desk/tickets/${req.subjectId}`,
    });
  }

  private tx<T>(a: { ctx: DeskActor['ctx'] }, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ the requester's profile

  /** The person's department, location, cost centre and legal entity today (P01), for audiences and form rules. */
  async profileOf(tx: Tx, org: string, personId: string): Promise<RecordValues> {
    const today = new Date(`${todayIst()}T00:00:00Z`);
    const emp = await tx.employee.findFirst({ where: { organizationId: org, personId }, select: { id: true } });
    const a = emp
      ? await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: emp.id, supersededAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { validFrom: 'desc' } })
      : null;
    const cc = a ? await tx.assignmentCostCentre.findFirst({ where: { organizationId: org, assignmentId: a.id }, orderBy: { percent: 'desc' } }) : null;
    return { 'requester.department': a?.departmentId ?? null, 'requester.location': a?.locationId ?? null, 'requester.legal_entity': a?.legalEntityId ?? null, 'requester.cost_centre': cc?.costCentreId ?? null };
  }

  private seesItem(item: Item, profile: RecordValues) {
    return !item.audience || evaluate(item.audience as unknown as Group, profile, REQUESTER_FIELDS).pass;
  }

  // ------------------------------------------------------------------------------------------ admin: checking a draft

  private parseMedia(x: unknown): Media[] {
    if (x === undefined) return [];
    if (!Array.isArray(x) || x.length > 12) throw new RuleError('Add up to 12 pictures, videos or documents.');
    return x.map((m) => {
      if (!isObj(m) || !['image', 'video', 'document'].includes(m.kind as string)) throw new RuleError('Choose whether each link is a picture, a video or a document.');
      const title = typeof m.title === 'string' ? m.title.trim() : '';
      if (!title || title.length > 100) throw new RuleError('Give each link a title (up to 100 characters).');
      let u: URL;
      try {
        u = new URL(String(m.url));
      } catch {
        throw new RuleError(`"${title}": enter a web address starting with https://.`);
      }
      if (u.protocol !== 'https:' || u.username || u.password || u.toString().length > 500) throw new RuleError(`"${title}": enter a web address starting with https://.`);
      return { kind: m.kind as Media['kind'], title, url: u.toString() };
    });
  }

  private async parseFulfilment(tx: Tx, org: string, deskId: string, x: unknown): Promise<FulfilmentTask[]> {
    if (x === undefined) return [];
    if (!Array.isArray(x) || x.length > 10) throw new RuleError('Plan up to 10 fulfilment tasks.');
    const groups = new Set((await tx.sdGroup.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true } })).map((g) => g.id));
    return x.map((t, i) => {
      if (!isObj(t)) throw new RuleError(`Fulfilment task ${i + 1} is not in the expected shape.`);
      const title = typeof t.title === 'string' ? t.title.trim() : '';
      if (!title || title.length > 200) throw new RuleError(`Name fulfilment task ${i + 1} (up to 200 characters).`);
      if (typeof t.groupId !== 'string' || !groups.has(t.groupId)) throw new RuleError(`"${title}": choose a team of this desk.`);
      const out: FulfilmentTask = { title, groupId: t.groupId };
      if (t.olaHours !== undefined && t.olaHours !== null) {
        if (!Number.isInteger(t.olaHours) || (t.olaHours as number) < 1 || (t.olaHours as number) > 720) throw new RuleError(`"${title}": the team's time (OLA) is 1 to 720 hours.`);
        out.olaHours = t.olaHours as number;
      }
      if (typeof t.note === 'string' && t.note.trim()) out.note = t.note.trim().slice(0, 2000);
      return out;
    });
  }

  private async checkApprovers(tx: Tx, org: string, steps: StepSpec[], form: FormDef) {
    const pickers = new Map(form.sections.flatMap((s) => s.fields).map((f) => [f.key, f.type]));
    for (const s of steps) {
      for (const a of s.approvers) {
        if (a.kind === 'cost_centre_owner' && pickers.get(a.field) !== 'cost_centre') throw new RuleError(`"${s.name}": the cost-centre owner comes from a cost centre question on the form.`);
        if (a.kind === 'users' && (await tx.user.count({ where: { organizationId: org, id: { in: a.userIds }, status: 'active' } })) !== a.userIds.length) throw new RuleError(`"${s.name}": choose active colleagues.`);
        if (a.kind === 'user_group' && !(await tx.userGroup.findFirst({ where: { organizationId: org, id: a.groupId }, select: { id: true } }))) throw new RuleError(`"${s.name}": choose a group of this company.`);
      }
    }
  }

  /** The whole draft, checked (the save keeps what was sent; publish needs it to pass). */
  private async parseDraft(tx: Tx, org: string, deskId: string, d: ItemDraftDto | Record<string, unknown>, expand: boolean): Promise<Draft> {
    let form = parseForm(d.form ?? EMPTY_FORM, { allowQuestionnaires: true });
    if (expand) {
      const ids = form.sections.map((s) => s.questionnaireId).filter((x): x is string => Boolean(x));
      const qs = ids.length ? await tx.sdQuestionnaire.findMany({ where: { organizationId: org, id: { in: ids }, active: true } }) : [];
      form = expandQuestionnaires(form, new Map(qs.map((q) => [q.id, { fields: q.fields as unknown as FormField[], rules: q.rules as unknown as FormRule[] }])));
    }
    const approval = parseSteps(d.approval, [...formSchema(form), ...EXTRA_FIELDS]);
    await this.checkApprovers(tx, org, approval, form);
    const html = typeof d.bodyHtml === 'string' ? cleanHtml(d.bodyHtml) : '';
    return { bodyHtml: htmlToText(html) ? html : '', media: this.parseMedia(d.media), form, approval, fulfilment: await this.parseFulfilment(tx, org, deskId, d.fulfilment) };
  }

  private async parseAudience(x: unknown): Promise<Group | null> {
    if (x === undefined || x === null) return null;
    const g = parseGroup(x, REQUESTER_FIELDS);
    return g.items.length ? g : null;
  }

  // ------------------------------------------------------------------------------------------ admin: items

  private async itemFor(tx: Tx, a: DeskActor, id: string): Promise<Item> {
    const item = await tx.sdCatalogItem.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
    if (!item) throw new NotFoundException('No such catalogue item.');
    requireSetUp(a, item.deskId, 'desk.catalog.manage');
    return item;
  }

  private itemView(i: Item) {
    return { id: i.id, deskId: i.deskId, categoryId: i.categoryId, name: i.name, shortText: i.shortText, state: i.state, currentVersion: i.currentVersion, audience: i.audience, cost: i.cost === null ? null : Number(i.cost), currency: i.currency, deliveryDays: i.deliveryDays, sortOrder: i.sortOrder, draft: i.draft, version: i.version, updatedAt: i.updatedAt };
  }

  async adminItems(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.catalog.manage');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, deskId);
      return (await tx.sdCatalogItem.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })).map((i) => this.itemView(i));
    });
  }

  async adminItem(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const item = await this.itemFor(tx, a, id);
      const versions = await tx.sdCatalogItemVersion.findMany({ where: { organizationId: a.ctx.organizationId, itemId: id }, orderBy: { version: 'desc' }, select: { version: true, publishedAt: true, publishedBy: true } });
      const orders = await tx.sdRequestItem.groupBy({ by: ['stage'], where: { organizationId: a.ctx.organizationId, itemId: id }, _count: { _all: true } });
      return { ...this.itemView(item), versions, orders: Object.fromEntries(orders.map((o) => [o.stage, o._count._all])) };
    });
  }

  private async checkCategory(tx: Tx, org: string, deskId: string, categoryId: string | null | undefined) {
    if (categoryId && !(await tx.sdCategory.findFirst({ where: { organizationId: org, deskId, id: categoryId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a category of this desk.');
  }

  async createItem(a: DeskActor, dto: CatalogItemDto) {
    requireSetUp(a, dto.deskId, 'desk.catalog.manage');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: dto.deskId, status: 'active' }, select: { kind: true } });
      if (!desk) throw new NotFoundException('No such desk.');
      if (desk.kind === 'customer_support') throw new BadRequestException('The service catalogue is for employee help desks.');
      await this.checkCategory(tx, org, dto.deskId, dto.categoryId);
      const audience = await plain(() => this.parseAudience(dto.audience));
      const draft = dto.draft ? await this.safeDraft(tx, org, dto.deskId, dto.draft) : {};
      if (await tx.sdCatalogItem.findFirst({ where: { organizationId: org, deskId: dto.deskId, name: dto.name }, select: { id: true } })) throw new ConflictException('This desk already has an item with that name.');
      const item = await tx.sdCatalogItem.create({
        data: { organizationId: org, deskId: dto.deskId, categoryId: dto.categoryId ?? null, name: dto.name, shortText: dto.shortText || null, audience: (audience ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue, cost: dto.cost ?? null, deliveryDays: dto.deliveryDays ?? null, sortOrder: dto.sortOrder ?? 0, draft: draft as Prisma.InputJsonValue, createdBy: a.userId },
      });
      await audit(tx, a, 'desk.catalog.item_created', 'sd_catalog_item', item.id, { deskId: dto.deskId, name: dto.name });
      return this.itemView(item);
    });
  }

  /** A draft is stored as sent after the engines checked it (so a half-made form can be saved and finished later). */
  private async safeDraft(tx: Tx, org: string, deskId: string, d: ItemDraftDto): Promise<Record<string, unknown>> {
    const parsed = await plain(() => this.parseDraft(tx, org, deskId, d as unknown as Record<string, unknown>, false));
    return { bodyHtml: parsed.bodyHtml, media: parsed.media, form: parsed.form, approval: parsed.approval, fulfilment: parsed.fulfilment };
  }

  async updateItem(a: DeskActor, id: string, dto: UpdateCatalogItemDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const item = await this.itemFor(tx, a, id);
      if (item.version !== dto.version) throw new ConflictException('Someone changed this item. Reload to see the latest.');
      if (dto.categoryId !== undefined) await this.checkCategory(tx, org, item.deskId, dto.categoryId);
      const audience = dto.everyone ? null : dto.audience !== undefined ? await plain(() => this.parseAudience(dto.audience)) : undefined;
      const draft = dto.draft ? await this.safeDraft(tx, org, item.deskId, dto.draft) : undefined;
      if (dto.name && dto.name !== item.name && (await tx.sdCatalogItem.findFirst({ where: { organizationId: org, deskId: item.deskId, name: dto.name }, select: { id: true } }))) throw new ConflictException('This desk already has an item with that name.');
      const updated = await tx.sdCatalogItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.shortText !== undefined ? { shortText: dto.shortText || null } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.cost !== undefined ? { cost: dto.cost } : {}),
          ...(dto.deliveryDays !== undefined ? { deliveryDays: dto.deliveryDays } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(audience !== undefined ? { audience: (audience ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue } : {}),
          ...(draft ? { draft: draft as Prisma.InputJsonValue } : {}),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      await audit(tx, a, 'desk.catalog.item_updated', 'sd_catalog_item', id, { fields: Object.keys(dto).filter((k) => k !== 'version') });
      return this.itemView(updated);
    });
  }

  /** Makes the draft the next version; orders made from now on use it, earlier orders keep theirs (§5.3). */
  async publish(a: DeskActor, id: string, version: number) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const item = await this.itemFor(tx, a, id);
      if (item.version !== version) throw new ConflictException('Someone changed this item. Reload to see the latest.');
      const d = await plain(() => this.parseDraft(tx, org, item.deskId, item.draft as Record<string, unknown>, true));
      const next = (item.currentVersion ?? 0) + 1;
      await tx.sdCatalogItemVersion.create({ data: { organizationId: org, deskId: item.deskId, itemId: id, version: next, bodyHtml: d.bodyHtml, media: d.media as unknown as Prisma.InputJsonValue, form: d.form as unknown as Prisma.InputJsonValue, approval: d.approval as unknown as Prisma.InputJsonValue, fulfilment: d.fulfilment as unknown as Prisma.InputJsonValue, publishedBy: a.userId } });
      const updated = await tx.sdCatalogItem.update({ where: { id }, data: { state: 'published', currentVersion: next, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, a, 'desk.catalog.item_published', 'sd_catalog_item', id, { version: next, approvalSteps: d.approval.length, tasks: d.fulfilment.length });
      return this.itemView(updated);
    });
  }

  async retire(a: DeskActor, id: string, version: number) {
    return this.tx(a, async (tx) => {
      const item = await this.itemFor(tx, a, id);
      if (item.version !== version) throw new ConflictException('Someone changed this item. Reload to see the latest.');
      const updated = await tx.sdCatalogItem.update({ where: { id }, data: { state: 'retired', version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, a, 'desk.catalog.item_retired', 'sd_catalog_item', id, {});
      return this.itemView(updated);
    });
  }

  /** What the builders offer: requester fields with live options, the desk's teams and categories. */
  async builderSchema(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.catalog.manage');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, deskId);
      const org = a.ctx.organizationId;
      const [departments, locations, costCentres, entities, groups, categories, userGroups, questionnaires] = await Promise.all([
        tx.department.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.costCentre.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true, code: true, ownerUserId: true }, orderBy: { name: 'asc' } }),
        tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.sdGroup.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.sdCategory.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.userGroup.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.sdQuestionnaire.findMany({ where: { organizationId: org, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      ]);
      const opts = (rows: { id: string; name: string }[]) => rows.map((r) => ({ value: r.id, label: r.name }));
      return {
        requesterFields: [
          { ...REQUESTER_FIELDS[0], options: opts(departments) },
          { ...REQUESTER_FIELDS[1], options: opts(locations) },
          { ...REQUESTER_FIELDS[2], options: costCentres.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })) },
          { ...REQUESTER_FIELDS[3], options: entities.map((e) => ({ value: e.id, label: e.name })) },
        ],
        extraFields: EXTRA_FIELDS,
        groups,
        categories,
        userGroups,
        questionnaires,
        costCentresWithoutOwner: costCentres.filter((c) => !c.ownerUserId).map((c) => c.name),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ admin: question library, order guides

  private requireCatalog(a: DeskActor) {
    if (!has(a, 'desk.catalog.manage') || !(has(a, 'desk.desk.create') || [...a.roles.values()].includes('admin'))) throw new ForbiddenException('You need the catalogue permission and a desk admin role (desk.catalog.manage).');
  }

  async questionnaires(a: DeskActor) {
    this.requireCatalog(a);
    return this.tx(a, (tx) => tx.sdQuestionnaire.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { name: 'asc' } }));
  }

  async saveQuestionnaire(a: DeskActor, id: string | null, dto: QuestionnaireDto) {
    this.requireCatalog(a);
    const form = plain(() => parseForm({ sections: [{ id: 'q', columns: 1, fields: dto.fields }], rules: dto.rules ?? [] }));
    const fields = form.sections[0].fields;
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const clash = await tx.sdQuestionnaire.findFirst({ where: { organizationId: org, name: dto.name, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
      if (clash) throw new ConflictException('A question set with that name exists.');
      if (id) {
        const n = await tx.sdQuestionnaire.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { name: dto.name, description: dto.description || null, fields: fields as unknown as Prisma.InputJsonValue, rules: form.rules as unknown as Prisma.InputJsonValue, active: dto.active ?? true, version: { increment: 1 }, updatedAt: new Date() } });
        if (!n.count) throw new ConflictException('Someone changed this question set. Reload to see the latest.');
      }
      const row = id
        ? await tx.sdQuestionnaire.findFirstOrThrow({ where: { organizationId: org, id } })
        : await tx.sdQuestionnaire.create({ data: { organizationId: org, name: dto.name, description: dto.description || null, fields: fields as unknown as Prisma.InputJsonValue, rules: form.rules as unknown as Prisma.InputJsonValue, active: dto.active ?? true, createdBy: a.userId } });
      await audit(tx, a, id ? 'desk.catalog.questionnaire_updated' : 'desk.catalog.questionnaire_created', 'sd_questionnaire', row.id, { name: row.name, fields: fields.length });
      return row;
    });
  }

  private parseGuideRules(x: unknown, form: FormDef, itemIds: Set<string>) {
    const schema = formSchema(form);
    if (!Array.isArray(x)) throw new RuleError('The guide rules are not in the expected shape.');
    return x.map((r, i) => {
      if (!isObj(r)) throw new RuleError(`Guide rule ${i + 1} is not in the expected shape.`);
      const items = Array.isArray(r.itemIds) ? [...new Set(r.itemIds.filter((v): v is string => typeof v === 'string'))] : [];
      if (!items.length || items.length > 10 || items.some((v) => !itemIds.has(v))) throw new RuleError(`Guide rule ${i + 1}: choose 1 to 10 published items.`);
      return { id: typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : `r${i + 1}`, when: parseGroup(r.when ?? { id: 'all', join: 'and', items: [] }, schema), itemIds: items };
    });
  }

  async guides(a: DeskActor) {
    this.requireCatalog(a);
    return this.tx(a, (tx) => tx.sdOrderGuide.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { name: 'asc' } }));
  }

  async saveGuide(a: DeskActor, id: string | null, dto: OrderGuideDto) {
    this.requireCatalog(a);
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const published = new Set((await tx.sdCatalogItem.findMany({ where: { organizationId: org, state: 'published' }, select: { id: true } })).map((i) => i.id));
      const form = plain(() => parseForm(dto.form));
      const rules = plain(() => this.parseGuideRules(dto.rules, form, published));
      if (id) {
        const n = await tx.sdOrderGuide.updateMany({ where: { organizationId: org, id, version: dto.version ?? -1 }, data: { name: dto.name, description: dto.description || null, form: form as unknown as Prisma.InputJsonValue, rules: rules as unknown as Prisma.InputJsonValue, active: dto.active ?? true, version: { increment: 1 }, updatedAt: new Date() } });
        if (!n.count) throw new ConflictException('Someone changed this guide. Reload to see the latest.');
      } else if (await tx.sdOrderGuide.findFirst({ where: { organizationId: org, name: dto.name }, select: { id: true } })) throw new ConflictException('A guide with that name exists.');
      const row = id
        ? await tx.sdOrderGuide.findFirstOrThrow({ where: { organizationId: org, id } })
        : await tx.sdOrderGuide.create({ data: { organizationId: org, name: dto.name, description: dto.description || null, form: form as unknown as Prisma.InputJsonValue, rules: rules as unknown as Prisma.InputJsonValue, active: dto.active ?? true, createdBy: a.userId } });
      await audit(tx, a, id ? 'desk.catalog.guide_updated' : 'desk.catalog.guide_created', 'sd_order_guide', row.id, { name: row.name, rules: rules.length });
      return row;
    });
  }

  // ------------------------------------------------------------------------------------------ requester: browse

  /** Published items of the employee help desks this person may see (their audience holds for them). */
  async catalogue(r: Requester) {
    return this.tx(r, async (tx) => {
      const org = r.ctx.organizationId;
      const personId = await this.requesters.personOf(tx, r, false);
      const profile = personId ? await this.profileOf(tx, org, personId) : {};
      const desks = await tx.sdDesk.findMany({ where: { organizationId: org, status: 'active', kind: { not: 'customer_support' } }, select: { id: true, name: true } });
      const items = await tx.sdCatalogItem.findMany({ where: { organizationId: org, state: 'published', deskId: { in: desks.map((d) => d.id) } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      const cats = new Map((await tx.sdCategory.findMany({ where: { organizationId: org, id: { in: items.map((i) => i.categoryId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
      const deskName = new Map(desks.map((d) => [d.id, d.name]));
      const guides = await tx.sdOrderGuide.findMany({ where: { organizationId: org, active: true }, select: { id: true, name: true, description: true } });
      return {
        items: items.filter((i) => this.seesItem(i, profile)).map((i) => ({ id: i.id, deskId: i.deskId, desk: deskName.get(i.deskId) ?? '', category: i.categoryId ? (cats.get(i.categoryId) ?? null) : null, name: i.name, shortText: i.shortText, cost: i.cost === null ? null : Number(i.cost), currency: i.currency, deliveryDays: i.deliveryDays })),
        guides,
      };
    });
  }

  private async visibleItem(tx: Tx, r: Requester, id: string): Promise<{ item: Item; v: Version; profile: RecordValues }> {
    const org = r.ctx.organizationId;
    const item = await tx.sdCatalogItem.findFirst({ where: { organizationId: org, id, state: 'published' } });
    const desk = item && (await tx.sdDesk.findFirst({ where: { organizationId: org, id: item.deskId, status: 'active' }, select: { kind: true } }));
    const personId = await this.requesters.personOf(tx, r, false);
    const profile = personId ? await this.profileOf(tx, org, personId) : {};
    if (!item || !desk || desk.kind === 'customer_support' || !this.seesItem(item, profile)) throw new NotFoundException('No such catalogue item.');
    const v = await tx.sdCatalogItemVersion.findFirstOrThrow({ where: { organizationId: org, itemId: id, version: item.currentVersion! } });
    return { item, v, profile };
  }

  /** The item page (US-G-042): rich text, links, cost, delivery time and the form of the current version. */
  async itemPage(r: Requester, id: string) {
    return this.tx(r, async (tx) => {
      const { item, v, profile } = await this.visibleItem(tx, r, id);
      const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: r.ctx.organizationId, id: item.deskId }, select: { name: true } });
      const steps = v.approval as unknown as StepSpec[];
      return {
        id: item.id,
        name: item.name,
        shortText: item.shortText,
        desk: desk.name,
        cost: item.cost === null ? null : Number(item.cost),
        currency: item.currency,
        deliveryDays: item.deliveryDays,
        version: v.version,
        bodyHtml: v.bodyHtml,
        media: v.media,
        form: v.form,
        profile,
        approvals: steps.map((s) => s.name),
      };
    });
  }

  async guide(r: Requester, id: string) {
    return this.tx(r, async (tx) => {
      const g = await tx.sdOrderGuide.findFirst({ where: { organizationId: r.ctx.organizationId, id, active: true } });
      if (!g) throw new NotFoundException('No such guide.');
      return { id: g.id, name: g.name, description: g.description, form: g.form };
    });
  }

  /** US-G-041: the guide's answers pick the items (only items the person may see). */
  async resolveGuide(r: Requester, id: string, answers: unknown) {
    return this.tx(r, async (tx) => {
      const org = r.ctx.organizationId;
      const g = await tx.sdOrderGuide.findFirst({ where: { organizationId: org, id, active: true } });
      if (!g) throw new NotFoundException('No such guide.');
      const form = g.form as unknown as FormDef;
      const personId = await this.requesters.personOf(tx, r, false);
      const profile = personId ? await this.profileOf(tx, org, personId) : {};
      const { values, errors } = checkAnswers(form, answers, profile);
      if (Object.keys(errors).length) throw new BadRequestException({ statusCode: 400, code: 'FORM_ERRORS', message: 'Check the answers.', errors });
      const rec = { ...(values as RecordValues), ...profile };
      const ids = new Set((g.rules as unknown as { when: Group; itemIds: string[] }[]).filter((x) => evaluate(x.when, rec, formSchema(form)).pass).flatMap((x) => x.itemIds));
      const items = await tx.sdCatalogItem.findMany({ where: { organizationId: org, id: { in: [...ids] }, state: 'published' } });
      return items.filter((i) => this.seesItem(i, profile)).map((i) => ({ id: i.id, name: i.name, shortText: i.shortText, cost: i.cost === null ? null : Number(i.cost) }));
    });
  }

  // ------------------------------------------------------------------------------------------ live-data pickers (SD-2.02)

  async pick(r: Requester, kind: 'people' | 'locations' | 'cost-centres', q = '') {
    const org = r.ctx.organizationId;
    const l = like(q.trim());
    return this.tx(r, async (tx) => {
      if (kind === 'people') {
        // Colleagues only (an employee or a login), never applicants or outside contacts; names and department only.
        const rows = await tx.$queryRaw<{ id: string; name: string; department: string | null }[]>`
          SELECT p.id, concat_ws(' ', coalesce(nullif(p.preferred_name, ''), p.given_name), p.family_name) AS name,
                 (SELECT d.name::text FROM employees e JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND a.valid_to IS NULL
                  JOIN departments d ON d.organization_id = a.organization_id AND d.id = a.department_id WHERE e.organization_id = p.organization_id AND e.person_id = p.id LIMIT 1) AS department
          FROM persons p
          WHERE p.organization_id = ${org}::uuid AND p.status = 'active'
            AND EXISTS (SELECT 1 FROM person_roles x WHERE x.organization_id = p.organization_id AND x.person_id = p.id AND x.role_type IN ('employee', 'login') AND (x.end_on IS NULL OR x.end_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date))
            AND (p.given_name ILIKE ${l} OR p.family_name ILIKE ${l} OR p.preferred_name ILIKE ${l})
          ORDER BY p.given_name, p.family_name LIMIT 20`;
        return rows.map((x) => ({ id: x.id, label: x.name, detail: x.department }));
      }
      if (kind === 'locations') {
        const rows = await tx.location.findMany({ where: { organizationId: org, archivedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' }, take: 20 });
        return rows.map((x) => ({ id: x.id, label: x.name, detail: x.code }));
      }
      const rows = await tx.costCentre.findMany({ where: { organizationId: org, archivedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' }, take: 20 });
      return rows.map((x) => ({ id: x.id, label: x.name, detail: x.code }));
    });
  }

  /** Picked ids must be this company's live records; returns their names for summaries. */
  private async checkPicks(tx: Tx, org: string, def: FormDef, values: Answers): Promise<Map<string, string>> {
    const ids = pickedIds(def, values);
    const names = new Map<string, string>();
    for (const id of ids.person) {
      if (!(await this.tickets.internalPerson(tx, org, id))) throw new BadRequestException('Choose a colleague from the list.');
    }
    for (const [id, n] of await this.tickets.personNames(tx, org, ids.person)) names.set(id, n.name);
    const locs = ids.location.length ? await tx.location.findMany({ where: { organizationId: org, id: { in: ids.location }, archivedAt: null }, select: { id: true, name: true } }) : [];
    if (locs.length !== new Set(ids.location).size) throw new BadRequestException('Choose a location from the list.');
    const ccs = ids.cost_centre.length ? await tx.costCentre.findMany({ where: { organizationId: org, id: { in: ids.cost_centre }, archivedAt: null }, select: { id: true, name: true } }) : [];
    if (ccs.length !== new Set(ids.cost_centre).size) throw new BadRequestException('Choose a cost centre from the list.');
    for (const x of [...locs, ...ccs]) names.set(x.id, x.name);
    return names;
  }

  // ------------------------------------------------------------------------------------------ checkout (SD-2.04)

  /**
   * US-G-041: the cart. One request ticket per desk; each line is a request item with its own approval and tasks. A cart
   * for someone else needs request.raise_on_behalf over them (P02); approvals then follow that person (P03 D5).
   */
  async checkout(r: Requester, dto: CheckoutDto) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const notices: Notice[] = [];
    const out = await this.tx(r, async (tx) => {
      const org = r.ctx.organizationId;
      const me = (await this.requesters.personOf(tx, r, true))!;
      if (dto.forPersonId) await this.requesters.checkOnBehalf(tx, r, dto.forPersonId, me);
      const forPerson = dto.forPersonId ?? me;
      const forUser = forPerson === me ? r.userId : ((await tx.personRole.findFirst({ where: { organizationId: org, personId: forPerson, roleType: 'login', sourceTable: 'users', endOn: null }, select: { sourceId: true } }))?.sourceId ?? null);
      const profile = await this.profileOf(tx, org, forPerson);
      const forName = (await this.tickets.personNames(tx, org, [forPerson])).get(forPerson)?.name ?? '';
      // Check every line first (all or nothing).
      const errors: Record<number, Record<string, string>> = {};
      const lines: { item: Item; v: Version; form: FormDef; values: Answers; quantity: number; names: Map<string, string> }[] = [];
      for (const [i, line] of dto.items.entries()) {
        const item = await tx.sdCatalogItem.findFirst({ where: { organizationId: org, id: line.itemId, state: 'published' } });
        const desk = item && (await tx.sdDesk.findFirst({ where: { organizationId: org, id: item.deskId, status: 'active' }, select: { kind: true } }));
        if (!item || !desk || desk.kind === 'customer_support' || !this.seesItem(item, profile)) throw new NotFoundException('No such catalogue item.');
        const v = await tx.sdCatalogItemVersion.findFirstOrThrow({ where: { organizationId: org, itemId: item.id, version: item.currentVersion! } });
        const form = v.form as unknown as FormDef;
        const { values, errors: e } = checkAnswers(form, line.answers ?? {}, profile);
        if (Object.keys(e).length) errors[i] = e;
        else lines.push({ item, v, form, values, quantity: line.quantity ?? 1, names: await this.checkPicks(tx, org, form, values) });
      }
      if (Object.keys(errors).length) throw new BadRequestException({ statusCode: 400, code: 'FORM_ERRORS', message: 'Check the answers in your cart.', errors });
      const byDesk = new Map<string, typeof lines>();
      for (const l of lines) byDesk.set(l.item.deskId, [...(byDesk.get(l.item.deskId) ?? []), l]);
      const made: { ticketId: string; number: string }[] = [];
      for (const [deskId, group] of byDesk) {
        const type = (await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId, kind: 'request', active: true }, orderBy: { sortOrder: 'asc' } })) ?? undefined;
        const body = group
          .map((l) => `<p><strong>${escape(l.item.name)}</strong>${l.quantity > 1 ? ` × ${l.quantity}` : ''}</p>${list(summarise(l.form, l.values, l.names))}`)
          .join('');
        const subject = group.length === 1 ? group[0].item.name : `${group[0].item.name} and ${group.length - 1} more`;
        const t = await this.tickets.createIn(tx, r, {
          deskId,
          typeId: type?.id,
          categoryId: group[0].item.categoryId ?? undefined,
          subject,
          bodyHtml: body,
          requesterPersonId: me,
          requestedForPersonId: forPerson === me ? undefined : forPerson,
          openedByUserId: r.userId,
          channel: 'portal',
          side: 'requester',
          authorPersonId: me,
          tags: ['catalogue'],
        });
        for (const l of group) {
          const ri = await tx.sdRequestItem.create({ data: { organizationId: org, deskId, ticketId: t.id, itemId: l.item.id, itemVersion: l.v.version, quantity: l.quantity, answers: l.values as unknown as Prisma.InputJsonValue, forPersonId: forPerson } });
          const steps = l.v.approval as unknown as StepSpec[];
          if (!steps.length) {
            await this.startFulfilment(tx, r, t, ri, l.v);
            continue;
          }
          const cost = l.item.cost === null ? null : Number(l.item.cost) * l.quantity;
          const leads = (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId, role: 'lead', validTo: null }, select: { userId: true } })).map((m) => m.userId);
          const sub = await this.approvals.submit(tx, r.ctx, {
            type: ITEM_REQUEST,
            subjectType: 'sd_request_item',
            subjectId: ri.id,
            title: `${l.item.name} for ${forName}`,
            summary: [{ label: 'Item', value: l.item.name }, { label: 'For', value: forName }, { label: 'Quantity', value: String(l.quantity) }, ...(cost !== null ? [{ label: 'Cost', value: rupees(cost) }] : []), { label: 'Request', value: t.number }, ...summarise(l.form, l.values, l.names)],
            subjectPersonId: forPerson,
            requesterUserId: forUser,
            raisedByUserId: forPerson === me ? null : r.userId,
            steps,
            payload: { ...(l.values as RecordValues), quantity: l.quantity, total_cost: cost },
            payloadFields: [...formSchema(l.form), ...EXTRA_FIELDS],
            fallbackUserIds: leads,
          });
          notices.push(...sub.notices);
          const cur = await tx.sdRequestItem.findFirstOrThrow({ where: { id: ri.id } });
          if (cur.stage === 'submitted') await tx.sdRequestItem.update({ where: { id: ri.id }, data: { stage: 'approval', approvalRequestId: sub.id, stageAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
          else await tx.sdRequestItem.update({ where: { id: ri.id }, data: { approvalRequestId: sub.id } });
        }
        await emit(tx, org, 'helpdesk.request.submitted', { ticketId: t.id, deskId, items: group.length });
        await audit(tx, { ctx: r.ctx, userId: r.userId }, 'desk.catalog.ordered', 'sd_ticket', t.id, { number: t.number, items: group.map((l) => ({ itemId: l.item.id, version: l.v.version, quantity: l.quantity })), forPersonId: forPerson === me ? null : forPerson });
        made.push({ ticketId: t.id, number: t.number });
      }
      return made;
    });
    await this.approvals.send(r.ctx, notices);
    return { requests: out };
  }

  // ------------------------------------------------------------------------------------------ approvals → fulfilment

  /** US-B-126: the item's plan becomes tasks for its teams, each with its OLA as the due time. */
  private async startFulfilment(tx: Tx, a: { ctx: DeskActor['ctx'] }, t: Ticket, ri: ReqItem, v: Version) {
    const org = a.ctx.organizationId;
    const plan = v.fulfilment as unknown as FulfilmentTask[];
    await tx.sdRequestItem.update({ where: { id: ri.id }, data: { stage: 'fulfilment', stageAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    const item = await tx.sdCatalogItem.findFirstOrThrow({ where: { organizationId: org, id: ri.itemId }, select: { name: true } });
    for (const [i, p] of plan.entries()) {
      // The team may have been switched off since publishing: the task then waits on the desk with no team.
      const group = await tx.sdGroup.findFirst({ where: { organizationId: org, deskId: ri.deskId, id: p.groupId, active: true }, select: { id: true } });
      const k = await tx.sdTask.create({ data: { organizationId: org, deskId: ri.deskId, ticketId: t.id, title: p.title.slice(0, 200), note: p.note ?? null, groupId: group?.id ?? null, dueAt: p.olaHours ? new Date(Date.now() + p.olaHours * 3_600_000) : null, sortOrder: i, requestItemId: ri.id } });
      await this.tickets.event(tx, t, 'task_added', null, k.title.slice(0, 100), { by: null, reason: `Fulfilment of ${item.name}` });
    }
    await this.tickets.event(tx, t, 'request_stage', 'approval', 'fulfilment', { by: null, reason: item.name, requesterVisible: true });
    await this.tickets.sla.sync(tx, t.id);
    if (!plan.length) await this.itemSettled(tx, a, ri.id);
  }

  private async itemDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: Outcome) {
    // The approver is not a desk agent: the desk's own step reaches a sensitive request's ticket (§5.7, desk system work).
    await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
    const org = req.organizationId;
    const ri = await tx.sdRequestItem.findFirst({ where: { organizationId: org, id: req.subjectId } });
    if (!ri || ri.stage !== 'approval') return;
    const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: ri.ticketId } });
    const ctx = { organizationId: org, isSuperAdmin: false };
    if (outcome === 'approved') {
      const v = await tx.sdCatalogItemVersion.findFirstOrThrow({ where: { organizationId: org, itemId: ri.itemId, version: ri.itemVersion } });
      await emit(tx, org, 'helpdesk.request.approved', { ticketId: t.id, deskId: t.deskId, requestItemId: ri.id });
      return this.startFulfilment(tx, { ctx }, t, ri, v);
    }
    const why = (await tx.wfAction.findFirst({ where: { organizationId: org, requestId: req.id, action: { in: ['rejected', 'auto_rejected'] } }, orderBy: { createdAt: 'desc' } }))?.reason ?? null;
    await tx.sdRequestItem.update({ where: { id: ri.id }, data: { stage: 'rejected', stageAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    const item = await tx.sdCatalogItem.findFirstOrThrow({ where: { organizationId: org, id: ri.itemId }, select: { name: true } });
    // US-B-125: the requester sees the reason.
    await this.tickets.event(tx, t, 'request_stage', 'approval', 'rejected', { by: null, reason: `${item.name} was not approved${why ? `: ${why}` : ''}`.slice(0, 1000), requesterVisible: true });
    await emit(tx, org, 'helpdesk.request.rejected', { ticketId: t.id, deskId: t.deskId, requestItemId: ri.id });
    await this.settleTicket(tx, { ctx }, t.id);
  }

  /** An item is delivered when all its fulfilment tasks are done (or cancelled), then the ticket may resolve. */
  async itemSettled(tx: Tx, a: { ctx: DeskActor['ctx'] }, requestItemId: string) {
    const org = a.ctx.organizationId;
    const ri = await tx.sdRequestItem.findFirst({ where: { organizationId: org, id: requestItemId } });
    if (!ri || ri.stage !== 'fulfilment') return;
    const open = await tx.sdTask.count({ where: { organizationId: org, requestItemId, state: { in: ['open', 'in_progress'] } } });
    if (open) return;
    await tx.sdRequestItem.update({ where: { id: ri.id }, data: { stage: 'delivered', stageAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: ri.ticketId } });
    const item = await tx.sdCatalogItem.findFirstOrThrow({ where: { organizationId: org, id: ri.itemId }, select: { name: true } });
    await this.tickets.event(tx, t, 'request_stage', 'fulfilment', 'delivered', { by: null, reason: item.name, requesterVisible: true });
    await emit(tx, org, 'helpdesk.request.fulfilled', { ticketId: t.id, deskId: t.deskId, requestItemId: ri.id });
    await this.settleTicket(tx, a, t.id);
  }

  /** US-B-126: when every item is delivered, rejected or cancelled, the request resolves by itself. */
  private async settleTicket(tx: Tx, a: { ctx: DeskActor['ctx'] }, ticketId: string) {
    const org = a.ctx.organizationId;
    const items = await tx.sdRequestItem.findMany({ where: { organizationId: org, ticketId }, select: { stage: true } });
    if (!items.length || items.some((i) => ['submitted', 'approval', 'fulfilment'].includes(i.stage))) return;
    const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: ticketId } });
    if (!OPEN_STATES.includes(t.systemState)) return;
    const delivered = items.some((i) => i.stage === 'delivered');
    const state = items.every((i) => i.stage === 'cancelled') ? 'closed' : 'solved';
    try {
      const status = await this.tickets.firstStatus(tx, org, t.deskId, t.typeId, state);
      await tx.$executeRaw`SAVEPOINT sd_settle`;
      await this.tickets.applyIn(tx, deskRobot(a, t.deskId), t, { statusId: status.id, resolutionNote: delivered ? 'Everything ordered was delivered.' : 'Nothing left to deliver: the items were not approved or were cancelled.' }, 'Request settled');
      await tx.$executeRaw`RELEASE SAVEPOINT sd_settle`;
    } catch (e) {
      // A desk that asks for a resolution code keeps the ticket for an agent to resolve.
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT sd_settle`.catch(() => undefined);
      this.logger.log(`request ${t.number} left for an agent: ${(e as Error).message}`);
    }
  }

  // ------------------------------------------------------------------------------------------ requester: follow and cancel (SD-2.03)

  private stages(ri: ReqItem, hasApproval: boolean) {
    const order = ['submitted', ...(hasApproval ? ['approval'] : []), 'fulfilment', 'delivered'];
    const at = order.indexOf(ri.stage);
    return order.map((s, i) => ({ stage: s, state: ri.stage === 'rejected' || ri.stage === 'cancelled' ? (i === 0 ? 'done' : 'stopped') : i < at || ri.stage === 'delivered' ? 'done' : i === at ? 'current' : 'next' }));
  }

  private async itemsView(tx: Tx, org: string, ticketId: string, o: { agent: boolean }) {
    const items = await tx.sdRequestItem.findMany({ where: { organizationId: org, ticketId }, orderBy: { createdAt: 'asc' } });
    const versions = await tx.sdCatalogItemVersion.findMany({ where: { organizationId: org, OR: items.map((i) => ({ itemId: i.itemId, version: i.itemVersion })) } });
    const names = new Map((await tx.sdCatalogItem.findMany({ where: { organizationId: org, id: { in: items.map((i) => i.itemId) } }, select: { id: true, name: true } })).map((i) => [i.id, i.name]));
    const out = [];
    for (const ri of items) {
      const v = versions.find((x) => x.itemId === ri.itemId && x.version === ri.itemVersion)!;
      const form = v.form as unknown as FormDef;
      const steps = v.approval as unknown as StepSpec[];
      const req = ri.approvalRequestId ? await tx.wfRequest.findFirst({ where: { organizationId: org, id: ri.approvalRequestId } }) : null;
      const route = req ? await this.approvals.viewIn(tx, org, req) : null;
      const tasks = await tx.sdTask.findMany({ where: { organizationId: org, requestItemId: ri.id }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, state: true, dueAt: true, groupId: true } });
      out.push({
        id: ri.id,
        item: names.get(ri.itemId) ?? '',
        itemVersion: ri.itemVersion,
        quantity: ri.quantity,
        stage: ri.stage,
        stageAt: ri.stageAt,
        tracker: this.stages(ri, steps.length > 0),
        canCancel: ri.stage === 'submitted' || ri.stage === 'approval',
        // Agents of the desk fulfil it and see every answer; anyone else sees the summary without sensitive answers.
        answers: o.agent ? ri.answers : summarise(form, ri.answers as Answers, await this.checkPicksNames(tx, org, form, ri.answers as Answers)),
        approval: route ? { status: route.status, steps: route.steps.map((s) => ({ name: s.name, state: s.state, rule: s.rule, approvers: s.approvers, waitingFor: s.waitingFor })), log: o.agent ? route.log : route.log.filter((l) => ['approved', 'self_approved', 'rejected', 'auto_approved', 'auto_rejected'].includes(l.action)) } : null,
        tasks: tasks.map((k) => ({ id: k.id, title: k.title, state: k.state, dueAt: k.dueAt })),
      });
    }
    return out;
  }

  private async checkPicksNames(tx: Tx, org: string, form: FormDef, values: Answers) {
    try {
      return await this.checkPicks(tx, org, form, values);
    } catch {
      return new Map<string, string>();
    }
  }

  /** GET /requests/{id}/stages for the requester (or the person it is for). */
  async myRequest(r: Requester, ticketId: string) {
    return this.tx(r, async (tx) => {
      const { t } = await this.requesters.ownTicket(tx, r, ticketId);
      return { ticketId: t.id, number: t.number, subject: t.subject, systemState: t.systemState, items: await this.itemsView(tx, r.ctx.organizationId, t.id, { agent: false }) };
    });
  }

  /** US-G-042: cancel while fulfilment has not started (one item, or every item that still can be). */
  async cancel(r: Requester, ticketId: string, itemId: string | null, reason: string | undefined) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    return this.tx(r, async (tx) => {
      const org = r.ctx.organizationId;
      const { t } = await this.requesters.ownTicket(tx, r, ticketId);
      await tx.$queryRaw`SELECT id FROM sd_request_items WHERE organization_id = ${org}::uuid AND ticket_id = ${t.id}::uuid FOR UPDATE`;
      const items = await tx.sdRequestItem.findMany({ where: { organizationId: org, ticketId: t.id, ...(itemId ? { id: itemId } : {}) } });
      if (itemId && !items.length) throw new NotFoundException('No such item.');
      const can = items.filter((i) => i.stage === 'submitted' || i.stage === 'approval');
      if (!can.length) throw new ConflictException('Fulfilment has started, so this can no longer be cancelled here. Reply on the request to ask the team.');
      for (const ri of can) {
        if (ri.approvalRequestId) await this.approvals.withdraw(tx, { ...r.ctx }, ri.approvalRequestId, r.userId, reason || 'Cancelled by the requester');
        await tx.sdRequestItem.update({ where: { id: ri.id }, data: { stage: 'cancelled', cancelReason: reason || null, stageAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
        await this.tickets.event(tx, t, 'request_stage', ri.stage, 'cancelled', { by: null, byPerson: await this.requesters.personOf(tx, r, false), reason: reason || 'Cancelled by the requester', requesterVisible: true });
      }
      await emit(tx, org, 'helpdesk.request.cancelled', { ticketId: t.id, deskId: t.deskId, items: can.length });
      await audit(tx, { ctx: r.ctx, userId: r.userId }, 'desk.catalog.cancelled', 'sd_ticket', t.id, { items: can.map((i) => i.id), reason: reason ?? null });
      await this.settleTicket(tx, r, t.id);
      return { cancelled: can.length };
    });
  }

  // ------------------------------------------------------------------------------------------ agents: the request and ad-hoc approvals

  /** The ordered items, their approvals and tasks, for whoever may open the ticket. */
  async ticketRequest(a: DeskActor, ticketId: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      const items = await this.itemsView(tx, a.ctx.organizationId, t.id, { agent: access === 'agent' });
      const adhoc = await tx.wfRequest.findMany({ where: { organizationId: a.ctx.organizationId, requestType: TICKET_APPROVAL, subjectType: 'sd_ticket', subjectId: t.id }, orderBy: { submittedAt: 'desc' } });
      return { items, approvals: await Promise.all(adhoc.map((r) => this.approvals.viewIn(tx, a.ctx.organizationId, r))) };
    });
  }

  /** US-G-054: an agent asks named colleagues to approve something on any ticket; the answer lands on the ticket. */
  async askApproval(a: DeskActor, ticketId: string, dto: AdhocApprovalDto) {
    const notices: Notice[] = [];
    const res = await this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      if (access !== 'agent') throw new ForbiddenException('Only an agent of this desk can do that.');
      requireWork(a, t.deskId);
      const hidden = t.sensitive || t.private;
      const sub = await this.approvals.submit(tx, a.ctx, {
        type: TICKET_APPROVAL,
        subjectType: 'sd_ticket',
        subjectId: t.id,
        title: `${t.number}: ${dto.question}`.slice(0, 200),
        // Approvers see the question and the ticket number; a sensitive or private ticket's subject stays out.
        summary: [{ label: 'Question', value: dto.question }, { label: 'Ticket', value: hidden ? t.number : `${t.number} · ${t.subject}` }],
        subjectPersonId: null,
        requesterUserId: a.userId,
        raisedByUserId: null,
        steps: [{ name: 'Approval', approvers: [{ kind: 'users', userIds: dto.userIds }], mode: dto.mode ?? 'any', rejectOn: 'one' }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: [],
      });
      notices.push(...sub.notices);
      await this.tickets.event(tx, t, 'approval_asked', null, `${dto.userIds.length} approver${dto.userIds.length > 1 ? 's' : ''}`, { by: a.userId, reason: dto.question });
      await audit(tx, a, 'desk.ticket.approval_asked', 'sd_ticket', t.id, { requestId: sub.id, approvers: dto.userIds, mode: dto.mode ?? 'any' });
      return { requestId: sub.id, status: sub.status };
    });
    await this.approvals.send(a.ctx, notices);
    return res;
  }

  private async adhocDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: Outcome) {
    await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
    const t = await tx.sdTicket.findFirst({ where: { organizationId: req.organizationId, id: req.subjectId } });
    if (!t) return;
    const last = await tx.wfAction.findFirst({ where: { organizationId: req.organizationId, requestId: req.id, action: { in: ['approved', 'rejected', 'self_approved'] } }, orderBy: { createdAt: 'desc' } });
    await this.tickets.event(tx, t, 'approval_decided', null, outcome === 'approved' ? 'Approved' : 'Not approved', { by: last?.actorUserId ?? null, reason: last?.reason ?? null });
  }
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function list(rows: { label: string; value: string }[]) {
  return rows.length ? `<ul>${rows.map((x) => `<li>${escape(x.label)}: ${escape(x.value)}</li>`).join('')}</ul>` : '';
}

/** Used by WorkService after a task changes: a delivered item may resolve its request (US-B-126). */
export async function afterTaskChange(tx: Tx, catalog: CatalogService, a: { ctx: DeskActor['ctx'] }, requestItemId: string | null) {
  if (requestItemId) await catalog.itemSettled(tx, a, requestItemId);
}


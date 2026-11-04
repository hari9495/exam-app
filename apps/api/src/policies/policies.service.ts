import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { OTP_TTL_SECONDS, OtpService } from '../auth/otp.service';
import { FilesService } from '../documents/files.service';
import { CompanyContext, Tx, audit, companyContext } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { safeName } from '../service-desk/attachments.service';
import { cleanHtml, htmlToText } from '../service-desk/rich-text';
import { toCsv } from '../time/leave-rules';
import type { AcknowledgeDto, DraftDto, NewPolicyDto, PolicyChangeDto, PublishDto, RemindDto, SendBackDto, SubmitDto } from './dto';
import { ackVersionNumber, daysBetween, daysSetting, dueOn, isDone, policyCode, remindNow, sameName, statusOf, tellManagerNow } from './policy-rules';

// HLP-10 / HLP-11 company policies (rules: docs/yukthix/helpdesk-design-map.md section 4d). HR (policy.manage) writes a
// policy and its versions and chooses who it applies to; a second person (policy.publish) publishes each version when
// the company says so (policy.publish.second_person, default on; also a database CHECK). The people in the audience read
// the current version and acknowledge it once (append-only record: the app's database role can neither change nor delete
// it). Reminders go through the notification system: on publish, every morning on the company's schedule, and when HR
// asks. Every change is audited. Another company's records never show (RLS), so they are "not found".

type Policy = Prisma.PolicyDocumentGetPayload<object>;
type Version = Prisma.PolicyVersionGetPayload<object>;
export interface AudienceRow {
  id: string;
  userId: string | null;
  name: string;
  code: string | null;
  departmentId: string | null;
  dept: string | null;
  managerId: string | null;
  joinedOn: string | null;
}
export interface Meta {
  ip: string | null;
  device: string | null;
}

const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const FILE_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'] as const;
const FILE_MAX_MB = 10;
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const nameOf = (e: { givenName: string; familyName: string | null }) => [e.givenName, e.familyName].filter(Boolean).join(' ');
const otpKey = (org: string, versionId: string, userId: string) => `policy-ack:${org}:${versionId}:${userId}`;
const LINK_MY = (id: string) => `/yx/desk/policies?policy=${id}`;
const LINK_ADMIN = (id: string) => `/yx/desk/policy-admin?policy=${id}`;

/** Unique-index clashes in plain words (the indexes say which record). */
function mapDb(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const model = String(e.meta?.modelName ?? '');
    if (model === 'PolicyAcknowledgement') return new ConflictException('You have already acknowledged this version.');
    if (model === 'PolicyVersion') return new ConflictException('Someone started a new version of this policy at the same moment. Reload to see it.');
    if (model === 'PolicyReminder') return new ConflictException('A reminder already went to this person today.');
    return new ConflictException('A policy with this title already exists.');
  }
  return e;
}

@Injectable()
export class PoliciesService {
  private readonly logger = new Logger(PoliciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly otp: OtpService,
  ) {}

  private async tx<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
    const c = companyContext(ctx);
    try {
      return await this.tenantPrisma.forTenant(c, (tx) => fn(tx, c));
    } catch (e) {
      throw mapDb(e);
    }
  }

  /**
   * Policies are company-wide: an HR key granted for one legal entity only (the HR Admin template's typical scope) passes
   * the route guard but confers nothing here (fail closed); the key must be held for the whole company.
   */
  async companyWide(user: ScopeUser, keys: ('policy.manage' | 'policy.publish')[]) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, keys);
    if (!keys.some((k) => tenantWide(v, k))) throw new ForbiddenException('Company policies apply to the whole company: this needs the key for the whole company, not one legal entity.');
  }

  // ------------------------------------------------------------------------------------------ shared reads

  async settings(tx: Tx, c: CompanyContext) {
    const get = (k: Parameters<typeof settingFor>[2]) => settingFor(tx, c, k, ANY_ENTITY);
    return {
      dueDays: daysSetting(await get('policy.ack.due_days')) ?? 14,
      everyDays: daysSetting(await get('policy.reminder.every_days')),
      managerAfterDays: daysSetting(await get('policy.reminder.manager_after_days')),
      reackDefault: (await get('policy.reack.default')) !== 'off',
      typedName: (await get('policy.ack.typed_name')) === 'on',
      secondPerson: (await get('policy.publish.second_person')) !== 'off',
    };
  }

  private async policy(tx: Tx, org: string, id: string): Promise<Policy> {
    const p = await tx.policyDocument.findFirst({ where: { organizationId: org, id } });
    if (!p) throw new NotFoundException('No such policy.');
    return p;
  }

  private versions(tx: Tx, org: string, policyId: string) {
    return tx.policyVersion.findMany({ where: { organizationId: org, policyId }, orderBy: { number: 'asc' } });
  }

  /** The people a policy applies to today: their assignment in force matches every list given (empty = all). */
  async audience(tx: Tx, org: string, p: Policy, today: string, employeeId?: string): Promise<AudienceRow[]> {
    const one = employeeId ? Prisma.sql`AND e.id = ${employeeId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<{ id: string; user_id: string | null; given_name: string; family_name: string | null; employee_code: string | null; department_id: string | null; dept: string | null; manager_id: string | null; joined_on: string | null }[]>`
      SELECT DISTINCT ON (e.id) e.id::text, e.user_id::text, e.given_name, e.family_name, em.employee_code::text, ea.department_id::text, dpt.name::text AS dept,
             ea.manager_employee_id::text AS manager_id, em.joined_on::text
      FROM employee_assignments ea
      JOIN employees e ON e.organization_id = ea.organization_id AND e.id = ea.employee_id
      JOIN employments em ON em.organization_id = ea.organization_id AND em.id = ea.employment_id
      LEFT JOIN departments dpt ON dpt.organization_id = ea.organization_id AND dpt.id = ea.department_id
      WHERE ea.organization_id = ${org}::uuid AND ea.superseded_at IS NULL
        AND ea.valid_from <= ${today}::date AND (ea.valid_to IS NULL OR ea.valid_to >= ${today}::date)
        AND (em.exited_on IS NULL OR em.exited_on >= ${today}::date)
        AND (cardinality(${p.legalEntityIds}::uuid[]) = 0 OR ea.legal_entity_id = ANY(${p.legalEntityIds}::uuid[]))
        AND (cardinality(${p.locationIds}::uuid[]) = 0 OR ea.location_id = ANY(${p.locationIds}::uuid[]))
        AND (cardinality(${p.gradeIds}::uuid[]) = 0 OR ea.grade_id = ANY(${p.gradeIds}::uuid[]))
        AND (cardinality(${p.departmentIds}::uuid[]) = 0 OR EXISTS (SELECT 1 FROM unnest(${p.departmentIds}::uuid[]) x WHERE dpt.path LIKE '%/' || x::text || '/%'))
        ${one}
      ORDER BY e.id, em.joined_on DESC`;
    return rows.map((r) => ({ id: r.id, userId: r.user_id, name: [r.given_name, r.family_name].filter(Boolean).join(' '), code: r.employee_code, departmentId: r.department_id, dept: r.dept, managerId: r.manager_id, joinedOn: r.joined_on }));
  }

  /** Per person in the audience: done or not, the due day and status, against the version people must acknowledge. */
  private async completion(tx: Tx, org: string, p: Policy, versions: Version[], today: string, dueDays: number, employeeId?: string) {
    const published = versions.filter((v) => v.status === 'published');
    const need = ackVersionNumber(published);
    const people = need === null ? [] : await this.audience(tx, org, p, today, employeeId);
    const needVersion = published.find((v) => v.number === need) ?? null;
    const acks = await tx.policyAcknowledgement.findMany({ where: { organizationId: org, policyId: p.id, ...(employeeId ? { employeeId } : {}) }, orderBy: { acknowledgedAt: 'asc' } });
    const numberOf = new Map(versions.map((v) => [v.id, v.number]));
    const byPerson = new Map<string, typeof acks>();
    for (const a of acks) byPerson.set(a.employeeId, [...(byPerson.get(a.employeeId) ?? []), a]);
    const rows = people.map((person) => {
      const mine = byPerson.get(person.id) ?? [];
      const done = isDone(mine.map((a) => numberOf.get(a.versionId) ?? 0), need!);
      const due = dueOn(iso(needVersion!.effectiveOn)!, person.joinedOn, dueDays);
      const last = mine[mine.length - 1] ?? null;
      return { person, done, due, status: statusOf(done, due, today), last };
    });
    return { need, needVersion, rows };
  }

  private current(versions: Version[]) {
    return [...versions].reverse().find((v) => v.status === 'published') ?? null;
  }

  private async fileList(tx: Tx, org: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await tx.file.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, fileName: true, size: true, mime: true, scanStatus: true } });
    return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map((r) => ({ id: r.id, name: r.fileName, size: r.size, type: r.mime, scan: r.scanStatus }));
  }

  private async userNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(rows.map((u) => [u.id, u.name ?? u.email]));
  }

  // ------------------------------------------------------------------------------------------ HR: list and detail

  async list(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const s = await this.settings(tx, c);
      const policies = await tx.policyDocument.findMany({ where: { organizationId: org }, orderBy: { number: 'asc' } });
      const owners = await this.userNames(tx, org, policies.map((p) => p.ownerUserId));
      const out = [];
      // shortcut: one audience query per policy; fine for tens of policies, batch it if a company keeps hundreds.
      for (const p of policies) {
        const versions = await this.versions(tx, org, p.id);
        const cur = this.current(versions);
        const open = versions.find((v) => v.status !== 'published') ?? null;
        const { rows, needVersion } = await this.completion(tx, org, p, versions, today, s.dueDays);
        out.push({
          id: p.id,
          code: policyCode(p.number),
          title: p.title,
          category: p.category,
          method: p.method,
          owner: p.ownerUserId ? (owners.get(p.ownerUserId) ?? null) : null,
          version: cur ? `v${cur.number}` : null,
          effectiveOn: iso(cur?.effectiveOn ?? null),
          open: open ? { number: open.number, status: open.status } : null,
          audience: rows.length,
          acknowledged: rows.filter((r) => r.done).length,
          overdue: rows.filter((r) => r.status === 'overdue').length,
          dueOn: needVersion ? dueOn(iso(needVersion.effectiveOn)!, null, s.dueDays) : null,
        });
      }
      return out;
    });
  }

  async detail(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const p = await this.policy(tx, org, id);
      const s = await this.settings(tx, c);
      const versions = await this.versions(tx, org, p.id);
      const cur = this.current(versions);
      const open = versions.find((v) => v.status !== 'published') ?? null;
      const { rows, need, needVersion } = await this.completion(tx, org, p, versions, today, s.dueDays);
      const names = await this.userNames(tx, org, [p.ownerUserId, ...versions.flatMap((v) => [v.writtenBy, v.publishedBy])]);
      // Acknowledged % per version: of today's audience, who acknowledged that version.
      const acks = await tx.policyAcknowledgement.groupBy({ by: ['versionId'], where: { organizationId: org, policyId: p.id }, _count: { _all: true } });
      const ackCount = new Map(acks.map((a) => [a.versionId, a._count._all]));
      const depts = new Map<string, { departmentId: string | null; dept: string; audience: number; acknowledged: number }>();
      for (const r of rows) {
        const k = r.person.departmentId ?? 'none';
        const d = depts.get(k) ?? { departmentId: r.person.departmentId, dept: r.person.dept ?? 'No department', audience: 0, acknowledged: 0 };
        d.audience++;
        if (r.done) d.acknowledged++;
        depts.set(k, d);
      }
      const versionView = (v: Version) => ({
        id: v.id,
        number: v.number,
        label: `v${v.number}`,
        status: v.status,
        changeSummary: v.changeSummary,
        reack: v.reack || v.number === 1,
        effectiveOn: iso(v.effectiveOn),
        writtenBy: names.get(v.writtenBy) ?? null,
        // HLP-14: the approver of an AI draft counts as its writer (never its publisher).
        writtenByMe: v.writtenBy === c.userId || v.aiApprovedBy === c.userId,
        publishedBy: v.publishedBy ? (names.get(v.publishedBy) ?? null) : null,
        needsSecondPerson: v.needsSecondPerson,
        // HLP-14: the counsel note the publisher ticks as seen (null when none).
        counselNote: v.counselNote,
        sentBackNote: v.sentBackNote,
        acknowledged: ackCount.get(v.id) ?? 0,
        version: v.version,
      });
      return {
        id: p.id,
        code: policyCode(p.number),
        title: p.title,
        category: p.category,
        method: p.method,
        ownerUserId: p.ownerUserId,
        owner: p.ownerUserId ? (names.get(p.ownerUserId) ?? null) : null,
        legalEntityIds: p.legalEntityIds,
        locationIds: p.locationIds,
        departmentIds: p.departmentIds,
        gradeIds: p.gradeIds,
        version: p.version,
        current: cur ? { ...versionView(cur), bodyHtml: cur.bodyHtml, files: await this.fileList(tx, org, cur.fileIds) } : null,
        open: open ? { ...versionView(open), bodyHtml: open.bodyHtml, files: await this.fileList(tx, org, open.fileIds) } : null,
        versions: versions.filter((v) => v.status === 'published').map(versionView).reverse(),
        ackVersion: need ? `v${need}` : null,
        audience: rows.length,
        acknowledged: rows.filter((r) => r.done).length,
        overdue: rows.filter((r) => r.status === 'overdue').length,
        dueOn: needVersion ? dueOn(iso(needVersion.effectiveOn)!, null, s.dueDays) : null,
        byDept: [...depts.values()].sort((a, b) => a.dept.localeCompare(b.dept)),
        settings: s,
      };
    });
  }

  /** People who have not acknowledged yet, most overdue first; optionally one department (the drill-down). */
  async pending(ctx: TenantContext, id: string, departmentId?: string) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const p = await this.policy(tx, org, id);
      const s = await this.settings(tx, c);
      const versions = await this.versions(tx, org, p.id);
      const { rows, needVersion } = await this.completion(tx, org, p, versions, today, s.dueDays);
      const open = rows.filter((r) => !r.done && (!departmentId || r.person.departmentId === departmentId));
      if (!needVersion) return [];
      const managers = await tx.employee.findMany({ where: { organizationId: org, id: { in: open.map((r) => r.person.managerId).filter((x): x is string => Boolean(x)) } }, select: { id: true, givenName: true, familyName: true } });
      const reminders = await tx.policyReminder.findMany({ where: { organizationId: org, versionId: needVersion.id, employeeId: { in: open.map((r) => r.person.id) } }, orderBy: { sentOn: 'asc' } });
      return open
        .map((r) => {
          const mine = reminders.filter((x) => x.employeeId === r.person.id);
          const last = mine.filter((x) => x.kind === 'employee').pop();
          const m = managers.find((x) => x.id === r.person.managerId);
          return {
            employeeId: r.person.id,
            name: r.person.name,
            code: r.person.code,
            departmentId: r.person.departmentId,
            dept: r.person.dept,
            manager: m ? nameOf(m) : null,
            dueOn: r.due,
            daysOverdue: Math.max(0, daysBetween(r.due, today)),
            lastRemindedOn: iso(last?.sentOn ?? null),
            managerTold: mine.some((x) => x.kind === 'manager'),
          };
        })
        .sort((a, b) => b.daysOverdue - a.daysOverdue || a.name.localeCompare(b.name));
    });
  }

  /** The org structure the audience is built from (names only). */
  async options(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const [legalEntities, locations, departments, grades, people] = await Promise.all([
        tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.location.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.department.findMany({ where: { organizationId: org }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.grade.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { rank: 'asc' } }),
        tx.user.findMany({ where: { organizationId: org, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 500 }),
      ]);
      return { legalEntities, locations, departments, grades, owners: people.map((u) => ({ id: u.id, name: u.name ?? u.email })) };
    });
  }

  // ------------------------------------------------------------------------------------------ HR: write

  async create(ctx: TenantContext, dto: NewPolicyDto) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (await tx.policyDocument.findFirst({ where: { organizationId: org, title: { equals: dto.title, mode: 'insensitive' } }, select: { id: true } })) throw new ConflictException('A policy with this title already exists.');
      const last = await tx.policyDocument.aggregate({ where: { organizationId: org }, _max: { number: true } });
      const p = await tx.policyDocument.create({ data: { organizationId: org, number: (last._max.number ?? 0) + 1, title: dto.title, category: dto.category, method: dto.method, ownerUserId: c.userId ?? null, createdBy: c.userId ?? null } });
      await tx.policyVersion.create({ data: { organizationId: org, policyId: p.id, number: 1, writtenBy: c.userId!, reack: true } });
      await audit(tx, c, 'policy.created', 'policy_document', p.id, { title: p.title, category: p.category, method: p.method });
      return { id: p.id, code: policyCode(p.number) };
    });
  }

  async update(ctx: TenantContext, id: string, dto: PolicyChangeDto) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.policy(tx, org, id);
      if (p.version !== dto.version) throw new ConflictException('Someone changed this policy meanwhile. Reload and try again.');
      // Every id must be this company's own (RLS hides the rest, so a foreign id simply isn't found).
      const check = async (ids: string[] | undefined, table: 'legalEntity' | 'location' | 'department' | 'grade', what: string) => {
        if (!ids?.length) return;
        const n = await (tx[table] as unknown as { count: (a: object) => Promise<number> }).count({ where: { organizationId: org, id: { in: ids } } });
        if (n !== ids.length) throw new BadRequestException(`One of the ${what} is not in this company.`);
      };
      await check(dto.legalEntityIds, 'legalEntity', 'legal entities');
      await check(dto.locationIds, 'location', 'locations');
      await check(dto.departmentIds, 'department', 'departments');
      await check(dto.gradeIds, 'grade', 'grades');
      if (dto.ownerUserId && !(await tx.user.findFirst({ where: { organizationId: org, id: dto.ownerUserId }, select: { id: true } }))) throw new BadRequestException('The owner is not in this company.');
      if (dto.title && dto.title.toLowerCase() !== p.title.toLowerCase() && (await tx.policyDocument.findFirst({ where: { organizationId: org, title: { equals: dto.title, mode: 'insensitive' }, NOT: { id: p.id } }, select: { id: true } })))
        throw new ConflictException('A policy with this title already exists.');
      const data = { title: dto.title, category: dto.category, method: dto.method, ownerUserId: dto.ownerUserId, legalEntityIds: dto.legalEntityIds, locationIds: dto.locationIds, departmentIds: dto.departmentIds, gradeIds: dto.gradeIds };
      const before = Object.fromEntries(Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined).map((k) => [k, p[k as keyof Policy]]));
      const after = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      const n = await tx.policyDocument.updateMany({ where: { organizationId: org, id: p.id, version: dto.version }, data: { ...after, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone changed this policy meanwhile. Reload and try again.');
      await audit(tx, c, 'policy.changed', 'policy_document', p.id, { before, after });
      return { version: p.version + 1 };
    });
  }

  /** Save the open version's text; with no open version, start the next one. */
  async saveDraft(ctx: TenantContext, id: string, dto: DraftDto) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.policy(tx, org, id);
      const s = await this.settings(tx, c);
      const versions = await this.versions(tx, org, p.id);
      const open = versions.find((v) => v.status !== 'published') ?? null;
      const bodyHtml = cleanHtml(dto.bodyHtml);
      if (!open) {
        if (dto.version !== undefined) throw new ConflictException('This version was published meanwhile. Reload to start a new one.');
        const number = (versions[versions.length - 1]?.number ?? 0) + 1;
        const v = await tx.policyVersion.create({ data: { organizationId: org, policyId: p.id, number, bodyHtml, changeSummary: dto.changeSummary || null, reack: number === 1 ? true : (dto.reack ?? s.reackDefault), fileIds: versions[versions.length - 1]?.fileIds ?? [], writtenBy: c.userId! } });
        await audit(tx, c, 'policy.version_started', 'policy_version', v.id, { policyId: p.id, number });
        return { id: v.id, version: v.version };
      }
      if (open.status === 'waiting') throw new ConflictException('This version is waiting to be published. Ask the publisher to send it back to change it.');
      if (dto.version !== open.version) throw new ConflictException('Someone changed this version meanwhile. Reload and try again.');
      const n = await tx.policyVersion.updateMany({
        where: { organizationId: org, id: open.id, version: open.version, status: { in: ['draft', 'sent_back'] } },
        data: { bodyHtml, changeSummary: dto.changeSummary === undefined ? undefined : dto.changeSummary || null, reack: open.number === 1 ? true : dto.reack, status: 'draft', writtenBy: c.userId!, version: { increment: 1 } },
      });
      if (!n.count) throw new ConflictException('Someone changed this version meanwhile. Reload and try again.');
      await audit(tx, c, 'policy.version_saved', 'policy_version', open.id, { policyId: p.id, number: open.number, textChanged: bodyHtml !== open.bodyHtml, summaryChanged: dto.changeSummary !== undefined && (dto.changeSummary || null) !== open.changeSummary, reack: dto.reack });
      return { id: open.id, version: open.version + 1 };
    });
  }

  private async openDraft(tx: Tx, org: string, policyId: string) {
    const v = await tx.policyVersion.findFirst({ where: { organizationId: org, policyId, status: { not: 'published' } } });
    if (!v) throw new ConflictException('There is no version being written. Start one first.');
    if (v.status === 'waiting') throw new ConflictException('This version is waiting to be published. Ask the publisher to send it back to change it.');
    return v;
  }

  async addFile(ctx: TenantContext, id: string, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a file to attach.');
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.policy(tx, org, id);
      const v = await this.openDraft(tx, org, id);
      if (v.fileIds.length >= 10) throw new BadRequestException('A version can have up to 10 attachments.');
      const f = await this.files.storeIn(tx, c, { area: 'policies', name: safeName(file.name), data: file.data, allowedMime: FILE_TYPES, maxMb: FILE_MAX_MB, via: 'staff' });
      await tx.policyVersion.update({ where: { id: v.id }, data: { fileIds: [...v.fileIds, f.id], version: { increment: 1 } } });
      await audit(tx, c, 'policy.file_added', 'policy_version', v.id, { policyId: id, fileId: f.id, name: f.fileName });
      return { id: f.id, name: f.fileName, size: f.size, type: f.mime, scan: f.scanStatus };
    }).then(async (r) => {
      void this.files.scan(companyContext(ctx).organizationId, r.id).catch(() => undefined);
      return r;
    });
  }

  async removeFile(ctx: TenantContext, id: string, fileId: string) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.policy(tx, org, id);
      const v = await this.openDraft(tx, org, id);
      if (!v.fileIds.includes(fileId)) throw new NotFoundException('That file is not on this version.');
      await tx.policyVersion.update({ where: { id: v.id }, data: { fileIds: v.fileIds.filter((x) => x !== fileId), version: { increment: 1 } } });
      await audit(tx, c, 'policy.file_removed', 'policy_version', v.id, { policyId: id, fileId });
      return { removed: true };
    });
  }

  /** Send the open version to be published (a second person when the company says so). */
  async submit(ctx: TenantContext, id: string, dto: SubmitDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.policy(tx, org, id);
      const v = await this.openDraft(tx, org, id);
      if (v.version !== dto.version) throw new ConflictException('Someone changed this version meanwhile. Reload and try again.');
      if (!htmlToText(v.bodyHtml).trim()) throw new BadRequestException({ statusCode: 400, code: 'POLICY_TEXT_MISSING', message: 'Write the policy text first.' });
      if (v.number > 1 && (v.changeSummary ?? '').trim().length < 3) throw new BadRequestException({ statusCode: 400, code: 'POLICY_SUMMARY_MISSING', message: 'Say what changed (3 letters or more). People see it at the top of the policy.' });
      const s = await this.settings(tx, c);
      const n = await tx.policyVersion.updateMany({ where: { organizationId: org, id: v.id, version: v.version }, data: { status: 'waiting', submittedAt: new Date(), sentBackNote: null, needsSecondPerson: s.secondPerson || Boolean(v.aiApprovedBy), writtenBy: c.userId!, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone changed this version meanwhile. Reload and try again.');
      const second = s.secondPerson || Boolean(v.aiApprovedBy);
      await audit(tx, c, 'policy.version_sent', 'policy_version', v.id, { policyId: p.id, number: v.number, needsSecondPerson: second });
      return { org, p, number: v.number, publishers: (await this.publishers(tx, org)).filter((u) => (!second || u !== c.userId) && u !== v.aiApprovedBy) };
    });
    await this.noticeToPublish(out.org, out.p, out.number, out.publishers);
    return { status: 'waiting' };
  }

  /** "Waiting to be published" to the people who may publish it (HLP-11 submit, HLP-14 approve). */
  async noticeToPublish(org: string, p: { id: string; title: string }, number: number, userIds: string[]) {
    await this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, userIds, 'helpdesk.policy.to_publish', { entityType: 'policy_document', entityId: p.id, contextText: `${p.title} v${number} is waiting to be published`, linkPath: LINK_ADMIN(p.id) }, { subject: 'A policy version is waiting to be published', html: `<p>${escapeHtml(p.title)} v${number} is waiting for you to publish it in YukthiX.</p>` })
      .catch((e: Error) => this.logger.warn(`publish notice: ${e.message}`));
  }

  /** Users who may publish: a role profile with policy.publish, or the System Admin role (which carries it). */
  async publishers(tx: Tx, org: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id::text FROM users u LEFT JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
      WHERE u.organization_id = ${org}::uuid AND u.status = 'active'
        AND ((p.id IS NOT NULL AND p.permissions_json LIKE '%"policy.publish"%') OR (p.id IS NULL AND u.role = 'org_admin'))
      LIMIT 25`;
    return rows.map((r) => r.id);
  }

  async publish(ctx: TenantContext, id: string, dto: PublishDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.policy(tx, org, id);
      const v = await tx.policyVersion.findFirst({ where: { organizationId: org, policyId: p.id, status: 'waiting' } });
      if (!v) throw new ConflictException('No version of this policy is waiting to be published.');
      if (v.version !== dto.version) throw new ConflictException('This version changed meanwhile. Reload and check it again.');
      if (v.needsSecondPerson && v.writtenBy === c.userId) throw new ForbiddenException({ statusCode: 403, code: 'POLICY_SECOND_PERSON', message: 'Someone other than the writer publishes this version. Ask another publisher.' });
      // HLP-14: the person who approved the AI draft never publishes it (also a database CHECK).
      if (v.aiApprovedBy && v.aiApprovedBy === c.userId) throw new ForbiddenException({ statusCode: 403, code: 'POLICY_SECOND_PERSON', message: 'You approved this draft, so someone else publishes it. Ask another publisher.' });
      // HLP-14: a counsel note (industry rules not checked) is ticked as seen by the publisher; never a block (database CHECK).
      if (v.counselNote && dto.counselSeen !== true) throw new BadRequestException({ statusCode: 400, code: 'POLICY_COUNSEL_UNSEEN', message: 'Tick that you have read the counsel note first.' });
      if (v.counselNote) await audit(tx, c, 'policy.counsel_note_seen', 'policy_version', v.id, { policyId: p.id, number: v.number, note: v.counselNote });
      const today = todayIst();
      await tx.policyVersion.update({ where: { id: v.id }, data: { status: 'published', ...(v.counselNote ? { counselSeenBy: c.userId!, counselSeenAt: new Date() } : {}), publishedBy: c.userId!, publishedAt: new Date(), effectiveOn: new Date(`${today}T00:00:00Z`), bodySha256: sha256(v.bodyHtml), version: { increment: 1 } } });
      await audit(tx, c, 'policy.version_published', 'policy_version', v.id, { policyId: p.id, number: v.number, reack: v.reack || v.number === 1, writtenBy: v.writtenBy });
      // The notice on publish counts as the first reminder for everyone who must acknowledge.
      const s = await this.settings(tx, c);
      const versions = await this.versions(tx, org, p.id);
      const { rows, needVersion } = await this.completion(tx, org, p, versions, today, s.dueDays);
      const pending = needVersion?.id === v.id ? rows.filter((r) => !r.done) : [];
      if (pending.length) await tx.policyReminder.createMany({ data: pending.map((r) => ({ organizationId: org, policyId: p.id, versionId: v.id, employeeId: r.person.id, kind: 'employee', sentOn: new Date(`${today}T00:00:00Z`), byUserId: c.userId ?? null })), skipDuplicates: true });
      return { org, p, number: v.number, writer: v.writtenBy, people: pending.map((r) => r.person.userId).filter((x): x is string => Boolean(x)), due: pending[0]?.due ?? null };
    });
    const ctxOrg = { organizationId: out.org, isSuperAdmin: false };
    await this.notifications
      .notifySystem(ctxOrg, out.people, 'helpdesk.policy.to_acknowledge', { entityType: 'policy_document', entityId: out.p.id, contextText: `Read and acknowledge ${out.p.title} (v${out.number})`, linkPath: LINK_MY(out.p.id) }, { subject: `Please read and acknowledge: ${out.p.title}`, html: `<p>A company policy is waiting for you to read and acknowledge it in YukthiX: ${escapeHtml(out.p.title)} (v${out.number}).</p>` })
      .catch((e: Error) => this.logger.warn(`policy notice: ${e.message}`));
    if (out.writer !== companyContext(ctx).userId)
      await this.notifications.notifySystem(ctxOrg, [out.writer], 'helpdesk.policy.decided', { entityType: 'policy_document', entityId: out.p.id, contextText: `${out.p.title} v${out.number} was published`, linkPath: LINK_ADMIN(out.p.id) }, { subject: 'Your policy version was published', html: `<p>${escapeHtml(out.p.title)} v${out.number} was published in YukthiX.</p>` }).catch(() => undefined);
    return { status: 'published', notified: out.people.length };
  }

  async sendBack(ctx: TenantContext, id: string, dto: SendBackDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.policy(tx, org, id);
      const v = await tx.policyVersion.findFirst({ where: { organizationId: org, policyId: p.id, status: 'waiting' } });
      if (!v) throw new ConflictException('No version of this policy is waiting to be published.');
      if (v.version !== dto.version) throw new ConflictException('This version changed meanwhile. Reload and check it again.');
      await tx.policyVersion.update({ where: { id: v.id }, data: { status: 'sent_back', sentBackNote: dto.note, version: { increment: 1 } } });
      await audit(tx, c, 'policy.version_sent_back', 'policy_version', v.id, { policyId: p.id, number: v.number, note: dto.note });
      return { org, p, number: v.number, writer: v.writtenBy };
    });
    await this.notifications.notifySystem({ organizationId: out.org, isSuperAdmin: false }, [out.writer], 'helpdesk.policy.decided', { entityType: 'policy_document', entityId: out.p.id, contextText: `${out.p.title} v${out.number} was sent back: ${dto.note}`, linkPath: LINK_ADMIN(out.p.id) }, { subject: 'Your policy version was sent back', html: `<p>${escapeHtml(out.p.title)} v${out.number} was sent back to you in YukthiX with a note.</p>` }).catch(() => undefined);
    return { status: 'sent_back' };
  }

  // ------------------------------------------------------------------------------------------ reminders

  /** HR's "Send reminder": the pending people (or the ticked ones) not reminded today. */
  async remind(ctx: TenantContext, id: string, dto: RemindDto) {
    const out = await this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const p = await this.policy(tx, org, id);
      const s = await this.settings(tx, c);
      const versions = await this.versions(tx, org, p.id);
      const { rows, needVersion } = await this.completion(tx, org, p, versions, today, s.dueDays);
      if (!needVersion) throw new ConflictException('This policy is not published yet, so nobody needs a reminder.');
      const want = dto.employeeIds?.length ? new Set(dto.employeeIds) : null;
      const pending = rows.filter((r) => !r.done && (!want || want.has(r.person.id)));
      const sentToday = new Set((await tx.policyReminder.findMany({ where: { organizationId: org, versionId: needVersion.id, kind: 'employee', sentOn: new Date(`${today}T00:00:00Z`) }, select: { employeeId: true } })).map((r) => r.employeeId));
      const go = pending.filter((r) => !sentToday.has(r.person.id));
      if (go.length) await tx.policyReminder.createMany({ data: go.map((r) => ({ organizationId: org, policyId: p.id, versionId: needVersion.id, employeeId: r.person.id, kind: 'employee', sentOn: new Date(`${today}T00:00:00Z`), byUserId: c.userId ?? null })), skipDuplicates: true });
      await audit(tx, c, 'policy.reminded', 'policy_document', p.id, { version: needVersion.number, sent: go.length, skippedToday: pending.length - go.length, chosen: want ? want.size : null });
      return { org, p, number: needVersion.number, users: go.map((r) => r.person.userId).filter((x): x is string => Boolean(x)), sent: go.length, skipped: pending.length - go.length };
    });
    await this.tellPeople(out.org, out.p, out.number, out.users);
    return { sent: out.sent, skipped: out.skipped };
  }

  private tellPeople(org: string, p: Policy, number: number, users: string[]) {
    return this.notifications
      .notifySystem({ organizationId: org, isSuperAdmin: false }, users, 'helpdesk.policy.to_acknowledge', { entityType: 'policy_document', entityId: p.id, contextText: `Reminder: read and acknowledge ${p.title} (v${number})`, linkPath: LINK_MY(p.id) }, { subject: `Reminder: please acknowledge ${p.title}`, html: `<p>A company policy is still waiting for you to read and acknowledge it in YukthiX: ${escapeHtml(p.title)} (v${number}).</p>` })
      .catch((e: Error) => this.logger.warn(`policy reminder: ${e.message}`));
  }

  /** The morning job for every company: reminders on the company's schedule, and the manager told once. Safe to re-run. */
  async remindAll(today = todayIst()): Promise<number> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM policy_versions WHERE status = 'published'`);
    let n = 0;
    for (const { id } of orgs) n += await this.remindOrg(id, today).catch((e: Error) => (this.logger.warn(`policy reminders ${id}: ${e.message}`), 0));
    return n;
  }

  async remindOrg(org: string, today = todayIst()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const sends = await this.tenantPrisma.forTenant(c, async (tx) => {
      const s = await this.settings(tx, c);
      const out: { p: Policy; number: number; users: string[]; managers: { userId: string; name: string }[] }[] = [];
      for (const p of await tx.policyDocument.findMany({ where: { organizationId: org } })) {
        const versions = await this.versions(tx, org, p.id);
        const { rows, needVersion } = await this.completion(tx, org, p, versions, today, s.dueDays);
        if (!needVersion) continue;
        const open = rows.filter((r) => !r.done);
        if (!open.length) continue;
        const sent = await tx.policyReminder.findMany({ where: { organizationId: org, versionId: needVersion.id, employeeId: { in: open.map((r) => r.person.id) } }, orderBy: { sentOn: 'asc' } });
        const users: string[] = [];
        const told: AudienceRow[] = [];
        const day = new Date(`${today}T00:00:00Z`);
        for (const r of open) {
          const mine = sent.filter((x) => x.employeeId === r.person.id);
          const last = iso(mine.filter((x) => x.kind === 'employee').pop()?.sentOn ?? null);
          if (remindNow(last, today, s.everyDays) && (await tx.policyReminder.createMany({ data: [{ organizationId: org, policyId: p.id, versionId: needVersion.id, employeeId: r.person.id, kind: 'employee', sentOn: day }], skipDuplicates: true })).count && r.person.userId) users.push(r.person.userId);
          if (r.person.managerId && tellManagerNow(r.due, today, s.managerAfterDays, mine.some((x) => x.kind === 'manager')) && (await tx.policyReminder.createMany({ data: [{ organizationId: org, policyId: p.id, versionId: needVersion.id, employeeId: r.person.id, kind: 'manager', sentOn: day }], skipDuplicates: true })).count) told.push(r.person);
        }
        const mgrs = told.length ? await tx.employee.findMany({ where: { organizationId: org, id: { in: told.map((t) => t.managerId!) } }, select: { id: true, userId: true } }) : [];
        out.push({ p, number: needVersion.number, users, managers: told.map((t) => ({ userId: mgrs.find((m) => m.id === t.managerId)?.userId ?? '', name: t.name })).filter((m) => m.userId) });
      }
      return out;
    });
    let n = 0;
    for (const x of sends) {
      if (x.users.length) await this.tellPeople(org, x.p, x.number, x.users);
      for (const m of x.managers)
        await this.notifications
          .notifySystem(c, [m.userId], 'helpdesk.policy.overdue_report', { entityType: 'policy_document', entityId: x.p.id, contextText: `${m.name} has not acknowledged ${x.p.title} yet and is overdue`, linkPath: '/yx/desk/help' }, { subject: 'Someone in your team is overdue on a company policy', html: `<p>${escapeHtml(m.name)} has not acknowledged ${escapeHtml(x.p.title)} yet. Please remind them.</p>` })
          .catch(() => undefined);
      n += x.users.length + x.managers.length;
    }
    return n;
  }

  // ------------------------------------------------------------------------------------------ evidence

  async evidence(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await this.policy(tx, org, id);
      const versions = await this.versions(tx, org, p.id);
      const acks = await tx.policyAcknowledgement.findMany({ where: { organizationId: org, policyId: p.id }, orderBy: { acknowledgedAt: 'asc' } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(acks.map((a) => a.employeeId))] } }, select: { id: true, givenName: true, familyName: true } });
      const codes = await tx.employment.findMany({ where: { organizationId: org, employeeId: { in: people.map((x) => x.id) } }, select: { employeeId: true, employeeCode: true }, orderBy: { joinedOn: 'desc' } });
      const vOf = new Map(versions.map((v) => [v.id, v]));
      const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
      const rows: (string | number | null)[][] = [['Policy', 'Version', 'Version effective', 'Employee', 'Employee code', 'Acknowledged at (IST)', 'Method', 'Typed name', 'Text fingerprint (SHA-256)', 'IP', 'Device']];
      for (const a of acks) {
        const person = people.find((x) => x.id === a.employeeId);
        const v = vOf.get(a.versionId);
        rows.push([`${policyCode(p.number)} ${p.title}`, v ? `v${v.number}` : '', iso(v?.effectiveOn ?? null), person ? nameOf(person) : '', codes.find((x) => x.employeeId === a.employeeId)?.employeeCode ?? '', ist(a.acknowledgedAt), a.method === 'otp' ? 'One-time code' : 'Confirmation', a.typedName, a.bodySha256, a.ip, a.userAgent]);
      }
      await audit(tx, c, 'policy.evidence_exported', 'policy_document', p.id, { rows: acks.length });
      return { name: `${policyCode(p.number)}-acknowledgements.csv`, csv: toCsv(rows) };
    });
  }

  /** A file of a version (HR: any version; the employee: the current one, via myFile). Only clean files open. */
  async file(ctx: TenantContext, id: string, fileId: string) {
    const row = await this.tx(ctx, async (tx, c) => {
      const versions = await this.versions(tx, c.organizationId, (await this.policy(tx, c.organizationId, id)).id);
      if (!versions.some((v) => v.fileIds.includes(fileId))) throw new NotFoundException('No such file.');
      return tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  // ------------------------------------------------------------------------------------------ the employee

  /** The signed-in person's employee record, or null (a login with no employee record sees no policies). */
  private me(tx: Tx, c: CompanyContext) {
    return c.userId ? tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: c.userId }, select: { id: true, givenName: true, familyName: true } }) : null;
  }

  /** One policy as this person sees it, or null when it is not for them (not published, or not in its audience). */
  private async mineOf(tx: Tx, c: CompanyContext, p: Policy, employeeId: string, today: string, dueDays: number) {
    const versions = await this.versions(tx, c.organizationId, p.id);
    const cur = this.current(versions);
    if (!cur) return null;
    const { rows } = await this.completion(tx, c.organizationId, p, versions, today, dueDays, employeeId);
    const row = rows[0];
    if (!row) return null;
    const numberOf = new Map(versions.map((v) => [v.id, v.number]));
    return { versions, cur, row, ackedVersion: row.last ? `v${numberOf.get(row.last.versionId)}` : null };
  }

  async myList(ctx: TenantContext) {
    return this.tx(ctx, async (tx, c) => {
      const me = await this.me(tx, c);
      if (!me) return { policies: [], typedName: false, managerAfterDays: null };
      const today = todayIst();
      const s = await this.settings(tx, c);
      const out = [];
      for (const p of await tx.policyDocument.findMany({ where: { organizationId: c.organizationId }, orderBy: { number: 'asc' } })) {
        const m = await this.mineOf(tx, c, p, me.id, today, s.dueDays);
        if (!m) continue;
        out.push({ id: p.id, code: policyCode(p.number), title: p.title, category: p.category, method: p.method, version: `v${m.cur.number}`, versionId: m.cur.id, effectiveOn: iso(m.cur.effectiveOn), changeSummary: m.cur.changeSummary, status: m.row.status, dueOn: m.row.done ? null : m.row.due, acknowledgedOn: m.row.last ? iso(m.row.last.acknowledgedAt) : null, acknowledgedVersion: m.ackedVersion });
      }
      return { policies: out, typedName: s.typedName, managerAfterDays: s.managerAfterDays };
    });
  }

  async myPolicy(ctx: TenantContext, id: string) {
    return this.tx(ctx, async (tx, c) => {
      const me = await this.me(tx, c);
      const p = await this.policy(tx, c.organizationId, id);
      const s = await this.settings(tx, c);
      const m = me ? await this.mineOf(tx, c, p, me.id, todayIst(), s.dueDays) : null;
      if (!me || !m) throw new NotFoundException('No such policy.');
      const owner = p.ownerUserId ? (await this.userNames(tx, c.organizationId, [p.ownerUserId])).get(p.ownerUserId) ?? null : null;
      const last = m.row.last;
      return {
        id: p.id,
        code: policyCode(p.number),
        title: p.title,
        category: p.category,
        method: p.method,
        owner,
        version: `v${m.cur.number}`,
        versionId: m.cur.id,
        effectiveOn: iso(m.cur.effectiveOn),
        changeSummary: m.cur.changeSummary,
        bodyHtml: m.cur.bodyHtml,
        files: await this.fileList(tx, c.organizationId, m.cur.fileIds),
        status: m.row.status,
        dueOn: m.row.done ? null : m.row.due,
        acknowledged: last ? { version: m.ackedVersion, at: last.acknowledgedAt.toISOString(), method: last.method, typedName: last.typedName } : null,
        typedName: s.typedName,
        myName: nameOf(me),
      };
    });
  }

  async myFile(ctx: TenantContext, id: string, fileId: string) {
    const row = await this.tx(ctx, async (tx, c) => {
      const me = await this.me(tx, c);
      const p = await this.policy(tx, c.organizationId, id);
      const m = me ? await this.mineOf(tx, c, p, me.id, todayIst(), 14) : null;
      if (!m || !m.cur.fileIds.includes(fileId)) throw new NotFoundException('No such file.');
      return tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: fileId } });
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  /** The checks every acknowledgement passes before any code is used: the person, the current version, not done yet. */
  private async ackable(tx: Tx, c: CompanyContext, id: string, versionId: string) {
    const me = await this.me(tx, c);
    const p = await this.policy(tx, c.organizationId, id);
    const s = await this.settings(tx, c);
    const m = me ? await this.mineOf(tx, c, p, me.id, todayIst(), s.dueDays) : null;
    if (!me || !m) throw new NotFoundException('No such policy.');
    if (!m.versions.some((v) => v.id === versionId && v.status === 'published')) throw new NotFoundException('No such version of this policy.');
    if (m.cur.id !== versionId) throw new ConflictException({ statusCode: 409, code: 'POLICY_NEWER_VERSION', message: `A newer version (v${m.cur.number}) was published. Read it, then acknowledge.` });
    if (await tx.policyAcknowledgement.findFirst({ where: { organizationId: c.organizationId, versionId, employeeId: me.id }, select: { id: true } })) throw new ConflictException('You have already acknowledged this version.');
    return { me, p, s, cur: m.cur };
  }

  /** Method "one-time code": 6 digits to the person's sign-in email, bound to this version and person. */
  async myCode(ctx: TenantContext, id: string, versionId: string, ip: string | null) {
    const { org, userId, email } = await this.tx(ctx, async (tx, c) => {
      const { p } = await this.ackable(tx, c, id, versionId);
      if (p.method !== 'otp') throw new BadRequestException('This policy is acknowledged with a confirmation, not a code.');
      const u = await tx.user.findFirstOrThrow({ where: { organizationId: c.organizationId, id: c.userId! }, select: { email: true } });
      return { org: c.organizationId, userId: c.userId!, email: u.email };
    });
    await this.otp.reserveSend(`policy-ack:${org}:${userId}`, ip);
    const code = await this.otp.issue(otpKey(org, versionId, userId), { versionId, userId });
    this.otp.deliver('email', email, code, 'mfa', org, { userId });
    await this.tx(ctx, (tx, c) => audit(tx, c, 'policy.ack_code_sent', 'policy_document', id, { versionId, channel: 'email' }));
    const [name, domain] = email.split('@');
    return { sent: true, to: `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`, minutes: OTP_TTL_SECONDS / 60 };
  }

  async acknowledge(ctx: TenantContext, id: string, dto: AcknowledgeDto, meta: Meta) {
    // Plain mistakes first, so they never use up a code.
    const pre = await this.tx(ctx, async (tx, c) => {
      const { me, p, s } = await this.ackable(tx, c, id, dto.versionId);
      if (s.typedName) {
        if (!dto.typedName) throw new BadRequestException({ statusCode: 400, code: 'POLICY_TYPED_NAME', message: `Type your name as on your record: ${nameOf(me)}.` });
        if (!sameName(dto.typedName, nameOf(me))) throw new BadRequestException({ statusCode: 400, code: 'POLICY_TYPED_NAME', message: `Type your name as on your record: ${nameOf(me)}.` });
      }
      if (p.method === 'otp' && !dto.code) throw new BadRequestException({ statusCode: 400, code: 'POLICY_CODE_MISSING', message: 'Enter the 6-digit code we sent to your email.' });
      return { org: c.organizationId, userId: c.userId!, method: p.method, typed: s.typedName };
    });
    if (pre.method === 'otp') {
      const ok = await this.otp.check(otpKey(pre.org, dto.versionId, pre.userId), dto.code!);
      if (!ok || ok.versionId !== dto.versionId || ok.userId !== pre.userId) throw new UnauthorizedException({ statusCode: 401, code: 'POLICY_CODE_WRONG', message: 'That code is not right or has expired. Ask for a new code.' });
    }
    return this.tx(ctx, async (tx, c) => {
      const { me, p, cur } = await this.ackable(tx, c, id, dto.versionId);
      const a = await tx.policyAcknowledgement.create({
        data: { organizationId: c.organizationId, policyId: p.id, versionId: cur.id, employeeId: me.id, userId: c.userId!, method: p.method, typedName: pre.typed ? dto.typedName!.trim().replace(/\s+/g, ' ') : null, bodySha256: cur.bodySha256!, ip: meta.ip, userAgent: meta.device },
      });
      await audit(tx, c, 'policy.acknowledged', 'policy_document', p.id, { versionId: cur.id, version: cur.number, method: p.method, typedName: Boolean(a.typedName) });
      return { acknowledgedAt: a.acknowledgedAt.toISOString(), version: `v${cur.number}`, method: p.method };
    });
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);


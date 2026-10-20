import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { isoDate } from '../org-structure/org-validation';
import { buildViewer, tenantWide, Viewer } from '../access/scope';
import { displayName, EmployeeHistoryService, RequestUser } from '../employee-history/employee-history.service';
import { payScope } from '../payroll/pay-access';
import { EXTRA_KEYS } from './records.service';

// PPL-37: two records of one person become one, field by field, and can be split again exactly. Merging moves every
// row that belongs to the second person (their roles, employee record, joiner, documents, letters, cases, consents,
// identity checks) to the kept one and records each moved row; the second person stays, marked merged. Unmerge moves
// those rows back and restores the fields the merge took. Nothing is deleted. Company-wide HR only (as linking people,
// SD-1.31), with an audit note, never about oneself. Service Desk rows follow merged persons already, so they stay.

export type Pick = 'a' | 'b';
export interface MergeInput {
  keepPersonId: string;
  mergePersonId: string;
  picks: { name: Pick; email: Pick; phone: Pick };
  note: string;
}
type PersonRow = Prisma.PersonGetPayload<object>;
const KEY = 'employee.change.manage';
const FIELDS = (p: PersonRow) => ({ givenName: p.givenName, familyName: p.familyName, preferredName: p.preferredName, primaryEmail: p.primaryEmail, primaryPhone: p.primaryPhone });
/** Tables keyed to a person that a merge never moves (the persons and their link logs themselves; desk rows follow merges). */
const SKIP = new Set(['persons', 'person_link_log', 'person_merges']);
const ROLE_TEXT: Record<string, string> = { employee: 'Employee', preboarder: 'Joiner (pre-boarding)', alumnus: 'Alumnus', candidate: 'Candidate', applicant: 'Applicant', login: 'Login', nominee: 'Nominee', consultant: 'Consultant' };

@Injectable()
export class MergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
  ) {}

  private async hr(user: RequestUser): Promise<Viewer> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, EXTRA_KEYS);
    if (v.actingForOther || !tenantWide(v, KEY)) throw new ForbiddenException('Merging records is for HR with company-wide access.');
    return v;
  }

  /** What one person record holds: its fields, roles and (from its employee record) the identifiers on file. */
  private async side(tx: Tx, c: CompanyContext, p: PersonRow) {
    const org = c.organizationId;
    const roles = await tx.personRole.findMany({ where: { organizationId: org, personId: p.id }, orderBy: { startOn: 'asc' } });
    const emp = await tx.employee.findFirst({ where: { organizationId: org, personId: p.id } });
    const employment = emp ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id }, orderBy: { joinedOn: 'desc' } }) : null;
    const ids = emp ? await tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId: emp.id }, select: { panLast4: true, uanLast4: true } }) : null;
    const personal = emp ? await tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: emp.id }, select: { dateOfBirth: true } }) : null;
    return {
      personId: p.id,
      name: displayName(p),
      email: p.primaryEmail,
      phone: p.primaryPhone,
      dob: personal?.dateOfBirth ? isoDate(personal.dateOfBirth) : null,
      pan: ids?.panLast4 ? `XXXXXX${ids.panLast4}` : null,
      uan: ids?.uanLast4 ? `XXXXXXXX${ids.uanLast4}` : null,
      employee: emp ? { id: emp.id, code: employment?.employeeCode ?? null, joined: employment ? isoDate(employment.joinedOn) : null, left: employment?.exitedOn ? isoDate(employment.exitedOn) : null } : null,
      roles: roles.map((r) => ({ id: r.id, type: r.roleType, label: ROLE_TEXT[r.roleType] ?? r.roleType, from: isoDate(r.startOn), to: r.endOn ? isoDate(r.endOn) : null })),
    };
  }

  private async person(tx: Tx, c: CompanyContext, id: string) {
    const p = await tx.person.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!p) throw new NotFoundException('No such person.');
    return p;
  }

  /** Search for the other record: active persons by name or email. */
  async search(ctx: TenantContext, user: RequestUser, q: string, not: string | null) {
    await this.hr(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.person.findMany({
        where: { organizationId: c.organizationId, status: 'active', ...(not ? { NOT: { id: not } } : {}), OR: [{ givenName: { contains: q.trim(), mode: 'insensitive' } }, { familyName: { contains: q.trim(), mode: 'insensitive' } }, { primaryEmail: { contains: q.trim(), mode: 'insensitive' } }] },
        orderBy: { givenName: 'asc' },
        take: 20,
      });
      const roles = await tx.personRole.findMany({ where: { organizationId: c.organizationId, personId: { in: rows.map((r) => r.id) } }, select: { personId: true, roleType: true } });
      return rows.map((p) => ({ personId: p.id, name: displayName(p), email: p.primaryEmail, roles: [...new Set(roles.filter((r) => r.personId === p.id).map((r) => ROLE_TEXT[r.roleType] ?? r.roleType))] }));
    });
  }

  async compare(ctx: TenantContext, user: RequestUser, keepId: string, mergeId: string) {
    await this.hr(user);
    if (keepId === mergeId) throw new BadRequestException('Choose two different records.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const [a, b] = [await this.person(tx, c, keepId), await this.person(tx, c, mergeId)];
      if (a.status !== 'active' || b.status !== 'active') throw new ConflictException('One of these records is merged already.');
      const [sa, sb] = [await this.side(tx, c, a), await this.side(tx, c, b)];
      return { a: sa, b: sb, blocked: sa.employee && sb.employee ? 'Both records have an employee record. Two employee records are two people, or one needs a correction first.' : null };
    });
  }

  /** The tables with a person_id column and an id that the app may update: the rows a merge moves (and an unmerge moves back). */
  private async tables(tx: Tx): Promise<string[]> {
    const rows = await tx.$queryRaw<{ table_name: string }[]>`
      SELECT cl.relname::text AS table_name FROM pg_class cl
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      WHERE cl.relkind IN ('r', 'p')
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = cl.oid AND a.attname = 'person_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = cl.oid AND a.attname = 'id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = cl.oid AND a.attname = 'organization_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
        -- Append-only ledgers (no UPDATE for the app) keep their rows on the merged record, linked by merged_into.
        AND has_table_privilege(cl.oid, 'UPDATE')
      ORDER BY 1`;
    return rows.map((r) => r.table_name).filter((t) => !SKIP.has(t) && !t.startsWith('sd_'));
  }

  async merge(ctx: TenantContext, user: RequestUser, dto: MergeInput) {
    const v = await this.hr(user);
    if (dto.keepPersonId === dto.mergePersonId) throw new BadRequestException('Choose two different records.');
    if (dto.note.trim().length < 5) throw new BadRequestException('Enter why you are merging. It goes to the link log.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const a = await this.person(tx, c, dto.keepPersonId);
      const b = await this.person(tx, c, dto.mergePersonId);
      if (a.status !== 'active' || b.status !== 'active') throw new ConflictException('One of these records is merged already.');
      const own = await this.history.ownEmployeeId(tx, c, v);
      const mine = own ? (await tx.employee.findFirst({ where: { id: own }, select: { personId: true } }))?.personId : null;
      if (mine && (mine === a.id || mine === b.id)) throw new ForbiddenException('Someone else merges your own record.');
      if ((await tx.employee.findFirst({ where: { organizationId: org, personId: a.id }, select: { id: true } })) && (await tx.employee.findFirst({ where: { organizationId: org, personId: b.id }, select: { id: true } }))) {
        throw new ConflictException('Both records have an employee record. Two employee records are two people, or one needs a correction first.');
      }
      // Pay-guarded rows move too: the merge sees every legal entity's rows.
      await payScope(tx, (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id));
      const before = { kept: FIELDS(a), merged: FIELDS(b) };
      const moved: Record<string, string[]> = {};
      const stays: string[] = [];
      for (const t of await this.tables(tx)) {
        await tx.$executeRaw`SAVEPOINT person_merge_table`;
        try {
          const ids = await tx.$queryRawUnsafe<{ id: string }[]>(`UPDATE "${t}" SET person_id = $1::uuid WHERE organization_id = $2::uuid AND person_id = $3::uuid RETURNING id::text`, a.id, org, b.id);
          await tx.$executeRaw`RELEASE SAVEPOINT person_merge_table`;
          if (ids.length) moved[t] = ids.map((x) => x.id);
        } catch (e) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT person_merge_table`;
          const code = e instanceof Prisma.PrismaClientKnownRequestError ? String((e.meta as { code?: string } | undefined)?.code ?? e.message) : String(e);
          if (/23505|unique|duplicate/i.test(code)) throw new ConflictException('Both records hold the same one-per-person item (for example two logins). Remove one first, then merge.');
          // Evidence the database keeps as written (a consent, a signed record): it stays on the merged record, which
          // points to the kept one (merged_into), so nothing is lost and nothing is rewritten.
          if (/23514|42501|kept as given|permission denied/i.test(code)) {
            stays.push(t);
            continue;
          }
          throw e;
        }
      }
      // The merged record leaves the active list first, so its email can move to the kept one.
      await tx.person.update({ where: { id: b.id }, data: { status: 'merged', mergedInto: a.id } });
      const from = (pick: Pick) => (pick === 'b' ? b : a);
      await tx.person.update({
        where: { id: a.id },
        data: {
          givenName: from(dto.picks.name).givenName,
          familyName: from(dto.picks.name).familyName,
          preferredName: from(dto.picks.name).preferredName,
          primaryEmail: from(dto.picks.email).primaryEmail ?? a.primaryEmail ?? b.primaryEmail,
          primaryPhone: from(dto.picks.phone).primaryPhone ?? a.primaryPhone ?? b.primaryPhone,
        },
      });
      const m = await tx.personMerge.create({ data: { organizationId: org, keptPersonId: a.id, mergedPersonId: b.id, choices: dto.picks, keptBefore: before as unknown as Prisma.InputJsonObject, moved: moved as unknown as Prisma.InputJsonObject, note: dto.note.trim(), mergedBy: c.userId! } });
      await tx.personLinkLog.create({ data: { organizationId: org, action: 'merge', personId: b.id, otherPersonId: a.id, basis: 'hr_confirmed', decidedBy: c.userId ?? null, reason: dto.note.trim(), before: before as unknown as Prisma.InputJsonObject } });
      await audit(tx, c, 'person.merged', 'person', a.id, { mergeId: m.id, merged: b.id, moved: Object.fromEntries(Object.entries(moved).map(([k, ids]) => [k, ids.length])), stays, picks: dto.picks });
      return { id: m.id };
    });
  }

  private async mergeView(tx: Tx, c: CompanyContext, m: Prisma.PersonMergeGetPayload<object>) {
    const [a, b] = [await this.person(tx, c, m.keptPersonId), await this.person(tx, c, m.mergedPersonId)];
    const moved = m.moved as Record<string, string[]>;
    const roles = moved.person_roles?.length ? await tx.personRole.findMany({ where: { organizationId: c.organizationId, id: { in: moved.person_roles } } }) : [];
    const by = await tx.user.findFirst({ where: { id: m.mergedBy }, select: { name: true, email: true } });
    return {
      id: m.id,
      kept: { personId: a.id, name: displayName(a) },
      merged: { personId: b.id, name: displayName((m.keptBefore as unknown as { merged: ReturnType<typeof FIELDS> }).merged) },
      mergedAt: m.mergedAt,
      mergedBy: by?.name ?? by?.email ?? null,
      note: m.note,
      unmergedAt: m.unmergedAt,
      unmergeNote: m.unmergeNote,
      // What unmerge returns: each role moved, and how many other rows.
      roles: roles.map((r) => ({ id: r.id, label: ROLE_TEXT[r.roleType] ?? r.roleType, from: isoDate(r.startOn), to: r.endOn ? isoDate(r.endOn) : null })),
      rows: Object.entries(moved).filter(([t]) => t !== 'person_roles').map(([t, ids]) => ({ what: t.replace(/_/g, ' '), count: ids.length })),
      picks: m.choices as MergeInput['picks'],
    };
  }

  list(ctx: TenantContext, user: RequestUser) {
    return this.hr(user).then(() =>
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const rows = await tx.personMerge.findMany({ where: { organizationId: c.organizationId }, orderBy: { mergedAt: 'desc' }, take: 100 });
        return Promise.all(rows.map((m) => this.mergeView(tx, c, m)));
      }),
    );
  }

  get(ctx: TenantContext, user: RequestUser, id: string) {
    return this.hr(user).then(() =>
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const m = await tx.personMerge.findFirst({ where: { organizationId: c.organizationId, id } });
        if (!m) throw new NotFoundException('No such merge.');
        return this.mergeView(tx, c, m);
      }),
    );
  }

  /** Every moved row goes back; the fields the merge took return unless someone changed them since. */
  async unmerge(ctx: TenantContext, user: RequestUser, id: string, note: string) {
    await this.hr(user);
    if (note.trim().length < 5) throw new BadRequestException('Enter a reason for the audit log.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`person-merge:${org}:${id}`}))`;
      const m = await tx.personMerge.findFirst({ where: { organizationId: org, id } });
      if (!m) throw new NotFoundException('No such merge.');
      if (m.unmergedAt) throw new ConflictException('This merge is undone already.');
      const a = await this.person(tx, c, m.keptPersonId);
      const b = await this.person(tx, c, m.mergedPersonId);
      if (a.status !== 'active' || b.status !== 'merged' || b.mergedInto !== a.id) throw new ConflictException('The kept record was merged again since. Undo that merge first.');
      await payScope(tx, (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id));
      const tables = new Set(await this.tables(tx));
      const back: Record<string, number> = {};
      for (const [t, ids] of Object.entries(m.moved as Record<string, string[]>)) {
        if (!tables.has(t)) continue;
        const n = await tx.$executeRawUnsafe(`UPDATE "${t}" SET person_id = $1::uuid WHERE organization_id = $2::uuid AND person_id = $3::uuid AND id = ANY($4::uuid[])`, b.id, org, a.id, ids);
        back[t] = n;
      }
      const before = m.keptBefore as { kept: ReturnType<typeof FIELDS>; merged: ReturnType<typeof FIELDS> };
      const now = FIELDS(a);
      const restore: Partial<ReturnType<typeof FIELDS>> = {};
      // A field the merge took from the other record goes back, unless someone has changed it since.
      for (const k of Object.keys(before.kept) as (keyof ReturnType<typeof FIELDS>)[]) if (now[k] === before.merged[k] && before.kept[k] !== now[k]) (restore as Record<string, unknown>)[k] = before.kept[k];
      if (Object.keys(restore).length) await tx.person.update({ where: { id: a.id }, data: restore });
      await tx.person.update({ where: { id: b.id }, data: { status: 'active', mergedInto: null } });
      const at = new Date();
      await tx.personMerge.update({ where: { id }, data: { unmergedAt: at, unmergedBy: c.userId ?? null, unmergeNote: note.trim() } });
      await tx.personLinkLog.create({ data: { organizationId: org, action: 'unmerge', personId: b.id, otherPersonId: a.id, basis: 'hr_confirmed', decidedBy: c.userId ?? null, reason: note.trim() } });
      await audit(tx, c, 'person.unmerged', 'person', a.id, { mergeId: id, restoredTo: b.id, moved: back });
      return { unmerged: true };
    });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { maskShaped, maskTail, TenantContext } from '@exam-platform/shared';
import { tenantWide } from '../access/scope';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { isoDate } from '../org-structure/org-validation';
import { EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { checkLoginLink } from './persons';
import type { MergeDto } from './person-panels.dto';

// PPL-36 Possible same person and PPL-37 Merge / unmerge (P01 §4.5a, YX-ORG-26/27). A person record that only has a
// login or a help desk contact (the Service Desk made it for a login with no person) may be the same human as another
// person whose email or work email is that login's email. HR (employee.change.manage for the whole company: a link can
// land on anyone) compares the evidence and decides: not the same person (logged, never proposed again), or merge,
// keeping per field the value they choose. A merge moves every role to the kept person and marks the other merged;
// nothing is deleted, and unmerge puts the roles and the field values back. Every decision is in person_link_log.

/** "Suresh Nair" and "Suresh K Nair": the same first given name and the same last word of the family name (SQL). */
const sameName = (p: string, m: string) => Prisma.sql`(lower(split_part(btrim(${Prisma.raw(`${p}.given_name`)}), ' ', 1)) = lower(split_part(btrim(${Prisma.raw(`${m}.given_name`)}), ' ', 1))
    AND lower(regexp_replace(btrim(coalesce(${Prisma.raw(`${p}.family_name`)}, '')), '^.*[[:space:]]', '')) = lower(regexp_replace(btrim(coalesce(${Prisma.raw(`${m}.family_name`)}, '')), '^.*[[:space:]]', '')))`;

/**
 * Pairs (A, B) with the evidence; one SQL for the list, its count and the merge check. A is a loose record (a login or a
 * help desk contact) sharing B's email, or (PPL-36) a new joiner whose own answers share B's PAN or UAN, or B's name
 * and date of birth, where B has an employee record. Never on the name alone.
 */
export const samePersonPairs = (org: string, only?: { personId: string; intoPersonId: string }) => Prisma.sql`
  SELECT * FROM (
  SELECT p.id::text AS a, m.id::text AS b, p.created_at AS at,
         (u.email IS NOT NULL AND (lower(m.primary_email::text) = lower(u.email::text) OR lower(e.work_email::text) = lower(u.email::text))) AS login_email,
         (p.primary_email IS NOT NULL AND lower(e.work_email::text) = lower(p.primary_email::text)) AS work_email,
         false AS pan, false AS uan, false AS name_dob
  FROM persons p
  LEFT JOIN person_roles r ON r.organization_id = p.organization_id AND r.person_id = p.id AND r.role_type = 'login' AND r.source_table = 'users' AND r.end_on IS NULL
  LEFT JOIN users u ON u.organization_id = r.organization_id AND u.id = r.source_id
  JOIN persons m ON m.organization_id = p.organization_id AND m.status = 'active' AND m.id <> p.id
  LEFT JOIN employees e ON e.organization_id = m.organization_id AND e.person_id = m.id
  WHERE p.organization_id = ${org}::uuid AND p.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM employees x WHERE x.organization_id = p.organization_id AND x.person_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM preboardings x WHERE x.organization_id = p.organization_id AND x.person_id = p.id)
    AND ((u.email IS NOT NULL AND (lower(m.primary_email::text) = lower(u.email::text) OR lower(e.work_email::text) = lower(u.email::text)))
         OR (p.primary_email IS NOT NULL AND lower(e.work_email::text) = lower(p.primary_email::text)))
    AND NOT EXISTS (SELECT 1 FROM person_link_log l WHERE l.organization_id = p.organization_id AND l.action = 'rejected'
                    AND ((l.person_id = p.id AND l.other_person_id = m.id) OR (l.person_id = m.id AND l.other_person_id = p.id)))
  UNION ALL
  SELECT p.id::text, m.id::text, pb.created_at, false, false,
         (pb.pan_hash IS NOT NULL AND i.pan_hash = pb.pan_hash),
         (pb.uan_hash IS NOT NULL AND i.uan_hash = pb.uan_hash),
         (pb.date_of_birth IS NOT NULL AND d.date_of_birth = pb.date_of_birth AND ${sameName('p', 'm')})
  FROM preboardings pb
  JOIN persons p ON p.organization_id = pb.organization_id AND p.id = pb.person_id AND p.status = 'active'
  JOIN employees e ON e.organization_id = pb.organization_id AND e.person_id <> pb.person_id
  JOIN persons m ON m.organization_id = e.organization_id AND m.id = e.person_id AND m.status = 'active'
  LEFT JOIN employee_identifiers i ON i.organization_id = e.organization_id AND i.employee_id = e.id
  LEFT JOIN employee_personal_details d ON d.organization_id = e.organization_id AND d.employee_id = e.id
  WHERE pb.organization_id = ${org}::uuid AND pb.status = 'invited' AND pb.person_type = 'new'
    AND NOT EXISTS (SELECT 1 FROM employees x WHERE x.organization_id = p.organization_id AND x.person_id = p.id)
    AND ((pb.pan_hash IS NOT NULL AND i.pan_hash = pb.pan_hash) OR (pb.uan_hash IS NOT NULL AND i.uan_hash = pb.uan_hash)
         OR (pb.date_of_birth IS NOT NULL AND d.date_of_birth = pb.date_of_birth AND ${sameName('p', 'm')}))
    AND NOT EXISTS (SELECT 1 FROM person_link_log l WHERE l.organization_id = p.organization_id AND l.action = 'rejected'
                    AND ((l.person_id = p.id AND l.other_person_id = m.id) OR (l.person_id = m.id AND l.other_person_id = p.id)))
  ) pairs
  ${only ? Prisma.sql`WHERE pairs.a = ${only.personId} AND pairs.b = ${only.intoPersonId}` : Prisma.empty}`;

const ROLE: Record<string, string> = { employee: 'Employee', login: 'Login', preboarder: 'Joiner', external_login: 'Help desk contact' };
/** PPL-36: a joiner merged into an employee record: every row of theirs moves with them (and back on unmerge). */
// Consent records and identity checks are evidence and stay with the record they were given on (append-only).
const JOINER_TABLES = ['preboardings', 'journeys', 'documents', 'document_shares', 'letter_issues', 'signature_requests', 'asset_assignments'] as const;
const name = (p: { givenName: string; familyName: string | null }) => [p.givenName, p.familyName].filter(Boolean).join(' ');
type Before = { givenName: string; familyName: string | null; primaryEmail: string | null; primaryPhone: string | null; roleIds: string[]; employeeLinked: string | null; joiner?: { preboardingId: string; moved: Record<string, string[]> } };

@Injectable()
export class SamePersonService {
  constructor(private readonly history: EmployeeHistoryService) {}

  private hr(v: Viewer) {
    if (v.actingForOther || !tenantWide(v, 'employee.change.manage')) throw new ForbiddenException('Linking people needs employee.change.manage for the whole company.');
  }

  /** One side of the evidence: the person's own fields, and the employee's where the viewer's class keys allow. */
  private async side(tx: Tx, c: CompanyContext, v: Viewer, personId: string) {
    const org = c.organizationId;
    const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: personId } });
    const e = await tx.employee.findFirst({ where: { organizationId: org, personId } });
    const roles = await tx.personRole.findMany({ where: { organizationId: org, personId, endOn: null }, orderBy: { startOn: 'asc' } });
    const login = roles.find((r) => r.roleType === 'login' && r.sourceTable === 'users');
    const user = login ? await tx.user.findFirst({ where: { organizationId: org, id: login.sourceId }, select: { email: true } }) : null;
    const job = e ? await tx.employment.findFirst({ where: { organizationId: org, employeeId: e.id }, orderBy: { joinedOn: 'desc' }, select: { employeeCode: true, exitedOn: true } }) : null;
    const personal = e && tenantWide(v, 'employee.personal.view') ? await tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId: e.id }, select: { dateOfBirth: true } }) : null;
    const ids = e && tenantWide(v, 'employee.identity.view') ? await tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId: e.id }, select: { panLast4: true, uanLast4: true } }) : null;
    // PPL-36: a joiner shows their own date of birth (PAN and UAN are kept only as hashes before day one: "on file").
    const pb = e ? null : await tx.preboarding.findFirst({ where: { organizationId: org, personId, status: 'invited' }, select: { dateOfBirth: true, panHash: true, uanHash: true } });
    return {
      personId,
      name: name(p),
      email: p.primaryEmail ?? e?.workEmail ?? user?.email ?? null,
      phone: maskTail(p.primaryPhone?.slice(-4)),
      dob: personal?.dateOfBirth ? isoDate(personal.dateOfBirth) : pb?.dateOfBirth && tenantWide(v, 'employee.personal.view') ? isoDate(pb.dateOfBirth) : null,
      pan: ids?.panLast4 ? maskShaped('pan', ids.panLast4) : pb?.panHash && tenantWide(v, 'employee.identity.view') ? 'Given by the joiner' : maskShaped('pan', null),
      uan: ids?.uanLast4 ? maskShaped('uan', ids.uanLast4) : pb?.uanHash && tenantWide(v, 'employee.identity.view') ? 'Given by the joiner' : maskShaped('uan', null),
      role: job ? `${job.exitedOn ? 'Former employee' : 'Employee'} · ${job.employeeCode}` : [...new Set(roles.map((r) => ROLE[r.roleType] ?? r.roleType))].join(', ') || 'No role',
      roles: roles.map((r) => ({ id: r.id, role: ROLE[r.roleType] ?? r.roleType, from: isoDate(r.startOn) })),
      _person: p,
      _loginEmail: user?.email ?? null,
    };
  }

  private view(s: Awaited<ReturnType<SamePersonService['side']>>) {
    const { _person, _loginEmail, ...rest } = s;
    return rest;
  }

  list(ctx: TenantContext, v: Viewer) {
    this.hr(v);
    return this.history.run(ctx, async (tx, c) => {
      const pairs = await tx.$queryRaw<{ a: string; b: string; login_email: boolean; work_email: boolean; pan: boolean; uan: boolean; name_dob: boolean }[]>(Prisma.sql`${samePersonPairs(c.organizationId)} ORDER BY at DESC LIMIT 200`);
      const rows = [];
      for (const r of pairs) {
        const basis = [...(r.login_email ? ['login email'] : []), ...(r.work_email ? ['work email'] : []), ...(r.pan ? ['PAN'] : []), ...(r.uan ? ['UAN'] : []), ...(r.name_dob ? ['name and date of birth'] : [])];
        rows.push({ id: `${r.a}:${r.b}`, a: this.view(await this.side(tx, c, v, r.a)), b: this.view(await this.side(tx, c, v, r.b)), basis });
      }
      return { rows };
    });
  }

  private async pair(tx: Tx, c: CompanyContext, personId: string, intoPersonId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`person-merge:${c.organizationId}`}))`;
    const [row] = await tx.$queryRaw<{ a: string }[]>(samePersonPairs(c.organizationId, { personId, intoPersonId }));
    if (!row) throw new NotFoundException('These records are not a proposed match any more.');
  }

  /** Not the same person: logged with its note, never proposed again. */
  notSame(ctx: TenantContext, v: Viewer, personId: string, intoPersonId: string, note: string | undefined) {
    this.hr(v);
    return this.history.run(ctx, async (tx, c) => {
      await this.pair(tx, c, personId, intoPersonId);
      await tx.personLinkLog.create({ data: { organizationId: c.organizationId, action: 'rejected', personId, otherPersonId: intoPersonId, basis: 'hr_checked', decidedBy: v.userId, reason: note?.trim() || null } });
      await audit(tx, c, 'person.not_same', 'person', personId, { other: intoPersonId });
      return { done: true };
    });
  }

  /** The loose record (A) merges into B, keeping per field the value HR chose; A's roles move to B. */
  merge(ctx: TenantContext, v: Viewer, dto: MergeDto) {
    this.hr(v);
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.pair(tx, c, dto.personId, dto.intoPersonId);
      const a = await this.side(tx, c, v, dto.personId);
      const b = await this.side(tx, c, v, dto.intoPersonId);
      if (a._loginEmail && (await tx.user.findFirst({ where: { organizationId: org, id: v.userId!, email: a._loginEmail } }))) throw new ForbiddenException('Someone else merges your own record.');
      const pick = <T>(k: 'name' | 'email' | 'phone', x: T, y: T) => (dto.keep[k] === 'a' ? x : y);
      const before: Before = { givenName: b._person.givenName, familyName: b._person.familyName, primaryEmail: b._person.primaryEmail, primaryPhone: b._person.primaryPhone, roleIds: a.roles.map((r) => r.id), employeeLinked: null };
      // The login reaches the employee record when it has none and its email is the work email (as the desk link does).
      const emp = await tx.employee.findFirst({ where: { organizationId: org, personId: b.personId } });
      const login = await tx.personRole.findFirst({ where: { organizationId: org, personId: a.personId, roleType: 'login', sourceTable: 'users', endOn: null } });
      if (emp && !emp.userId && login && a._loginEmail && emp.workEmail?.toLowerCase() === a._loginEmail.toLowerCase()) {
        await checkLoginLink(tx, c, login.sourceId, emp.workEmail);
        await tx.employee.update({ where: { id: emp.id }, data: { userId: login.sourceId } });
        before.employeeLinked = emp.id;
      }
      // PPL-36: a joiner who already has an employee record joins as a rehire of it, everything of theirs moving along.
      const joining = await tx.preboarding.findFirst({ where: { organizationId: org, personId: a.personId, status: 'invited' } });
      if (joining) before.joiner = await this.moveJoiner(tx, org, joining, a.personId, b.personId);
      await tx.person.update({ where: { id: a.personId }, data: { status: 'merged', mergedInto: b.personId } });
      await tx.person.update({
        where: { id: b.personId },
        data: {
          givenName: pick('name', a._person.givenName, b._person.givenName),
          familyName: pick('name', a._person.familyName, b._person.familyName),
          primaryEmail: pick('email', a._person.primaryEmail ?? a._loginEmail, b._person.primaryEmail),
          primaryPhone: pick('phone', a._person.primaryPhone, b._person.primaryPhone),
        },
      });
      await tx.personRole.updateMany({ where: { organizationId: org, id: { in: before.roleIds } }, data: { personId: b.personId } });
      await tx.personLinkLog.create({ data: { organizationId: org, action: 'merge', personId: a.personId, otherPersonId: b.personId, basis: 'hr_confirmed', decidedBy: v.userId, reason: dto.note.trim(), before: before as unknown as Prisma.InputJsonValue } });
      await audit(tx, c, 'person.merged', 'person', a.personId, { into: b.personId, keep: dto.keep, roles: before.roleIds.length, employeeLinked: Boolean(before.employeeLinked), joinerAsRehire: Boolean(before.joiner) });
      return { mergedInto: b.personId };
    });
  }

  /**
   * A joiner (A) is the same person as an employee record (B): B must not work here now (a move is a job change); the
   * joining becomes B's rehire (the joining day after their last day), and A's rows move to B. Returns what moved.
   */
  private async moveJoiner(tx: Tx, org: string, pb: { id: string; joiningOn: Date }, from: string, to: string) {
    const emp = await tx.employee.findFirstOrThrow({ where: { organizationId: org, personId: to } });
    if (await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, exitedOn: null }, select: { id: true } })) throw new ConflictException('This person works here now. Their move is a job change: cancel the joiner and change their job instead.');
    const last = await tx.employment.findFirstOrThrow({ where: { organizationId: org, employeeId: emp.id }, orderBy: { exitedOn: 'desc' } });
    if (isoDate(pb.joiningOn) <= isoDate(last.exitedOn!)) throw new BadRequestException('A rehire joins after the day they left. Change the joining day first.');
    const moved: Record<string, string[]> = {};
    for (const t of JOINER_TABLES) {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`UPDATE ${Prisma.raw(`"${t}"`)} SET person_id = ${to}::uuid WHERE organization_id = ${org}::uuid AND person_id = ${from}::uuid RETURNING id::text`);
      if (rows.length) moved[t] = rows.map((r) => r.id);
    }
    await tx.preboarding.update({ where: { id: pb.id }, data: { personType: 'rehire', rehireOf: last.id, version: { increment: 1 } } });
    return { preboardingId: pb.id, moved };
  }

  /** The merge of a person (for the unmerge page): when, by whom, why, and what goes back. */
  merged(ctx: TenantContext, v: Viewer, personId: string) {
    this.hr(v);
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.person.findFirst({ where: { organizationId: org, id: personId, status: 'merged' } });
      const log = p ? await tx.personLinkLog.findFirst({ where: { organizationId: org, action: 'merge', personId }, orderBy: { createdAt: 'desc' } }) : null;
      if (!p || !log) throw new NotFoundException('That record is not merged.');
      const into = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: p.mergedInto! } });
      const by = log.decidedBy ? await tx.user.findFirst({ where: { organizationId: org, id: log.decidedBy }, select: { name: true, email: true } }) : null;
      const before = log.before as unknown as Before;
      const roles = await tx.personRole.findMany({ where: { organizationId: org, id: { in: before.roleIds } } });
      return {
        personId,
        name: name(p),
        intoName: name(into),
        mergedAt: log.createdAt.toISOString(),
        mergedBy: by ? by.name || by.email : null,
        note: log.reason,
        moved: roles.map((r) => ROLE[r.roleType] ?? r.roleType),
        employeeLinked: Boolean(before.employeeLinked),
      };
    });
  }

  /** Merged records still merged (an unmerged one leaves the list), newest merge first; the last 200. */
  mergedList(ctx: TenantContext, v: Viewer) {
    this.hr(v);
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const people = await tx.person.findMany({ where: { organizationId: org, status: 'merged', mergedInto: { not: null } }, select: { id: true, givenName: true, familyName: true, mergedInto: true } });
      const logs = await tx.personLinkLog.findMany({ where: { organizationId: org, action: 'merge', personId: { in: people.map((p) => p.id) } }, orderBy: { createdAt: 'desc' } });
      const into = await tx.person.findMany({ where: { organizationId: org, id: { in: people.map((p) => p.mergedInto!) } }, select: { id: true, givenName: true, familyName: true } });
      const by = await tx.user.findMany({ where: { organizationId: org, id: { in: logs.map((l) => l.decidedBy).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      const rows = [];
      for (const p of people) {
        const log = logs.find((l) => l.personId === p.id);
        if (!log) continue;
        const u = by.find((x) => x.id === log.decidedBy);
        const i = into.find((x) => x.id === p.mergedInto);
        // A Service Desk link made before merges could be undone has no saved "before": it cannot be unmerged here.
        rows.push({ personId: p.id, name: name(p), intoName: i ? name(i) : '', mergedAt: log.createdAt.toISOString(), mergedBy: u ? u.name || u.email : null, note: log.reason, canUnmerge: Boolean((log.before as unknown as Before | null)?.roleIds) });
      }
      return { rows: rows.sort((x, y) => y.mergedAt.localeCompare(x.mergedAt)).slice(0, 200) };
    });
  }

  /** Unmerge: the roles and the field values return, the login leaves the employee record again; both actions stay logged. */
  unmerge(ctx: TenantContext, v: Viewer, personId: string, note: string) {
    this.hr(v);
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`person-merge:${org}`}))`;
      const p = await tx.person.findFirst({ where: { organizationId: org, id: personId, status: 'merged' } });
      const log = p ? await tx.personLinkLog.findFirst({ where: { organizationId: org, action: 'merge', personId }, orderBy: { createdAt: 'desc' } }) : null;
      if (!p || !log) throw new NotFoundException('That record is not merged.');
      const before = log.before as unknown as Before;
      if (!before?.roleIds) throw new ConflictException('This record was linked from the Service Desk, before merges could be undone, so it cannot be unmerged here.');
      const into = p.mergedInto!;
      if (before.joiner) {
        const pb = await tx.preboarding.findFirst({ where: { organizationId: org, id: before.joiner.preboardingId } });
        if (pb && pb.status !== 'invited') throw new ConflictException('They have joined since, so this merge cannot be undone. Their record is one employee record now.');
        for (const t of JOINER_TABLES) {
          const ids = before.joiner.moved[t];
          if (ids?.length) await tx.$executeRaw(Prisma.sql`UPDATE ${Prisma.raw(`"${t}"`)} SET person_id = ${personId}::uuid WHERE organization_id = ${org}::uuid AND id = ANY(${ids}::uuid[])`);
        }
        await tx.preboarding.update({ where: { id: before.joiner.preboardingId }, data: { personType: 'new', rehireOf: null, version: { increment: 1 } } });
      }
      await tx.person.update({ where: { id: into }, data: { givenName: before.givenName, familyName: before.familyName, primaryEmail: before.primaryEmail, primaryPhone: before.primaryPhone } });
      await tx.person.update({ where: { id: personId }, data: { status: 'active', mergedInto: null } });
      await tx.personRole.updateMany({ where: { organizationId: org, id: { in: before.roleIds }, personId: into }, data: { personId } });
      if (before.employeeLinked) await tx.employee.update({ where: { id: before.employeeLinked }, data: { userId: null } });
      await tx.personLinkLog.create({ data: { organizationId: org, action: 'unmerge', personId, otherPersonId: into, basis: 'hr_confirmed', decidedBy: v.userId, reason: note.trim() } });
      await audit(tx, c, 'person.unmerged', 'person', personId, { from: into });
      return { unmerged: true };
    });
  }
}

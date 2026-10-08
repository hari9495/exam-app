import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { parse } from 'csv-parse/sync';
import { lookup } from 'dns/promises';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { assertHuman } from '../auth/bot-challenge';
import { isPublicAddress } from '../common/ssrf';
import { OrganizationsService } from '../organizations/organizations.service';
import { Tx } from '../org-structure/org-structure.service';
import { addDays, todayIst } from '../org-structure/org-validation';
import { DeskActor, activeOn, audit, deskSystem, emit, has } from './desk-access';
import { DirectorySourceDto, PersonDto, PeopleImportDto, SignUpDto } from './dto-ops';
import { endSeatIn } from './desks.service';

// SD-1.29 the standalone Service Desk (US-B-114, US-B-121, US-G-032, US-G-034): sign-up for a company that uses only the
// Service Desk (30-day trial, no card, YX-TEN-08), its light people list (P01 persons with a team and a location; CSV
// import), and directory sync: LDAP / Active Directory over TLS with the company's own read-only bind account (its
// password encrypted with the org-secrets key, the host must resolve to a public address and the connection is pinned to
// the checked address) and SCIM 2.0 pushed by the company's identity provider (a bearer token shown once, kept as sha256,
// good only for this source's /scim routes). Directory groups map to desk seats; a disabled user's desk seats end.

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const SCIM_USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCIM_GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const SCIM_ENTERPRISE = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
const SCIM_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const SCIM_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';
const RESERVED_SLUGS = new Set(['yukthix', 'admin', 'api', 'www', 'staff', 'help', 'support', 'status', 'mail', 'app']);
const TRIAL_DAYS = 30;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface LdapConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  filter?: string;
}
export interface DirectoryUser {
  externalId: string;
  email: string;
  givenName: string;
  familyName: string | null;
  department: string | null;
  managerExternalId: string | null;
  groups: string[];
  active: boolean;
}
type GroupMap = { group: string; deskId: string; role: 'agent' | 'lead' | 'collaborator' }[];

/** An LDAP / AD entry as a directory user. AD's userAccountControl bit 2 means "disabled". Groups are their CNs. */
export function ldapUser(e: Record<string, unknown>): DirectoryUser | null {
  const one = (k: string) => {
    const v = e[k];
    const x = Array.isArray(v) ? v[0] : v;
    return x === undefined || x === null ? null : Buffer.isBuffer(x) ? x.toString('hex') : String(x);
  };
  const email = (one('mail') ?? one('userPrincipalName') ?? '').toLowerCase();
  if (!EMAIL.test(email)) return null;
  const memberOf = ([] as unknown[]).concat(e.memberOf ?? []).map(String);
  const uac = Number(one('userAccountControl') ?? 0);
  return {
    externalId: one('objectGUID') ?? one('entryUUID') ?? String(e.dn),
    email,
    givenName: (one('givenName') ?? one('displayName') ?? one('cn') ?? email.split('@')[0]).slice(0, 100),
    familyName: one('sn')?.slice(0, 100) ?? null,
    department: one('department')?.slice(0, 100) ?? null,
    managerExternalId: one('manager'),
    groups: memberOf.map((dn) => /^cn=([^,]+)/i.exec(dn)?.[1] ?? dn).slice(0, 200),
    active: !(uac & 2),
  };
}

/** A SCIM 2.0 User body as a directory user. */
export function scimUser(body: Record<string, unknown>, externalFallback: string): DirectoryUser {
  const name = (body.name ?? {}) as { givenName?: string; familyName?: string };
  const emails = (Array.isArray(body.emails) ? body.emails : []) as { value?: string; primary?: boolean }[];
  const email = String(body.userName ?? emails.find((m) => m.primary)?.value ?? emails[0]?.value ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw new BadRequestException(scimError(400, 'userName must be an email address', 'invalidValue'));
  const ent = (body[SCIM_ENTERPRISE] ?? {}) as { department?: string; manager?: { value?: string } };
  return {
    externalId: String(body.externalId ?? externalFallback).slice(0, 200),
    email,
    givenName: String(name.givenName ?? body.displayName ?? email.split('@')[0]).slice(0, 100),
    familyName: name.familyName ? String(name.familyName).slice(0, 100) : null,
    department: ent.department ? String(ent.department).slice(0, 100) : null,
    managerExternalId: ent.manager?.value ? String(ent.manager.value).slice(0, 200) : null,
    groups: [],
    active: body.active === undefined ? true : body.active === true || body.active === 'true',
  };
}

export const scimError = (status: number, detail: string, scimType?: string) => ({ schemas: [SCIM_ERROR], status: String(status), detail, ...(scimType ? { scimType } : {}) });

@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly organizations: OrganizationsService,
  ) {}

  private requireDirectory(a: DeskActor) {
    if (!has(a, 'desk.directory.manage')) throw new ForbiddenException('You cannot manage the people list and directory sync (desk.directory.manage).');
  }

  // ------------------------------------------------------------------------------------------ sign-up (US-B-121)

  /** A company that uses only the Service Desk starts a 30-day trial; its first admin sets a password from the email. */
  async signUp(dto: SignUpDto, ip: string | null) {
    await assertHuman(dto.challengeToken, ip);
    if (RESERVED_SLUGS.has(dto.slug)) throw new ConflictException(`The company code "${dto.slug}" is taken. Choose another.`);
    const ctx: TenantContext = { organizationId: null, isSuperAdmin: true };
    const org = await this.organizations.create(ctx, null as unknown as string, { name: dto.company, slug: dto.slug, adminEmail: dto.email, adminName: dto.name });
    const trialEndsAt = new Date(`${addDays(todayIst(), TRIAL_DAYS)}T00:00:00Z`);
    await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, async (tx) => {
      await tx.organization.update({ where: { id: org.id }, data: { lifecycle: 'trial', trialEndsAt } });
      await tx.organizationProduct.create({ data: { organizationId: org.id, productCode: 'service_desk' } });
      await audit(tx, { ctx: { organizationId: org.id, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.company.signed_up', 'organization', org.id, { products: ['service_desk'], trialEndsAt, ip });
    });
    // The same answer whatever the email: the welcome link goes to the address given (that proves it).
    return { created: true, trialEndsAt };
  }

  // ------------------------------------------------------------------------------------------ the light people list

  async people(a: DeskActor, search?: string) {
    this.requireDirectory(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const like = search?.trim() ? `%${search.trim().replace(/[%_\\]/g, '\\$&')}%` : null;
      const rows = await tx.$queryRaw<{ id: string; given_name: string; family_name: string | null; email: string | null; team: string | null; location: string | null; location_id: string | null; source: string | null; login: boolean; active_dir: boolean | null }[]>`
        SELECT p.id, p.given_name, p.family_name, p.primary_email AS email, x.team, l.name AS location, x.location_id, x.source,
          EXISTS (SELECT 1 FROM person_roles r WHERE r.organization_id = p.organization_id AND r.person_id = p.id AND r.role_type = 'login' AND r.end_on IS NULL) AS login,
          (SELECT bool_and(d.active) FROM sd_directory_people d WHERE d.organization_id = p.organization_id AND d.person_id = p.id) AS active_dir
        FROM persons p
        LEFT JOIN sd_people x ON x.organization_id = p.organization_id AND x.person_id = p.id
        LEFT JOIN locations l ON l.organization_id = p.organization_id AND l.id = x.location_id
        WHERE p.organization_id = ${org}::uuid AND p.status = 'active' AND p.merged_into IS NULL
          AND NOT EXISTS (SELECT 1 FROM sd_customer_contacts c WHERE c.organization_id = p.organization_id AND c.person_id = p.id)
          AND (${like}::text IS NULL OR p.given_name ILIKE ${like} OR p.family_name ILIKE ${like} OR p.primary_email ILIKE ${like} OR x.team ILIKE ${like})
        ORDER BY p.given_name, p.family_name LIMIT 500`;
      return rows.map((r) => ({ id: r.id, name: [r.given_name, r.family_name].filter(Boolean).join(' '), email: r.email, team: r.team, location: r.location, locationId: r.location_id, source: r.source ?? 'manual', hasLogin: r.login, directoryActive: r.active_dir }));
    });
  }

  private async locationId(tx: Tx, org: string, name: string | undefined | null): Promise<string | null | undefined> {
    if (!name?.trim()) return null;
    const l = await tx.location.findFirst({ where: { organizationId: org, name: { equals: name.trim(), mode: 'insensitive' } }, select: { id: true } });
    return l?.id;
  }

  /** One person in the people list: found by email (the same person is never made twice) or made. */
  private async upsertPerson(tx: Tx, org: string, by: string | null, p: { email: string; givenName: string; familyName: string | null; team: string | null; locationId: string | null | undefined; source: string }) {
    let person = await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: p.email }, select: { id: true } });
    const created = !person;
    if (!person) person = await tx.person.create({ data: { organizationId: org, givenName: p.givenName, familyName: p.familyName, primaryEmail: p.email, createdBy: by } });
    else await tx.person.update({ where: { id: person.id }, data: { givenName: p.givenName, familyName: p.familyName } });
    await tx.sdPeople.upsert({
      where: { organizationId_personId: { organizationId: org, personId: person.id } },
      update: { team: p.team, ...(p.locationId !== undefined ? { locationId: p.locationId } : {}), source: p.source },
      create: { organizationId: org, personId: person.id, team: p.team, locationId: p.locationId ?? null, source: p.source },
    });
    return { personId: person.id, created };
  }

  async savePerson(a: DeskActor, id: string | null, dto: PersonDto) {
    this.requireDirectory(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const locationId = await this.locationId(tx, org, dto.location);
      if (locationId === undefined) throw new BadRequestException('No such location. Add it under Settings › Locations first.');
      if (id) {
        const p = await tx.person.findFirst({ where: { organizationId: org, id, status: 'active' } });
        if (!p) throw new NotFoundException('No such person.');
        await tx.person.update({ where: { id }, data: { givenName: dto.givenName, familyName: dto.familyName ?? null } });
        await tx.sdPeople.upsert({ where: { organizationId_personId: { organizationId: org, personId: id } }, update: { team: dto.team ?? null, locationId }, create: { organizationId: org, personId: id, team: dto.team ?? null, locationId, source: 'manual' } });
        await audit(tx, a, 'desk.people.updated', 'person', id, { team: dto.team, locationId });
        return { id };
      }
      const r = await this.upsertPerson(tx, org, a.userId, { email: dto.email!, givenName: dto.givenName, familyName: dto.familyName ?? null, team: dto.team ?? null, locationId, source: 'manual' });
      await audit(tx, a, 'desk.people.added', 'person', r.personId, { created: r.created });
      return { id: r.personId, created: r.created };
    });
  }

  /** CSV with columns name (or first name / last name), email, team, location. Every row is checked; nothing half done. */
  async importPeople(a: DeskActor, dto: PeopleImportDto) {
    this.requireDirectory(a);
    let rows: Record<string, string>[];
    try {
      rows = parse(dto.csv, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase().replace(/\s+/g, '_')), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true, to: 5001 });
    } catch {
      throw new BadRequestException('That file is not a CSV we can read.');
    }
    if (rows.length > 5000) throw new BadRequestException('Import up to 5,000 people at a time.');
    const problems: { row: number; problem: string }[] = [];
    const clean = rows.map((r, i) => {
      const email = (r.email ?? '').toLowerCase();
      const name = (r.name ?? [r.first_name, r.last_name].filter(Boolean).join(' ')).trim();
      if (!EMAIL.test(email)) problems.push({ row: i + 2, problem: 'The email is missing or not valid.' });
      if (!name) problems.push({ row: i + 2, problem: 'The name is missing.' });
      const [given, ...rest] = name.split(/\s+/);
      return { email, givenName: (r.first_name || given || '').slice(0, 100), familyName: (r.last_name || rest.join(' ') || null)?.slice(0, 100) ?? null, team: r.team?.slice(0, 100) || null, location: r.location || null };
    });
    return this.tenantPrisma.forTenant(
      a.ctx,
      async (tx) => {
        const org = a.ctx.organizationId;
        const locs = new Map((await tx.location.findMany({ where: { organizationId: org }, select: { id: true, name: true } })).map((l) => [l.name.toLowerCase(), l.id]));
        clean.forEach((r, i) => {
          if (r.location && !locs.has(r.location.toLowerCase())) problems.push({ row: i + 2, problem: `No location called "${r.location}".` });
        });
        const dup = clean.findIndex((r, i) => clean.findIndex((x) => x.email === r.email) !== i);
        if (dup >= 0) problems.push({ row: dup + 2, problem: 'This email appears twice in the file.' });
        if (problems.length || dto.dryRun) return { imported: 0, created: 0, problems: problems.slice(0, 100), rows: clean.length };
        let created = 0;
        for (const r of clean) {
          const res = await this.upsertPerson(tx, org, a.userId, { ...r, locationId: r.location ? locs.get(r.location.toLowerCase())! : null, source: 'csv' });
          if (res.created) created++;
        }
        await audit(tx, a, 'desk.people.imported', 'organization', org, { rows: clean.length, created });
        return { imported: clean.length, created, problems: [], rows: clean.length };
      },
      { timeout: 120_000 },
    );
  }

  /** US-G-032: directory groups a person is in (read only, for rules and approvals). */
  async groupsOf(a: DeskActor, personId: string) {
    if (!has(a, 'desk.directory.manage') && !has(a, 'desk.ticket.work')) throw new ForbiddenException('You cannot see directory groups.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdDirectoryPerson.findMany({ where: { organizationId: a.ctx.organizationId, personId }, select: { groups: true, active: true } });
      return { groups: [...new Set(rows.flatMap((r) => r.groups))].sort(), active: rows.every((r) => r.active) };
    });
  }

  // ------------------------------------------------------------------------------------------ directory sources

  async sources(a: DeskActor) {
    this.requireDirectory(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdDirectorySource.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { createdAt: 'asc' } });
      const counts = await tx.sdDirectoryPerson.groupBy({ by: ['sourceId', 'active'], where: { organizationId: a.ctx.organizationId }, _count: { _all: true } });
      return rows.map((s) => {
        const cfg = s.configEncrypted ? (JSON.parse(this.crypto.decrypt(s.configEncrypted)) as LdapConfig) : null;
        return {
          id: s.id,
          kind: s.kind,
          name: s.name,
          // The bind password never leaves the server.
          ldap: cfg ? { url: cfg.url, bindDn: cfg.bindDn, baseDn: cfg.baseDn, filter: cfg.filter ?? null } : null,
          scimUrl: s.kind === 'scim' ? `${(process.env.API_ORIGIN ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1/desk/scim/${a.ctx.organizationId}/${s.id}/v2` : null,
          groupMap: s.groupMap,
          schedule: s.schedule,
          status: s.status,
          lastSyncAt: s.lastSyncAt,
          lastResult: s.lastResult,
          people: counts.filter((c) => c.sourceId === s.id).reduce((n, c) => n + c._count._all, 0),
          disabled: counts.filter((c) => c.sourceId === s.id && !c.active).reduce((n, c) => n + c._count._all, 0),
          version: s.version,
        };
      });
    });
  }

  /** LDAP: a TLS address whose host resolves only to public addresses (no reaching into our own network). */
  private async checkLdapUrl(raw: string): Promise<URL> {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new BadRequestException('Enter the directory address like ldaps://dc1.example.com');
    }
    if (u.protocol !== 'ldaps:') throw new BadRequestException('Use a secure address (ldaps://).');
    if (process.env.SD_LDAP_ALLOW_PRIVATE === '1') return u;
    const all = await lookup(u.hostname.replace(/^\[|\]$/g, ''), { all: true }).catch(() => []);
    if (!all.length || all.some((x) => !isPublicAddress(x.address))) throw new BadRequestException('The directory must be reachable on a public address.');
    return u;
  }

  /** Mapping groups to seats gives paid seats, so it also needs the right to hand out seats on those desks. */
  private async checkMap(tx: Tx, a: DeskActor, map: GroupMap) {
    if (!map.length) return;
    if (!has(a, 'desk.member.manage')) throw new ForbiddenException('Mapping groups to desk seats needs the right to hand out seats (desk.member.manage).');
    const desks = await tx.sdDesk.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: map.map((m) => m.deskId) }, status: 'active' }, select: { id: true } });
    if (desks.length !== new Set(map.map((m) => m.deskId)).size) throw new BadRequestException('Map groups to active desks of this company.');
    if (!has(a, 'desk.desk.create') && map.some((m) => a.roles.get(m.deskId) !== 'admin')) throw new ForbiddenException('Map groups only to desks you run.');
  }

  /** Saving LDAP credentials or making a SCIM token needs a fresh second factor (checked by the controller). */
  async saveSource(a: DeskActor, id: string | null, dto: DirectorySourceDto) {
    this.requireDirectory(a);
    if (dto.kind === 'ldap' && dto.ldap) await this.checkLdapUrl(dto.ldap.url);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      await this.checkMap(tx, a, dto.groupMap ?? []);
      const cur = id ? await tx.sdDirectorySource.findFirst({ where: { organizationId: org, id } }) : null;
      if (id && !cur) throw new NotFoundException('No such directory source.');
      if (cur && dto.version !== undefined && dto.version !== cur.version) throw new ConflictException('Someone changed this source. Reload to see the latest.');
      const kind = cur?.kind ?? dto.kind;
      let configEncrypted = cur?.configEncrypted ?? null;
      if (kind === 'ldap' && dto.ldap) {
        const old = cur?.configEncrypted ? (JSON.parse(this.crypto.decrypt(cur.configEncrypted)) as LdapConfig) : null;
        // A blank password keeps the saved one.
        const bindPassword = dto.ldap.bindPassword || old?.bindPassword;
        if (!bindPassword) throw new BadRequestException('Enter the read-only account password.');
        configEncrypted = this.crypto.encrypt(JSON.stringify({ url: dto.ldap.url, bindDn: dto.ldap.bindDn, bindPassword, baseDn: dto.ldap.baseDn, filter: dto.ldap.filter || undefined } satisfies LdapConfig));
      }
      if (kind === 'ldap' && !configEncrypted) throw new BadRequestException('Fill in the directory connection.');
      const token = kind === 'scim' && !cur ? randomBytes(32).toString('base64url') : null;
      const data = { name: dto.name, groupMap: (dto.groupMap ?? []) as unknown as Prisma.InputJsonValue, schedule: kind === 'scim' ? 'off' : (dto.schedule ?? 'daily'), configEncrypted, ...(dto.status ? { status: dto.status } : {}) };
      const row = cur ? await tx.sdDirectorySource.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 } } }) : await tx.sdDirectorySource.create({ data: { organizationId: org, kind, ...data, scimTokenHash: token ? sha256(token) : null, createdBy: a.userId } });
      await audit(tx, a, cur ? 'desk.directory.source_updated' : 'desk.directory.source_created', 'sd_directory_source', row.id, { kind, name: dto.name, groupMap: dto.groupMap ?? [], credentialsChanged: Boolean(dto.ldap?.bindPassword) });
      return { id: row.id, ...(token ? { scimToken: token, scimUrl: `${(process.env.API_ORIGIN ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1/desk/scim/${org}/${row.id}/v2` } : {}) };
    });
  }

  /** A new SCIM token (shown once); the old one stops working at once. */
  async rotateScim(a: DeskActor, id: string) {
    this.requireDirectory(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const token = randomBytes(32).toString('base64url');
      const n = await tx.sdDirectorySource.updateMany({ where: { organizationId: a.ctx.organizationId, id, kind: 'scim' }, data: { scimTokenHash: sha256(token) } });
      if (!n.count) throw new NotFoundException('No such SCIM source.');
      await audit(tx, a, 'desk.directory.scim_token_rotated', 'sd_directory_source', id, {});
      return { scimToken: token };
    });
  }

  // ------------------------------------------------------------------------------------------ applying a directory user

  /** Upserts the person, records them for this source, and applies group seats; a disabled user's seats end. */
  private async applyUser(tx: Tx, org: string, sourceId: string, map: GroupMap, u: DirectoryUser, source: 'ldap' | 'scim', keepGroups = false) {
    const prev = await tx.sdDirectoryPerson.findFirst({ where: { organizationId: org, sourceId, externalId: u.externalId } });
    const { personId } = await this.upsertPerson(tx, org, null, { email: u.email, givenName: u.givenName, familyName: u.familyName, team: u.department, locationId: undefined, source });
    const groups = keepGroups ? (prev?.groups ?? []) : u.groups;
    const row = prev
      ? await tx.sdDirectoryPerson.update({ where: { id: prev.id }, data: { userName: u.email, personId, active: u.active, groups, department: u.department, managerExternalId: u.managerExternalId, lastSeenAt: new Date() } })
      : await tx.sdDirectoryPerson.create({ data: { organizationId: org, sourceId, externalId: u.externalId, userName: u.email, personId, active: u.active, groups, department: u.department, managerExternalId: u.managerExternalId } });
    await this.applySeats(tx, org, map, row);
    return row;
  }

  /** The login of this person (if any) gets the mapped seats while active and in the group; otherwise those seats end. */
  private async applySeats(tx: Tx, org: string, map: GroupMap, row: { personId: string; active: boolean; groups: string[] }) {
    const login = await tx.personRole.findFirst({ where: { organizationId: org, personId: row.personId, roleType: 'login', sourceTable: 'users', endOn: null }, select: { sourceId: true } });
    if (!login?.sourceId) return;
    const userId = login.sourceId;
    const seats = await tx.sdDeskMember.findMany({ where: { organizationId: org, userId, validTo: null } });
    const sys = { ctx: { organizationId: org, isSuperAdmin: false }, userId: null };
    if (!row.active) {
      // US-G-032: a disabled user's desk access ends.
      for (const m of seats) await endSeatIn(tx, sys, m, 'Disabled in the company directory');
      return;
    }
    const want = map.filter((m) => row.groups.some((g) => g.toLowerCase() === m.group.toLowerCase()));
    for (const m of map) {
      const has = seats.find((s) => s.deskId === m.deskId && s.role === m.role);
      const wanted = want.some((w) => w.deskId === m.deskId && w.role === m.role);
      if (wanted && !has && !seats.some((s) => s.deskId === m.deskId)) {
        const user = await tx.user.findFirst({ where: { organizationId: org, id: userId, status: 'active' }, select: { id: true } });
        if (!user) continue;
        const seat = await tx.sdDeskMember.create({ data: { organizationId: org, deskId: m.deskId, userId, role: m.role, validFrom: new Date(`${todayIst()}T00:00:00Z`) } });
        await audit(tx, sys as never, 'desk.member.added', 'sd_desk_member', seat.id, { deskId: m.deskId, userId, role: m.role, by: 'directory group', group: m.group });
        if (m.role !== 'collaborator') await emit(tx, org, 'helpdesk.agent_seat.granted', { deskId: m.deskId, userId, by: 'directory' });
      } else if (!wanted && has) await endSeatIn(tx, sys, has, `No longer in the directory group ${m.group}`);
    }
  }

  // ------------------------------------------------------------------------------------------ LDAP sync

  async syncNow(a: DeskActor, id: string) {
    this.requireDirectory(a);
    const src = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdDirectorySource.findFirst({ where: { organizationId: a.ctx.organizationId, id, kind: 'ldap' } }));
    if (!src) throw new NotFoundException('No such LDAP source.');
    await this.tenantPrisma.forTenant(a.ctx, (tx) => audit(tx, a, 'desk.directory.sync_started', 'sd_directory_source', id, {}));
    return this.syncLdap(a.ctx.organizationId, id);
  }

  /** Reads the directory with the company's read-only account and applies every user. */
  async syncLdap(org: string, id: string) {
    const ctx = { organizationId: org, isSuperAdmin: false };
    const src = await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdDirectorySource.findFirst({ where: { organizationId: org, id, kind: 'ldap' } }));
    if (!src?.configEncrypted) throw new NotFoundException('No such LDAP source.');
    const cfg = JSON.parse(this.crypto.decrypt(src.configEncrypted)) as LdapConfig;
    let result: Record<string, unknown>;
    try {
      const url = await this.checkLdapUrl(cfg.url);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      // Connect to the address that was checked (no DNS rebinding); the certificate is checked against the host name.
      const ip = process.env.SD_LDAP_ALLOW_PRIVATE === '1' ? host : (await lookup(host)).address;
      const { Client } = await import('ldapts');
      const client = new Client({ url: `ldaps://${ip.includes(':') ? `[${ip}]` : ip}:${url.port || 636}`, timeout: 15_000, connectTimeout: 10_000, tlsOptions: { servername: host, minVersion: 'TLSv1.2' } });
      const entries: Record<string, unknown>[] = [];
      try {
        await client.bind(cfg.bindDn, cfg.bindPassword);
        const res = await client.search(cfg.baseDn, { scope: 'sub', filter: cfg.filter || '(&(objectClass=person)(mail=*))', attributes: ['mail', 'userPrincipalName', 'givenName', 'sn', 'displayName', 'cn', 'department', 'manager', 'memberOf', 'userAccountControl', 'objectGUID', 'entryUUID'], sizeLimit: 20_000, paged: { pageSize: 500 } });
        entries.push(...(res.searchEntries as Record<string, unknown>[]));
      } finally {
        await client.unbind().catch(() => undefined);
      }
      const users = entries.map(ldapUser).filter((u): u is DirectoryUser => Boolean(u));
      const map = src.groupMap as GroupMap;
      let applied = 0;
      await deskSystem(
        this.tenantPrisma,
        ctx,
        async (tx) => {
          for (const u of users) {
            await this.applyUser(tx, org, src.id, map, u, 'ldap');
            applied++;
          }
          // People no longer in the directory are treated as disabled.
          const gone = await tx.sdDirectoryPerson.findMany({ where: { organizationId: org, sourceId: src.id, active: true, externalId: { notIn: users.map((u) => u.externalId) } } });
          for (const g of gone) {
            const row = await tx.sdDirectoryPerson.update({ where: { id: g.id }, data: { active: false } });
            await this.applySeats(tx, org, map, row);
          }
        },
        { timeout: 300_000 },
      );
      result = { ok: true, read: entries.length, applied, at: new Date().toISOString() };
    } catch (e) {
      // Never the password or the full error of the directory server back to the screen.
      this.logger.warn(`LDAP sync failed for ${org}/${id}: ${(e as Error).message}`);
      result = { ok: false, error: 'Could not read the directory. Check the address, the account and that the server accepts TLS.', at: new Date().toISOString() };
    }
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      await tx.sdDirectorySource.update({ where: { id: src.id }, data: { lastSyncAt: new Date(), lastResult: result as Prisma.InputJsonValue, status: result.ok ? 'active' : 'error' } });
      await audit(tx, { ctx, userId: null as unknown as string }, 'desk.directory.synced', 'sd_directory_source', src.id, result);
    });
    return result;
  }

  /** Job: scheduled LDAP syncs. */
  async scheduledSyncs(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT id, organization_id FROM sd_directory_sources WHERE kind = 'ldap' AND status <> 'paused' AND schedule <> 'off'
          AND (last_sync_at IS NULL OR last_sync_at < ${now}::timestamptz - CASE schedule WHEN 'hourly' THEN interval '55 minutes' ELSE interval '23 hours' END) LIMIT 50`,
    );
    for (const s of due) await this.syncLdap(s.organization_id, s.id).catch((e) => this.logger.warn(`LDAP sync: ${(e as Error).message}`));
    return due.length;
  }

  // ------------------------------------------------------------------------------------------ SCIM 2.0 (RFC 7643 / 7644)

  /** The source behind a SCIM bearer token: only this company's, only this source's. */
  async scimSource(org: string, sourceId: string, authorization: string | undefined) {
    const token = /^Bearer\s+([A-Za-z0-9_-]{40,60})$/.exec(authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException(scimError(401, 'A valid bearer token is required'));
    const src = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.sdDirectorySource.findFirst({ where: { organizationId: org, id: sourceId, kind: 'scim', scimTokenHash: sha256(token) } }));
    if (!src || src.status === 'paused') throw new UnauthorizedException(scimError(401, 'A valid bearer token is required'));
    return src;
  }

  private scimView(r: Prisma.SdDirectoryPersonGetPayload<object>, p: { givenName: string; familyName: string | null }, base: string) {
    return {
      schemas: [SCIM_USER, SCIM_ENTERPRISE],
      id: r.id,
      externalId: r.externalId,
      userName: r.userName,
      name: { givenName: p.givenName, familyName: p.familyName ?? undefined },
      emails: [{ value: r.userName, primary: true }],
      active: r.active,
      groups: r.groups.map((g) => ({ display: g })),
      [SCIM_ENTERPRISE]: { department: r.department ?? undefined },
      meta: { resourceType: 'User', created: r.createdAt.toISOString(), lastModified: r.lastSeenAt.toISOString(), location: `${base}/Users/${r.id}` },
    };
  }

  private scimTx<T>(org: string, fn: (tx: Tx) => Promise<T>) {
    return deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, fn);
  }

  async scimList(org: string, src: { id: string }, base: string, filter?: string, startIndex = 1, count = 100) {
    const m = filter ? /^\s*(userName|externalId)\s+eq\s+"([^"]{1,320})"\s*$/i.exec(filter) : null;
    if (filter && !m) throw new BadRequestException(scimError(400, 'Only userName eq and externalId eq filters are supported', 'invalidFilter'));
    return this.scimTx(org, async (tx) => {
      const where: Prisma.SdDirectoryPersonWhereInput = { organizationId: org, sourceId: src.id, ...(m ? (m[1].toLowerCase() === 'username' ? { userName: m[2].toLowerCase() } : { externalId: m[2] }) : {}) };
      const take = Math.max(0, Math.min(200, count));
      const [total, rows] = await Promise.all([tx.sdDirectoryPerson.count({ where }), tx.sdDirectoryPerson.findMany({ where, orderBy: { createdAt: 'asc' }, skip: Math.max(0, startIndex - 1), take })]);
      const people = new Map((await tx.person.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.personId) } }, select: { id: true, givenName: true, familyName: true } })).map((p) => [p.id, p]));
      return { schemas: [SCIM_LIST], totalResults: total, startIndex, itemsPerPage: rows.length, Resources: rows.map((r) => this.scimView(r, people.get(r.personId) ?? { givenName: '', familyName: null }, base)) };
    });
  }

  async scimGet(org: string, src: { id: string }, base: string, id: string) {
    return this.scimTx(org, async (tx) => {
      const r = await tx.sdDirectoryPerson.findFirst({ where: { organizationId: org, sourceId: src.id, id } });
      if (!r) throw new NotFoundException(scimError(404, 'No such user'));
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: r.personId }, select: { givenName: true, familyName: true } });
      return this.scimView(r, p, base);
    });
  }

  async scimCreate(org: string, src: { id: string; groupMap: unknown }, base: string, body: Record<string, unknown>) {
    const u = scimUser(body, randomBytes(8).toString('hex'));
    return this.scimTx(org, async (tx) => {
      if (await tx.sdDirectoryPerson.findFirst({ where: { organizationId: org, sourceId: src.id, OR: [{ userName: u.email }, { externalId: u.externalId }] }, select: { id: true } })) {
        throw new ConflictException(scimError(409, 'A user with that userName already exists', 'uniqueness'));
      }
      const row = await this.applyUser(tx, org, src.id, src.groupMap as GroupMap, u, 'scim');
      await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.directory.scim_user_created', 'sd_directory_person', row.id, { sourceId: src.id, userName: u.email, active: u.active });
      return this.scimView(row, { givenName: u.givenName, familyName: u.familyName }, base);
    });
  }

  async scimReplace(org: string, src: { id: string; groupMap: unknown }, base: string, id: string, body: Record<string, unknown>) {
    return this.scimTx(org, async (tx) => {
      const cur = await tx.sdDirectoryPerson.findFirst({ where: { organizationId: org, sourceId: src.id, id } });
      if (!cur) throw new NotFoundException(scimError(404, 'No such user'));
      const u = { ...scimUser(body, cur.externalId), externalId: cur.externalId };
      const row = await this.applyUser(tx, org, src.id, src.groupMap as GroupMap, u, 'scim', true);
      await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.directory.scim_user_updated', 'sd_directory_person', row.id, { sourceId: src.id, active: u.active });
      return this.scimView(row, { givenName: u.givenName, familyName: u.familyName }, base);
    });
  }

  /** PATCH: the operations identity providers send (active on / off, names, email). */
  async scimPatch(org: string, src: { id: string; groupMap: unknown }, base: string, id: string, body: { Operations?: { op?: string; path?: string; value?: unknown }[] }) {
    const ops = Array.isArray(body?.Operations) ? body.Operations.slice(0, 50) : [];
    if (!ops.length) throw new BadRequestException(scimError(400, 'No operations', 'invalidSyntax'));
    return this.scimTx(org, async (tx) => {
      const cur = await tx.sdDirectoryPerson.findFirst({ where: { organizationId: org, sourceId: src.id, id } });
      if (!cur) throw new NotFoundException(scimError(404, 'No such user'));
      const p = await tx.person.findFirstOrThrow({ where: { organizationId: org, id: cur.personId }, select: { givenName: true, familyName: true } });
      const body2: Record<string, unknown> = { userName: cur.userName, externalId: cur.externalId, active: cur.active, name: { givenName: p.givenName, familyName: p.familyName }, [SCIM_ENTERPRISE]: { department: cur.department } };
      for (const op of ops) {
        if (!['replace', 'add'].includes(String(op.op ?? '').toLowerCase())) continue;
        const values = op.path ? { [op.path]: op.value } : ((op.value ?? {}) as Record<string, unknown>);
        for (const [k, v] of Object.entries(values)) {
          if (k === 'active') body2.active = v === true || v === 'true' || v === 'True';
          else if (k === 'userName' && typeof v === 'string') body2.userName = v;
          else if (k === 'name.givenName') (body2.name as Record<string, unknown>).givenName = v;
          else if (k === 'name.familyName') (body2.name as Record<string, unknown>).familyName = v;
          else if (k === 'name' && v && typeof v === 'object') body2.name = { ...(body2.name as object), ...(v as object) };
          else if (k.endsWith(':department') || k === 'department') (body2[SCIM_ENTERPRISE] as Record<string, unknown>).department = v;
        }
      }
      const u = { ...scimUser(body2, cur.externalId), externalId: cur.externalId };
      const row = await this.applyUser(tx, org, src.id, src.groupMap as GroupMap, u, 'scim', true);
      await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.directory.scim_user_updated', 'sd_directory_person', row.id, { sourceId: src.id, active: u.active });
      return this.scimView(row, { givenName: u.givenName, familyName: u.familyName }, base);
    });
  }

  /** DELETE never removes a person (their tickets stay theirs): it turns them off and ends their seats. */
  async scimDelete(org: string, src: { id: string; groupMap: unknown }, id: string) {
    return this.scimTx(org, async (tx) => {
      const cur = await tx.sdDirectoryPerson.findFirst({ where: { organizationId: org, sourceId: src.id, id } });
      if (!cur) throw new NotFoundException(scimError(404, 'No such user'));
      const row = await tx.sdDirectoryPerson.update({ where: { id: cur.id }, data: { active: false, lastSeenAt: new Date() } });
      await this.applySeats(tx, org, src.groupMap as GroupMap, row);
      await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.directory.scim_user_disabled', 'sd_directory_person', row.id, { sourceId: src.id });
    });
  }

  // Groups: kept by name; members are the source's users.

  private groupView(g: { id: string; displayName: string; externalId: string | null }, members: { id: string; userName: string }[], base: string) {
    return { schemas: [SCIM_GROUP], id: g.id, displayName: g.displayName, externalId: g.externalId ?? undefined, members: members.map((m) => ({ value: m.id, display: m.userName })), meta: { resourceType: 'Group', location: `${base}/Groups/${g.id}` } };
  }

  private async setMembers(tx: Tx, org: string, src: { id: string; groupMap: unknown }, name: string, add: string[], remove: string[], replaceAll: boolean) {
    const rows = await tx.sdDirectoryPerson.findMany({ where: { organizationId: org, sourceId: src.id } });
    for (const r of rows) {
      const inNow = r.groups.includes(name);
      const should = replaceAll ? add.includes(r.id) : (inNow || add.includes(r.id)) && !remove.includes(r.id);
      if (should === inNow) continue;
      const updated = await tx.sdDirectoryPerson.update({ where: { id: r.id }, data: { groups: should ? [...r.groups, name] : r.groups.filter((g) => g !== name) } });
      await this.applySeats(tx, org, src.groupMap as GroupMap, updated);
    }
  }

  async scimGroups(org: string, src: { id: string }, base: string, filter?: string) {
    const m = filter ? /^\s*displayName\s+eq\s+"([^"]{1,200})"\s*$/i.exec(filter) : null;
    return this.scimTx(org, async (tx) => {
      const groups = await tx.sdDirectoryGroup.findMany({ where: { organizationId: org, sourceId: src.id, ...(m ? { displayName: m[1] } : {}) }, orderBy: { createdAt: 'asc' }, take: 200 });
      const people = await tx.sdDirectoryPerson.findMany({ where: { organizationId: org, sourceId: src.id }, select: { id: true, userName: true, groups: true } });
      return { schemas: [SCIM_LIST], totalResults: groups.length, startIndex: 1, itemsPerPage: groups.length, Resources: groups.map((g) => this.groupView(g, people.filter((p) => p.groups.includes(g.displayName)), base)) };
    });
  }

  async scimGroupWrite(org: string, src: { id: string; groupMap: unknown }, base: string, id: string | null, body: Record<string, unknown>, method: 'post' | 'put' | 'patch') {
    return this.scimTx(org, async (tx) => {
      let g = id ? await tx.sdDirectoryGroup.findFirst({ where: { organizationId: org, sourceId: src.id, id } }) : null;
      if (id && !g) throw new NotFoundException(scimError(404, 'No such group'));
      if (method !== 'patch') {
        const displayName = String(body.displayName ?? '').trim().slice(0, 200);
        if (!displayName) throw new BadRequestException(scimError(400, 'displayName is required', 'invalidValue'));
        if (!g) {
          if (await tx.sdDirectoryGroup.findFirst({ where: { organizationId: org, sourceId: src.id, displayName } })) throw new ConflictException(scimError(409, 'A group with that name exists', 'uniqueness'));
          g = await tx.sdDirectoryGroup.create({ data: { organizationId: org, sourceId: src.id, displayName, externalId: body.externalId ? String(body.externalId).slice(0, 200) : null } });
        } else if (displayName !== g.displayName) throw new BadRequestException(scimError(400, 'Renaming a group is not supported; make a new group', 'mutability'));
        const members = (Array.isArray(body.members) ? body.members : []).map((x: { value?: string }) => String(x?.value ?? '')).slice(0, 10_000);
        await this.setMembers(tx, org, src, g.displayName, members, [], true);
      } else {
        const ops = (Array.isArray(body.Operations) ? body.Operations : []) as { op?: string; path?: string; value?: unknown }[];
        for (const op of ops.slice(0, 50)) {
          const kind = String(op.op ?? '').toLowerCase();
          const values = (Array.isArray(op.value) ? op.value : op.value ? [op.value] : []) as { value?: string }[];
          const pathMember = /^members\[value eq "([^"]+)"\]$/.exec(op.path ?? '')?.[1];
          if (kind === 'add' && (op.path === 'members' || !op.path)) await this.setMembers(tx, org, src, g!.displayName, values.map((v) => String(v.value)), [], false);
          else if (kind === 'remove') await this.setMembers(tx, org, src, g!.displayName, [], pathMember ? [pathMember] : values.map((v) => String(v.value)), false);
          else if (kind === 'replace' && op.path === 'members') await this.setMembers(tx, org, src, g!.displayName, values.map((v) => String(v.value)), [], true);
        }
      }
      await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.directory.scim_group_changed', 'sd_directory_group', g!.id, { sourceId: src.id, method });
      const people = await tx.sdDirectoryPerson.findMany({ where: { organizationId: org, sourceId: src.id }, select: { id: true, userName: true, groups: true } });
      return this.groupView(g!, people.filter((p) => p.groups.includes(g!.displayName)), base);
    });
  }

  async scimGroupDelete(org: string, src: { id: string; groupMap: unknown }, id: string) {
    return this.scimTx(org, async (tx) => {
      const g = await tx.sdDirectoryGroup.findFirst({ where: { organizationId: org, sourceId: src.id, id } });
      if (!g) throw new NotFoundException(scimError(404, 'No such group'));
      await this.setMembers(tx, org, src, g.displayName, [], [], true);
      await tx.sdDirectoryGroup.delete({ where: { id: g.id } });
      await audit(tx, { ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.directory.scim_group_deleted', 'sd_directory_group', g.id, { sourceId: src.id, name: g.displayName });
    });
  }

  // ------------------------------------------------------------------------------------------ the set-up checklist (US-G-034)

  /** Each step done or to do, worked out from what exists (nothing to keep in step by hand). */
  async checklist(a: DeskActor) {
    if (!has(a, 'desk.desk.create') && ![...a.roles.values()].includes('admin')) throw new ForbiddenException('Desk admins see the set-up checklist.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const [desks, agents, sla, mailboxes, articles, people, directory, portals, calendars] = await Promise.all([
        tx.sdDesk.count({ where: { organizationId: org, status: 'active' } }),
        tx.sdDeskMember.count({ where: { organizationId: org, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) } }),
        tx.sdSlaPolicy.count({ where: { organizationId: org, active: true } }),
        tx.sdMailbox.count({ where: { organizationId: org, status: 'active' } }),
        tx.sdKbArticle.count({ where: { organizationId: org, state: 'published', deletedAt: null } }),
        tx.sdPeople.count({ where: { organizationId: org } }),
        tx.sdDirectorySource.count({ where: { organizationId: org } }),
        tx.sdPortal.count({ where: { organizationId: org, status: 'active' } }),
        tx.businessCalendar.count({ where: { organizationId: org } }),
      ]);
      const hasHr = Boolean(await tx.organizationProduct.findFirst({ where: { organizationId: org, productCode: 'hrms' }, select: { productCode: true } }));
      const steps = [
        { key: 'desk', label: 'Create your first desk', done: desks > 0, link: '/yx/desk/setup' },
        { key: 'hours', label: 'Set your working hours and holidays', done: calendars > 0, link: '/yx/desk/setup?tab=sla' },
        { key: 'agents', label: 'Add agents to the desk', done: agents > 0, link: '/yx/desk/setup?tab=members' },
        { key: 'sla', label: 'Set response targets (SLA)', done: sla > 0, link: '/yx/desk/setup?tab=sla' },
        { key: 'email', label: 'Connect the support email address', done: mailboxes > 0, link: '/yx/desk/setup?tab=email' },
        { key: 'kb', label: 'Publish your first help article', done: articles > 0, link: '/yx/desk/knowledge' },
        ...(hasHr ? [] : [{ key: 'people', label: 'Add your people (CSV or directory sync)', done: people > 0 || directory > 0, link: '/yx/desk/people-list' }]),
        { key: 'portal', label: 'Open a help portal for customers (if you serve them)', done: portals > 0, link: '/yx/desk/setup?tab=portal', optional: true },
      ];
      return { steps, done: steps.filter((s) => s.done).length, total: steps.length, standalone: !hasHr };
    });
  }
}


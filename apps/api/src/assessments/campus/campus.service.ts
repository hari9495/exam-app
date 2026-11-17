import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { parse } from 'csv-parse/sync';
import { isEmail } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuditService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../../email/email.service';
import { escapeHtml } from '../../notifications/notification-email-render';
import { driveState, invitationState, type DriveListRow } from '../delivery/delivery.service';
import { campusSettingsProblem, readCampus, type CampusSettings } from './campus-rules';

// Assessments AS-3 part 2 (answer 2014; PRC-29): the campus kit on the existing walk-in drives. Institutions (the
// company's colleges), a drive's form and eligibility, registrants with duplicate merge, the college-wise report and the
// college coordinator's read-only link. No admit cards.

export type Visibility = 'none' | 'aggregate' | 'per_candidate';

export const INSTITUTION_COLUMNS = ['name', 'code', 'city', 'coordinator_name', 'coordinator_email', 'results'] as const;
export const INSTITUTION_IMPORT_MAX = 500;
const RESULTS_WORDS: Record<string, Visibility> = { none: 'none', counts: 'aggregate', each: 'per_candidate' };

export interface InstitutionImportRow {
  line: number;
  name: string;
  code: string;
  ok: boolean;
  problem: string | null;
}

export interface InstitutionRow {
  id: string;
  name: string;
  code: string;
  city: string | null;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  resultsVisibility: Visibility;
  archived: boolean;
}

export interface RegistrantRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  institutionId: string;
  college: string;
  rollNumber: string;
  branch: string | null;
  graduationYear: number | null;
  cgpa: number | null;
  eligible: boolean;
  ineligibleReason: string | null;
  match: 'New' | 'Existing candidate' | 'Possible duplicate' | 'Merged';
  duplicateOf: { id: string; name: string; email: string } | null;
  mergedInto: { id: string; name: string } | null;
  test: string | null;
  registeredAt: string;
}

export interface CollegeRow {
  institutionId: string;
  college: string;
  registered: number;
  eligible: number;
  invited: number;
  attended: number;
  passed: number;
}

export interface CampusView {
  drive: { id: string; name: string; status: DriveListRow['status']; orgSlug: string; tests: string[] };
  settings: CampusSettings | null;
  registrants: RegistrantRow[];
  report: CollegeRow[];
}

export interface CoordinatorView {
  company: string;
  drive: string;
  college: string;
  coordinator: string | null;
  visibility: Visibility;
  /** Results are shown (by the visibility) only after the drive closes. */
  resultsShown: boolean;
  registrationPath: string;
  counts: { registered: number; eligible: number; invited: number; attended: number; passed: number | null };
  registrants: { name: string; rollNumber: string; registration: string; test: string; result: string | null }[];
}

const LINK_DAYS = 60;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const RUNNING = ['in_progress', 'paused'];

type Tx = Prisma.TransactionClient;
const registrantSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  institutionId: true,
  rollNumber: true,
  branch: true,
  graduationYear: true,
  cgpa: true,
  eligible: true,
  ineligibleReason: true,
  matchedExisting: true,
  createdAt: true,
  institution: { select: { name: true } },
  duplicateOf: { select: { id: true, name: true, email: true, mergedIntoId: true } },
  mergedInto: { select: { id: true, name: true } },
  invitation: { select: { status: true, expiresAt: true, attempt: { select: { status: true, result: { select: { passFail: true, releaseOverride: true } } } } } },
} satisfies Prisma.AsmtRegistrantSelect;
type RegistrantRecord = Prisma.AsmtRegistrantGetPayload<{ select: typeof registrantSelect }>;

const passed = (r: RegistrantRecord) => r.invitation?.attempt?.result?.passFail === 'pass' && r.invitation.attempt.result.releaseOverride !== 'held';
const attended = (r: RegistrantRecord) => Boolean(r.invitation?.attempt);
const testState = (r: RegistrantRecord, now: Date) =>
  r.invitation ? invitationState({ status: r.invitation.status, expiresAt: r.invitation.expiresAt, attempt: r.invitation.attempt ? { status: r.invitation.attempt.status, held: r.invitation.attempt.result?.releaseOverride === 'held' } : null }, now) : null;

/** Counts per college (merged duplicates never count). */
export function collegeReport(rows: RegistrantRecord[]): CollegeRow[] {
  const by = new Map<string, CollegeRow>();
  for (const r of rows) {
    const c = by.get(r.institutionId) ?? { institutionId: r.institutionId, college: r.institution.name, registered: 0, eligible: 0, invited: 0, attended: 0, passed: 0 };
    c.registered++;
    if (r.eligible) c.eligible++;
    if (r.invitation) c.invited++;
    if (attended(r)) c.attended++;
    if (passed(r)) c.passed++;
    by.set(r.institutionId, c);
  }
  return [...by.values()].sort((a, b) => b.registered - a.registered || a.college.localeCompare(b.college));
}

@Injectable()
export class CampusService {
  private readonly logger = new Logger(CampusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private org(ctx: TenantContext) {
    return ctx.organizationId as string;
  }

  /* ---------------------------------------------------------------- institutions */

  async institutions(ctx: TenantContext): Promise<InstitutionRow[]> {
    const rows = await this.tenantPrisma.forTenant(ctx, (tx) => tx.asmtInstitution.findMany({ where: { organizationId: this.org(ctx) }, orderBy: { name: 'asc' }, take: 1000 }));
    return rows.map((r) => ({ id: r.id, name: r.name, code: r.code, city: r.city, coordinatorName: r.coordinatorName, coordinatorEmail: r.coordinatorEmail, resultsVisibility: r.resultsVisibility as Visibility, archived: Boolean(r.archivedAt) }));
  }

  async saveInstitution(ctx: TenantContext, userId: string, id: string | null, d: { name: string; code: string; city?: string | null; coordinatorName?: string | null; coordinatorEmail?: string | null; resultsVisibility: Visibility; archived?: boolean }) {
    const org = this.org(ctx);
    const data = { name: d.name.trim(), code: d.code.trim(), city: d.city?.trim() || null, coordinatorName: d.coordinatorName?.trim() || null, coordinatorEmail: d.coordinatorEmail?.trim().toLowerCase() || null, resultsVisibility: d.resultsVisibility };
    const saved = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const clash = await tx.asmtInstitution.findFirst({ where: { organizationId: org, code: { equals: data.code, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
      if (clash) throw new ConflictException('Another institution already has this code.');
      if (!id) return tx.asmtInstitution.create({ data: { organizationId: org, ...data } });
      const was = await tx.asmtInstitution.findFirst({ where: { id, organizationId: org }, select: { id: true } });
      if (!was) throw new NotFoundException('Institution not found');
      return tx.asmtInstitution.update({ where: { id }, data: { ...data, ...(d.archived === undefined ? {} : { archivedAt: d.archived ? new Date() : null }) } });
    });
    await this.audit.record(ctx, { actorUserId: userId, action: id ? 'institution.updated' : 'institution.created', entityType: 'institution', entityId: saved.id, metadata: { code: saved.code } });
    return { id: saved.id };
  }

  /**
   * Answer 2241: institutions from a CSV (name, code, city, coordinator_name, coordinator_email, results). Every row is
   * checked first; `commit` adds the good rows in one go. A code already in the list (or twice in the file) is refused.
   */
  async importInstitutions(ctx: TenantContext, userId: string, csv: string, commit: boolean): Promise<{ rows: InstitutionImportRow[]; added: number }> {
    const org = this.org(ctx);
    let records: string[][];
    try {
      records = parse(csv.replace(/^﻿/, ''), { skip_empty_lines: true, trim: true, max_record_size: 4096 }) as string[][];
    } catch (e) {
      throw new BadRequestException(`The file is not valid CSV: ${(e as Error).message}`);
    }
    if (records.length < 2) throw new BadRequestException('The file has no rows under the header.');
    if (records.length > INSTITUTION_IMPORT_MAX + 1) throw new BadRequestException(`Import at most ${INSTITUTION_IMPORT_MAX} institutions at a time.`);
    const header = records[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const unknown = header.filter((h) => !(INSTITUTION_COLUMNS as readonly string[]).includes(h));
    if (unknown.length) throw new BadRequestException(`Unknown column: ${unknown.join(', ')}. Use: ${INSTITUTION_COLUMNS.join(', ')}.`);
    if (!header.includes('name') || !header.includes('code')) throw new BadRequestException('The file needs the name and code columns.');
    const cell = (r: string[], k: (typeof INSTITUTION_COLUMNS)[number]) => (header.includes(k) ? (r[header.indexOf(k)] ?? '').trim() : '');
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const existing = await tx.asmtInstitution.findMany({ where: { organizationId: org }, select: { code: true } });
      const taken = new Set(existing.map((e) => e.code.toLowerCase()));
      const rows: (InstitutionImportRow & { data?: Prisma.AsmtInstitutionUncheckedCreateInput })[] = records.slice(1).map((r, i) => {
        const line = i + 2;
        const name = cell(r, 'name');
        const code = cell(r, 'code');
        const city = cell(r, 'city');
        const coordinatorName = cell(r, 'coordinator_name');
        const coordinatorEmail = cell(r, 'coordinator_email').toLowerCase();
        const results = cell(r, 'results').toLowerCase() || 'counts';
        const problem =
          name.length < 2 || name.length > 300 ? 'Name the institution (2 to 300 characters).'
          : !code || code.length > 40 ? 'Give its code (up to 40 characters).'
          : taken.has(code.toLowerCase()) ? `The code ${code} is already in the list.`
          : city.length > 120 ? 'The city is too long (120 characters at most).'
          : coordinatorName.length > 200 ? "The coordinator's name is too long (200 characters at most)."
          : coordinatorEmail && (!isEmail(coordinatorEmail) || coordinatorEmail.length > 320) ? `Not an email address: ${coordinatorEmail}.`
          : !(results in RESULTS_WORDS) ? 'Results must be none, counts or each.'
          : null;
        if (problem) return { line, name, code, ok: false, problem };
        taken.add(code.toLowerCase());
        return { line, name, code, ok: true, problem: null, data: { organizationId: org, name, code, city: city || null, coordinatorName: coordinatorName || null, coordinatorEmail: coordinatorEmail || null, resultsVisibility: RESULTS_WORDS[results] } };
      });
      const good = rows.filter((r) => r.data);
      let added = 0;
      if (commit && good.length) {
        added = (await tx.asmtInstitution.createMany({ data: good.map((r) => r.data!) })).count;
        await this.audit.record(ctx, { actorUserId: userId, action: 'institution.imported', entityType: 'institution', metadata: { added, codes: good.map((r) => r.code) } });
      }
      return { rows: rows.map(({ data: _data, ...r }) => r), added };
    });
  }

  /* ---------------------------------------------------------------- a drive's campus kit */

  private async group(tx: Tx, org: string, groupId: string) {
    const g = await tx.walkInGroup.findFirst({
      where: { id: groupId, organizationId: org, deletedAt: null },
      select: { id: true, name: true, campusSettings: true, exams: { select: { title: true } }, driveSessions: { select: { startsAt: true, endsAt: true } } },
    });
    if (!g) throw new NotFoundException('Drive not found');
    return g;
  }

  async campus(ctx: TenantContext, groupId: string): Promise<CampusView> {
    const org = this.org(ctx);
    const now = new Date();
    const orgRow = await this.prisma.organization.findUnique({ where: { id: org }, select: { slug: true } });
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const g = await this.group(tx, org, groupId);
      // shortcut: the newest 2000 registrants; paging when a drive passes it (question 2246).
      const rows = await tx.asmtRegistrant.findMany({ where: { organizationId: org, walkInGroupId: groupId }, orderBy: { createdAt: 'desc' }, take: 2000, select: { ...registrantSelect, mergedIntoId: true } });
      const live = rows.filter((r) => !r.mergedIntoId);
      return {
        drive: { id: g.id, name: g.name, status: driveState(g.driveSessions, now), orgSlug: orgRow?.slug ?? '', tests: g.exams.map((e) => e.title) },
        settings: readCampus(g.campusSettings),
        registrants: rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          institutionId: r.institutionId,
          college: r.institution.name,
          rollNumber: r.rollNumber,
          branch: r.branch,
          graduationYear: r.graduationYear,
          cgpa: r.cgpa == null ? null : Number(r.cgpa),
          eligible: r.eligible,
          ineligibleReason: r.ineligibleReason,
          match: r.mergedInto ? 'Merged' : r.duplicateOf && !r.duplicateOf.mergedIntoId ? 'Possible duplicate' : r.matchedExisting ? 'Existing candidate' : 'New',
          duplicateOf: r.duplicateOf && !r.duplicateOf.mergedIntoId ? { id: r.duplicateOf.id, name: r.duplicateOf.name, email: r.duplicateOf.email } : null,
          mergedInto: r.mergedInto,
          test: testState(r, now),
          registeredAt: r.createdAt.toISOString(),
        })),
        report: collegeReport(live),
      };
    });
  }

  /** Turn a drive into a campus drive, change its form and eligibility, or (null) turn it back. */
  async saveSettings(ctx: TenantContext, userId: string, groupId: string, settings: CampusSettings | null) {
    if (settings) {
      const problem = campusSettingsProblem(settings);
      if (problem) throw new BadRequestException(problem);
    }
    const org = this.org(ctx);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      await this.group(tx, org, groupId);
      await tx.walkInGroup.update({ where: { id: groupId }, data: { campusSettings: settings ? (settings as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
    });
    await this.audit.record(ctx, { actorUserId: userId, action: 'drive.campus_settings_changed', entityType: 'walk_in_group', entityId: groupId, metadata: { campus: Boolean(settings) } });
    return { saved: true };
  }

  /** Merge a duplicate registration into the one kept: the duplicate stops counting and its untaken invitation is revoked. */
  async merge(ctx: TenantContext, userId: string, id: string, intoId: string) {
    if (id === intoId) throw new BadRequestException('Choose another registration to keep.');
    const org = this.org(ctx);
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const pair = await tx.asmtRegistrant.findMany({ where: { id: { in: [id, intoId] }, organizationId: org }, select: { id: true, walkInGroupId: true, mergedIntoId: true, invitationId: true, invitation: { select: { attempt: { select: { id: true } } } } } });
      const dup = pair.find((p) => p.id === id);
      const keep = pair.find((p) => p.id === intoId);
      if (!dup || !keep) throw new NotFoundException('Registration not found');
      if (dup.walkInGroupId !== keep.walkInGroupId) throw new BadRequestException('Both registrations must be for the same drive.');
      if (dup.mergedIntoId || keep.mergedIntoId) throw new ConflictException('One of these was already merged.');
      if (dup.invitation?.attempt) throw new BadRequestException('This registration has taken the test, so keep it and merge the other one into it.');
      // Guarded on not yet merged: two presses at once merge once.
      const res = await tx.asmtRegistrant.updateMany({ where: { id, mergedIntoId: null }, data: { mergedIntoId: intoId, mergedAt: new Date(), mergedByUserId: userId, duplicateOfId: null } });
      if (!res.count) throw new ConflictException('This registration was already merged.');
      await tx.asmtRegistrant.updateMany({ where: { duplicateOfId: id }, data: { duplicateOfId: intoId } });
      if (dup.invitationId) await tx.invitation.updateMany({ where: { id: dup.invitationId, status: 'invited', attempt: { is: null } }, data: { status: 'revoked' } });
    });
    await this.audit.record(ctx, { actorUserId: userId, action: 'registrant.merged', entityType: 'registrant', entityId: id, metadata: { into: intoId } });
    return { merged: true };
  }

  /** The two registrations are different students: clear the flag. */
  async notDuplicate(ctx: TenantContext, userId: string, id: string) {
    const res = await this.tenantPrisma.forTenant(ctx, (tx) => tx.asmtRegistrant.updateMany({ where: { id, organizationId: this.org(ctx), mergedIntoId: null, duplicateOfId: { not: null } }, data: { duplicateOfId: null } }));
    if (!res.count) throw new NotFoundException('No possible duplicate to clear');
    await this.audit.record(ctx, { actorUserId: userId, action: 'registrant.not_duplicate', entityType: 'registrant', entityId: id });
    return { cleared: true };
  }

  /* ---------------------------------------------------------------- the college coordinator */

  /** Email the institution's coordinator a read-only link to this drive (older links for it stop working). */
  async sendCoordinatorLink(ctx: TenantContext, userId: string, groupId: string, institutionId: string) {
    const org = this.org(ctx);
    const token = randomBytes(32).toString('base64url');
    const { inst, group } = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const group = await this.group(tx, org, groupId);
      if (!group.campusSettings) throw new BadRequestException('Turn on the campus form for this drive first.');
      const inst = await tx.asmtInstitution.findFirst({ where: { id: institutionId, organizationId: org, archivedAt: null } });
      if (!inst) throw new NotFoundException('Institution not found');
      if (!inst.coordinatorEmail) throw new BadRequestException('Add the coordinator’s email first.');
      await tx.asmtCoordinatorLink.updateMany({ where: { institutionId, walkInGroupId: groupId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.asmtCoordinatorLink.create({ data: { organizationId: org, institutionId, walkInGroupId: groupId, tokenHash: hash(token), expiresAt: new Date(Date.now() + LINK_DAYS * 864e5), createdByUserId: userId } });
      return { inst, group };
    });
    const company = (await this.prisma.organization.findUnique({ where: { id: org }, select: { name: true } }))?.name ?? '';
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/campus/${token}`;
    const sent = await this.email.send({
      organizationId: org,
      to: inst.coordinatorEmail!,
      subject: `${company}: ${group.name}, your college's view`,
      html: `<p>Dear ${escapeHtml(inst.coordinatorName ?? 'coordinator')},</p><p>${escapeHtml(company)} shares how students of ${escapeHtml(inst.name)} are doing in ${escapeHtml(group.name)}. This link is for you only and works for ${LINK_DAYS} days:</p><p><a href="${link}">Open your college's view</a></p>`,
      text: `${company} shares how students of ${inst.name} are doing in ${group.name}. This link is for you only and works for ${LINK_DAYS} days: ${link}`,
    });
    if (!sent.success) throw new BadRequestException('The email could not be sent. Check the company’s email settings and try again.');
    await this.audit.record(ctx, { actorUserId: userId, action: 'coordinator_link.sent', entityType: 'institution', entityId: institutionId, metadata: { walkInGroupId: groupId } });
    return { sentTo: inst.coordinatorEmail };
  }

  /** The coordinator's read-only view: their own college only, results at the level the company set, after the drive. */
  async coordinatorView(token: string): Promise<CoordinatorView> {
    const now = new Date();
    const link = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.asmtCoordinatorLink.findUnique({ where: { tokenHash: hash(token) }, select: { organizationId: true, institutionId: true, walkInGroupId: true, expiresAt: true, revokedAt: true } }),
    );
    if (!link || link.revokedAt || link.expiresAt < now) throw new NotFoundException('This link has expired or was replaced. Ask the company for a new one.');
    const ctx = { organizationId: link.organizationId, isSuperAdmin: false };
    const orgRow = await this.prisma.organization.findUnique({ where: { id: link.organizationId }, select: { name: true, slug: true } });
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const g = await this.group(tx, link.organizationId, link.walkInGroupId);
      const inst = await tx.asmtInstitution.findUniqueOrThrow({ where: { id: link.institutionId } });
      const rows = await tx.asmtRegistrant.findMany({ where: { organizationId: link.organizationId, walkInGroupId: g.id, institutionId: inst.id, mergedIntoId: null }, orderBy: { name: 'asc' }, take: 5000, select: registrantSelect });
      const visibility = inst.resultsVisibility as Visibility;
      const resultsShown = visibility !== 'none' && driveState(g.driveSessions, now) === 'Closed';
      const c = collegeReport(rows)[0];
      return {
        company: orgRow?.name ?? '',
        drive: g.name,
        college: inst.name,
        coordinator: inst.coordinatorName,
        visibility,
        resultsShown,
        registrationPath: `/walk-in/${orgRow?.slug ?? ''}?group=${g.id}&college=${encodeURIComponent(inst.code)}`,
        counts: { registered: c?.registered ?? 0, eligible: c?.eligible ?? 0, invited: c?.invited ?? 0, attended: c?.attended ?? 0, passed: resultsShown ? (c?.passed ?? 0) : null },
        registrants: rows.map((r) => ({
          name: r.name,
          rollNumber: r.rollNumber,
          registration: r.eligible ? 'Eligible' : 'Not eligible',
          test: !r.invitation ? 'Not invited' : attended(r) ? (RUNNING.includes(r.invitation.attempt!.status) ? 'Taking the test' : 'Attended') : 'Invited',
          result: resultsShown && visibility === 'per_candidate' && r.invitation?.attempt?.result?.passFail && r.invitation.attempt.result.releaseOverride !== 'held' ? (passed(r) ? 'Passed' : 'Not passed') : null,
        })),
      };
    });
  }
}

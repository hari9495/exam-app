import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { asDate, isCountry, isoDate, todayIst } from '../org-structure/org-validation';
import { EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { settingFor } from './probation';
import { holdersOf } from '../time/time-core';
import { displayName } from '../employee-history/employee-history.service';
import { sealValue } from './profile.service';
import type { WorkAuthDto } from './person-panels.dto';

// PPL-45 Work authorisations (Confidential, P02 §4.4; P21 deputation): the visas, permits and national IDs a person
// needs to work in a country, with the passport on file. HR holding employee.identity.view for the person reads
// them, numbers masked to the last four; employee.identity.manage adds one. The person and the HR who can record the
// renewal (employee.identity.manage over them) are reminded before each expires (company setting), and an expired
// employment visa or work permit stops payroll approval (runs pre-flight).

const DAY = 86_400_000;

@Injectable()
export class WorkAuthService {
  private readonly logger = new Logger(WorkAuthService.name);

  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  /** HR with `key` for the person today; never their own record or while acting for someone else. */
  private async gate(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string, key: 'employee.identity.view' | 'employee.identity.manage') {
    const a = await this.history.access(tx, c, v, employeeId);
    if (a.self || v.actingForOther || !(await this.history.reaches(tx, c, v, key, employeeId, todayIst()))) throw new ForbiddenException('Work authorisations are for HR with identity access for this person.');
  }

  list(ctx: TenantContext, v: Viewer, employeeId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.gate(tx, c, v, employeeId, 'employee.identity.view');
      const rows = await tx.workAuthorisation.findMany({ where: { organizationId: org, employeeId }, orderBy: { expiresOn: 'asc' } });
      const passport = await tx.employeeIdentifiers.findFirst({ where: { organizationId: org, employeeId, passportLast4: { not: null } }, select: { passportLast4: true, passportExpiresOn: true } });
      const job = await tx.employment.findFirst({ where: { organizationId: org, employeeId, exitedOn: null }, orderBy: { joinedOn: 'desc' }, select: { id: true, legalEntityId: true } });
      const now = job ? await tx.employeeAssignment.findFirst({ where: { organizationId: org, employmentId: job.id, supersededAt: null, validFrom: { lte: asDate(todayIst()) } }, orderBy: { validFrom: 'desc' }, select: { designationId: true } }) : null;
      const designation = now?.designationId ? ((await tx.designation.findFirst({ where: { organizationId: org, id: now.designationId }, select: { name: true } }))?.name ?? null) : null;
      const reminders = await this.reminderDays(tx, c, job?.legalEntityId ?? '');
      return {
        designation,
        reminderDays: reminders,
        rows: [
          ...rows.map((r) => ({ id: r.id, kind: r.kind, country: r.country, number: `XXXX-${r.numberLast4}`, sponsor: r.sponsor, occupation: r.occupation, issuedOn: r.issuedOn ? isoDate(r.issuedOn) : null, expiresOn: isoDate(r.expiresOn), remindedDays: r.remindedDays })),
          ...(passport?.passportExpiresOn ? [{ id: 'passport', kind: 'passport', country: null, number: `XXXX${passport.passportLast4}`, sponsor: null, occupation: null, issuedOn: null, expiresOn: isoDate(passport.passportExpiresOn), remindedDays: [] as number[] }] : []),
        ],
      };
    });
  }

  add(ctx: TenantContext, v: Viewer, employeeId: string, dto: WorkAuthDto) {
    return this.history.run(ctx, async (tx, c) => {
      await this.gate(tx, c, v, employeeId, 'employee.identity.manage');
      if (!isCountry(dto.country)) throw new BadRequestException('Choose the country.');
      if (dto.issuedOn && dto.expiresOn <= dto.issuedOn) throw new BadRequestException('The expiry date must be after the issue date.');
      const number = dto.number.replace(/\s+/g, '').toUpperCase();
      const row = await tx.workAuthorisation.create({
        data: {
          organizationId: c.organizationId,
          employeeId,
          kind: dto.kind,
          country: dto.country,
          numberEnc: sealValue(this.crypto, c.organizationId, employeeId, number),
          numberLast4: number.slice(-4),
          sponsor: dto.sponsor?.trim() || null,
          occupation: dto.occupation?.trim() || null,
          issuedOn: dto.issuedOn ? asDate(dto.issuedOn) : null,
          expiresOn: asDate(dto.expiresOn),
          createdBy: c.userId ?? null,
        },
      });
      await audit(tx, c, 'employee.work_auth.added', 'employee', employeeId, { id: row.id, kind: row.kind, country: row.country, expiresOn: dto.expiresOn });
      return { id: row.id };
    });
  }

  private async entityOf(tx: Tx, c: CompanyContext, employeeId: string) {
    return (await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId }, orderBy: { joinedOn: 'desc' }, select: { legalEntityId: true } }))?.legalEntityId ?? '';
  }

  /** Days before expiry the company reminds at, largest first ("off": none). */
  private async reminderDays(tx: Tx, c: CompanyContext, legalEntityId: string): Promise<number[]> {
    const value = await settingFor(tx, c, 'work_auth.reminder_days', { legalEntityId });
    return value === 'off' ? [] : value.split(',').map(Number);
  }

  /** Daily: each reminder day reached tells the person once (in the app and by email). */
  async remind(today = todayIst()): Promise<number> {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const due = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.workAuthorisation.findMany({ where: { expiresOn: { gt: asDate(today), lte: new Date(asDate(today).getTime() + 90 * DAY) } }, distinct: ['organizationId'], select: { organizationId: true } }));
    let sent = 0;
    for (const { organizationId } of due) {
      const ctx = { organizationId, isSuperAdmin: false };
      try {
        const notes = await this.tenantPrisma.forTenant(ctx, async (tx) => {
          const c = { ...ctx, organizationId } as CompanyContext;
          const out: { userIds: string[]; text: string; employeeId: string; hr: boolean }[] = [];
          const rows = await tx.workAuthorisation.findMany({ where: { organizationId, expiresOn: { gt: asDate(today), lte: new Date(asDate(today).getTime() + 90 * DAY) } } });
          for (const r of rows) {
            const left = Math.round((r.expiresOn.getTime() - asDate(today).getTime()) / DAY);
            // The latest reminder day reached, once: one that went at it or a later day already covers it.
            const passed = (await this.reminderDays(tx, c, await this.entityOf(tx, c, r.employeeId))).filter((d) => left <= d);
            if (!passed.length) continue;
            const day = Math.min(...passed);
            if (r.remindedDays.some((x) => x <= day)) continue;
            await tx.workAuthorisation.update({ where: { id: r.id }, data: { remindedDays: [...r.remindedDays, day] } });
            await audit(tx, c, 'employee.work_auth.reminded', 'employee', r.employeeId, { id: r.id, daysLeft: left });
            const e = await tx.employee.findFirstOrThrow({ where: { organizationId, id: r.employeeId } });
            const what = KIND_LABEL[r.kind] ?? 'work permit';
            if (e.userId) out.push({ userIds: [e.userId], employeeId: r.employeeId, hr: false, text: `Your ${what} expires on ${isoDate(r.expiresOn)}, in ${left} days. Talk to HR about renewing it.` });
            // Founder 27 Oct 2026: HR is reminded too, never about themselves.
            const hr = (await holdersOf(tx, organizationId, 'employee.identity.manage', r.employeeId, today)).filter((u) => u !== e.userId);
            if (hr.length) out.push({ userIds: hr, employeeId: r.employeeId, hr: true, text: `${displayName(e)}'s ${what} expires on ${isoDate(r.expiresOn)}, in ${left} days. Record the renewal on their Work authorisations tab.` });
          }
          return out;
        });
        for (const n of notes) {
          sent += n.userIds.length;
          await this.notifications
            .notifySystem(ctx, n.userIds, n.hr ? 'work_auth.expiring' : 'document.expiring', { entityType: 'employee', entityId: n.employeeId, contextText: n.text, linkPath: n.hr ? `/yx/people/directory/${n.employeeId}` : '/yx/me/documents' }, { subject: n.hr ? 'A work permit or visa expires soon' : 'Your work permit or visa expires soon', html: `<p>${n.text}</p>` })
            .catch(() => undefined);
        }
      } catch (e) {
        this.logger.warn(`work permit reminders ${organizationId}: ${(e as Error).message}`);
      }
    }
    return sent;
  }
}

const KIND_LABEL: Record<string, string> = { employment_visa: 'employment visa', residence_visa: 'residence visa', work_permit: 'work permit', national_id: 'national ID' };

/** Payroll pre-flight: people whose latest employment visa or work permit for the entity's country has expired by `on`. */
export async function lapsedWorkPermits(tx: Tx, organizationId: string, country: string, employeeIds: readonly string[], on: Date): Promise<string[]> {
  if (!employeeIds.length) return [];
  const rows = await tx.workAuthorisation.groupBy({ by: ['employeeId'], where: { organizationId, country, kind: { in: ['employment_visa', 'work_permit'] }, employeeId: { in: [...employeeIds] } }, _max: { expiresOn: true } });
  return rows.filter((r) => r._max.expiresOn && r._max.expiresOn < on).map((r) => r.employeeId);
}

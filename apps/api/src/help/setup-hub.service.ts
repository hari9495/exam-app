import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { withPayScope } from '../payroll/pay-access';

// Answer 952 (11 Nov 2026): the set-up hub (PLT-08) shows, per area, how much of its set-up is done, from what each area
// already knows: its own records and the company rules it has saved (the settings registry). It asks nothing new; each
// check names the set-up page that completes it. Blocking checks are the ones an area cannot work without; the others are
// advisory, and "company rules reviewed" counts YukthiX starter defaults the company has not touched yet.

export interface HubCheck {
  id: string;
  label: string;
  blocking: boolean;
  done: boolean;
  starter?: boolean;
  href: string;
}
export interface HubArea {
  id: string;
  name: string;
  owner: string;
  checks: HubCheck[];
}

/** Registry key prefixes each area's company rules live under ("reviewed" once the company saved one of them). */
const RULES: Record<string, string[]> = {
  org: ['employee_change.', 'promotion.', 'transfer.', 'probation.', 'contract.', 'joining.', 'work.'],
  people: ['employee.', 'home.', 'work_auth.'],
  access: ['access.', 'privacy.'],
  time: ['attendance.', 'leave.'],
  payroll: ['payroll.', 'pay.'],
};

@Injectable()
export class SetupHubService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  hub(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = { organizationId: c.organizationId };
      const live = { ...org, archivedAt: null };
      const rules = async (area: string) => (await this.rulesSaved(tx, c, RULES[area]!)) > 0;
      const check = (id: string, label: string, blocking: boolean, done: boolean, href: string, starter = false): HubCheck => ({ id, label, blocking, done, href, ...(starter ? { starter } : {}) });
      const [entities, locations, departments, designations, types] = await Promise.all([
        tx.legalEntity.count({ where: live }),
        tx.location.count({ where: live }),
        tx.department.count({ where: live }),
        tx.designation.count({ where: live }),
        tx.employmentType.count({ where: live }),
      ]);
      const areas: HubArea[] = [
        {
          id: 'org',
          name: 'Organisation',
          owner: 'HR',
          checks: [
            check('entities', 'Legal entities', true, entities > 0, '/yx/settings/legal-entities'),
            check('locations', 'Locations', true, locations > 0, '/yx/settings/locations'),
            check('structure', 'Departments, designations and employment types', true, departments > 0 && designations > 0 && types > 0, '/yx/settings/structure'),
            check('org-rules', 'Company rules reviewed', false, await rules('org'), '/yx/settings/company-rules', true),
          ],
        },
        await this.people(tx, c, await rules('people')),
        {
          id: 'access',
          name: 'Roles & access',
          owner: 'System Admin',
          checks: [
            check('second-admin', 'A second System Admin', false, (await tx.user.count({ where: { ...org, role: 'org_admin', status: 'active' } })) > 1, '/yx/settings/access'),
            check('roles', 'Roles for HR, managers and payroll', false, (await tx.permissionProfile.count({ where: { ...org, archivedAt: null } })) > 0, '/yx/settings/access'),
            check('access-rules', 'Access and privacy rules reviewed', false, await rules('access'), '/yx/settings/access-settings', true),
          ],
        },
      ];
      if ((await settingFor(tx, c, 'setup.hub.time', { legalEntityId: '' })) === 'on') {
        const [leaveTypes, policies, calendars, shifts] = await Promise.all([
          tx.leaveType.count({ where: { ...org, active: true } }),
          tx.leavePolicy.count({ where: { ...org, archivedAt: null } }),
          tx.holidayCalendar.count({ where: org }),
          tx.shift.count({ where: { ...org, active: true } }),
        ]);
        areas.push({
          id: 'time',
          name: 'Time & Leave',
          owner: 'HR',
          checks: [
            check('leave-types', 'Leave types', true, leaveTypes > 0, '/yx/time/setup'),
            check('leave-policies', 'Leave policies', true, policies > 0, '/yx/time/setup'),
            check('holidays', 'Holiday calendars', true, calendars > 0, '/yx/time/setup/holidays'),
            check('shifts', 'Shifts', false, shifts > 0, '/yx/time/shifts-setup'),
            check('time-rules', 'Attendance rules reviewed', false, await rules('time'), '/yx/settings/company-rules', true),
          ],
        });
      }
      if ((await settingFor(tx, c, 'setup.hub.payroll', { legalEntityId: '' })) === 'on') {
        // Pay set-up tables sit behind the pay guard; only whether rows exist is read, for every entity, server-side.
        const all = (await tx.legalEntity.findMany({ where: org, select: { id: true } })).map((e) => e.id);
        const [groups, components, templates] = await withPayScope(tx, all, () =>
          Promise.all([
            tx.payGroup.count({ where: { ...org, status: 'active' } }),
            tx.payComponent.count({ where: { ...org, status: 'active' } }),
            tx.salaryTemplate.count({ where: { ...org, status: 'active' } }),
          ]),
        );
        areas.push({
          id: 'payroll',
          name: 'Payroll',
          owner: 'Payroll admin',
          checks: [
            check('pay-groups', 'Pay groups', true, groups > 0, '/yx/payroll/pay-groups'),
            check('components', 'Salary components', true, components > 0, '/yx/payroll/components'),
            check('templates', 'Salary templates', true, templates > 0, '/yx/payroll/templates'),
            check('pay-rules', 'Payroll rules reviewed', false, await rules('payroll'), '/yx/settings/payroll-rules', true),
          ],
        });
      }
      return areas;
    });
  }

  /** People: someone is employed today, everyone but the top person has a manager, and letters are set up. */
  private async people(tx: Tx, c: CompanyContext, reviewed: boolean): Promise<HubArea> {
    const today = todayIst();
    const [{ employed, unmanaged }] = await tx.$queryRaw<{ employed: bigint; unmanaged: bigint }[]>`
      SELECT count(*) AS employed,
             count(*) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM employee_assignments a WHERE a.organization_id = e.organization_id AND a.employee_id = e.id
                 AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
                 AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date))) AS unmanaged
      FROM employees e
      WHERE e.organization_id = ${c.organizationId}::uuid
        AND EXISTS (SELECT 1 FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id
                    AND m.joined_on <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date))`;
    const letters = await tx.letterTemplate.count({ where: { organizationId: c.organizationId } });
    return {
      id: 'people',
      name: 'People',
      owner: 'HR',
      checks: [
        { id: 'employees', label: 'Employees added', blocking: true, done: employed > 0n, href: '/yx/people/import' },
        // The person at the top has no manager; anyone else without one is a gap.
        { id: 'managers', label: 'A manager for everyone but the top person', blocking: false, done: employed > 0n && unmanaged <= 1n, href: '/yx/people' },
        { id: 'letters', label: 'Letter templates', blocking: false, done: letters > 0, href: '/yx/settings/letters', starter: true },
        { id: 'people-rules', label: 'Employee record rules reviewed', blocking: false, done: reviewed, href: '/yx/settings/company-rules', starter: true },
      ],
    };
  }

  private async rulesSaved(tx: Tx, c: CompanyContext, prefixes: string[]): Promise<number> {
    const like = Prisma.join(prefixes.map((p) => Prisma.sql`s.key LIKE ${`${p}%`}`), ' OR ');
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM settings s WHERE s.organization_id = ${c.organizationId}::uuid AND (${like})`;
    return Number(n);
  }
}

import { Prisma } from '@prisma/client';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';

// Learning keys (migration 20261207000000_learning):
//   learning.manage        build and publish courses, set assignment rules (company-wide)
//   learning.report.view   completion and compliance of people in scope; remind people who are overdue
// The employee works on their own learning; a manager sees their team (the implicit view, YX-SEC-04).
export const LEARNING_KEYS = ['learning.manage', 'learning.report.view'] as const;

export interface JobToday {
  employeeId: string;
  userId: string | null;
  name: string;
  legalEntityId: string;
  locationId: string;
  departmentId: string;
  department: string;
  designation: string;
  managerEmployeeId: string | null;
}

/**
 * Everyone working today with their job in force: entity, location, department, designation and manager. `only`
 * narrows it to some employees (the rest of Learning filters the scope separately).
 */
export async function jobsToday(tx: Tx, c: CompanyContext, today: string, only?: readonly string[]): Promise<JobToday[]> {
  const ids = only ? [...new Set(only)] : null;
  if (ids && !ids.length) return [];
  const rows = await tx.$queryRaw<
    { employee_id: string; user_id: string | null; given_name: string; family_name: string | null; preferred_name: string | null; legal_entity_id: string; location_id: string; department_id: string; department: string; designation: string; manager_employee_id: string | null }[]
  >`
    SELECT DISTINCT ON (a.employee_id) a.employee_id::text, e.user_id::text, e.given_name, e.family_name, e.preferred_name,
      a.legal_entity_id::text, a.location_id::text, a.department_id::text, d.name AS department, g.name AS designation, a.manager_employee_id::text
    FROM employee_assignments a
    JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id
    JOIN employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id
    JOIN departments d ON d.organization_id = a.organization_id AND d.id = a.department_id
    JOIN designations g ON g.organization_id = a.organization_id AND g.id = a.designation_id
    WHERE a.organization_id = ${c.organizationId}::uuid AND a.superseded_at IS NULL
      AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
      AND m.joined_on <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
      ${ids ? Prisma.sql`AND a.employee_id = ANY(${ids}::uuid[])` : Prisma.empty}
    ORDER BY a.employee_id, a.valid_from DESC`;
  return rows.map((r) => ({
    employeeId: r.employee_id,
    userId: r.user_id,
    name: r.preferred_name || [r.given_name, r.family_name].filter(Boolean).join(' '),
    legalEntityId: r.legal_entity_id,
    locationId: r.location_id,
    departmentId: r.department_id,
    department: r.department,
    designation: r.designation,
    managerEmployeeId: r.manager_employee_id,
  }));
}

/** The signed-in person's employee record in this company, if any. */
export async function ownEmployee(tx: Tx, c: CompanyContext): Promise<string | null> {
  if (!c.userId) return null;
  return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: c.userId }, select: { id: true } }))?.id ?? null;
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

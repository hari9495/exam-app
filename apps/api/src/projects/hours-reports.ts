// T2-D 60 (answer 2871): the two hours reports in Projects › Reports. Pure shaping and CSV; the service reads the lines.

export type HoursReportKind = 'person' | 'task';

/** One timesheet line of a sent or approved week, as the report reads it. */
export interface ReportLine {
  projectId: string;
  code: string;
  employeeId: string;
  person: string;
  week: string;
  task: string | null;
  billable: boolean;
  booked: number;
  approved: number;
}

const h = (m: number) => Math.round((m / 60) * 100) / 100;

/** Hours by person: week by week, per project, billable and not (booked), and approved. */
export function byPerson(lines: ReportLine[]) {
  const rows = new Map<string, { person: string; project: string; week: string; billable: number; nonBillable: number; approved: number }>();
  for (const l of lines) {
    const k = `${l.employeeId}|${l.projectId}|${l.week}`;
    const r = rows.get(k) ?? { person: l.person, project: l.code, week: l.week, billable: 0, nonBillable: 0, approved: 0 };
    if (l.billable) r.billable += l.booked;
    else r.nonBillable += l.booked;
    r.approved += l.approved;
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => a.person.localeCompare(b.person) || a.week.localeCompare(b.week) || a.project.localeCompare(b.project)).map((r) => ({ ...r, billable: h(r.billable), nonBillable: h(r.nonBillable), approved: h(r.approved) }));
}

/** Hours by task: each project's tasks with their budget, hours booked and approved (lines with no task: "No task"). */
export function byTask(lines: ReportLine[], tasks: { projectId: string; name: string; budgetHours: number | null }[], codes: Map<string, string>) {
  const rows = new Map<string, { project: string; task: string; budget: number | null; booked: number; approved: number }>();
  for (const t of tasks) rows.set(`${t.projectId}|${t.name}`, { project: codes.get(t.projectId) ?? '', task: t.name, budget: t.budgetHours, booked: 0, approved: 0 });
  for (const l of lines) {
    const k = `${l.projectId}|${l.task ?? ''}`;
    const r = rows.get(k) ?? { project: l.code, task: l.task ?? 'No task', budget: null, booked: 0, approved: 0 };
    r.booked += l.booked;
    r.approved += l.approved;
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => a.project.localeCompare(b.project) || a.task.localeCompare(b.task)).map((r) => ({ ...r, booked: h(r.booked), approved: h(r.approved) }));
}

/** A CSV cell: quoted when needed; a leading =, +, - or @ is prefixed so a spreadsheet never runs it as a formula. */
export function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function reportCsv(kind: HoursReportKind, rows: ReturnType<typeof byPerson> | ReturnType<typeof byTask>): string {
  if (kind === 'person') return csv(['Person', 'Project', 'Week of', 'Billable hours', 'Non-billable hours', 'Approved hours'], (rows as ReturnType<typeof byPerson>).map((r) => [r.person, r.project, r.week, r.billable, r.nonBillable, r.approved]));
  return csv(['Project', 'Task', 'Budget hours', 'Booked hours', 'Approved hours'], (rows as ReturnType<typeof byTask>).map((r) => [r.project, r.task, r.budget ?? '', r.booked, r.approved]));
}

import { byPerson, byTask, cell, reportCsv, type ReportLine } from './hours-reports';

const L = (o: Partial<ReportLine>): ReportLine => ({ projectId: 'p1', code: 'NRP', employeeId: 'e1', person: 'Priya', week: '2026-11-16', task: 'Build', billable: true, booked: 600, approved: 600, ...o });

describe('T2-D 60 hours reports (answer 2871)', () => {
  it('by person: week by week per project, billable and not, and approved', () => {
    const rows = byPerson([L({}), L({ billable: false, booked: 120, approved: 0, task: 'Docs' }), L({ week: '2026-11-23', booked: 60, approved: 60 })]);
    expect(rows).toEqual([
      { person: 'Priya', project: 'NRP', week: '2026-11-16', billable: 10, nonBillable: 2, approved: 10 },
      { person: 'Priya', project: 'NRP', week: '2026-11-23', billable: 1, nonBillable: 0, approved: 1 },
    ]);
  });

  it('by task: each task with its budget, including a task with no hours and lines with no task', () => {
    const rows = byTask([L({}), L({ task: null, booked: 30, approved: 0 })], [{ projectId: 'p1', name: 'Build', budgetHours: 100 }, { projectId: 'p1', name: 'Test', budgetHours: null }], new Map([['p1', 'NRP']]));
    expect(rows).toEqual([
      { project: 'NRP', task: 'Build', budget: 100, booked: 10, approved: 10 },
      { project: 'NRP', task: 'No task', budget: null, booked: 0.5, approved: 0 },
      { project: 'NRP', task: 'Test', budget: null, booked: 0, approved: 0 },
    ]);
  });

  it('CSV: a header, quoted cells, and no formula from a name', () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell(null)).toBe('');
    expect(reportCsv('task', [{ project: 'NRP', task: 'Build', budget: null, booked: 1, approved: 0 }])).toBe('Project,Task,Budget hours,Booked hours,Approved hours\r\nNRP,Build,,1,0\r\n');
  });
});

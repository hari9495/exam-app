// G4 (item 14, ANL-06): the report library lists the reports the areas already have, each with the key that opens it
// and the question it answers. Open goes to the area's own report page; nothing is computed here. A person sees an
// entry when they hold one of its keys (or, for `manager`, when someone reports to them today).

export type Sensitivity = 'Internal' | 'Confidential';
export interface CatalogueEntry {
  id: string;
  name: string;
  question: string;
  area: string;
  href: string;
  format: string;
  sensitivity: Sensitivity;
  /** Any of these keys opens it. */
  keys: string[];
  /** A manager (someone reports to them today) sees it too. */
  manager?: boolean;
}

const PAY = 'How much do we pay, and is it right?';
const PEOPLE = 'Who is here, and when do they work?';
const SPEND = 'Where does the money go besides salaries?';
const PERF = 'How are people doing?';
const SKILLS = 'Are people trained for their work?';
const SERVICE = 'How quickly do we help people?';
const STAT = 'Statutory registers';

const pay = (id: string, name: string): CatalogueEntry => ({ id: `pay.${id}`, name, question: PAY, area: 'Payroll', href: '/yx/payroll/reports', format: 'Table · CSV', sensitivity: 'Confidential', keys: ['payroll.reports.view'] });
const exp = (id: string, name: string): CatalogueEntry => ({ id: `exp.${id}`, name, question: SPEND, area: 'Expenses', href: '/yx/expenses/reports', format: 'Table · CSV · XLSX', sensitivity: 'Internal', keys: ['expense.report.view'] });
const perf = (id: string, name: string): CatalogueEntry => ({ id: `perf.${id}`, name, question: PERF, area: 'Performance', href: '/yx/performance/reports', format: 'Table · CSV', sensitivity: 'Confidential', keys: ['perf.report.view'] });

export const REPORT_CATALOGUE: CatalogueEntry[] = [
  pay('register', 'Salary register'),
  pay('recon', 'Payroll reconciliation with last month'),
  pay('variance', 'Net pay changes over the threshold'),
  pay('ctc', 'Cost to company by department'),
  pay('arrears', 'Arrears paid'),
  pay('ytd', 'Year to date pay and TDS'),
  pay('bank', 'Bank transfer list'),
  pay('holds', 'Salaries on hold'),
  pay('gratuity', 'Gratuity provision'),
  pay('loans', 'Loan balances'),
  { id: 'pay.registers', name: 'Statutory pay registers', question: STAT, area: 'Payroll', href: '/yx/payroll/registers', format: 'PDF', sensitivity: 'Confidential', keys: ['statutory.filing.view'] },
  exp('summary', 'Approved spend by category'),
  exp('unpaid', 'Approved claims not yet paid'),
  exp('advance-ageing', 'Advances by age'),
  exp('over-limit', 'Spending over a limit'),
  exp('gst-input', 'GST input credit lines'),
  exp('approver-patterns', 'Approver patterns to review'),
  // T2-G 47 (answer 2747): headcount on each month's last day and attrition (exits ÷ average headcount).
  { id: 'people.attrition', name: 'Headcount and attrition', question: PEOPLE, area: 'People', href: '/yx/people/attrition', format: 'Table · CSV', sensitivity: 'Internal', keys: ['people.analytics.view'] },
  { id: 'time.attendance', name: 'Attendance reports', question: PEOPLE, area: 'Time', href: '/yx/time/reports', format: 'Table · CSV', sensitivity: 'Internal', keys: ['attendance.view'], manager: true },
  { id: 'time.registers', name: 'Attendance and leave registers', question: STAT, area: 'Time', href: '/yx/time/registers', format: 'PDF', sensitivity: 'Internal', keys: ['attendance.view'] },
  perf('completion', 'Review completion'),
  perf('distribution', 'Rating distribution'),
  perf('calibration-changes', 'Changes made in calibration'),
  perf('goal-alignment', 'Goal alignment'),
  perf('pip-status', 'Improvement plans'),
  { id: 'learning.compliance', name: 'Mandatory training compliance', question: SKILLS, area: 'Learning', href: '/yx/learning/compliance', format: 'Table · CSV', sensitivity: 'Internal', keys: ['learning.report.view'] },
  { id: 'learning.team', name: 'My team’s mandatory training', question: SKILLS, area: 'Learning', href: '/yx/learning/team', format: 'Table', sensitivity: 'Internal', keys: [], manager: true },
  { id: 'learning.team-skills', name: 'My team’s skills', question: SKILLS, area: 'Learning', href: '/yx/learning/skills/team', format: 'Table', sensitivity: 'Internal', keys: [], manager: true },
  { id: 'desk.sla', name: 'Helpdesk SLAs and backlog', question: SERVICE, area: 'Helpdesk', href: '/yx/desk/reports', format: 'Dashboard · CSV', sensitivity: 'Internal', keys: ['desk.report.view'] },
  { id: 'visitors.log', name: 'Visitor log', question: PEOPLE, area: 'Visitors', href: '/yx/visitors/log', format: 'Table · CSV', sensitivity: 'Internal', keys: ['visitors.log.view', 'visitors.desk.manage'] },
  { id: 'hiring.costs', name: 'Recruiting costs', question: SPEND, area: 'Hiring', href: '/yx/hiring/costs', format: 'Table', sensitivity: 'Internal', keys: ['ats.costs.manage'] },
];

export const CATALOGUE_KEYS = [...new Set(REPORT_CATALOGUE.flatMap((r) => r.keys))];

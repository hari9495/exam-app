// Fictional sample data for Learning screens (Kaveri Foods). Provider and partner names are invented.
import { d } from './perf-data';
import type { Certification, Course, Enrolment, MyTest, PersonSkill, PlayerItem, SkillSuggestion } from './learn-me';
import type { AssignmentRule, BuilderItem, ComplianceData, CourseDraft, LibrarySkill, SessionPageData, SessionRow, Trainer, TrainingNeed } from './learn-admin';

export const COURSES: Course[] = [
  { id: 'c1', title: 'Food safety and hygiene essentials', type: 'Self-paced', source: 'Kaveri Foods', duration: '2 h', skills: ['Food safety and hygiene'], cost: 0, mandatory: true, certificate: true },
  { id: 'c2', title: 'POSH awareness', type: 'SCORM', source: 'Partner pack', duration: '45 min', skills: ['Workplace conduct'], cost: 0, mandatory: true, certificate: true },
  { id: 'c3', title: 'Fire safety and evacuation', type: 'Classroom', source: 'Kaveri Foods', duration: '3 h', skills: ['Plant safety'], cost: 1200, mandatory: true, certificate: true },
  { id: 'c4', title: 'Risk-based testing', type: 'Virtual', source: 'Kaveri Foods', duration: '2 sessions × 3 h', skills: ['Test automation', 'Risk analysis'], cost: 4500, approval: true, certificate: true },
  { id: 'c5', title: 'Stakeholder management', type: 'Self-paced', source: 'Provider', provider: 'SkillBridge Learning', duration: '4 h', skills: ['Stakeholder management'], cost: 0 },
  { id: 'c6', title: 'Statistical process control', type: 'Classroom', source: 'Kaveri Foods', duration: '2 days', skills: ['SPC', 'Quality tools'], cost: 18000, approval: true, certificate: true },
  { id: 'c7', title: 'Advanced Excel for analysts', type: 'Self-paced', source: 'Provider', provider: 'SkillBridge Learning', duration: '6 h', skills: ['Excel'], cost: 0 },
  { id: 'c8', title: 'Allergen control check', type: 'Assessment only', source: 'Kaveri Foods', duration: '20 min', skills: ['Food safety and hygiene'], cost: 0 },
];

export const ENROLMENTS: Enrolment[] = [
  { id: 'e1', course: COURSES[0], status: 'In progress', source: 'Assigned by rule', due: d(15, 9), progress: 60 },
  { id: 'e2', course: COURSES[1], status: 'Overdue', source: 'Assigned by rule', due: d(20), progress: 20 },
  { id: 'e3', course: COURSES[3], status: 'Enrolled', source: 'Nominated', due: d(30, 10), progress: 0, nextSession: 'Session 1 on 8 Oct, 2:00 pm' },
  { id: 'e4', course: COURSES[5], status: 'Waitlisted', source: 'IDP', progress: 0, nextSession: 'Waitlist position 2' },
  { id: 'e5', course: COURSES[2], status: 'Completed', source: 'Assigned by rule', progress: 100 },
];

export const CERTS: Certification[] = [
  { id: 'k1', title: 'Fire safety and evacuation', issued: d(2, 10, 2025), expires: d(1, 10), badge: 'Open Badge', renewal: d(2, 9) },
  { id: 'k2', title: 'Internal auditor, ISO 22000', issued: d(14, 2, 2025), expires: d(13, 2, 2028), badge: 'Credly' },
  { id: 'k3', title: 'First aid at work', issued: d(5, 5, 2024), expires: d(4, 5, 2026) },
];

export const RECS = [
  { course: COURSES[4], reason: 'Gap in Stakeholder management for your next role, QA Lead' },
  { course: COURSES[6], reason: 'In your IDP: Excel from level 2 to 3' },
];

export const PLAYER_ITEMS: PlayerItem[] = [
  { id: 'i1', title: 'Why food safety matters at Kaveri', kind: 'Video', minutes: 8, required: true, done: true },
  { id: 'i2', title: 'Personal hygiene on the line', kind: 'Video', minutes: 14, required: true, done: true },
  { id: 'i3', title: 'Hygiene SOP, Hosur plant', kind: 'PDF', minutes: 10, required: true, done: false },
  { id: 'i4', title: 'Allergen handling simulation', kind: 'SCORM', minutes: 25, required: true, done: false },
  { id: 'i5', title: 'FSSAI guidance (external link)', kind: 'Link', minutes: 5, required: false, done: false },
  { id: 'i6', title: 'Final quiz', kind: 'Quiz', minutes: 20, required: true, done: false },
];

export const SESSION_PEOPLE = ['Rohit Bhat', 'Meera Iyer', 'Manoj Patil', 'Gurpreet Kaur', 'Imran Qureshi', 'Deepa Rao', 'Sneha Ghosh', 'Rahul Sharma'];

export const SESSIONS: SessionRow[] = [
  { id: 's1', course: 'Fire safety and evacuation', start: d(24), mode: 'Classroom', venue: 'Hosur plant, training room 2', trainer: 'Ramesh Kamath', external: true, seats: 6, enrolled: SESSION_PEOPLE.slice(0, 6), waitlist: SESSION_PEOPLE.slice(6), status: 'Completed', cost: 14400 },
  { id: 's2', course: 'Risk-based testing', start: d(8, 9), mode: 'Virtual', venue: 'Online meeting link', trainer: 'Divya Raghunathan', external: false, seats: 20, enrolled: SESSION_PEOPLE.slice(0, 5), waitlist: [], status: 'Scheduled', cost: 22500 },
  { id: 's3', course: 'Statistical process control', start: d(15, 9), mode: 'Classroom', venue: 'Bengaluru head office, room Kabini', trainer: 'Anita Deshpande', external: true, seats: 15, enrolled: SESSION_PEOPLE, waitlist: [], status: 'Scheduled', cost: 2_70_000 },
  { id: 's4', course: 'Fire safety and evacuation', start: d(28, 9), mode: 'Classroom', venue: 'Chennai office', trainer: 'Ramesh Kamath', external: true, seats: 25, enrolled: [], waitlist: [], status: 'Scheduled', cost: 0 },
];

export const SESSION_PAGE: SessionPageData = {
  session: SESSIONS[0],
  slots: ['24 Sep, 9:30 am', '24 Sep, 11:30 am', '24 Sep, 2:00 pm', '24 Sep, 4:00 pm'],
  attendance: [
    { name: 'Rohit Bhat', marks: ['Present', 'Present', 'Present', 'Present'], method: 'QR' },
    { name: 'Meera Iyer', marks: ['Present', 'Late', 'Present', 'Present'], method: 'QR' },
    { name: 'Manoj Patil', marks: ['Present', 'Present', 'Absent', 'Absent'], method: 'QR + manual' },
    { name: 'Gurpreet Kaur', marks: ['Absent', 'Absent', 'Absent', 'Absent'], method: '—' },
    { name: 'Imran Qureshi', marks: ['Present', 'Present', 'Present', 'Present'], method: 'Kiosk code' },
    { name: 'Deepa Rao', marks: ['Present', 'Present', 'Present', null], method: 'QR' },
  ],
  results: [
    { name: 'Rohit Bhat', score: 88 },
    { name: 'Meera Iyer', score: 74 },
    { name: 'Manoj Patil', score: 81 },
    { name: 'Gurpreet Kaur', score: null },
    { name: 'Imran Qureshi', score: 52 },
    { name: 'Deepa Rao', score: 90 },
  ],
  feedback: { avg: 4.4, trainer: 4.6, responses: 5, comments: ['The evacuation drill on the shop floor was the most useful part.', 'Slides in Tamil would help the night shift.'] },
  costLines: [
    { label: 'Trainer fee', amount: 12000 },
    { label: 'Extinguisher refills for the drill', amount: 1800 },
    { label: 'Printed material', amount: 600 },
  ],
};

export const VIRTUAL_PAGE: SessionPageData = {
  ...SESSION_PAGE,
  session: SESSIONS[1],
  slots: ['8 Oct, 2:00 pm', '10 Oct, 2:00 pm'],
  attendance: SESSION_PAGE.attendance.slice(0, 5).map((a) => ({ ...a, marks: [null, null], method: 'Participant report' })),
  results: [],
  meeting: { platform: 'Teams', link: 'meet.kaverifoods.in/rbt-0810', report: false },
};

export const TRAINERS: Trainer[] = [
  { id: 'tr1', name: 'Ramesh Kamath', org: 'Safe Works Training', external: true, sessions: 14, score: 4.6, accessEnds: d(26, 9) },
  { id: 'tr2', name: 'Anita Deshpande', org: 'Deccan Quality Institute', external: true, sessions: 3, score: 4.2, accessEnds: d(15, 10) },
  { id: 'tr3', name: 'Divya Raghunathan', org: 'Kaveri Foods · Quality', external: false, sessions: 2, score: null, accessEnds: null },
];

export const BUILDER_ITEMS: BuilderItem[] = PLAYER_ITEMS.map((p) => ({ id: p.id, title: p.title, kind: p.kind, minutes: p.minutes, required: p.required }));

export const PATHS = [
  { id: 'lp1', name: 'New plant supervisor track', courses: ['Food safety and hygiene essentials', 'Fire safety and evacuation', 'Statistical process control', 'Coaching on the shop floor'], certificate: true, enrolled: 12 },
];

export const RULES: AssignmentRule[] = [
  { id: 'r1', name: 'Joiners: POSH awareness', course: 'POSH awareness', population: 'Everyone, on joining', due: '30 days after joining', recurrence: 'Once', matches: 248, active: true },
  { id: 'r2', name: 'Plant staff: fire safety', course: 'Fire safety and evacuation', population: 'Hosur plant · Operations, Quality', due: '30 days', recurrence: 'Every 12 months', matches: 96, active: true },
  { id: 'r3', name: 'Food handlers: hygiene', course: 'Food safety and hygiene essentials', population: 'Operations, Quality', due: '15 days', recurrence: 'Every 12 months', matches: 118, active: true },
  { id: 'r4', name: 'Managers: code of conduct', course: 'Code of conduct', population: 'Designation contains “Manager”', due: '30 days', recurrence: 'Every 24 months', matches: 31, active: false },
];

export const COMPLIANCE: ComplianceData = {
  courses: ['POSH awareness', 'Fire safety', 'Food hygiene', 'Code of conduct', 'Information security'],
  rows: [
    { dept: 'Operations', size: 72, done: [70, 61, 64, 68, 55], assigned: [72, 72, 72, 72, 72] },
    { dept: 'Quality', size: 17, done: [17, 16, 17, 17, 15], assigned: [17, 17, 17, 17, 17] },
    { dept: 'Engineering', size: 42, done: [40, 0, 0, 39, 41], assigned: [42, 0, 0, 42, 42] },
    { dept: 'Sales', size: 30, done: [26, 0, 0, 22, 24], assigned: [30, 0, 0, 30, 30] },
    { dept: 'Finance', size: 13, done: [13, 0, 0, 13, 13], assigned: [13, 0, 0, 13, 13] },
    { dept: 'People', size: 4, done: [4, 0, 0, 4, 4], assigned: [4, 0, 0, 4, 4] },
  ],
  overdue: [
    { id: 'o1', name: 'Gurpreet Kaur', dept: 'Operations', course: 'Fire safety', due: d(10), manager: 'Manoj Patil' },
    { id: 'o2', name: 'Rahul Sharma', dept: 'Operations', course: 'Food hygiene', due: d(2), manager: 'Joseph Mathew' },
    { id: 'o3', name: 'Priya Nair', dept: 'Sales', course: 'POSH awareness', due: d(20, 7), manager: 'Aisha Khan' },
    { id: 'o4', name: 'Meera Iyer', dept: 'Quality', course: 'Information security', due: d(25), manager: 'Karthik Subramanian' },
  ],
};

export const SKILL_COLUMNS = ['Food safety', 'Test automation', 'SPC', 'Stakeholder mgmt', 'Coaching'];
export const TEAM_SKILLS = [
  { name: 'Divya Raghunathan', role: 'Senior QA Engineer', levels: [3, 4, 2, 2, 3], required: [3, 4, 2, 3, 3] },
  { name: 'Rohit Bhat', role: 'Quality Inspector', levels: [3, null, 2, 1, 1], required: [3, 1, 3, 1, 1] },
  { name: 'Meera Iyer', role: 'Quality Inspector', levels: [4, 1, 3, 2, 2], required: [3, 1, 3, 1, 1] },
  { name: 'Imran Qureshi', role: 'QA Engineer', levels: [2, 2, null, 1, 1], required: [3, 3, 1, 1, 1] },
  { name: 'Ananya Das', role: 'Quality Inspector', levels: [2, null, null, null, null], required: [3, 1, 3, 1, 1] },
];

export const MY_SKILLS: PersonSkill[] = [
  { id: 'm1', name: 'Test automation', level: 4, required: 4, source: 'Manager', evidence: 'Half-yearly review H2 FY 2025-26', updated: d(11, 3) },
  { id: 'm2', name: 'Food safety and hygiene', level: 3, required: 3, source: 'Course', evidence: 'Food safety and hygiene essentials', updated: d(18, 7) },
  { id: 'm3', name: 'SQL', level: 3, source: 'AI-confirmed', evidence: 'Data skills test, 84%', updated: d(2) },
  { id: 'm4', name: 'Stakeholder management', level: 2, required: 3, source: 'Self', evidence: 'Self-assessed', updated: d(4, 5) },
  { id: 'm5', name: 'Coaching others', level: null, required: 3, source: 'Manager', evidence: 'Not yet rated', updated: d(1, 3) },
];

export const SUGGESTIONS: SkillSuggestion[] = [
  { id: 'g1', skill: 'Allergen control', level: 3, from: 'Course', evidence: 'Completed “Allergen control check”, 92%, 20 Sep 2026' },
  { id: 'g2', skill: 'Python scripting', level: 2, from: 'Project', evidence: 'Packaging-line test harness, 140 hours logged' },
  { id: 'g3', skill: 'Supplier audits', level: 2, from: 'CV', evidence: 'CV: “Led 12 supplier audits at previous employer”' },
];

export const MY_TESTS: MyTest[] = [
  { id: 'x1', title: 'Food safety basics', source: 'Course: Food safety and hygiene essentials', due: d(15, 9), minutes: 30, status: 'Not started', passMark: 70, attemptsLeft: 2 },
  { id: 'x2', title: 'Data skills check', source: 'Skills test: SQL', due: null, minutes: 45, status: 'Passed', score: 84, passMark: 60, attemptsLeft: 0 },
  { id: 'x3', title: 'ISO 22000 internal auditor exam', source: 'Certification', due: d(20, 9), minutes: 90, status: 'Not started', passMark: 75, attemptsLeft: 1, proctored: true },
  { id: 'x4', title: 'POSH awareness quiz', source: 'Course: POSH awareness', due: d(20), minutes: 15, status: 'Failed', score: 55, passMark: 80, attemptsLeft: 1 },
];

export const NEEDS: TrainingNeed[] = [
  { id: 'n1', title: 'SPC for line inspectors', who: 'Quality · 6 people', source: 'Skill gap', skill: 'SPC', priority: 'High', status: 'Planned', plan: 'SPC session, 15 Oct', estCost: 90000 },
  { id: 'n2', title: 'Stakeholder management', who: 'Divya Raghunathan', source: 'Review gap', skill: 'Stakeholder management', priority: 'Medium', status: 'New', estCost: 0 },
  { id: 'n3', title: 'Forklift licence renewal', who: 'Operations · 9 people', source: 'Compliance', skill: 'Material handling', priority: 'High', status: 'In progress', plan: 'External, Hosur RTO', estCost: 40500 },
  { id: 'n4', title: 'Excel for sales reports', who: 'Sales, South · 5 people', source: 'Manager request', skill: 'Excel', priority: 'Low', status: 'New', estCost: 0 },
  { id: 'n5', title: 'Certified quality auditor prep', who: 'Rohit Bhat', source: 'Employee request', skill: 'Supplier audits', priority: 'Medium', status: 'New', estCost: 32000 },
  { id: 'n6', title: 'POSH refresher for managers', who: 'All managers · 31 people', source: 'Compliance', skill: 'Workplace conduct', priority: 'High', status: 'Closed', plan: 'SCORM course', estCost: 0 },
];

export const BUDGETS = [
  { dept: 'Quality', planned: 3_00_000, spent: 1_12_000, committed: 90_000 },
  { dept: 'Operations', planned: 4_50_000, spent: 3_10_000, committed: 1_60_000 },
  { dept: 'Engineering', planned: 5_00_000, spent: 1_80_000, committed: 45_000 },
  { dept: 'Sales', planned: 2_00_000, spent: 60_000, committed: 0 },
];

export const LIBRARY: LibrarySkill[] = [
  { id: 's1', domain: 'Quality', skill: 'Food safety and hygiene', synonyms: ['GMP', 'food hygiene'], starter: true, status: 'Active', views: { competency: true, tag: true, scorecard: true }, people: 118, roles: ['Quality Inspector', 'Plant Supervisor'] },
  { id: 's2', domain: 'Quality', skill: 'Statistical process control', synonyms: ['SPC', 'control charts'], starter: true, status: 'Active', views: { competency: true, tag: true, scorecard: false }, people: 22, roles: ['Quality Inspector'] },
  { id: 's3', domain: 'Quality', skill: 'Statistical process control', sub: 'Capability studies', synonyms: ['Cp', 'Cpk'], starter: false, status: 'Active', views: { competency: false, tag: true, scorecard: false }, people: 4, roles: [] },
  { id: 's4', domain: 'Technology', skill: 'Test automation', synonyms: ['automated testing'], starter: true, status: 'Active', views: { competency: true, tag: true, scorecard: true }, people: 9, roles: ['QA Engineer', 'Senior QA Engineer'] },
  { id: 's5', domain: 'Technology', skill: 'SQL', synonyms: ['database queries'], starter: true, status: 'Active', views: { competency: false, tag: true, scorecard: true }, people: 31, roles: [] },
  { id: 's6', domain: 'Business', skill: 'Stakeholder management', synonyms: [], starter: true, status: 'Active', views: { competency: true, tag: false, scorecard: true }, people: 40, roles: ['Quality Manager'] },
  { id: 's7', domain: 'Business', skill: 'Stakeholder engagement', synonyms: [], starter: false, status: 'Active', views: { competency: false, tag: false, scorecard: true }, people: 3, roles: [] },
];

export const DRAFT: CourseDraft = {
  title: 'Leave policy for plant staff',
  sources: [
    { name: 'Leave policy', version: 'v3', updated: false },
    { name: 'Hosur plant standing orders', version: 'v2' },
  ],
  lessons: [
    { id: 'l1', title: 'Types of leave you can take', summary: 'Casual, sick and earned leave, how many days each, and how they are credited each month.', cite: 'Leave policy v3, §2' },
    { id: 'l2', title: 'Applying and getting approval', summary: 'Apply in the app at least 3 days ahead for planned leave; sick leave can be applied on return with a note for 3+ days.', cite: 'Leave policy v3, §4' },
    { id: 'l3', title: 'Shift swaps and leave during peak season', summary: 'From October to December, earned leave on the line needs 2 weeks’ notice so the roster can be covered.', cite: 'Hosur standing orders v2, §11' },
  ],
  quiz: [
    { id: 'q1', q: 'How many days ahead should planned leave be applied?', options: ['1 day', '3 days', '2 weeks'], answer: 1, cite: 'Leave policy v3, §4' },
    { id: 'q2', q: 'When do you need a note for sick leave?', options: ['Always', '3 or more days', 'Never'], answer: 1, cite: 'Leave policy v3, §4.3' },
    { id: 'q3', q: 'What notice is needed for earned leave in peak season?', options: ['3 days', '1 week', '2 weeks'], answer: 2, cite: 'Hosur standing orders v2, §11' },
  ],
  reviewer: null,
};

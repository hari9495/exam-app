// Fictional sample data for Performance people screens: feedback, 1:1s, PIP, hand-over, competencies.
import type { PersonOption } from '../../components/select';
import { d, TEAM } from './perf-data';
import type { Competency, FeedbackItem, HandoverRow, OneOnOne, Pip } from './perf-people';

export const PEOPLE: PersonOption[] = [
  { id: 't1', name: 'Divya Raghunathan', role: 'Senior QA Engineer', department: 'Quality' },
  ...TEAM.slice(1).map((t) => ({ id: t.id, name: t.name, role: t.role, department: 'Quality' })),
  { id: 'x1', name: 'Karthik Subramanian', role: 'Quality Manager', department: 'Quality' },
  { id: 'x2', name: 'Manoj Patil', role: 'Plant Supervisor', department: 'Operations' },
  { id: 'x3', name: 'Gurpreet Kaur', role: 'Shift Lead', department: 'Operations' },
];

export const MEERA_GOALS = [
  { value: 'g1', label: 'Reduce seal-strength rejects on line 3' },
  { value: 'g2', label: 'Train two inspectors on the new checklist' },
];

export const RECEIVED: FeedbackItem[] = [
  { id: 'r1', from: 'Meera Iyer', to: 'Divya Raghunathan', kind: 'Praise', text: 'Your checklist for the line-3 changeover saved us two hours on Friday.', at: d(24), visibility: 'Them and their manager' },
  { id: 'r2', from: 'Karthik Subramanian', to: 'Divya Raghunathan', kind: 'Suggestion', text: 'Share the test plan earlier with the plant team so they can book the line.', at: d(11), goal: 'Automate regression tests', visibility: 'Only them' },
  { id: 'r3', from: 'Manoj Patil', to: 'Divya Raghunathan', kind: 'Praise', text: 'The label-printer mock you built means we no longer stop the line to test.', at: d(2), visibility: 'Them, their manager and HR' },
];
export const GIVEN: FeedbackItem[] = [
  { id: 'g1', from: 'Divya Raghunathan', to: 'Imran Qureshi', kind: 'Suggestion', text: 'Add the batch number to every defect ticket so the plant can trace it quickly.', at: d(17), visibility: 'Only them' },
];
export const REQUESTS = [{ id: 'q1', from: 'Rohit Bhat', about: 'How I ran the supplier audit at Hosur', at: d(27) }];

export const ONE_ON_ONES: OneOnOne[] = [
  {
    id: 'o1',
    employee: 'Meera Iyer',
    manager: 'Karthik Subramanian',
    role: 'Quality Inspector',
    cadence: 'Every 2 weeks',
    next: d(1, 9),
    last: d(2, 7),
    agenda: [
      { id: 'a1', text: 'Seal-strength rejects on line 3: what changed in August', by: 'Meera Iyer' },
      { id: 'a2', text: 'Half-yearly self review: questions', by: 'Meera Iyer' },
    ],
    shared: 'Agreed to trial the new torque check on the night shift for two weeks.',
    privateNote: 'Seems stretched since the night-shift move. Ask how the rota is working.',
    actions: [
      { id: 'x1', text: 'Share August reject data by batch', owner: 'Meera Iyer', due: d(30), done: false, goal: 'Reduce seal-strength rejects on line 3' },
      { id: 'x2', text: 'Book torque-gauge calibration', owner: 'Karthik Subramanian', due: d(25), done: true },
    ],
    history: [{ at: d(2, 7), summary: 'Night-shift trial agreed' }],
  },
  {
    id: 'o2',
    employee: 'Divya Raghunathan',
    manager: 'Karthik Subramanian',
    role: 'Senior QA Engineer',
    cadence: 'Every 2 weeks',
    next: d(1, 9),
    last: d(19),
    agenda: [{ id: 'b1', text: 'Top 20 flaky tests', by: 'Karthik Subramanian' }],
    shared: 'Flaky rate down to 6%.',
    privateNote: '',
    actions: [{ id: 'y1', text: 'List the top 20 flaky tests', owner: 'Divya Raghunathan', due: d(1, 9), done: false, goal: 'Automate regression tests' }],
    history: [],
  },
  { id: 'o3', employee: 'Rohit Bhat', manager: 'Karthik Subramanian', role: 'Quality Inspector', cadence: 'Monthly', next: d(8, 9), last: d(8), agenda: [], shared: '', privateNote: '', actions: [], history: [] },
];

export const SUGGESTED_AGENDA = [
  { id: 's1', text: 'Line-3 rejects goal is off track: agree one next step', why: 'Goal “Reduce seal-strength rejects” is off track since 12 Sep' },
  { id: 's2', text: 'Recognise the changeover checklist', why: 'Two colleagues praised it this month' },
  { id: 's3', text: 'Follow up: August reject data by batch', why: 'Open action from your last 1:1 (due 30 Sep)' },
];

export const PIP: Pip = {
  id: 'pip1',
  employee: 'Imran Qureshi',
  role: 'QA Engineer · Quality',
  manager: 'Karthik Subramanian',
  hr: 'Lakshmi Venkatesan',
  status: 'Active',
  start: d(1, 7),
  days: 60,
  reason: 'Test cases for the last three releases were submitted after the release date, and 9 of 14 escaped defects in Q1 were in areas Imran signed off.',
  goals: [
    { id: 'g1', text: 'Submit test cases 3 working days before each release', measure: 'All 4 releases in the plan period', status: 'In progress' },
    { id: 'g2', text: 'No escaped defects above severity 2 in signed-off areas', measure: 'Defect tracker, plan period', status: 'In progress' },
    { id: 'g3', text: 'Complete “Risk-based testing” course', measure: 'Course completion in Learning', status: 'Met' },
  ],
  support: ['Weekly pairing with Divya Raghunathan on test design', '“Risk-based testing” course paid by the company', 'Release calendar shared 2 weeks ahead'],
  checkIns: [
    { at: d(11, 7), by: 'Karthik Subramanian', note: 'Cases for release 7.2 in 2 days early.', rating: 'On track' },
    { at: d(21, 7), by: 'Karthik Subramanian', note: 'One severity-2 escape in the export module.', rating: 'Some progress' },
    { at: d(31, 7), by: 'Karthik Subramanian', note: 'Course finished; pairing going well.', rating: 'On track' },
  ],
  acknowledgement: { at: d(3, 7), comment: 'I’d like the release dates confirmed earlier.' },
  approval: [
    { id: 'a1', label: 'Proposed', status: 'done', approver: 'Karthik Subramanian', at: d(26, 6) },
    { id: 'a2', label: 'HR approval', status: 'done', approver: 'Lakshmi Venkatesan', at: d(29, 6), comment: 'Support plan is clear.' },
    { id: 'a3', label: 'Employee acknowledgement', status: 'done', approver: 'Imran Qureshi', at: d(3, 7) },
  ],
};

export const PIP_PROPOSED: Pip = {
  ...PIP,
  id: 'pip2',
  employee: 'Rahul Sharma',
  role: 'Warehouse Associate · Operations',
  manager: 'Joseph Mathew',
  status: 'Proposed',
  start: d(5, 9),
  days: 30,
  checkIns: [],
  acknowledgement: null,
  reason: 'Pick accuracy fell to 94% in August against a team target of 99%.',
  goals: [{ id: 'g1', text: 'Pick accuracy at or above 99% each week', measure: 'Warehouse scanner report', status: 'Not started' }],
  support: ['Buddy on the first two shifts each week', 'Refresher on the scanner workflow'],
  approval: [
    { id: 'a1', label: 'Proposed', status: 'done', approver: 'Joseph Mathew', at: d(28) },
    { id: 'a2', label: 'HR approval', status: 'current', approver: 'Lakshmi Venkatesan' },
    { id: 'a3', label: 'Employee acknowledgement', status: 'pending', approver: 'Rahul Sharma' },
  ],
};

export const PIP_TO_ACK: Pip = { ...PIP, status: 'Active', checkIns: [], acknowledgement: null, start: d(28) };
export const PIP_NOT_MET: Pip = { ...PIP, status: 'Closed: not met', goals: PIP.goals.map((g, i) => ({ ...g, status: i === 2 ? 'Met' : 'Not met' })) };

export const HANDOVER: HandoverRow[] = [
  { id: 'h1', employee: 'Ravi Menon', artefact: 'Manager review stage', detail: 'Half-yearly H1: manager review pending', from: 'Priya Nair', to: 'Karthik Subramanian', effective: d(1), status: 'Moved' },
  { id: 'h2', employee: 'Ravi Menon', artefact: '1:1 thread', detail: 'Shared notes and 2 open actions', from: 'Priya Nair', to: 'Karthik Subramanian', effective: d(1), status: 'Moved', note: 'Private notes stayed with Priya Nair' },
  { id: 'h3', employee: 'Sana Nizami', artefact: '360° nominations', detail: '4 nominations awaiting approval', from: 'Priya Nair', to: 'Karthik Subramanian', effective: d(1), status: 'Moved' },
  { id: 'h4', employee: 'Sana Nizami', artefact: 'Goal parent', detail: '“Ship lab LIMS upgrade” was under Priya’s personal goal', from: 'Priya Nair', to: 'Karthik Subramanian', effective: d(1), status: 'Needs decision' },
  { id: 'h5', employee: 'Thomas George', artefact: 'Comp proposal', detail: 'Increment 9% (draft)', from: 'Priya Nair', to: 'Karthik Subramanian', effective: d(1), status: 'Moved' },
  { id: 'h6', employee: '6 people', artefact: 'Calibration session', detail: 'Quality lab calibration, 14 Oct', from: 'Priya Nair', to: 'HR to reassign', effective: d(1), status: 'Needs decision' },
  { id: 'h7', employee: 'Deepa Rao', artefact: 'PIP', detail: 'Check-ins 2 of 3 held', from: 'Priya Nair', to: 'Karthik Subramanian', effective: d(1), status: 'Moved' },
];

const L5 = (a: string, b: string, c: string, d2: string, e: string) => [a, b, c, d2, e];
export const COMPETENCIES: Competency[] = [
  {
    id: 'k1',
    name: 'Food safety and hygiene',
    group: 'Functional',
    description: 'Applies FSSAI and plant hygiene standards in daily work and spots risks early.',
    starter: false,
    status: 'Active',
    levels: L5('Follows the checklist with help', 'Follows standards without reminders', 'Spots and fixes common risks', 'Improves standards for a line', 'Sets standards across plants'),
    roles: [
      { role: 'Quality Inspector', level: 3 },
      { role: 'Plant Supervisor', level: 4 },
      { role: 'Quality Manager', level: 5 },
    ],
    usedIn: ['Half-yearly review', 'Annual review', 'Probation review'],
    skillsTest: 'Food safety basics (20 questions)',
  },
  {
    id: 'k2',
    name: 'Ownership',
    group: 'Core',
    description: 'Takes responsibility for results and follows through.',
    starter: true,
    status: 'Active',
    levels: L5('Completes assigned tasks', 'Follows up without being asked', 'Owns outcomes for own area', 'Owns outcomes across teams', 'Builds a culture of ownership'),
    roles: [{ role: 'All employees', level: 3 }],
    usedIn: ['Half-yearly review', 'Annual review'],
  },
  { id: 'k3', name: 'Test automation', group: 'Functional', description: 'Designs and maintains automated tests.', starter: false, status: 'Active', levels: L5('Runs existing suites', 'Writes simple tests', 'Designs suites for a module', 'Designs frameworks', 'Sets automation strategy'), roles: [{ role: 'QA Engineer', level: 3 }, { role: 'Senior QA Engineer', level: 4 }], usedIn: ['Half-yearly review'] },
  { id: 'k4', name: 'Coaching others', group: 'Leadership', description: 'Helps others grow through feedback and guidance.', starter: true, status: 'Active', levels: L5('Shares knowledge when asked', 'Gives regular feedback', 'Coaches one or two people', 'Builds coaching into the team', 'Develops leaders'), roles: [{ role: 'Senior QA Engineer', level: 3 }, { role: 'Quality Manager', level: 4 }], usedIn: ['Annual review'] },
  { id: 'k5', name: 'Manual inspection records', group: 'Functional', description: 'Paper-based inspection logs (replaced by digital checklists).', starter: false, status: 'Retired', levels: L5('1', '2', '3', '4', '5'), roles: [], usedIn: ['Annual review FY 2024-25'] },
];

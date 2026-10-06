// Fictional sample data for Proctoring (PRC) and Analytics (ANL) screens. Deterministic; dates relative to TODAY (29 Sep 2026).
import type { LiveTileData, SignalCount } from './proctoring-logic';
import type { FlagEvent, SystemCheck } from './proctoring-kit';

export const d = (day: number, month = 8, h = 10, m = 0) => new Date(2026, month, day, h, m);

export const PEOPLE = {
  owner: 'Neha Joshi',
  author: 'Pranav Kulkarni',
  reviewer: 'Farah Siddiqui',
  reviewer2: 'Gopal Menon',
  proctor: 'Ritika Bansal',
  evaluator: 'Arvind Swamy',
  candidate: 'Arjun Nair',
};

/* ---------- Question bank (T01) ---------- */

export type QStatus = 'Draft' | 'In review' | 'Approved' | 'Retired';
export interface QuestionRow {
  id: string;
  stem: string;
  type: string;
  skill: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  status: QStatus;
  version: number;
  languages: string[];
  collection: string;
  served: number;
  pCorrect: number | null;
  discrimination: number | null;
  exposure: number | null;
  source: 'Our team' | 'AI-drafted' | 'Imported' | 'YukthiX starter';
  updated: Date;
  dif?: 'A' | 'B' | 'C';
}

export const DIFFICULTY_LABEL = ['', 'Very easy', 'Easy', 'Medium', 'Hard', 'Very hard'];

export const QUESTIONS: QuestionRow[] = [
  { id: 'Q-1042', stem: 'Which Java Stream operation is lazy and returns a new stream?', type: 'Single choice', skill: 'Java › Streams API', difficulty: 3, status: 'Approved', version: 2, languages: ['English', 'Hindi'], collection: 'Backend L2', served: 1284, pCorrect: 0.62, discrimination: 0.41, exposure: 0.22, source: 'Our team', updated: d(14), dif: 'A' },
  { id: 'Q-1043', stem: 'Write a function that returns the k most frequent words in a list.', type: 'Code', skill: 'Java › Collections', difficulty: 4, status: 'Approved', version: 1, languages: ['English'], collection: 'Backend L2', served: 842, pCorrect: 0.38, discrimination: 0.52, exposure: 0.31, source: 'Our team', updated: d(2), dif: 'A' },
  { id: 'Q-1051', stem: 'A dispatch van covers 180 km in 3 hours. At the same speed, how far in 5 hours?', type: 'Single choice', skill: 'Aptitude › Speed and distance', difficulty: 2, status: 'Approved', version: 1, languages: ['English', 'Hindi', 'Tamil', 'Telugu'], collection: 'Campus aptitude', served: 5310, pCorrect: 0.81, discrimination: 0.28, exposure: 0.44, source: 'YukthiX starter', updated: d(10, 7) },
  { id: 'Q-1060', stem: 'Explain how you would reduce food-safety deviations on a packing line.', type: 'Descriptive', skill: 'Quality › Food safety', difficulty: 3, status: 'In review', version: 3, languages: ['English'], collection: 'Quality supervisors', served: 0, pCorrect: null, discrimination: null, exposure: null, source: 'Our team', updated: d(28), dif: undefined },
  { id: 'Q-1061', stem: 'Write a SQL query that lists outlets with no orders in the last 30 days.', type: 'SQL', skill: 'Data › SQL joins', difficulty: 3, status: 'Draft', version: 1, languages: ['English'], collection: 'Data analyst L1', served: 0, pCorrect: null, discrimination: null, exposure: null, source: 'AI-drafted', updated: d(29, 8, 9, 10) },
  { id: 'Q-1062', stem: 'Arrange these HACCP steps in the order they are applied.', type: 'Ordering', skill: 'Quality › HACCP', difficulty: 2, status: 'Approved', version: 1, languages: ['English', 'Tamil'], collection: 'Quality supervisors', served: 412, pCorrect: 0.71, discrimination: 0.19, exposure: 0.12, source: 'Our team', updated: d(3), dif: 'C' },
  { id: 'Q-1070', stem: 'Type the passage shown for 2 minutes.', type: 'Typing', skill: 'Office › Typing', difficulty: 2, status: 'Approved', version: 1, languages: ['English'], collection: 'Customer care', served: 620, pCorrect: null, discrimination: null, exposure: 0.08, source: 'YukthiX starter', updated: d(2, 7) },
  { id: 'Q-1071', stem: 'Reply to the upset distributor in the chat simulation.', type: 'Role-play', skill: 'Customer care › De-escalation', difficulty: 3, status: 'In review', version: 1, languages: ['English'], collection: 'Customer care', served: 0, pCorrect: null, discrimination: null, exposure: null, source: 'AI-drafted', updated: d(27) },
  { id: 'Q-0911', stem: 'Which statement about Java 7 PermGen is true?', type: 'Single choice', skill: 'Java › JVM', difficulty: 3, status: 'Retired', version: 2, languages: ['English'], collection: 'Backend L2', served: 3120, pCorrect: 0.55, discrimination: 0.22, exposure: 0.35, source: 'Our team', updated: d(1, 5) },
  { id: 'Q-1080', stem: 'Calculate the net weight after 3 % moisture loss on 250 kg of flour.', type: 'Fill in the blank', skill: 'Aptitude › Percentages', difficulty: 2, status: 'Approved', version: 1, languages: ['English', 'Hindi'], collection: 'Campus aptitude', served: 2210, pCorrect: 0.66, discrimination: 0.37, exposure: 0.29, source: 'Our team', updated: d(20, 7) },
];

export const SKILL_TREE = [
  { domain: 'Software engineering', skills: ['Java › Streams API', 'Java › Collections', 'Java › JVM', 'Data › SQL joins'] },
  { domain: 'Aptitude', skills: ['Aptitude › Speed and distance', 'Aptitude › Percentages'] },
  { domain: 'Quality & food safety', skills: ['Quality › Food safety', 'Quality › HACCP'] },
  { domain: 'Customer care', skills: ['Customer care › De-escalation', 'Office › Typing'] },
];

/* ---------- Tests (T02) ---------- */

export interface TestRow {
  id: string;
  name: string;
  mode: 'Fixed' | 'Randomised' | 'Adaptive';
  proctoring: 'Open' | 'AI-only' | 'Record & review' | 'Live';
  version: number;
  status: 'Draft' | 'In approval' | 'Published' | 'Archived';
  attempts: number;
  alpha: number | null;
}
export const TESTS: TestRow[] = [
  { id: 'T-21', name: 'Java Backend Developer · L2', mode: 'Randomised', proctoring: 'Record & review', version: 3, status: 'Published', attempts: 842, alpha: 0.84 },
  { id: 'T-22', name: 'Campus aptitude 2026', mode: 'Randomised', proctoring: 'AI-only', version: 2, status: 'Published', attempts: 5310, alpha: 0.79 },
  { id: 'T-23', name: 'Quality supervisor certification', mode: 'Fixed', proctoring: 'Live', version: 1, status: 'In approval', attempts: 0, alpha: null },
  { id: 'T-24', name: 'Data analyst · L1', mode: 'Adaptive', proctoring: 'Record & review', version: 1, status: 'Draft', attempts: 0, alpha: null },
];

export interface BlueprintCell {
  skill: string;
  counts: [number, number][]; // [needed, available] per difficulty 1–5
}
export const BLUEPRINT: BlueprintCell[] = [
  { skill: 'Java › Streams API', counts: [[0, 4], [2, 9], [3, 12], [2, 5], [0, 1]] },
  { skill: 'Java › Collections', counts: [[0, 3], [1, 6], [2, 8], [2, 7], [1, 2]] },
  { skill: 'Data › SQL joins', counts: [[0, 2], [1, 5], [2, 7], [1, 3], [0, 0]] },
  { skill: 'Aptitude › Percentages', counts: [[1, 18], [2, 22], [1, 9], [0, 4], [0, 0]] },
];

/* ---------- Drives, invitations, slots (T03) ---------- */

export interface InvitationRow {
  id: string;
  name: string;
  email: string;
  test: string;
  drive: string;
  status: 'Invited' | 'Booked' | 'Started' | 'Completed' | 'Under review' | 'Missed' | 'Expired';
  slot: Date | null;
  reminders: number;
  accommodation?: string;
  subject: 'Candidate' | 'Employee';
}
const FIRST = ['Arjun', 'Sneha', 'Rahul', 'Ananya', 'Karthik', 'Meenakshi', 'Vikram', 'Pooja', 'Imran', 'Lavanya', 'Harish', 'Deepa', 'Sanjay', 'Nandini', 'Faisal', 'Revathi', 'Manoj', 'Aishwarya', 'Tarun', 'Keerthi'];
const LAST = ['Nair', 'Iyer', 'Deshpande', 'Rao', 'Krishnan', 'Sundaram', 'Hegde', 'Menon', 'Qureshi', 'Balaji', 'Gowda', 'Pillai', 'Chatterjee', 'Reddy', 'Ahmed', 'Murthy', 'Kumar', 'Srinivasan', 'Joshi', 'Varma'];
export const NAMES = FIRST.map((f, i) => `${f} ${LAST[i]}`);
const STATUSES: InvitationRow['status'][] = ['Booked', 'Completed', 'Invited', 'Started', 'Under review', 'Completed', 'Missed', 'Booked', 'Completed', 'Expired'];
export const INVITATIONS: InvitationRow[] = NAMES.map((n, i) => ({
  id: `INV-${3400 + i}`,
  name: n,
  email: `${n.split(' ')[0].toLowerCase()}.${n.split(' ')[1].toLowerCase()}@mailbox.example`,
  test: i % 3 === 0 ? 'Java Backend Developer · L2' : 'Campus aptitude 2026',
  drive: i % 3 === 0 ? 'Backend hiring Q3' : 'Campus drive · Tamil Nadu 2026',
  status: STATUSES[i % STATUSES.length],
  slot: STATUSES[i % STATUSES.length] === 'Invited' || STATUSES[i % STATUSES.length] === 'Expired' ? null : d(28 + (i % 5), 8, 9 + (i % 4) * 2),
  reminders: i % 3,
  accommodation: i === 4 ? '25 % extra time' : i === 11 ? 'Screen-reader mode' : undefined,
  subject: i === 7 ? 'Employee' : 'Candidate',
}));

export interface DriveRow {
  id: string;
  name: string;
  test: string;
  window: string;
  registered: number;
  invited: number;
  attempted: number;
  expected: number;
  status: 'Planning' | 'Registration open' | 'Live' | 'Closed';
}
export const DRIVES: DriveRow[] = [
  { id: 'DR-12', name: 'Campus drive · Tamil Nadu 2026', test: 'Campus aptitude 2026', window: '3–5 Oct 2026', registered: 4820, invited: 3960, attempted: 0, expected: 3600, status: 'Registration open' },
  { id: 'DR-11', name: 'Backend hiring Q3', test: 'Java Backend Developer · L2', window: '1 Sep – 15 Oct 2026', registered: 0, invited: 412, attempted: 288, expected: 400, status: 'Live' },
  { id: 'DR-10', name: 'Quality supervisors · Hosur', test: 'Quality supervisor certification', window: '12 Oct 2026', registered: 0, invited: 64, attempted: 0, expected: 60, status: 'Planning' },
  { id: 'DR-08', name: 'Customer care walk-in', test: 'Customer care basics', window: '10 Aug 2026', registered: 310, invited: 290, attempted: 271, expected: 300, status: 'Closed' },
];

export interface SlotData {
  id: string;
  day: number; // 0 = Mon 28 Sep
  start: number; // hour
  capacity: number;
  booked: number;
  centre: string;
  proctors: number;
}
export const SLOTS: SlotData[] = [
  { id: 's1', day: 0, start: 9, capacity: 36, booked: 36, centre: 'Online', proctors: 3 },
  { id: 's2', day: 0, start: 14, capacity: 36, booked: 22, centre: 'Online', proctors: 3 },
  { id: 's3', day: 1, start: 9, capacity: 48, booked: 45, centre: 'Online', proctors: 4 },
  { id: 's4', day: 1, start: 11, capacity: 60, booked: 18, centre: 'Hosur plant centre', proctors: 0 },
  { id: 's5', day: 1, start: 15, capacity: 36, booked: 30, centre: 'Online', proctors: 3 },
  { id: 's6', day: 2, start: 10, capacity: 36, booked: 12, centre: 'Online', proctors: 2 },
  { id: 's7', day: 3, start: 9, capacity: 48, booked: 48, centre: 'Online', proctors: 4 },
  { id: 's8', day: 3, start: 14, capacity: 48, booked: 40, centre: 'Online', proctors: 3 },
  { id: 's9', day: 4, start: 10, capacity: 120, booked: 96, centre: 'Chennai college hall', proctors: 0 },
];
export const WEEK_DAYS = ['Mon 28 Sep', 'Tue 29 Sep', 'Wed 30 Sep', 'Thu 1 Oct', 'Fri 2 Oct'];

export interface AccommodationRow {
  id: string;
  name: string;
  test: string;
  types: string[];
  evidence: string;
  submitted: Date;
  status: 'New' | 'Approved' | 'Partly approved' | 'Declined' | 'More information requested';
  slot: Date;
}
export const ACCOMMODATIONS: AccommodationRow[] = [
  { id: 'ACC-201', name: 'Karthik Krishnan', test: 'Campus aptitude 2026', types: ['25 % extra time', 'Extra break'], evidence: 'Certificate, 1 file', submitted: d(26), status: 'New', slot: d(3, 9, 10) },
  { id: 'ACC-202', name: 'Deepa Pillai', test: 'Java Backend Developer · L2', types: ['Screen-reader mode', 'Adjusted proctoring (no gaze flags)'], evidence: 'Letter from doctor, 1 file', submitted: d(25), status: 'New', slot: d(1, 9, 14) },
  { id: 'ACC-203', name: 'Faisal Ahmed', test: 'Campus aptitude 2026', types: ['Larger font', 'High contrast'], evidence: 'None needed', submitted: d(24), status: 'Approved', slot: d(4, 9, 9) },
  { id: 'ACC-204', name: 'Revathi Murthy', test: 'Quality supervisor certification', types: ['Separate session', '50 % extra time'], evidence: 'Certificate, 2 files', submitted: d(22), status: 'More information requested', slot: d(12, 9, 11) },
  { id: 'ACC-205', name: 'Tarun Joshi', test: 'Campus aptitude 2026', types: ['Hearing aids allowed (no earbud flags)'], evidence: 'Audiology report, 1 file', submitted: d(21), status: 'Partly approved', slot: d(3, 9, 15) },
];

/* ---------- Live (T04) ---------- */

export const LIVE_TILES: LiveTileData[] = [
  { id: 'a1', name: 'Arjun Nair', status: 'in-progress', score: 92, flags: 1, lastFlag: 'Tab switch, 3 s', question: 'Q 14 of 40', secondsLeft: 1710 },
  { id: 'a2', name: 'Sneha Iyer', status: 'in-progress', score: 46, flags: 7, lastFlag: 'More than one face', question: 'Q 22 of 40', secondsLeft: 1320 },
  { id: 'a3', name: 'Rahul Deshpande', status: 'in-progress', score: 71, flags: 3, lastFlag: 'Response time unusual', lastFlagAi: true, question: 'Q 31 of 40', secondsLeft: 960 },
  { id: 'a4', name: 'Ananya Rao', status: 'disconnected', score: 88, flags: 1, lastFlag: 'Connection lost 40 s', question: 'Q 9 of 40', secondsLeft: 2100 },
  { id: 'a5', name: 'Karthik Krishnan', status: 'in-progress', score: 100, flags: 0, question: 'Q 5 of 40', secondsLeft: 3000, accommodation: '25 % extra time' },
  { id: 'a6', name: 'Meenakshi Sundaram', status: 'paused', score: 58, flags: 4, lastFlag: 'Phone in view', question: 'Q 18 of 40', secondsLeft: 1500 },
  { id: 'a7', name: 'Vikram Hegde', status: 'in-progress', score: 95, flags: 1, lastFlag: 'Noise detected', question: 'Q 27 of 40', secondsLeft: 1200 },
  { id: 'a8', name: 'Pooja Menon', status: 'waiting', score: 100, flags: 0, question: 'Waiting room', secondsLeft: 3600 },
  { id: 'a9', name: 'Imran Qureshi', status: 'in-progress', score: 64, flags: 4, lastFlag: 'Face not in view, 12 s', question: 'Q 12 of 40', secondsLeft: 2400 },
  { id: 'a10', name: 'Lavanya Balaji', status: 'submitted', score: 90, flags: 1, lastFlag: 'Tab switch, 2 s', question: 'Submitted', secondsLeft: 0 },
  { id: 'a11', name: 'Deepa Pillai', status: 'in-progress', score: 97, flags: 0, question: 'Q 16 of 40', secondsLeft: 2700, accommodation: 'Screen reader, no gaze flags' },
  { id: 'a12', name: 'Harish Gowda', status: 'in-progress', score: 83, flags: 2, lastFlag: 'Second screen detected', question: 'Q 20 of 40', secondsLeft: 1800 },
];

export const SIGNALS_SNEHA: SignalCount[] = [
  { signal: 'multiple-faces', label: 'More than one face', count: 2, weight: 12 },
  { signal: 'phone', label: 'Phone detected', count: 1, weight: 18 },
  { signal: 'gaze', label: 'Off-screen gaze', count: 3, weight: 4 },
  { signal: 'tab', label: 'Tab switch', count: 2, weight: 3 },
  { signal: 'llm', label: 'LLM-likeness in answer', count: 1, weight: 0, ai: true },
];

export const EVENTS_SNEHA: FlagEvent[] = [
  { id: 'e1', at: 142, type: 'id', label: 'Face re-verified', severity: 'low', source: 'camera' },
  { id: 'e2', at: 610, type: 'tab', label: 'Tab switch, 4 s', severity: 'low', source: 'screen' },
  { id: 'e3', at: 902, type: 'face-missing', label: 'Face not in view, 9 s', severity: 'medium', source: 'camera' },
  { id: 'e4', at: 1240, type: 'noise', label: 'Second voice detected', severity: 'medium', source: 'audio' },
  { id: 'e5', at: 1395, type: 'multiple-faces', label: 'More than one face', severity: 'high', source: 'camera' },
  { id: 'e6', at: 1520, type: 'phone', label: 'Phone detected in view', severity: 'high', source: 'camera' },
  { id: 'e7', at: 1688, type: 'llm', label: 'Answer reads like AI-generated text (Q 18)', severity: 'low', ai: true, source: 'screen' },
  { id: 'e8', at: 1802, type: 'warn', label: 'Proctor warning sent: "Please keep your desk clear"', severity: 'low', source: 'proctor' },
  { id: 'e9', at: 2010, type: 'multiple-faces', label: 'More than one face', severity: 'high', source: 'camera' },
];

/* ---------- Integrity queue (T05) ---------- */

export interface IncidentRow {
  id: string;
  candidate: string;
  test: string;
  types: string[];
  severity: 'High' | 'Medium' | 'Low';
  score: number;
  status: 'Open' | 'Under review' | 'Verdict given' | 'Appealed' | 'Closed' | 'Escalated';
  reviewer: string;
  due: Date;
  language: string;
}
export const INCIDENTS: IncidentRow[] = [
  { id: 'INC-5521', candidate: 'Sneha Iyer', test: 'Java Backend Developer · L2', types: ['More than one face', 'Phone detected'], severity: 'High', score: 46, status: 'Under review', reviewer: 'Farah Siddiqui', due: d(1, 9), language: 'English' },
  { id: 'INC-5519', candidate: 'Meenakshi Sundaram', test: 'Java Backend Developer · L2', types: ['Phone detected'], severity: 'High', score: 58, status: 'Open', reviewer: 'Gopal Menon', due: d(1, 9), language: 'English' },
  { id: 'INC-5514', candidate: 'Imran Qureshi', test: 'Campus aptitude 2026', types: ['Face not in view'], severity: 'Medium', score: 64, status: 'Open', reviewer: 'Farah Siddiqui', due: d(30), language: 'Hindi' },
  { id: 'INC-5510', candidate: 'Rahul Deshpande', test: 'Campus aptitude 2026', types: ['Response time unusual', 'Answer pattern match'], severity: 'Medium', score: 71, status: 'Open', reviewer: 'Lakshmi Venkatesan', due: d(28), language: 'Tamil' },
  { id: 'INC-5502', candidate: 'Nandini Reddy', test: 'Campus aptitude 2026', types: ['Tab switch'], severity: 'Low', score: 84, status: 'Verdict given', reviewer: 'Gopal Menon', due: d(25), language: 'Telugu' },
  { id: 'INC-5488', candidate: 'Manoj Kumar', test: 'Java Backend Developer · L2', types: ['Code similarity 91 %'], severity: 'High', score: 60, status: 'Appealed', reviewer: 'Farah Siddiqui', due: d(6, 9), language: 'English' },
  { id: 'INC-5470', candidate: 'Sanjay Chatterjee', test: 'Java Backend Developer · L2', types: ['Identity mismatch'], severity: 'High', score: 40, status: 'Escalated', reviewer: 'Gopal Menon', due: d(20), language: 'English' },
];

export const REVIEWERS = ['Farah Siddiqui', 'Gopal Menon', 'Lakshmi Venkatesan', 'Arvind Swamy'];

/* ---------- Readiness (T03 Q7, T08) ---------- */

export const READINESS_CHECKS: SystemCheck[] = [
  { id: 'camera', label: 'Camera', status: 'pass', detail: 'Integrated webcam found. Picture is clear and your face is lit.', blocking: true },
  { id: 'mic', label: 'Microphone', status: 'warn', detail: 'Microphone found, but it is picking up a lot of background noise.', fix: ['Move to a quieter room or close the window.', 'Switch off fans or music near you.', 'Speak the sample sentence again.'] },
  { id: 'screen', label: 'Screen share', status: 'fail', detail: 'Screen sharing was not allowed. We need to see your full screen, not one window.', blocking: true, fix: ['Select "Share screen" again.', 'In the browser window, choose "Entire screen", not a tab or window.', 'On a Mac, allow screen recording in System Settings › Privacy & Security, then reload this page.'] },
  { id: 'displays', label: 'Displays', status: 'pass', detail: 'One display connected.', blocking: true },
  { id: 'browser', label: 'Browser and Secure Client', status: 'fail', detail: 'This test needs the YukthiX Secure Client version 3.2 or later. We could not find it.', blocking: true, fix: ['Download the Secure Client for Windows (84 MB).', 'Open the installer and follow the steps. Admin rights are needed only the first time.', 'Come back to this page and select "Open in Secure Client".'] },
  { id: 'apps', label: 'Apps to close', status: 'warn', detail: '2 apps must be closed before the test starts: a video-call app and a screen recorder.', fix: ['Save your work in those apps.', 'Quit them fully, including from the system tray.', 'Run the check again.'] },
  { id: 'network', label: 'Network', status: 'pass', detail: 'Download 18 Mbps, upload 4.2 Mbps, delay 48 ms. Good enough for recording.', blocking: true },
  { id: 'device', label: 'Device', status: 'pass', detail: 'Laptop, Windows 11, 8 GB memory. Processor is fast enough.', blocking: true },
];

/* ---------- Analytics (P09) ---------- */

export const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

export interface MetricRow {
  key: string;
  name: string;
  domain: string;
  definition: string;
  formula: string;
  unit: string;
  grain: string;
  sensitivity: 'Internal' | 'Confidential' | 'Special';
  owner: string;
  version: number;
  usedIn: number;
  calculated?: boolean;
}
export const METRICS: MetricRow[] = [
  { key: 'workforce.headcount', name: 'Headcount', domain: 'Workforce', definition: 'Active employees on a date, not counting people who have not joined yet.', formula: 'count(snap_employee_day where status = active)', unit: 'people', grain: 'Day', sensitivity: 'Internal', owner: 'People analytics', version: 3, usedIn: 14 },
  { key: 'workforce.attrition_rate', name: 'Attrition rate', domain: 'Workforce', definition: 'Exits ÷ average headcount, permanent and probation employees. Monthly and annualised.', formula: 'exits ÷ avg(headcount) × 12 ÷ months', unit: '%', grain: 'Month', sensitivity: 'Internal', owner: 'People analytics', version: 2, usedIn: 9 },
  { key: 'payroll.cost', name: 'Payroll cost', domain: 'Payroll', definition: 'Gross pay plus employer contributions, by pay period, with run status.', formula: 'sum(gross + employer_pf + employer_esi + gratuity_provision)', unit: '₹', grain: 'Pay period', sensitivity: 'Confidential', owner: 'Payroll', version: 2, usedIn: 6 },
  { key: 'hire.time_to_fill', name: 'Time to fill', domain: 'Recruitment', definition: 'Requisition approved → offer accepted, per position. Median.', formula: 'median(offer_accepted_on − approved_on)', unit: 'days', grain: 'Position', sensitivity: 'Internal', owner: 'Talent acquisition', version: 1, usedIn: 4 },
  { key: 'assess.pass_rate', name: 'Assessment pass rate', domain: 'Assessment', definition: 'Released passes ÷ completed attempts, per test and drive.', formula: 'passed ÷ completed', unit: '%', grain: 'Attempt', sensitivity: 'Internal', owner: 'Assessments', version: 1, usedIn: 5 },
  { key: 'assess.impact_ratio', name: 'Adverse impact ratio', domain: 'Assessment', definition: 'Pass rate of each group ÷ highest group rate (4/5ths rule). Small groups suppressed.', formula: 'rate(group) ÷ max(rate)', unit: 'ratio', grain: 'Test × group', sensitivity: 'Special', owner: 'Assessments', version: 1, usedIn: 2 },
  { key: 'comp.gender_pay_gap', name: 'Gender pay gap', domain: 'Compensation', definition: 'Median and mean gap in fixed annual CTC, unadjusted and within grade × location × tenure.', formula: '(median_m − median_f) ÷ median_m', unit: '%', grain: 'As on date', sensitivity: 'Confidential', owner: 'Rewards', version: 1, usedIn: 1 },
  { key: 'kf.overtime_cost_per_head', name: 'Overtime cost per head', domain: 'Time', definition: 'Approved overtime cost ÷ average headcount. Calculated metric made by Kaveri Foods.', formula: 'time.overtime_cost ÷ workforce.avg_headcount', unit: '₹', grain: 'Month', sensitivity: 'Confidential', owner: 'Lakshmi Venkatesan', version: 1, usedIn: 2, calculated: true },
];

export interface ReportRow {
  id: string;
  name: string;
  question: string;
  owner: string;
  sensitivity: 'Internal' | 'Confidential' | 'Special';
  format: string;
  favourite?: boolean;
  standard: boolean;
}
export const REPORTS: ReportRow[] = [
  { id: 'RPT-WF-01', name: 'Headcount as on date', question: 'Who works here?', owner: 'People analytics', sensitivity: 'Internal', format: 'Screen · XLSX', favourite: true, standard: true },
  { id: 'RPT-WF-04', name: 'Exits and attrition by department', question: 'Who is leaving?', owner: 'People analytics', sensitivity: 'Internal', format: 'Screen · XLSX · PDF', favourite: true, standard: true },
  { id: 'RPT-WF-05', name: 'Early attrition (under 180 days)', question: 'Who is leaving?', owner: 'People analytics', sensitivity: 'Internal', format: 'Screen · XLSX', standard: true },
  { id: 'RPT-PAY-02', name: 'Payroll cost by cost centre', question: 'What does payroll cost?', owner: 'Payroll', sensitivity: 'Confidential', format: 'Screen · XLSX', standard: true },
  { id: 'RPT-PAY-06', name: 'Variance vs last month with reasons', question: 'What does payroll cost?', owner: 'Payroll', sensitivity: 'Confidential', format: 'Screen · XLSX · PDF', favourite: true, standard: true },
  { id: 'RPT-HIR-03', name: 'Source effectiveness', question: 'Where do good hires come from?', owner: 'Talent acquisition', sensitivity: 'Internal', format: 'Screen · XLSX', standard: true },
  { id: 'RPT-ASM-02', name: 'Drive results by college', question: 'How did the assessments go?', owner: 'Assessments', sensitivity: 'Internal', format: 'Screen · XLSX', standard: true },
  { id: 'RPT-ASM-08', name: 'Fairness report', question: 'How did the assessments go?', owner: 'Assessments', sensitivity: 'Special', format: 'Screen · PDF', standard: true },
  { id: 'RPT-CMP-01', name: 'EPF register', question: 'Statutory registers', owner: 'Payroll', sensitivity: 'Confidential', format: 'XLSX · ECR file', standard: true },
  { id: 'RPT-CMP-03', name: 'Professional tax register', question: 'Statutory registers', owner: 'Payroll', sensitivity: 'Confidential', format: 'XLSX', standard: true },
  { id: 'MY-07', name: 'Hosur overtime by line', question: 'My reports', owner: 'Lakshmi Venkatesan', sensitivity: 'Confidential', format: 'Screen · XLSX', standard: false },
];

export interface ScheduleRow {
  id: string;
  target: string;
  kind: 'Dashboard' | 'Report';
  frequency: string;
  format: string;
  recipients: string;
  channel: string;
  lastRun: Date | null;
  status: 'Delivered' | 'Skipped, no data' | 'Failed' | 'Paused';
  sensitivity: 'Internal' | 'Confidential' | 'Special';
}
export const SCHEDULES: ScheduleRow[] = [
  { id: 'SUB-31', target: 'Executive dashboard', kind: 'Dashboard', frequency: 'Monthly, 1st, 8:00 am', format: 'PDF snapshot', recipients: 'Leadership team (6)', channel: 'Email', lastRun: d(1, 8, 8), status: 'Delivered', sensitivity: 'Confidential' },
  { id: 'SUB-32', target: 'Exits and attrition by department', kind: 'Report', frequency: 'Weekly, Monday 9:00 am', format: 'XLSX', recipients: 'HR business partners (4)', channel: 'Email', lastRun: d(28, 8, 9), status: 'Delivered', sensitivity: 'Internal' },
  { id: 'SUB-33', target: 'Variance vs last month with reasons', kind: 'Report', frequency: 'Monthly, 26th', format: 'XLSX', recipients: 'Suresh Pillai, Finance controller', channel: 'Email', lastRun: d(26, 8, 7), status: 'Delivered', sensitivity: 'Confidential' },
  { id: 'SUB-34', target: 'Drive results by college', kind: 'Report', frequency: 'Daily, weekdays', format: 'CSV', recipients: 'Campus team (3)', channel: 'WhatsApp', lastRun: d(29, 8, 7), status: 'Skipped, no data', sensitivity: 'Internal' },
  { id: 'SUB-35', target: 'Hosur overtime by line', kind: 'Report', frequency: 'Weekly, Friday', format: 'XLSX', recipients: 'Plant manager', channel: 'Email', lastRun: d(25, 8, 18), status: 'Failed', sensitivity: 'Confidential' },
];

export interface ExportRow {
  id: string;
  who: string;
  what: string;
  format: string;
  rows: number;
  at: Date;
  sensitivity: 'Internal' | 'Confidential' | 'Special';
}
export const EXPORTS: ExportRow[] = [
  { id: 'EXP-9910', who: 'Lakshmi Venkatesan', what: 'Headcount as on date', format: 'XLSX', rows: 248, at: d(29, 8, 9, 20), sensitivity: 'Internal' },
  { id: 'EXP-9909', who: 'Suresh Pillai', what: 'Payroll cost by cost centre', format: 'XLSX', rows: 18, at: d(28, 8, 17, 5), sensitivity: 'Confidential' },
  { id: 'EXP-9907', who: 'Neha Joshi', what: 'Drive results by college', format: 'CSV', rows: 42, at: d(28, 8, 11, 40), sensitivity: 'Internal' },
  { id: 'EXP-9902', who: 'Scheduled: SUB-33', what: 'Variance vs last month with reasons', format: 'XLSX', rows: 36, at: d(26, 8, 7), sensitivity: 'Confidential' },
];

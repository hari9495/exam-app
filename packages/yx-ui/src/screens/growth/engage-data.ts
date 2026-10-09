// Fictional sample data for Engage screens. Partners and merchants are invented.
import type { FeedPost } from './growth-kit';
import { d } from './perf-data';
import type { AckRow, Celebration, ModItem, Space } from './engage-feed';
import type { ActionPlan, SurveyQuestion, SurveyResults, SurveyRow } from './engage-surveys';
import type { LeaderRow, LedgerRow, PerkOffer, RewardItem } from './engage-recognition';

const at = (day: number, h: number, m = 0, month = 8) => new Date(2026, month, day, h, m);

export const SPACES: Space[] = [
  { id: 'co', name: 'Kaveri Foods', kind: 'Company', members: 248, policy: 'Announcers post; others need approval', joined: true },
  { id: 'hosur', name: 'Hosur plant', kind: 'Location', members: 96, policy: 'Everyone posts', joined: false },
  { id: 'chennai', name: 'Chennai office', kind: 'Location', members: 58, policy: 'Everyone posts', joined: true },
  { id: 'quality', name: 'Quality team', kind: 'Team', members: 17, policy: 'Everyone posts', joined: true },
  { id: 'eng', name: 'Engineering', kind: 'Department', members: 42, policy: 'Everyone posts', joined: false },
  { id: 'cricket', name: 'Cricket club', kind: 'Interest group', members: 34, policy: 'Everyone posts', joined: true },
  { id: 'running', name: 'Sunday runners', kind: 'Interest group', members: 19, policy: 'Pre-approval on', joined: false },
];

export const POSTS: FeedPost[] = [
  {
    id: 'p1',
    type: 'Announcement',
    author: 'Lakshmi Venkatesan',
    space: 'Kaveri Foods',
    at: at(24, 10),
    pinned: true,
    body: 'From 1 October, hairnets and gloves are required in the canteen serving area as well as on the line. Please read the updated rules and acknowledge by 6 October.',
    reactions: 41,
    comments: 6,
    ack: { required: true, due: d(6, 9) },
  },
  {
    id: 'p2',
    type: 'Kudos',
    author: 'Divya Raghunathan',
    space: 'Quality team',
    at: at(29, 8, 50),
    to: ['Meera Iyer'],
    value: 'Customer first',
    points: 50,
    body: 'Thanks for staying back to re-run the seal-strength tests on line 3. We shipped on time because of it.',
    reactions: 12,
    reacted: true,
    comments: 3,
  },
  {
    id: 'p3',
    type: 'Poll',
    author: 'Gurpreet Kaur',
    space: 'Chennai office',
    at: at(28, 17),
    body: 'Canteen committee is planning the Ayudha Puja breakfast.',
    poll: { question: 'What should we serve on 20 Oct?', options: ['Idli and vada', 'Pongal', 'Poori'], votes: [22, 14, 9], closes: d(3, 9) },
    reactions: 5,
    comments: 11,
  },
  {
    id: 'p4',
    type: 'Celebration',
    author: 'Work anniversaries',
    space: 'Kaveri Foods',
    at: at(29, 7),
    body: 'Prakash Menon completes 10 years at Kaveri Foods today, and Sana Nizami completes 3.',
    reactions: 58,
    comments: 19,
  },
  {
    id: 'p5',
    type: 'Event',
    author: 'Rahul Sharma',
    space: 'Cricket club',
    at: at(27, 12),
    body: 'Inter-plant tennis-ball tournament. Teams of 8, register by 5 Oct.',
    event: { when: 'Sat 10 Oct, 7:00 am', where: 'Hosur plant ground', going: 42 },
    reactions: 18,
    comments: 7,
  },
  {
    id: 'p6',
    type: 'Update',
    author: 'Vikram Singh',
    authorNote: 'Former employee',
    space: 'Chennai office',
    at: at(20, 16),
    body: 'The new parking passes are with security at gate 2.',
    reactions: 9,
    comments: 1,
  },
];

export const CELEBRATIONS: Celebration[] = [
  { id: 'c1', name: 'Neha Joshi', kind: 'Birthday', detail: 'Birthday today' },
  { id: 'c2', name: 'Prakash Menon', kind: 'Work anniversary', detail: '10 years' },
  { id: 'c3', name: 'Kiran Rao', kind: 'New joiner', detail: 'Joined Quality' },
  { id: 'c4', name: 'Sana Nizami', kind: 'Work anniversary', detail: '3 years' },
];

export const BLOCKED = ['idiot', 'bewakoof', 'scam'];

export const ACK_ROWS: AckRow[] = [
  ['Rohit Bhat', 'Quality', 'Hosur plant', d(24), d(24)],
  ['Meera Iyer', 'Quality', 'Hosur plant', d(24), null],
  ['Manoj Patil', 'Operations', 'Hosur plant', d(25), d(25)],
  ['Gurpreet Kaur', 'Operations', 'Hosur plant', null, null],
  ['Rahul Sharma', 'Operations', 'Hosur plant', d(26), null],
  ['Deepa Rao', 'Operations', 'Hosur plant', d(24), d(26)],
  ['Imran Qureshi', 'Quality', 'Hosur plant', null, null],
  ['Joseph Mathew', 'Engineering', 'Hosur plant', d(27), d(27)],
].map(([name, department, location, read, acked], i) => ({ id: `a${i}`, name: name as string, department: department as string, location: location as string, read: read as Date | null, acked: acked as Date | null }));

export const MOD_ITEMS: ModItem[] = [
  { id: 'm1', kind: 'Post', author: 'Rahul Sharma', space: 'Hosur plant', text: 'Night shift canteen food is a scam, nobody listens.', reason: 'Blocked word “scam”', reports: 0, state: 'Held', at: d(29), priorActions: 2 },
  { id: 'm2', kind: 'Comment', author: 'Arjun Kulkarni', space: 'Engineering', text: 'Maybe if some people read the spec we wouldn’t be here.', reason: '3 reports: unkind', reports: 3, state: 'Hidden', at: d(28), priorActions: 0 },
  { id: 'm3', kind: 'Post', author: 'Sneha Ghosh', space: 'Cricket club', text: 'Selling my old bat, DM me. Link: shop-bats.example', reason: 'Link rule: outside link in a group', reports: 1, state: 'Held', at: d(27), priorActions: 0 },
];

export const SURVEYS: SurveyRow[] = [
  { id: 's1', name: 'Monthly pulse, September 2026', type: 'Pulse', anonymity: 'Anonymous', audience: 'Everyone', status: 'Open', invited: 248, responded: 181, closes: d(30) },
  { id: 's2', name: 'eNPS, Q2 FY 2026-27', type: 'eNPS', anonymity: 'Anonymous', audience: 'Everyone', status: 'Closed', invited: 246, responded: 199, closes: d(30, 5) },
  { id: 's3', name: 'Monthly pulse, October 2026', type: 'Pulse', anonymity: 'Anonymous', audience: 'Everyone', status: 'Scheduled', invited: 0, responded: 0, closes: d(12, 9) },
  { id: 's4', name: 'Onboarding, day 30', type: 'Onboarding', anonymity: 'Named', audience: 'Joiners, 30 days after joining', status: 'Open', invited: 11, responded: 7, closes: null },
  { id: 's5', name: 'Engagement survey 2026', type: 'Engagement', anonymity: 'Anonymous', audience: 'Everyone', status: 'Draft', invited: 0, responded: 0, closes: null },
];

export const PULSE_QUESTIONS: SurveyQuestion[] = [
  { id: 'l1', text: 'How likely are you to recommend Kaveri Foods as a place to work?', kind: 'eNPS (0–10)' },
  { id: 'l2', text: 'I know what is expected of me at work.', kind: 'Rating (1–5)' },
  { id: 'l5', text: 'My workload this month was…', kind: 'Single choice', options: ['Too light', 'About right', 'Too heavy'] },
  { id: 'l6', text: 'What one thing should we change?', kind: 'Text' },
];

const scores = (p: number, pa: number, de: number) => [...Array(p).fill(9), ...Array(pa).fill(7), ...Array(de).fill(5)];

export const RESULTS: SurveyResults = {
  name: 'Monthly pulse, September 2026',
  invited: 248,
  responded: 181,
  scores: scores(78, 62, 41),
  previousEnps: 14,
  trend: [
    { period: 'Q3 FY25-26', enps: 8 },
    { period: 'Q4 FY25-26', enps: 11 },
    { period: 'Q1 FY26-27', enps: 14 },
    { period: 'Q2 FY26-27', enps: 20 },
  ],
  themes: ['Clarity', 'Manager', 'Enablement', 'Workload', 'Recognition'],
  heat: [
    { label: 'Operations', groupSize: 58, values: [72, 64, 51, 38, 55] },
    { label: 'Quality', groupSize: 14, values: [81, 76, 69, 52, 71] },
    { label: 'Engineering', groupSize: 33, values: [78, 70, 74, 61, 66] },
    { label: 'Sales', groupSize: 24, values: [70, 58, 62, 57, 49] },
    { label: 'Finance', groupSize: 11, values: [85, 80, 77, 70, 68] },
    { label: 'People', groupSize: 4, values: [90, 90, 85, 75, 80] },
  ],
  departments: [
    { name: 'Operations', size: 58 },
    { name: 'Quality', size: 14 },
    { name: 'Engineering', size: 33 },
    { name: 'Sales', size: 24 },
    { name: 'Finance', size: 11 },
    { name: 'People', size: 4 },
  ],
  comments: [
    { theme: 'Night-shift canteen', count: 23, summary: 'Food runs out after 1 am; people want a hot option for the late shift.', examples: ['Hot food finishes before our break.'] },
    { theme: 'Workload in peak season', count: 17, summary: 'Overtime felt heavy in September; some ask for earlier roster notice.', examples: ['Roster comes on Friday for Monday.'] },
    { theme: 'Recognition', count: 9, summary: 'Kudos are liked; plant staff without phones feel left out.', examples: ['Not everyone on the line has the app.'] },
  ],
};

export const TEAM_OK = { name: 'Quality team', size: 14, scores: scores(6, 5, 3) };
export const TEAM_SMALL = { name: 'Accounts team', size: 4, scores: scores(2, 1, 1) };

export const PLAN: ActionPlan = {
  id: 'ap1',
  team: 'Quality team',
  owner: 'Karthik Subramanian',
  survey: 'Monthly pulse, September 2026',
  focus: { question: 'My workload this month was… (52% said “too heavy”)', score: '52% too heavy vs 38% company' },
  resultsOpened: d(1, 9),
  items: [
    { id: 'i1', action: 'Publish the weekly roster by Wednesday', owner: 'Karthik Subramanian', due: d(15, 9), status: 'In progress' },
    { id: 'i2', action: 'Cross-train two inspectors on line 3 checks', owner: 'Meera Iyer', due: d(30, 9), status: 'Not started' },
    { id: 'i3', action: 'Review overtime with the plant head each Friday', owner: 'Karthik Subramanian', due: d(9, 9), status: 'Done' },
  ],
  status: 'Shared with team',
};

export const PLANS: (ActionPlan & { size: number })[] = [
  { ...PLAN, size: 14 },
  { ...PLAN, id: 'ap2', team: 'Line 1 and 2', owner: 'Manoj Patil', status: 'Draft', items: [], resultsOpened: d(28, 7), size: 31 },
  { ...PLAN, id: 'ap3', team: 'Platform engineering', owner: 'Joseph Mathew', status: 'Completed', items: PLAN.items.map((i) => ({ ...i, status: 'Done' as const })), size: 12 },
  { ...PLAN, id: 'ap4', team: 'Sales, South', owner: 'Aisha Khan', status: 'Draft', items: [PLAN.items[0]], resultsOpened: d(1, 9), size: 18 },
];

export const VALUES = ['Customer first', 'Ownership', 'Do it right', 'Grow together'];
export const BADGES = ['Line saver', 'Great catch', 'Team player', 'Above and beyond'];

export const KUDOS_WALL: FeedPost[] = [
  POSTS[1],
  { id: 'k2', type: 'Kudos', author: 'Manoj Patil', space: 'Hosur plant', at: at(27, 15), to: ['Rohit Bhat', 'Imran Qureshi'], value: 'Do it right', body: 'Caught the mislabelled allergen batch before dispatch. Great catch.', reactions: 21, comments: 4 },
  { id: 'k3', type: 'Kudos', author: 'Karthik Subramanian', space: 'Quality team', at: at(25, 11), to: ['Divya Raghunathan'], value: 'Ownership', points: 100, body: 'The label-printer mock means we no longer stop the line to test.', reactions: 16, comments: 2 },
  { id: 'k4', type: 'Kudos', author: 'Aisha Khan', space: 'Kaveri Foods', at: at(22, 9), to: ['Neha Joshi'], value: 'Grow together', body: 'Ran three campus drives in a week and still made time to mentor our interns.', reactions: 30, comments: 5 },
];

export const LEADERS: LeaderRow[] = [
  { id: 'l1', name: 'Meera Iyer', team: 'Quality', points: 320, kudos: 7 },
  { id: 'l2', name: 'Rohit Bhat', team: 'Quality', points: 260, kudos: 5 },
  { id: 'l3', name: 'Imran Qureshi', team: 'Quality', points: 180, kudos: 4 },
  { id: 'l4', name: 'Deepa Rao', team: 'Operations', points: 150, kudos: 3 },
];

export const REWARDS: RewardItem[] = [
  { id: 'r1', name: 'Grocery voucher ₹500', kind: 'Voucher', points: 500, valueINR: 500, partner: 'Annapurna Grocers' },
  { id: 'r2', name: 'Movie voucher ₹1,000', kind: 'Gift card', points: 1000, valueINR: 1000, partner: 'Chitra Cinemas' },
  { id: 'r3', name: 'Electronics gift card ₹6,000', kind: 'Gift card', points: 6000, valueINR: 6000, partner: 'Vega Electronics' },
  { id: 'r4', name: 'Payout with salary ₹2,000', kind: 'Payroll payout', points: 2000, valueINR: 2000, partner: 'Kaveri Foods payroll' },
];

export const LEDGER: LedgerRow[] = [
  { id: 'g1', at: d(29), text: 'Kudos from Divya Raghunathan · Customer first', change: 50, kind: 'Earned' },
  { id: 'g2', at: d(22), text: 'Kudos from Karthik Subramanian · Ownership', change: 100, kind: 'Earned' },
  { id: 'g3', at: d(10), text: 'Grocery voucher ₹500', change: -500, kind: 'Redeemed' },
  { id: 'g4', at: d(31, 7), text: 'Points from Q1 expired', change: -40, kind: 'Expired' },
];

export const PERKS: PerkOffer[] = [
  { id: 'o1', partner: 'Vega Electronics', category: 'Phones', title: '8% off smartphones', detail: '8% off any smartphone up to ₹4,000, plus free screen guard.', terms: 'One use per employee; valid till 31 Dec 2026.', fields: ['Work email', 'Name', 'Mobile number'] },
  { id: 'o2', partner: 'Sahyatri Travels', category: 'Travel', title: '₹750 off train and bus bookings', detail: 'On bookings above ₹3,000 made through the partner’s site.', terms: 'Twice a year.', fields: ['Work email'] },
  { id: 'o3', partner: 'Pustak Learning', category: 'Learning', title: '30% off language courses', detail: 'Hindi, Tamil, Kannada and English courses, online.', terms: 'Valid on first purchase.', fields: ['Work email', 'Name'] },
  { id: 'o4', partner: 'Annapurna Grocers', category: 'Groceries', title: 'Free delivery for 3 months', detail: 'On orders above ₹499 in Bengaluru, Chennai and Hosur.', terms: 'Delivery areas vary.', fields: ['Work email', 'Mobile number', 'Delivery address'] },
];

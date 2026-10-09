// Fictional sample data for candidate-facing T9 pages (careers, campus, identity, automation notice, chat apply, referee).
import type { CareersConfig, CareersJob } from '../../components/careers';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

export const CAREERS_CONFIG: CareersConfig = {
  companyName: 'Kaveri Foods',
  theme: 'classic',
  accent: '1F6F4A',
  sections: [
    { id: 'hero', type: 'hero', title: 'Make the snacks South India shares', text: '248 people across Bengaluru, Chennai and our Hosur plant. Most of our shift leads started on the line.', photoAlt: 'Packing team at the Hosur plant during the morning shift' },
    { id: 'about', type: 'about', title: 'About Kaveri Foods', text: 'We have made millet snacks and ready mixes since 2004. Every batch is tasted before it leaves Hosur.' },
    {
      id: 'benefits',
      type: 'benefits',
      title: 'Benefits',
      items: [
        { icon: 'health', title: 'Family health cover', text: '₹5,00,000 floater for you, your spouse, children and parents.' },
        { icon: 'transport', title: 'Shift buses', text: 'Free buses from 9 pick-up points around Hosur.' },
        { icon: 'meal', title: 'Subsidised canteen', text: 'Two meals a shift for ₹25 a day.' },
        { icon: 'leave', title: '21 days of paid leave', text: 'Plus 12 public holidays.' },
      ],
    },
    { id: 'jobs', type: 'jobs', title: 'Open jobs' },
    { id: 'faq', type: 'faq', title: 'Questions', items: [{ question: 'Can I apply on WhatsApp?', answer: 'Yes. Choose "Apply on WhatsApp" on any job and follow the questions.' }] },
    { id: 'footer', type: 'footer', title: 'Footer', text: 'Kaveri Foods Pvt Ltd · 4th Floor, Prestige Meridian, MG Road, Bengaluru 560001' },
  ],
};

export const CAREERS_JOBS: CareersJob[] = [
  { id: 'qa-chemist-hosur', title: 'QA Chemist', department: 'Quality', location: 'Hosur plant', type: 'Full time', postedOn: d(2026, 9, 18) },
  { id: 'production-supervisor-hosur', title: 'Production Supervisor', department: 'Operations', location: 'Hosur plant', type: 'Full time', postedOn: d(2026, 9, 12) },
  { id: 'area-sales-officer-madurai', title: 'Area Sales Officer', department: 'Sales', location: 'Madurai', type: 'Full time', postedOn: d(2026, 9, 3) },
  { id: 'payroll-intern-bengaluru', title: 'Payroll Intern', department: 'Finance', location: 'Bengaluru head office', type: 'Internship', postedOn: d(2026, 9, 25) },
];

export const JOB_DETAIL = {
  job: CAREERS_JOBS[0],
  slug: 'careers/kaveri-foods/qa-chemist-hosur',
  pay: { min: 4_50_000, max: 6_00_000, period: 'a year' },
  experience: '2 to 4 years',
  about: 'Test raw materials and finished snacks against our specifications, run shelf-life studies and keep the lab audit-ready.',
  requirements: ['M.Sc. Chemistry or Food Technology', 'Hands-on with moisture, fat and peroxide-value tests', 'Comfortable with rotating shifts, including nights twice a month'],
  closesOn: d(2026, 10, 18),
};

/* ------------------------------------------------------------------ T9-11 Campus */

export const DRIVE = {
  name: 'Kaveri Foods campus drive 2026 · Graduate Engineer Trainee',
  opens: d(2026, 9, 15),
  closes: d(2026, 10, 5),
  cap: 600,
  registered: 412,
  eligibility: { branches: ['Chemical', 'Food Technology', 'Mechanical'], years: [2026, 2027], minPercent: 60 },
  testDate: d(2026, 10, 12, 10, 0),
};

export const COLLEGE = { name: 'Sri Ranganatha College of Engineering, Tiruchirappalli', coordinator: 'Prof. Meera Balasubramanian', email: 'placements@srce.example.in' };

export const COLLEGE_REGISTRANTS = [
  { name: 'Aishwarya Senthil', roll: '21CH014', branch: 'Chemical', year: 2026, status: 'eligible', admit: 'Issued', attended: null as boolean | null, result: null as string | null },
  { name: 'Barath Kumar', roll: '21FT007', branch: 'Food Technology', year: 2026, status: 'eligible', admit: 'Issued', attended: null, result: null },
  { name: 'Charulatha Venkat', roll: '21ME033', branch: 'Mechanical', year: 2026, status: 'rejected', admit: 'Not issued', attended: null, result: null },
  { name: 'Dinesh Prabhu', roll: '22CH019', branch: 'Chemical', year: 2027, status: 'registered', admit: 'Not issued', attended: null, result: null },
  { name: 'Ezhil Arasan', roll: '21FT022', branch: 'Food Technology', year: 2026, status: 'invited', admit: 'Issued', attended: null, result: null },
];

export const COLLEGE_RESULTS = { registered: 58, eligible: 46, attended: 41, passed: 17, shortlisted: 9 };

/* ------------------------------------------------------------------ T9-18 / 19 automation and requests */

export const AUTOMATION = {
  job: 'Production Supervisor',
  steps: [
    { what: 'Knockout questions', how: 'Your answers to 3 yes / no questions (shift work, Hosur location, 3+ years in food manufacturing) are checked automatically.', effect: 'A "no" is flagged for the recruiter; it does not reject you on its own.' },
    { what: 'Résumé screening', how: 'Software compares your résumé with the job requirements and suggests a match score.', effect: 'A recruiter reads every résumé before any decision.' },
    { what: 'AI-scored video interview', how: 'You answer 4 recorded questions. An AI model scores answers against a rubric.', effect: 'A trained interviewer reviews the scores and your answers.' },
  ],
  noticeVersion: 'ATS-AUTO-2026.3',
};

/* ------------------------------------------------------------------ T9-21 Referee */

export const REFEREE_REQUEST = {
  candidate: 'Imran',
  company: 'Kaveri Foods',
  referee: 'Balaji Natarajan',
  relationship: 'Former manager at Palar Beverages',
  expiresOn: d(2026, 10, 6),
  questions: [
    { id: 'q1', kind: 'rating' as const, text: 'How well did Imran plan and run a production shift?' },
    { id: 'q2', kind: 'rating' as const, text: 'How did Imran handle safety and hygiene rules on the line?' },
    { id: 'q3', kind: 'choice' as const, text: 'Would you work with Imran again?', options: ['Yes', 'Yes, in a different role', 'No', 'Prefer not to say'] },
    { id: 'q4', kind: 'text' as const, text: 'What is one thing Imran could improve?' },
  ],
};

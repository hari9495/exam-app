// YukthiX performance starters (M06-BUILD-DESIGN §6.2; D17 pattern: copied into the company, labelled, never
// overwritten). Written in our own words as examples a company edits; not taken from any vendor.

export const STARTER_SCALE = {
  key: 'scale_1_5',
  name: 'Five-point scale',
  min: 1,
  max: 5,
  step: 1,
  levels: [
    { value: 1, label: 'Needs improvement', description: 'Often falls short of what the role needs; needs close support.' },
    { value: 2, label: 'Partly meets', description: 'Meets some expectations; clear gaps remain.' },
    { value: 3, label: 'Meets', description: 'Does what the role needs, reliably.' },
    { value: 4, label: 'Exceeds', description: 'Often goes beyond what the role needs.' },
    { value: 5, label: 'Outstanding', description: 'Consistently sets the standard for others.' },
  ],
  bands: [
    { fromScore: 1, toScore: 1.49, label: 'Needs improvement' },
    { fromScore: 1.5, toScore: 2.49, label: 'Partly meets' },
    { fromScore: 2.5, toScore: 3.49, label: 'Meets' },
    { fromScore: 3.5, toScore: 4.49, label: 'Exceeds' },
    { fromScore: 4.5, toScore: 5, label: 'Outstanding' },
  ],
} as const;

type StarterSection = { kind: 'goals' | 'competencies' | 'values' | 'questions' | 'overall'; title: string; weight: number; rated: boolean; whoAnswers: string[]; questions: { text: string; answer: 'rating' | 'text' | 'both' }[] };
type StarterTemplate = { key: string; name: string; kind: 'annual' | 'half_yearly' | 'quarterly' | 'probation'; scoring: 'weighted' | 'manager_overall'; sections: StarterSection[] };

const SELF_AND_MANAGER = ['self', 'manager'];
const CLOSING: StarterSection = {
  kind: 'questions',
  title: 'Looking ahead',
  weight: 0,
  rated: false,
  whoAnswers: SELF_AND_MANAGER,
  questions: [
    { text: 'What went well in this period, and what would you do differently?', answer: 'text' },
    { text: 'What support or learning would help most in the next period?', answer: 'text' },
  ],
};

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    key: 'template_annual',
    name: 'Annual review',
    kind: 'annual',
    scoring: 'weighted',
    sections: [
      { kind: 'goals', title: 'Goals', weight: 60, rated: true, whoAnswers: SELF_AND_MANAGER, questions: [] },
      { kind: 'competencies', title: 'Competencies', weight: 40, rated: true, whoAnswers: ['self', 'manager', 'peer'], questions: [] },
      CLOSING,
    ],
  },
  {
    key: 'template_half_yearly',
    name: 'Half-yearly review',
    kind: 'half_yearly',
    scoring: 'weighted',
    sections: [
      { kind: 'goals', title: 'Goals', weight: 70, rated: true, whoAnswers: SELF_AND_MANAGER, questions: [] },
      { kind: 'competencies', title: 'Competencies', weight: 30, rated: true, whoAnswers: SELF_AND_MANAGER, questions: [] },
      CLOSING,
    ],
  },
  {
    key: 'template_quarterly_okr',
    name: 'Quarterly OKR check',
    kind: 'quarterly',
    scoring: 'weighted',
    sections: [
      { kind: 'goals', title: 'Objectives and key results', weight: 100, rated: true, whoAnswers: SELF_AND_MANAGER, questions: [] },
      { kind: 'questions', title: 'Next quarter', weight: 0, rated: false, whoAnswers: SELF_AND_MANAGER, questions: [{ text: 'What will you focus on next quarter?', answer: 'text' }] },
    ],
  },
  {
    key: 'template_probation',
    name: 'Probation review',
    kind: 'probation',
    scoring: 'manager_overall',
    sections: [
      {
        kind: 'questions',
        title: 'Settling in',
        weight: 0,
        rated: false,
        whoAnswers: ['manager'],
        questions: [
          { text: 'How well has the person learnt the role so far?', answer: 'both' },
          { text: 'How do they work with the team?', answer: 'both' },
        ],
      },
      { kind: 'overall', title: 'Overall', weight: 0, rated: true, whoAnswers: ['manager'], questions: [{ text: 'Your overall view and the reason for it.', answer: 'both' }] },
    ],
  },
];

type StarterCompetency = { key: string; name: string; group: 'core' | 'functional' | 'leadership'; description: string; levels: [string, string, string, string] };

/** Four levels each: learning, working, skilled, leading. */
export const STARTER_COMPETENCIES: readonly StarterCompetency[] = [
  { key: 'comp_ownership', name: 'Ownership', group: 'core', description: 'Takes responsibility for outcomes and follows work through to the end.', levels: ['Completes assigned tasks with reminders', 'Completes own work without reminders', 'Owns outcomes beyond own tasks', 'Builds a culture of ownership in the team'] },
  { key: 'comp_communication', name: 'Communication', group: 'core', description: 'Shares information clearly, listens and adapts to the audience.', levels: ['Shares updates when asked', 'Communicates clearly with the team', 'Adapts the message to different audiences', 'Communicates difficult topics with clarity and care'] },
  { key: 'comp_collaboration', name: 'Collaboration', group: 'core', description: 'Works well with others across teams towards shared goals.', levels: ['Works well within the team', 'Helps others without being asked', 'Brings teams together on shared work', 'Builds lasting partnerships across the organisation'] },
  { key: 'comp_customer', name: 'Customer focus', group: 'core', description: 'Understands and acts on what customers, inside or outside, need.', levels: ['Responds to customer requests', 'Anticipates common customer needs', 'Improves how the team serves customers', 'Shapes the service around customer insight'] },
  { key: 'comp_integrity', name: 'Integrity', group: 'core', description: 'Acts honestly and fairly, and keeps commitments.', levels: ['Follows policies and keeps commitments', 'Raises concerns openly', 'Models fair and honest conduct', 'Holds the organisation to high standards'] },
  { key: 'comp_quality', name: 'Quality of work', group: 'functional', description: 'Produces accurate, complete work that meets the standard.', levels: ['Meets the standard with checks', 'Meets the standard on own', 'Raises the standard for the team', 'Sets standards others follow'] },
  { key: 'comp_problem_solving', name: 'Problem solving', group: 'functional', description: 'Finds the cause of problems and chooses sound solutions.', levels: ['Solves routine problems with help', 'Solves routine problems alone', 'Solves new problems and prevents repeats', 'Solves complex problems across teams'] },
  { key: 'comp_expertise', name: 'Role expertise', group: 'functional', description: 'Knows and applies the knowledge and tools the role needs.', levels: ['Learning the basics of the role', 'Applies role knowledge reliably', 'Recognised expert others consult', 'Advances practice in the field'] },
  { key: 'comp_planning', name: 'Planning and organising', group: 'functional', description: 'Plans work, sets priorities and uses time well.', levels: ['Follows a plan made by others', 'Plans own work and meets deadlines', 'Plans work for a team', 'Plans across teams and balances priorities'] },
  { key: 'comp_people', name: 'Developing people', group: 'leadership', description: 'Helps others grow through feedback, coaching and opportunities.', levels: ['Shares knowledge with colleagues', 'Gives regular, useful feedback', 'Coaches people to grow', 'Builds strong leaders'] },
  { key: 'comp_direction', name: 'Setting direction', group: 'leadership', description: 'Sets clear goals and links them to the organisation’s aims.', levels: ['Understands the team’s goals', 'Explains how work links to goals', 'Sets clear goals for a team', 'Sets direction for a function'] },
  { key: 'comp_decisions', name: 'Decision making', group: 'leadership', description: 'Makes timely, well-reasoned decisions and stands by them.', levels: ['Makes routine decisions with guidance', 'Makes sound decisions in own area', 'Makes decisions with incomplete information', 'Makes high-stakes decisions and explains them'] },
];

export const STARTER_DOMAINS = [
  { key: 'domain_core', name: 'Core', group: 'core' },
  { key: 'domain_functional', name: 'Functional', group: 'functional' },
  { key: 'domain_leadership', name: 'Leadership', group: 'leadership' },
] as const;

/**
 * PM7 starter merit matrix (§6.2): five bands × three compa-ratio ranges (below 0.9, 0.9–1.1, above 1.1) with example
 * percentages a company replaces with its own. Rows go from the lowest band to the highest.
 */
export const STARTER_MATRIX = {
  key: 'matrix_5x3',
  name: 'Merit matrix (example, replace with your own)',
  byRank: [
    [{ compaFrom: null, compaTo: 0.9, minPct: 0, targetPct: 2, maxPct: 3 }, { compaFrom: 0.9, compaTo: 1.1, minPct: 0, targetPct: 1, maxPct: 2 }, { compaFrom: 1.1, compaTo: null, minPct: 0, targetPct: 0, maxPct: 1 }],
    [{ compaFrom: null, compaTo: 0.9, minPct: 3, targetPct: 4, maxPct: 5 }, { compaFrom: 0.9, compaTo: 1.1, minPct: 2, targetPct: 3, maxPct: 4 }, { compaFrom: 1.1, compaTo: null, minPct: 1, targetPct: 2, maxPct: 3 }],
    [{ compaFrom: null, compaTo: 0.9, minPct: 6, targetPct: 8, maxPct: 10 }, { compaFrom: 0.9, compaTo: 1.1, minPct: 5, targetPct: 6, maxPct: 7 }, { compaFrom: 1.1, compaTo: null, minPct: 3, targetPct: 4, maxPct: 5 }],
    [{ compaFrom: null, compaTo: 0.9, minPct: 10, targetPct: 12, maxPct: 14 }, { compaFrom: 0.9, compaTo: 1.1, minPct: 7, targetPct: 9, maxPct: 11 }, { compaFrom: 1.1, compaTo: null, minPct: 4, targetPct: 6, maxPct: 8 }],
    [{ compaFrom: null, compaTo: 0.9, minPct: 14, targetPct: 16, maxPct: 18 }, { compaFrom: 0.9, compaTo: 1.1, minPct: 10, targetPct: 12, maxPct: 14 }, { compaFrom: 1.1, compaTo: null, minPct: 6, targetPct: 8, maxPct: 10 }],
  ],
} as const;

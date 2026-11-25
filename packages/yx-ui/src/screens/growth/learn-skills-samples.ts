import type { LiveSkillProfileData, LiveSkillSuggestions, LiveSkillsProfile, LiveTeamSkills, LiveTrainingNeeds, PoshCounts } from './learn-skills-live';

// G3d sample live data (stories and tests).
const ok = () => Promise.resolve({ ok: true });
export const SKILL_PROFILE: LiveSkillProfileData = {
  employeeId: 'p1',
  person: 'Arjun Nair',
  role: 'Line Operator',
  self: true,
  canAssess: false,
  canDecide: true,
  skills: [
    { id: 's1', name: 'Forklift handling', level: 2, required: 3, source: 'Course', evidence: 'Forklift basics', updated: '2026-10-01' },
    { id: 's2', name: 'Food safety', level: null, required: 2, source: 'Not assessed', evidence: '', updated: null },
  ],
  suggestions: [{ id: 'g1', skillId: 's3', skill: 'Lockout tagout', level: 2, from: 'Course', evidence: 'Machine safety' }],
  library: [
    { id: 's1', name: 'Forklift handling' },
    { id: 's3', name: 'Lockout tagout' },
  ],
};
export const liveSkillsProfile = (over: Partial<LiveSkillsProfile> = {}): LiveSkillsProfile => ({ state: 'ready', data: SKILL_PROFILE, onSuggestions: () => {}, onAssess: ok, onAddOwn: ok, ...over });
export const liveSkillSuggestions = (over: Partial<LiveSkillSuggestions> = {}): LiveSkillSuggestions => ({ state: 'ready', data: SKILL_PROFILE, onDecide: ok, ...over });
export const liveTeamSkills = (over: Partial<LiveTeamSkills> = {}): LiveTeamSkills => ({
  state: 'ready',
  data: {
    skills: ['Food safety', 'Forklift handling'],
    skillIds: ['k1', 'k2'],
    people: [
      { employeeId: 'p1', name: 'Arjun Nair', role: 'Line Operator', levels: [null, 2], required: [2, 3] },
      { employeeId: 'p2', name: 'Meena Iyer', role: 'Quality Inspector', levels: [4, null], required: [3, 0] },
    ],
  },
  onPerson: () => {},
  onRaiseNeed: ok,
  ...over,
});
export const liveTrainingNeeds = (over: Partial<LiveTrainingNeeds> = {}): LiveTrainingNeeds => ({
  state: 'ready',
  needs: [
    { id: 'n1', title: 'Forklift refresher for Arjun', who: 'Arjun Nair', source: 'Skill gap', skill: 'Forklift handling', priority: 'High', status: 'New', estCost: 5000 },
    { id: 'n2', title: 'Food safety for Quality', who: 'Quality (department)', source: 'Compliance', skill: 'Food safety', priority: 'Medium', status: 'Planned', plan: 'Food safety basics', estCost: 20000 },
  ],
  budgets: { year: 2026, rows: [{ departmentId: 'd1', dept: 'Quality', planned: 100000, spent: 60000, committed: 50000 }, { departmentId: 'd2', dept: 'Operations', planned: 200000, spent: 40000, committed: 10000 }] },
  people: [{ value: 'p1', label: 'Arjun Nair' }],
  departments: [{ value: 'd1', label: 'Quality' }, { value: 'd2', label: 'Operations' }],
  skills: [{ value: 's1', label: 'Forklift handling' }],
  courses: [{ value: 'c1', label: 'Forklift basics' }],
  onAdd: ok,
  onPlan: ok,
  onStatus: ok,
  onBudget: ok,
  ...over,
});
export const POSH_COUNTS: PoshCounts = {
  minimum: 5,
  committees: [
    { committee: 'Hosur plant', year: 2026, shown: true, received: 6, disposed: 5, pendingOver90: 0, sessions: 2, trainings: 41 },
    { committee: 'Whole company', year: 2026, shown: false, received: null, disposed: null, pendingOver90: null, sessions: 1, trainings: 12 },
  ],
};

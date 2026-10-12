import type { Meta, StoryObj } from '@storybook/react-vite';
import { PerformanceSetupScreen, type PerformanceSetupScreenProps } from './setup';
import type { Competency, RatingScale, ReviewTemplate, Skill } from './types';

// Settings › Performance, wired (batch PM1). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Set-up', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const scale: RatingScale = {
  id: 's1',
  name: 'Five-point scale',
  min: 1,
  max: 5,
  step: 1,
  status: 'active',
  starter: true,
  inUse: true,
  levels: ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'].map((label, i) => ({ value: i + 1, label, description: null })),
  bands: [
    { fromScore: 1, toScore: 2.49, label: 'Below' },
    { fromScore: 2.5, toScore: 3.49, label: 'Meets' },
    { fromScore: 3.5, toScore: 5, label: 'Above' },
  ],
  version: 1,
};
const template = (o: Partial<ReviewTemplate> = {}): ReviewTemplate => ({
  id: 't1',
  familyId: 'f1',
  templateVersion: 1,
  name: 'Annual review',
  kind: 'annual',
  scaleId: 's1',
  scoring: 'weighted',
  status: 'active',
  starter: true,
  activatedAt: '2026-10-01T00:00:00.000Z',
  sections: [
    { kind: 'goals', title: 'Goals', weight: 60, rated: true, whoAnswers: ['self', 'manager'], questions: [] },
    { kind: 'competencies', title: 'Competencies', weight: 40, rated: true, whoAnswers: ['self', 'manager', 'peer'], questions: [] },
  ],
  problem: null,
  version: 2,
  ...o,
});
const competency: Competency = { id: 'c1', skillId: 'k1', name: 'Ownership', group: 'core', description: 'Takes responsibility for outcomes.', status: 'active', starter: true, levels: ['Learning', 'Working', 'Skilled', 'Leading'].map((label, i) => ({ level: i + 1, label, behaviours: null })), roles: [{ designationId: 'd1', designation: 'Team Lead', level: 3, validFrom: '2026-04-01' }], version: 1 };
const skills: Skill[] = [
  { id: 'd1', parentId: null, name: 'Core', kind: 'domain', status: 'active', mergedIntoId: null, starter: true, competency: false },
  { id: 'k1', parentId: 'd1', name: 'Ownership', kind: 'skill', status: 'active', mergedIntoId: null, starter: true, competency: true },
  { id: 'k2', parentId: 'd1', name: 'Taking ownership', kind: 'skill', status: 'merged', mergedIntoId: 'k1', starter: false, competency: false },
];
const BASE: PerformanceSetupScreenProps = {
  state: 'ready',
  today: '2026-10-12',
  scales: [scale],
  templates: [template(), template({ id: 't2', templateVersion: 2, status: 'draft', starter: false, problem: 'The weights of rated sections add up to 90, not 100.', sections: [{ kind: 'goals', title: 'Goals', weight: 60, rated: true, whoAnswers: ['self', 'manager'], questions: [] }, { kind: 'competencies', title: 'Competencies', weight: 30, rated: true, whoAnswers: ['self', 'manager'], questions: [] }] })],
  competencies: [competency],
  skills,
  designations: [{ value: 'd1', label: 'Team Lead' }, { value: 'd2', label: 'Engineer' }],
  onUseStarters: ok,
  onSaveScale: ok,
  onRetireScale: ok,
  onSaveTemplate: ok,
  onNewVersion: ok,
  onActivate: ok,
  onRetireTemplate: ok,
  onSaveCompetency: ok,
  onRetireCompetency: ok,
  onSaveSkill: ok,
  onRetireSkill: ok,
  onMergeSkill: ok,
};

export const Templates: S = { name: 'Templates (one draft not ready)', render: () => <PerformanceSetupScreen {...BASE} /> };
export const NewCompany: S = { name: 'New company · starters', render: () => <PerformanceSetupScreen {...BASE} templates={[]} scales={[]} competencies={[]} skills={[]} /> };

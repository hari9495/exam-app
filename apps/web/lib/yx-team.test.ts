import type { JourneyTask } from '@yukthix/ui/lifecycle';
import { teamTasks } from './yx-team';

const task = (over: Partial<JourneyTask>): JourneyTask => ({ id: 't', key: 'k', title: 'Call the joiner', kind: 'confirm', ownerType: 'manager', ownerLabel: 'Manager', assignee: null, dueOn: '2026-10-24', dueOffsetDays: -7, status: 'open', overdue: false, required: true, locked: false, form: null, documentType: null, answers: null, link: null, completedAt: null, completedBy: null, skipReason: null, canComplete: true, canSkip: false, version: 1, journeyId: 'j', journeyKind: 'onboarding', person: 'Sneha Pillai', ...over }) as JourneyTask;

describe('teamTasks (PPL-08)', () => {
  it('lists the open tasks owned as the manager; HR-owned checklist tasks for other people stay off My team', () => {
    const rows = teamTasks([task({ id: 'm' }), task({ id: 'hr', ownerType: 'hr', title: 'Collect the PAN card' }), task({ id: 'done', status: 'done' })]);
    expect(rows.map((r) => r.id)).toEqual(['m']);
    expect(rows[0]).toMatchObject({ title: 'Call the joiner · Sneha Pillai', kind: 'Onboarding', journeyId: 'j' });
  });
});

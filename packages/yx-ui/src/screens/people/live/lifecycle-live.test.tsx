import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JourneyTemplatesScreen } from './templates';
import type { Journey, JourneyTask, JourneyTemplates, JoinerBoard, JoinerPlaces, QueueDocument } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const PLACES: JoinerPlaces = {
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }],
  locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }],
  departments: [{ value: 'd1', label: 'Production' }],
  designations: [{ value: 'g1', label: 'Production Supervisor' }],
  employmentTypes: [{ value: 't1', label: 'Permanent' }],
  managers: [{ value: 'm1', label: 'Divya Raghunathan' }],
};
const BOARD: JoinerBoard = {
  today: '2026-10-09',
  canAdd: true,
  joiners: [
    { id: 'j1', personId: 'p1', name: 'Sneha Pillai', email: null, joiningOn: '2026-10-14', status: 'invited', source: 'direct', location: 'Hosur plant', department: 'Production', designation: 'Production Supervisor', manager: 'Divya Raghunathan', journeyId: 'jr1', departmentId: 'd1', designationId: 'g1', employmentTypeId: 't1', progress: 25, openTasks: 9, overdueTasks: 1, version: 1 },
    { id: 'j2', personId: 'p2', name: 'Asha Rao', email: null, joiningOn: '2026-11-20', status: 'invited', source: 'import', location: 'Hosur plant', department: null, designation: null, manager: null, journeyId: 'jr2', departmentId: null, designationId: null, employmentTypeId: null, progress: 0, openTasks: 12, overdueTasks: 0, version: 1 },
  ],
};
const task = (o: Partial<JourneyTask>): JourneyTask => ({
  id: 't1',
  key: 'welcome_call',
  title: 'Call the joiner before day one',
  kind: 'tick',
  ownerType: 'manager',
  ownerLabel: 'Manager',
  assignee: 'Divya Raghunathan',
  dueOn: '2026-10-16',
  dueOffsetDays: -3,
  status: 'open',
  overdue: false,
  required: true,
  locked: false,
  form: null,
  documentType: null,
  answers: null,
  link: null,
  completedAt: null,
  completedBy: null,
  skipReason: null,
  canComplete: true,
  canSkip: false,
  version: 1,
  ...o,
});
const JOURNEY: Journey = {
  id: 'jr1',
  kind: 'onboarding',
  person: 'Sneha Pillai',
  personId: 'p1',
  subjectType: 'preboarding',
  subjectId: 'j1',
  anchorOn: '2026-10-19',
  status: 'active',
  progress: 25,
  template: 'Standard onboarding',
  owner: 'Lakshmi Venkatesan',
  canManage: true,
  today: '2026-10-09',
  tasks: [
    task({}),
    task({ id: 't2', key: 'appointment_letter', title: 'Issue the appointment letter', kind: 'letter', letterType: 'appointment', canComplete: false, ownerType: 'hr', ownerLabel: 'HR', assignee: 'Lakshmi Venkatesan', locked: true, dueOn: '2026-10-19' }),
    task({ id: 't3', key: 'esic', title: 'Register with ESIC where ESI applies', ownerType: 'payroll', ownerLabel: 'Payroll', required: false, canSkip: true }),
    task({ id: 't4', key: 'collect_pan', title: 'Collect the PAN card', kind: 'document', documentType: 'pan_card', canComplete: false, dueOn: '2026-10-08', overdue: true }),
    task({ id: 't5', key: 'laptop', title: 'Laptop or work device', kind: 'desk_request', status: 'done', canComplete: false, completedBy: 'Farah Khan', link: { type: 'sd_ticket', id: 'x' } }),
  ],
};

describe('Checklist templates (settings)', () => {
  const DATA: JourneyTemplates = {
    templates: [
      {
        id: 'tp1',
        kind: 'onboarding',
        name: 'Standard onboarding',
        legalEntityId: null,
        locationId: null,
        departmentId: null,
        starterKey: 'onboarding_standard',
        active: true,
        version: 1,
        tasks: [
          { key: 'appointment_letter', title: 'Issue the appointment letter', ownerType: 'hr', ownerLabel: 'HR', ownerUserId: null, ownerGroupId: null, kind: 'letter', config: {}, dueOffsetDays: 0, dependsOn: [], required: true, locked: true },
          { key: 'laptop', title: 'Laptop or work device', ownerType: 'it', ownerLabel: 'IT', ownerUserId: null, ownerGroupId: null, kind: 'desk_request', config: {}, dueOffsetDays: -2, dependsOn: [], required: true, locked: false },
        ],
      },
    ],
    starters: [{ key: 'offboarding_standard', kind: 'offboarding', name: 'Standard offboarding (starter)', summary: 'Handover and exit tasks.', tasks: 7, copied: false }],
  };
  it('the law’s task has no Remove; other tasks can be removed and the checklist saved', async () => {
    const onSave = vi.fn(async () => ({}));
    render(<JourneyTemplatesScreen state="ready" data={DATA} teams={[{ value: 'g1', label: 'IT and Admin team' }]} catalogItems={[{ value: 'i1', label: 'New laptop', desk: 'IT help' }]} onUseStarter={vi.fn()} onSave={onSave} />);
    expect(screen.getByText('IT · 2 days before')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit checklist' }));
    const sheet = screen.getByRole('dialog');
    const removes = within(sheet).getAllByRole('button', { name: 'Remove task' });
    expect(removes).toHaveLength(1);
    await ue.click(removes[0]);
    await ue.click(within(sheet).getByRole('button', { name: 'Save checklist' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tasks: [expect.objectContaining({ key: 'appointment_letter', locked: true })] }));
  });

  it('offers the starter for leaving until it is copied', async () => {
    const onUseStarter = vi.fn(async () => ({}));
    render(<JourneyTemplatesScreen state="ready" data={DATA} teams={[]} catalogItems={[]} onUseStarter={onUseStarter} onSave={vi.fn()} />);
    await ue.click(screen.getByRole('radio', { name: 'Leaving' }));
    await ue.click(screen.getByRole('button', { name: 'Use this starter' }));
    expect(onUseStarter).toHaveBeenCalledWith('offboarding_standard');
  });
});

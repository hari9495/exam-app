import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DocumentQueueScreen, JourneyScreen, MyTasksScreen, OnboardingBoardScreen } from './lifecycle';
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

describe('Onboarding board (PPL-11)', () => {
  it('lists joiners with progress and overdue tasks; the Segment narrows to this week', async () => {
    const onOpen = vi.fn();
    render(<OnboardingBoardScreen state="ready" data={BOARD} places={PLACES} onOpen={onOpen} onAdd={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByText('Sneha Pillai')).toBeInTheDocument();
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Joining this week' }));
    expect(screen.queryByText('Asha Rao')).toBeNull();
    await ue.click(within(screen.getByRole('row', { name: /Sneha Pillai/ })).getByRole('button', { name: 'Checklist' }));
    expect(onOpen).toHaveBeenCalledWith('jr1');
  });

  it('Add joiner shows what is missing only after Save, then sends the joiner', async () => {
    const onAdd = vi.fn(async () => ({}));
    render(<OnboardingBoardScreen state="ready" data={BOARD} places={PLACES} onOpen={vi.fn()} onAdd={onAdd} onImport={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Add joiner' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByText('Enter the first name.')).toBeNull();
    await ue.click(within(sheet).getByRole('button', { name: 'Add joiner' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText('Enter the first name.').length).toBeGreaterThan(0);
  });

  it('import checks the file first and shows each row’s problem', async () => {
    const onImport = vi.fn(async (_csv: string, commit: boolean) => ({ committed: commit, added: commit ? 1 : 0, rows: [{ line: 2, name: 'Asha Rao', joiningOn: '2026-11-20', ok: true, problem: null }, { line: 3, name: 'Bad Row', joiningOn: null, ok: false, problem: 'No location "NOWHERE".' }] }));
    render(<OnboardingBoardScreen state="ready" data={BOARD} places={PLACES} onOpen={vi.fn()} onAdd={vi.fn()} onImport={onImport} />);
    await ue.click(screen.getByRole('button', { name: 'Import joiners' }));
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox'), 'given_name');
    await ue.click(within(sheet).getByRole('button', { name: 'Check the file' }));
    expect(onImport).toHaveBeenLastCalledWith('given_name', false);
    expect(within(sheet).getByText('No location "NOWHERE".')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Add 1 joiner' }));
    expect(onImport).toHaveBeenLastCalledWith('given_name', true);
  });
});

describe('Checklist (PPL-13)', () => {
  it('shows owners and due dates; the law’s task cannot be skipped; an optional one needs a reason to skip', async () => {
    const onSkip = vi.fn(async () => ({}));
    const onComplete = vi.fn(async () => ({}));
    const onIssueLetter = vi.fn(async () => ({}));
    render(<JourneyScreen state="ready" data={JOURNEY} onComplete={onComplete} onSkip={onSkip} onUpload={vi.fn()} onIssueLetter={onIssueLetter} onPreviewLetter={vi.fn()} onPostpone={vi.fn()} onBack={vi.fn()} />);
    const law = screen.getByRole('row', { name: /Issue the appointment letter/ });
    expect(within(law).getByText(/Required by law/)).toBeInTheDocument();
    expect(within(law).queryByRole('button', { name: 'Skip' })).toBeNull();
    // 6b: the letter is issued from here and the task closes by itself; it is never ticked by hand.
    expect(within(law).queryByRole('button', { name: 'Mark done' })).toBeNull();
    await ue.click(within(law).getByRole('button', { name: 'Issue letter' }));
    let dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Issue letter' }));
    expect(onIssueLetter).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
    await ue.click(within(screen.getByRole('row', { name: /ESIC/ })).getByRole('button', { name: 'Skip' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Skip task' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'ESI does not apply');
    await ue.click(within(dialog).getByRole('button', { name: 'Skip task' }));
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ id: 't3' }), 'ESI does not apply');
  });

  it('a document task is uploaded by HR, never ticked; done tasks are hidden under To do', async () => {
    render(<JourneyScreen state="ready" data={JOURNEY} onComplete={vi.fn()} onSkip={vi.fn()} onUpload={vi.fn()} onBack={vi.fn()} />);
    const pan = screen.getByRole('row', { name: /Collect the PAN card/ });
    expect(within(pan).queryByRole('button', { name: 'Mark done' })).toBeNull();
    expect(within(pan).getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(within(pan).getByText('Overdue')).toBeInTheDocument();
    expect(screen.queryByText('Laptop or work device')).toBeNull();
    await ue.click(screen.getByRole('radio', { name: 'All tasks' }));
    expect(screen.getByText('Laptop or work device')).toBeInTheDocument();
  });
});

describe('My checklist tasks', () => {
  it('shows who each task is for and opens their checklist', async () => {
    const onOpen = vi.fn();
    render(<MyTasksScreen state="ready" data={{ today: '2026-10-09', tasks: [task({ person: 'Sneha Pillai', anchorOn: '2026-10-19', journeyId: 'jr1', journeyKind: 'onboarding' })] }} onComplete={vi.fn()} onSkip={vi.fn()} onOpen={onOpen} />);
    expect(screen.getByText('Sneha Pillai')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Checklist' }));
    expect(onOpen).toHaveBeenCalledWith('jr1');
  });
});

describe('Documents to verify (PPL-27)', () => {
  const DOC: QueueDocument = { id: 'd1', personId: 'p1', person: 'Sneha Pillai', typeKey: 'pan_card', typeName: 'PAN card', sensitivity: 'confidential', status: 'uploaded', expiresOn: null, rejectReason: null, file: { name: 'pan.png', scanStatus: 'clean', size: 1000 }, uploadedAt: '2026-10-09T05:00:00Z', version: 2 };
  it('verifies a clean file and asks for a reason to reject; files still being checked offer nothing', async () => {
    const onDecide = vi.fn(async () => ({}));
    render(<DocumentQueueScreen state="ready" rows={[DOC, { ...DOC, id: 'd2', person: 'Asha Rao', file: { name: 'x.pdf', scanStatus: 'pending', size: 5 } }]} onDownload={vi.fn()} onDecide={onDecide} />);
    const asha = screen.getByRole('row', { name: /Asha Rao/ });
    expect(within(asha).queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(within(asha).getByText('Being checked')).toBeInTheDocument();
    const sneha = screen.getByRole('row', { name: /Sneha Pillai/ });
    await ue.click(within(sneha).getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await ue.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await ue.click(within(sneha).getByRole('button', { name: 'Verify' }));
    expect(onDecide).toHaveBeenCalledWith(DOC, 'verify');
  });
});

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

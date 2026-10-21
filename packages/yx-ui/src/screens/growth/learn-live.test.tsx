import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import type { Course } from './learn-me';
import { LiveAssignmentRulesScreen, LiveComplianceScreen, LiveCourseBuilderScreen, LiveCoursePlayerScreen, LiveMyLearningScreen, TeamLearningScreen, fromConditions, type LiveBuilder, type LiveRules } from './learn-live';

// Learning core, wired: My learning (LRN-01), the player (LRN-02), the builder (LRN-03), rules (LRN-07), compliance
// (LRN-08) and the manager's team.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const course = (o: Partial<Course> = {}): Course => ({ id: 'c1', title: 'Fire safety and evacuation', type: 'Self-paced', source: 'Kaveri Foods', duration: '45 min', skills: ['Fire safety'], cost: 0, mandatory: true, certificate: true, ...o });

describe('My learning (LRN-01)', () => {
  it('assigned with status words and due dates; the catalogue enrols, or asks when approval is needed', async () => {
    const onEnrol = vi.fn(async () => undefined);
    const onOpen = vi.fn();
    const base = {
      state: 'ready' as const,
      onRetry: vi.fn(),
      onTab: vi.fn(),
      onOpen,
      onEnrol,
      onDownload: vi.fn(),
      data: {
        today: '2026-10-21',
        employee: true,
        enrolments: [{ id: 'e1', course: course(), status: 'Overdue' as const, source: 'Assigned by rule', due: '2026-10-20', progress: 50 }],
        certificates: [],
        catalogue: [course(), course({ id: 'c2', title: 'Lean six sigma', mandatory: false, approval: true, source: 'Provider', provider: 'Kaizen Institute', cost: 24000 })],
      },
    };
    const { unmount } = wrap(<LiveMyLearningScreen live={{ ...base, tab: 'mine' }} />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText(/Assigned by rule · due 20 Oct 2026/)).toBeInTheDocument();
    await ue.click(screen.getByRole('link', { name: 'Fire safety and evacuation' }));
    expect(onOpen).toHaveBeenCalledWith('e1');
    unmount();
    wrap(<LiveMyLearningScreen live={{ ...base, tab: 'catalogue' }} />);
    const lean = screen.getByRole('article', { name: 'Lean six sigma' });
    expect(within(lean).getByText(/₹24,000 · needs approval/)).toBeInTheDocument();
    await ue.click(within(lean).getByRole('button', { name: 'Request' }));
    const sheet = await screen.findByRole('dialog', { name: 'Enrol in Lean six sigma' });
    expect(within(sheet).getByText('Goes to your manager, then L&D for approval.')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onEnrol).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }), { acceptBond: false }));
    // Already enrolled: no second Enrol.
    expect(within(screen.getByRole('article', { name: 'Fire safety and evacuation' })).queryByRole('button')).toBeNull();
  });
});

describe('Asking for a course (LRN-06)', () => {
  it('above the bond threshold the bond is accepted before the request goes', async () => {
    const onEnrol = vi.fn(async () => undefined);
    wrap(<LiveMyLearningScreen live={{ state: 'ready', onRetry: vi.fn(), onTab: vi.fn(), onOpen: vi.fn(), onDownload: vi.fn(), onEnrol, tab: 'catalogue', data: { today: '2026-10-21', employee: true, enrolments: [], certificates: [], catalogue: [course({ id: 'c9', title: 'Certified quality auditor', cost: 32000, approval: true })] } }} />);
    await ue.click(screen.getByRole('button', { name: 'Request' }));
    const sheet = await screen.findByRole('dialog', { name: 'Enrol in Certified quality auditor' });
    expect(within(sheet).getByRole('button', { name: 'Send request' })).toBeDisabled();
    await ue.click(within(sheet).getByRole('checkbox', { name: 'I accept the training bond terms' }));
    await ue.click(within(sheet).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onEnrol).toHaveBeenCalledWith(expect.objectContaining({ id: 'c9' }), { acceptBond: true }));
  });
});

describe('Course player (LRN-02)', () => {
  const data = (o: { completed?: boolean } = {}) => ({
    enrolment: { id: 'e1', status: (o.completed ? 'Completed' : 'In progress') as 'Completed' | 'In progress', due: '2026-11-20' },
    course: course(),
    items: [
      { id: 'i1', title: 'Fire safety handbook', kind: 'PDF' as const, minutes: 20, required: false, done: true, url: null },
      { id: 'i2', title: 'Evacuation map', kind: 'Link' as const, minutes: 5, required: true, done: Boolean(o.completed), url: 'https://example.test' },
    ],
    certificate: o.completed ? { id: 'cert1', issued: '2026-10-21', expires: '2027-10-21' } : null,
  });

  it('opens the next item not done, marks it done; the completion shows the certificate to download', async () => {
    const onDone = vi.fn(async () => undefined);
    const onDownload = vi.fn();
    const { unmount } = wrap(<LiveCoursePlayerScreen live={{ state: 'ready', onRetry: vi.fn(), data: data(), onOpenItem: vi.fn(), onDone, onDownload }} />);
    expect(screen.getByText('0 of 1 required items · 0%')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Link: Evacuation map' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2' })));
    unmount();
    wrap(<LiveCoursePlayerScreen live={{ state: 'ready', onRetry: vi.fn(), data: data({ completed: true }), onOpenItem: vi.fn(), onDone, onDownload }} />);
    expect(screen.getByText('You completed Fire safety and evacuation')).toBeInTheDocument();
    expect(screen.getByText(/valid until 21 Oct 2027/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download certificate' }));
    expect(onDownload).toHaveBeenCalledWith('cert1');
  });
});

describe('Course builder (LRN-03)', () => {
  it('publishing needs a required item; an item is made required in place', async () => {
    const live: LiveBuilder = {
      state: 'ready',
      onRetry: vi.fn(),
      data: { course: { ...course(), status: 'draft', version: 1, description: null, durationMinutes: 45, certificateMonths: 12 }, items: [{ id: 'i1', title: 'Fire safety handbook', kind: 'PDF', minutes: 20, required: false, url: null, file: 'handbook.pdf' }] },
      onSave: vi.fn(async () => undefined),
      onStatus: vi.fn(async () => undefined),
      onAddItem: vi.fn(async () => undefined),
      onItem: vi.fn(async () => undefined),
      onRemove: vi.fn(async () => undefined),
      onBack: vi.fn(),
    };
    wrap(<LiveCourseBuilderScreen live={live} />);
    expect(screen.getByRole('button', { name: 'Publish course' })).toBeDisabled();
    expect(screen.getByText('Mark at least one item as required')).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: 'Required' }));
    expect(live.onItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }), { required: true });
  });
});

describe('Assignment rules (LRN-07)', () => {
  it('only "all of these" and "is one of" are kept', () => {
    const rule = (join: 'and' | 'or') => ({ trigger: null, actions: [], conditions: { id: 'g', join, items: [{ id: 'a', field: 'location', operator: 'one_of' as const, value: ['hsr'] }, { id: 'b', field: 'designation', operator: 'contains' as const, value: 'operator' }] } });
    expect(fromConditions(rule('and'))).toEqual({ ok: true, value: { legalEntityIds: [], locationIds: ['hsr'], departmentIds: [], designation: 'operator' } });
    expect(fromConditions(rule('or'))).toMatchObject({ ok: false });
  });

  it('a new rule needs a name; the preview says who matches; saving sends the rule', async () => {
    const onSave = vi.fn(async () => undefined);
    const onPreview = vi.fn(async () => ({ matches: 4, toEnrol: 3 }));
    const live: LiveRules = { state: 'ready', onRetry: vi.fn(), rules: [], courses: [{ value: 'c1', label: 'Fire safety and evacuation' }], entities: [], locations: [{ value: 'hsr', label: 'Hosur plant' }], departments: [], onPreview, onSave };
    wrap(<LiveAssignmentRulesScreen live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add rule' })[0]);
    const drawer = await screen.findByRole('dialog', { name: 'New assignment rule' });
    await ue.click(within(drawer).getByRole('button', { name: 'Save rule' }));
    expect(within(drawer).getByText('Give the rule a name.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /Rule name/ }), 'Fire safety for everyone');
    await ue.click(within(drawer).getByRole('combobox', { name: /Course/ }));
    await ue.click(screen.getByRole('option', { name: 'Fire safety and evacuation' }));
    await waitFor(() => expect(within(drawer).getByText(/4 people match today; 3 don’t have a valid completion and will be enrolled when you save/)).toBeInTheDocument());
    await ue.click(within(drawer).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Fire safety for everyone', courseId: 'c1', dueDays: 30, repeatMonths: 12, active: true, legalEntityIds: [], locationIds: [], departmentIds: [], designation: null }, null));
  });
});

describe('Compliance and the team (LRN-08)', () => {
  it('Remind overdue only when someone is overdue; every figure drills', () => {
    const live = { state: 'ready' as const, onRetry: vi.fn(), entities: [], entity: 'all', onEntity: vi.fn(), onExport: vi.fn(), onRemind: vi.fn(async () => undefined), data: { today: '2026-10-21', courses: ['Fire safety'], rows: [{ dept: 'Quality', done: [5], assigned: [6], size: 6 }], overdue: [], expiring: 2, rules: 1 } };
    wrap(<LiveComplianceScreen live={live} />);
    expect(screen.getByRole('button', { name: 'Remind overdue' })).toBeDisabled();
    expect(screen.getByText('No one is overdue')).toBeInTheDocument();
  });

  it('the team in words per course', () => {
    render(<TeamLearningScreen data={{ courses: ['Fire safety'], people: [{ employeeId: 'p1', name: 'Arjun', role: 'Line Operator', cells: ['Overdue'] }], overdue: [{ id: 'o1', name: 'Arjun', course: 'Fire safety', due: '2026-10-11' }] }} />);
    expect(screen.getByRole('row', { name: /Arjun/ })).toHaveTextContent('Overdue');
    expect(screen.getByText('Arjun: Fire safety (due 11 Oct 2026)')).toBeInTheDocument();
  });
});

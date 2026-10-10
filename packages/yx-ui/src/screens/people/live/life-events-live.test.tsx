import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FirstThirtyDaysScreen, LifeJourneysScreen, MyTasksScreen } from './lifecycle';
import { JourneyTemplatesScreen } from './templates';
import type { JourneyTask, JourneyTemplates } from './types';

// Lifecycle 6f (design §7.5 / §7.6): read / watch / quick-survey steps, life-event checklists in settings, HR's list
// and a new hire's first 30 days.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const task = (o: Partial<JourneyTask>): JourneyTask => ({
  id: 't1',
  key: 'read_place',
  title: 'About your new place of work',
  kind: 'read',
  ownerType: 'person',
  ownerLabel: 'The joiner',
  assignee: 'Ravi Kumar',
  dueOn: '2026-10-16',
  dueOffsetDays: 1,
  status: 'open',
  overdue: false,
  required: true,
  locked: false,
  form: null,
  documentType: null,
  answers: null,
  content: { text: 'Check your new holiday list.', url: 'https://intranet.test/chennai' },
  link: null,
  completedAt: null,
  completedBy: null,
  skipReason: null,
  canComplete: true,
  canSkip: false,
  version: 3,
  journeyId: 'jr9',
  journeyKind: 'transfer',
  person: 'Ravi Kumar',
  anchorOn: '2026-10-15',
  ...o,
});

describe('Read, watch and survey steps', () => {
  it('a read step shows its text and link, and "I have read this" completes it', async () => {
    const onComplete = vi.fn(async () => ({}));
    render(<MyTasksScreen state="ready" data={{ today: '2026-10-10', tasks: [task({})] }} onComplete={onComplete} onSkip={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText('Moves 15 Oct 2026')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Read' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Check your new holiday list.')).toBeInTheDocument();
    expect(within(dlg).getByRole('link', { name: 'Open the page' })).toHaveAttribute('rel', 'noopener noreferrer');
    await ue.click(within(dlg).getByRole('button', { name: 'I have read this' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), {});
  });

  it('a watch step shows the length of the video', async () => {
    render(<MyTasksScreen state="ready" data={{ today: '2026-10-10', tasks: [task({ kind: 'watch', title: 'Safety video', content: { url: 'https://video.test/safety', minutes: 12 } })] }} onComplete={vi.fn()} onSkip={vi.fn()} onOpen={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Watch' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Open the video (about 12 minutes)' })).toHaveAttribute('href', 'https://video.test/safety');
  });

  it('a quick survey sends only when every statement is rated (one choice each, on a Segment)', async () => {
    const onComplete = vi.fn(async () => ({}));
    render(<MyTasksScreen state="ready" data={{ today: '2026-10-10', tasks: [task({ kind: 'survey', title: 'How is the move going?', content: { questions: ['I have what I need.', 'My team made me welcome.'] } })] }} onComplete={onComplete} onSkip={vi.fn()} onOpen={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Answer' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('HR sees your answers. Your manager sees only that you answered.')).toBeInTheDocument();
    const send = within(dlg).getByRole('button', { name: 'Send answers' });
    expect(send).toBeDisabled();
    await ue.click(within(within(dlg).getByRole('radiogroup', { name: 'I have what I need.' })).getByRole('radio', { name: '4' }));
    expect(send).toBeDisabled();
    await ue.click(within(within(dlg).getByRole('radiogroup', { name: 'My team made me welcome.' })).getByRole('radio', { name: '2' }));
    await ue.type(within(dlg).getByRole('textbox'), 'Seat not ready');
    await ue.click(send);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), { answers: { ratings: [4, 2], comment: 'Seat not ready' } });
  });
});

describe('Life-event checklists in settings', () => {
  const DATA: JourneyTemplates = {
    templates: [
      {
        id: 'tp2',
        kind: 'transfer',
        name: 'Transfer',
        legalEntityId: null,
        locationId: null,
        departmentId: null,
        starterKey: 'transfer_standard',
        active: false,
        version: 1,
        tasks: [{ key: 'pulse', title: 'How is the move going?', ownerType: 'person', ownerLabel: 'The joiner', ownerUserId: null, ownerGroupId: null, kind: 'survey', config: { questions: ['I have what I need.'] }, dueOffsetDays: 21, dependsOn: [], required: true, locked: false }],
      },
    ],
    starters: [{ key: 'new_manager_standard', kind: 'new_manager', name: 'New manager (starter)', summary: 'For a first team.', tasks: 5, copied: false }],
  };

  it('Life events lists the copies (Not in use) and the starters; turning one on is saved', async () => {
    const onSave = vi.fn(async () => ({}));
    const onUseStarter = vi.fn(async () => ({}));
    render(<JourneyTemplatesScreen state="ready" data={DATA} teams={[]} catalogItems={[]} onUseStarter={onUseStarter} onSave={onSave} />);
    expect(screen.queryByText('Transfer · 1 tasks · Not in use · from the YukthiX starter')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Life events' }));
    expect(screen.getByText('Transfer · 1 tasks · Not in use · from the YukthiX starter')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Use this starter' }));
    expect(onUseStarter).toHaveBeenCalledWith('new_manager_standard');
    await ue.click(screen.getByRole('button', { name: 'Edit checklist' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('textbox', { name: /Statements to rate/ })).toHaveValue('I have what I need.');
    await ue.click(within(sheet).getByRole('checkbox', { name: 'In use: starts by itself for each transfer' }));
    await ue.click(within(sheet).getByRole('button', { name: 'Save checklist' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ active: true, kind: 'transfer' }));
  });
});

describe('HR list and the first 30 days', () => {
  it('Life events lists running checklists and opens one', async () => {
    const onOpen = vi.fn();
    render(<LifeJourneysScreen state="ready" rows={[{ id: 'jr9', kind: 'transfer', kindLabel: 'Transfer', person: 'Ravi Kumar', anchorOn: '2026-10-15', progress: 40 }]} onOpen={onOpen} />);
    expect(screen.getByText('40%')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Checklist' }));
    expect(onOpen).toHaveBeenCalledWith('jr9');
  });

  it('My first 30 days shows the day, the people and the steps by when they fall', () => {
    render(
      <FirstThirtyDaysScreen
        state="ready"
        data={{ journeyId: 'jr1', joinedOn: '2026-10-05', date: '2026-10-10', day: 6, manager: 'Arun Kumar', buddy: 'Meena S', done: 2, today: [], week: [task({ title: 'How things work here', journeyKind: 'onboarding' })], month: [] }}
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText('Day 6 of 30. You joined on 5 Oct 2026.')).toBeInTheDocument();
    expect(screen.getByText('Arun Kumar')).toBeInTheDocument();
    expect(screen.getByText('Meena S')).toBeInTheDocument();
    expect(screen.getByText('Nothing for today.')).toBeInTheDocument();
    expect(screen.getByText('How things work here')).toBeInTheDocument();
    expect(screen.getByText('Nothing else this month.')).toBeInTheDocument();
  });
});

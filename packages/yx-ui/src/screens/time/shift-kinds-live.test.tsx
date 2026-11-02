import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShiftEditorScreen } from './roster';
import type { LiveShiftSetup } from './live/shifts-setup';
import type { ShiftSetup } from './live/types';

// TIM-06 Flexi and Split, live (founder 2 Nov 2026): the designed shift editor with real data. The type shows only once
// the company turns flexi or split on; a saved shift keeps its type; flexi needs core hours inside the shift; a split's
// parts go in order with the company's shortest gap; a split has no break rule.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const V = { validFrom: '2026-01-01', graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 0, breakAboveMinutes: 300 };
const BASE: ShiftSetup = {
  today: '2026-11-03',
  shifts: [{ id: 's-g', code: 'G', name: 'General', colour: 'blue', night: false, active: true, kind: 'fixed', versions: [{ ...V, start: 570, end: 1110, breakMinutes: 30 }] }],
  patterns: [],
  otRules: [],
  projects: [],
  night: { locations: [], consents: [] },
  hasCompOffType: false,
  locations: [],
  departments: [],
  entities: [],
  people: [],
  users: [],
  types: { flexi: false, split: false, minGapMinutes: 60, flexiLate: 'core_start', flexiShort: 'shift_hours' },
};
const ON: ShiftSetup = {
  ...BASE,
  types: { ...BASE.types!, flexi: true, split: true },
  shifts: [
    ...BASE.shifts,
    { id: 's-fx', code: 'FX', name: 'Flexi day', colour: 'teal', night: false, active: true, kind: 'flexi', versions: [{ ...V, start: 480, end: 1200, coreStart: 660, coreEnd: 960, otAfterMinutes: 540, breakMinutes: 30 }] },
    { id: 's-sp', code: 'SP', name: 'Canteen split', colour: 'green', night: false, active: true, kind: 'split', versions: [{ ...V, start: 420, end: 1260, firstEnd: 660, secondStart: 1020 }] },
  ],
};
const live = (data: ShiftSetup): LiveShiftSetup => ({
  state: 'ready',
  data,
  onCreateShift: vi.fn(async () => ({})),
  onShiftTimes: vi.fn(async () => ({})),
  onShiftDetails: vi.fn(async () => ({})),
  onCreatePattern: vi.fn(async () => ({})),
  onAssignPattern: vi.fn(async () => ({})),
  onRemoveAssignment: vi.fn(async () => ({})),
  onCreateOtRule: vi.fn(async () => ({})),
  onRemoveOtRule: vi.fn(async () => ({})),
  onSaveProject: vi.fn(async () => ({})),
  onAddConsent: vi.fn(async () => ({})),
  onWithdrawConsent: vi.fn(async () => ({})),
  onAttest: vi.fn(async () => ({})),
});
const time = async (label: RegExp | string, value: string) => {
  const box = screen.getByRole('textbox', { name: label });
  await ue.clear(box);
  await ue.type(box, value);
  await ue.tab();
};
const newShift = async (code: string, name: string) => {
  await ue.click(screen.getByRole('button', { name: 'Add a shift' }));
  await ue.type(screen.getByRole('textbox', { name: /^Name/ }), name);
  await ue.type(screen.getByRole('textbox', { name: /^Code/ }), code);
};

describe('TIM-06 Flexi and Split, live', () => {
  it('company setting off (the default): no Type field, a new shift is fixed as before', async () => {
    const p = live(BASE);
    render(<ShiftEditorScreen live={p} />);
    await newShift('E', 'Evening');
    expect(screen.queryByRole('radiogroup', { name: 'Type' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(p.onCreateShift).toHaveBeenCalled());
    const sent = vi.mocked(p.onCreateShift).mock.calls[0][0];
    expect(sent).not.toHaveProperty('kind');
    expect(sent).not.toHaveProperty('coreStart');
  });

  it('the list says the type and a split shows both parts; a saved shift keeps its type', async () => {
    render(<ShiftEditorScreen live={live(ON)} />);
    const list = screen.getByRole('list', { name: 'Shifts' });
    expect(list).toHaveTextContent('Flexi with core hours · 8:00 am – 8:00 pm');
    expect(list).toHaveTextContent('Split · 7:00 am – 11:00 am, 5:00 pm – 9:00 pm');
    expect(screen.getByRole('radio', { name: 'Fixed' })).toBeDisabled();
    expect(screen.getByText(/Type is fixed once the shift is saved/)).toBeInTheDocument();
  });

  it('Flexi (design story Flexi): core hours and overtime after hours worked are saved with the type', async () => {
    const p = live(ON);
    render(<ShiftEditorScreen live={p} />);
    await newShift('FY', 'Flexi office');
    await ue.click(screen.getByRole('radio', { name: 'Flexi with core hours' }));
    expect(screen.getByRole('textbox', { name: /Core from/ })).toBeInTheDocument();
    expect(screen.getByText(/Everyone is in for core hours, 11:00 am – 4:00 pm/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Overtime after/ }), '9');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(p.onCreateShift).toHaveBeenCalledWith(expect.objectContaining({ kind: 'flexi', start: 480, end: 1200, coreStart: 660, coreEnd: 960, otAfterMinutes: 540 })));
  });

  it('Flexi: core hours outside the shift are a field error, nothing is sent', async () => {
    const p = live(ON);
    render(<ShiftEditorScreen live={p} />);
    await newShift('FY', 'Flexi office');
    await ue.click(screen.getByRole('radio', { name: 'Flexi with core hours' }));
    await time(/Core to/, '9:00 pm');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    expect(screen.getAllByText(/Core hours sit inside the shift/).length).toBeGreaterThan(0);
    expect(p.onCreateShift).not.toHaveBeenCalled();
  });

  it('Split (design story Split): two parts saved as start, first end, second start and end; the gap is the break', async () => {
    const p = live(ON);
    render(<ShiftEditorScreen live={p} />);
    await newShift('SQ', 'Lunch split');
    await ue.click(screen.getByRole('radio', { name: 'Split' }));
    expect(screen.getByRole('textbox', { name: /First part from/ })).toBeInTheDocument();
    expect(screen.getByText(/The 11:00 am – 5:00 pm gap is the break, not shift time/)).toBeInTheDocument();
    expect(screen.getByText('None (the gap is the break)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(p.onCreateShift).toHaveBeenCalledWith(expect.objectContaining({ kind: 'split', start: 420, end: 1260, firstEnd: 660, secondStart: 1020, breakMinutes: 0 })));
  });

  it('Split: overlapping parts, a short gap and a break rule are field errors', async () => {
    const p = live(ON);
    render(<ShiftEditorScreen live={p} />);
    await newShift('SQ', 'Lunch split');
    await ue.click(screen.getByRole('radio', { name: 'Split' }));
    await time(/Second part from/, '11:30 am');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    expect(screen.getAllByText('Leave at least 1 h between the parts (company setting).').length).toBeGreaterThan(0);
    await time(/Second part from/, '10:00 am');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    expect(screen.getAllByText(/The second part starts after the first part ends/).length).toBeGreaterThan(0);
    await time(/Second part from/, '5:00 pm');
    await ue.click(screen.getByRole('radio', { name: 'Fixed unpaid break' }));
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    expect(screen.getAllByText(/A split shift has no break rule/).length).toBeGreaterThan(0);
    expect(p.onCreateShift).not.toHaveBeenCalled();
  });

  it('an existing split saves new times as its parts', async () => {
    const p = live(ON);
    render(<ShiftEditorScreen live={p} />);
    await ue.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByRole('heading', { name: 'Canteen split shift' })).toBeInTheDocument();
    await time(/Second part to/, '9:30 pm');
    await ue.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(p.onShiftTimes).toHaveBeenCalledWith('s-sp', expect.objectContaining({ start: 420, end: 1290, firstEnd: 660, secondStart: 1020 })));
  });
});

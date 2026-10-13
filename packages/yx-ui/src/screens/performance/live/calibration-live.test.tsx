import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalibrationBoardScreen, CalibrationSessions, PerformanceReportsScreen } from './calibration';
import type { CalibrationBoard } from './types';

// Performance batch PM6 screens (M06-BUILD-DESIGN §11, §13; PRF-09; PM-6.04).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const bands = [
  { fromScore: 1, toScore: 2.49, label: 'Below' },
  { fromScore: 2.5, toScore: 3.49, label: 'Meets' },
  { fromScore: 3.5, toScore: 5, label: 'Above' },
];
const board = (o: Partial<CalibrationBoard> = {}): CalibrationBoard => ({
  id: 's1',
  name: 'Sales',
  cycle: 'H1',
  status: 'open',
  guide: null,
  scale: { min: 1, max: 5, bands },
  rows: [{ reviewId: 'r1', employee: 'Arjun', manager: 'Priya', managerScore: 4, score: 4, band: 'Above', moved: false, selfIndication: null, skipAgreed: false, protectedLeave: false }],
  distribution: { bands: null, counted: 1, notes: [] },
  changes: [],
  can: { change: true, signOff: true },
  ...o,
});

describe('Calibration (PM6)', () => {
  it('dragging a person to another band asks for a reason before moving (YX-PERF-08)', async () => {
    const onChange = vi.fn(ok);
    const { container } = render(<CalibrationBoardScreen state="ready" board={board()} onBack={vi.fn()} onChange={onChange} onSignOff={vi.fn(ok)} />);
    const card = container.querySelector('[data-review="r1"]')!;
    const target = container.querySelector('[data-band="Meets"]')!;
    const data = { store: '', setData(_t: string, v: string) { this.store = v; }, getData() { return this.store; } };
    fireEvent.dragStart(card, { dataTransfer: data });
    fireEvent.dragOver(target, { dataTransfer: data });
    fireEvent.drop(target, { dataTransfer: data });
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Move' })).toBeDisabled();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Compared with peers');
    await ue.click(within(d).getByRole('button', { name: 'Move' }));
    expect(onChange).toHaveBeenCalledWith({ reviewId: 'r1', toBand: 'Meets', reason: 'Compared with peers' });
  });

  it('a small group shows no chart; a guide note never blocks sign-off', async () => {
    const onSignOff = vi.fn(ok);
    render(<CalibrationBoardScreen state="ready" board={board({ distribution: { bands: null, counted: 3, notes: [] } })} onBack={vi.fn()} onChange={vi.fn(ok)} onSignOff={onSignOff} />);
    expect(screen.getByText(/too few to show a distribution/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Sign off' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign off' }));
    expect(onSignOff).toHaveBeenCalled();
  });

  it('a session needs a guide that adds up to 100 when one is used', async () => {
    const onCreate = vi.fn(ok);
    render(<CalibrationSessions sessions={[]} departments={[]} facilitators={[{ value: 'u1', label: 'Lakshmi' }]} bands={['Below', 'Above']} onOpen={vi.fn()} onCreate={onCreate} />);
    await ue.click(screen.getByRole('button', { name: 'Open a session' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), 'Sales');
    await ue.click(within(d).getByRole('combobox', { name: 'Facilitator' }));
    await ue.click(screen.getByRole('option', { name: 'Lakshmi' }));
    await ue.click(within(d).getByRole('radio', { name: 'Use a guide' }));
    await ue.type(within(d).getByRole('textbox', { name: /^Below/ }), '30');
    expect(within(d).getByRole('button', { name: 'Open' })).toBeDisabled();
    await ue.type(within(d).getByRole('textbox', { name: /^Above/ }), '70');
    await ue.click(within(d).getByRole('button', { name: 'Open' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sales', facilitatorUserId: 'u1', departmentIds: [], guide: { bands: [{ label: 'Below', share: 30 }, { label: 'Above', share: 70 }], tolerance: 10 } });
  });

  it('reports show suppressed cells as hidden and download a CSV', async () => {
    const onDownload = vi.fn(ok);
    render(<PerformanceReportsScreen state="ready" cycles={[{ value: 'c1', label: 'H1' }]} cycleId="c1" onCycle={vi.fn()} kind="distribution" onKind={vi.fn()} report={{ kind: 'distribution', cycle: 'H1', header: ['department', 'band', 'people'], rows: [['Sales', 'Meets', null]] }} onDownload={onDownload} />);
    expect(screen.getByText('Hidden (small group)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(onDownload).toHaveBeenCalled();
  });
});

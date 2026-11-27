import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { MetricExplorerScreen } from './analytics';
import type { AttritionView, LiveAttrition } from './attrition-live';

// T2-G 47 (answer 2747): ANL-04 live for headcount and attrition.
const VIEW: AttritionView = {
  from: '2026-01',
  to: '2026-03',
  by: 'department',
  minGroup: 5,
  months: [{ month: '2026-01', headcount: 20 }, { month: '2026-02', headcount: 22 }, { month: '2026-03', headcount: 24 }],
  total: { avgHeadcount: 22, exits: 3, voluntary: 2, involuntary: 1, notRecorded: 0, rate: 13.6, voluntaryRate: 9.1 },
  groups: [
    { id: 'a', name: 'Operations', hidden: false, avgHeadcount: 18, exits: 3, voluntary: 2, involuntary: 1, notRecorded: 0, rate: 16.7, voluntaryRate: 11.1 },
    { id: 'b', name: 'People', hidden: true },
  ],
};
const live = (over: Partial<LiveAttrition> = {}): LiveAttrition => ({ state: 'ready', onRetry: vi.fn(), data: VIEW, by: 'department', onBy: vi.fn(), periods: [{ value: '2026-01|2026-03', label: 'Jan to Mar 2026' }], period: '2026-01|2026-03', onPeriod: vi.fn(), onExport: vi.fn(async () => {}), ...over });
const show = (l: LiveAttrition) => render(<ToastProvider><MetricExplorerScreen live={l} /></ToastProvider>);

describe('Headcount and attrition (T2-G 47)', () => {
  it('shows the totals and, in the table, hides the numbers of a group under 5 people', async () => {
    show(live());
    expect(screen.getByRole('heading', { name: 'Headcount and attrition' })).toBeInTheDocument();
    expect(screen.getByText('13.6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByText('Fewer than 5 people')).toBeInTheDocument();
    expect(screen.getByText('16.7 %')).toBeInTheDocument();
  });

  it('changing the split asks for it; Download CSV says when done or why not', async () => {
    const l = live({ onExport: vi.fn().mockRejectedValueOnce(new Error('Headcount and attrition need the people analytics key for the whole company.')).mockResolvedValue(undefined) });
    show(l);
    await userEvent.click(screen.getByRole('combobox', { name: 'Split by' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Location' }));
    expect(l.onBy).toHaveBeenCalledWith('location');
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect((await screen.findAllByText(/need the people analytics key/)).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(l.onExport).toHaveBeenCalledTimes(2));
    expect((await screen.findAllByText('Headcount and attrition downloaded')).length).toBeGreaterThan(0);
  });

  it('loading, error and no access; the design stays as drawn without live', () => {
    const { rerender } = show(live({ state: 'error', data: null }));
    expect(screen.getByText("We couldn't load headcount and attrition.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    rerender(<ToastProvider><MetricExplorerScreen /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Metric explorer' })).toBeInTheDocument();
  });
});

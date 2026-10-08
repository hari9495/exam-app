import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReportsScreen, WallScreen } from './reports';
import { WALL, reportsProps } from './report-data';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('HLP-05 reports', () => {
  it('shows the dashboard tiles as numbers, with no value as a dash', () => {
    render(<ReportsScreen {...reportsProps({ dashboard: { ...reportsProps().dashboard!, mttaHours: null } })} />);
    expect(within(screen.getByRole('region', { name: 'Open tickets (backlog)' })).getByText('42')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Response targets met' })).getByText('91.5')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Time to pick up (MTTA)' })).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Solved by an article' })).getByText('37')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Agents' })).toHaveTextContent('Suresh Pillai');
  });

  it('says each KPI colour in words and sets a target', async () => {
    const onSetTarget = vi.fn().mockResolvedValue(undefined);
    render(<ReportsScreen {...reportsProps({ tab: 'kpis', onSetTarget })} />);
    expect(screen.getByText('Amber · near the limit')).toBeInTheDocument();
    expect(screen.getByText('Green · on target')).toBeInTheDocument();
    expect(screen.getByText('No target set')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /forecast in 7 days about 94/ })).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Set target' })[0]);
    await ue.click(screen.getByRole('button', { name: 'Save target' }));
    await waitFor(() => expect(onSetTarget).toHaveBeenCalledWith('d-it', { metric: 'sla_met_pct', target: 95, amber: 90 }));
  });

  it('shows a new wall screen link once, with a copy button', async () => {
    const onCreateWallboard = vi.fn().mockResolvedValue({ id: 'w2', url: 'https://x.test/yx/wall/o/secret-token' });
    render(<ReportsScreen {...reportsProps({ tab: 'walls', onCreateWallboard })} />);
    await ue.click(screen.getByRole('button', { name: 'New wall screen' }));
    await ue.type(screen.getByRole('textbox', { name: /Name/ }), 'Floor TV');
    await ue.click(screen.getByRole('combobox', { name: /Desks/ }));
    await ue.click(await screen.findByRole('option', { name: /IT help desk/ }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Make the link' }));
    await waitFor(() => expect(onCreateWallboard).toHaveBeenCalledWith({ name: 'Floor TV', deskIds: ['d-it'] }));
    expect(await screen.findByRole('textbox', { name: 'Wall screen link' })).toHaveValue('https://x.test/yx/wall/o/secret-token');
    expect(screen.getByText(/without signing in and shows counts only/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy wall screen link' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'I have copied it' }));
    expect(screen.queryByRole('textbox', { name: 'Wall screen link' })).not.toBeInTheDocument();
  });

  it('picks the schedule frequency with a Segment and sends to chosen colleagues', async () => {
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    render(<ReportsScreen {...reportsProps({ tab: 'mine', onSchedule })} />);
    await ue.click(screen.getByRole('button', { name: 'Schedule' }));
    const often = screen.getByRole('radiogroup', { name: 'How often' });
    expect(within(often).getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true');
    await ue.click(within(often).getByRole('radio', { name: 'Monthly' }));
    await ue.type(screen.getByRole('searchbox', { name: /Find a colleague/ }), 'far');
    await ue.click(screen.getByRole('combobox', { name: /Send to/ }));
    await ue.click(await screen.findByRole('option', { name: /Farah Khan/ }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Start schedule' }));
    await waitFor(() => expect(onSchedule).toHaveBeenCalledWith('r1', { frequency: 'monthly', recipients: ['u2'] }));
  });

  it('shows NPS in survey rows and hides tabs the person cannot use', () => {
    render(<ReportsScreen {...reportsProps({ tab: 'surveys', canView: false })} />);
    expect(screen.getByRole('table', { name: 'Surveys' })).toHaveTextContent('+32');
    expect(screen.queryByRole('tab', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Surveys' })).toBeInTheDocument();
  });

  it('wall screen: big counts per desk, and a clear message when switched off', () => {
    const { rerender } = render(<WallScreen state="ready" wall={WALL} />);
    expect(within(screen.getByRole('region', { name: 'IT help desk' })).getByText('Due within an hour').nextSibling).toHaveTextContent('3');
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    rerender(<WallScreen state="not-found" wall={null} />);
    expect(screen.getByRole('heading', { name: 'This wall screen is switched off' })).toBeInTheDocument();
  });
});

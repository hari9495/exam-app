import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlaDashboardScreen } from './helpdesk';
import { SLA, liveSla } from './helpdesk-sla-live-samples';

// HLP-05 SLA dashboard, live: the designed screen with the server's figures, and the desk reports as its tabs.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('HLP-05 SLA dashboard (live)', () => {
  it('shows the server figures in the design cards, with the change against the period before', () => {
    render(<SlaDashboardScreen live={liveSla()} />);
    expect(within(screen.getByRole('region', { name: 'Open tickets' })).getByText('42')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Breached now' })).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'First response met' })).getByText(/94\.2/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'First response met' })).getByText(/the 30 days before/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View 42 open tickets/ })).toHaveAttribute('href', '#tickets');
  });

  it('a figure with nothing to count says so in words, not 0', () => {
    render(<SlaDashboardScreen live={liveSla({ sla: { ...SLA, firstResponseMetPct: null, articlePct: null } })} />);
    expect(screen.getByText('No first responses due in this period')).toBeInTheDocument();
    expect(screen.getByText('No searches or tickets in this period')).toBeInTheDocument();
  });

  it('lists at-risk and missed tickets with their clock, says how many stay hidden, and opens a ticket', async () => {
    const onOpenTicket = vi.fn();
    render(<SlaDashboardScreen live={liveSla({ onOpenTicket })} />);
    expect(screen.getByText('At risk or breached (4)')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'At risk or breached tickets' });
    expect(within(table).getByText('IT-1002')).toBeInTheDocument();
    expect(within(table).getAllByText(/Breached/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 more is sensitive or private/)).toBeInTheDocument();
    await ue.click(within(table).getByText('Laptop will not start'));
    expect(onOpenTicket).toHaveBeenCalledWith('t2');
  });

  it('Reassign pressed with nobody chosen names what is missing; then reassigns with a toast', async () => {
    const onReassign = vi.fn().mockResolvedValue(undefined);
    render(<SlaDashboardScreen live={liveSla({ onReassign })} />);
    await ue.click(screen.getAllByRole('button', { name: 'Reassign' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Reassign IT-1002' });
    await ue.click(within(dialog).getByRole('button', { name: 'Reassign' }));
    expect(await screen.findByText('Choose who takes the ticket.')).toBeInTheDocument();
    expect(onReassign).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('combobox', { name: /Give it to/ }));
    // The current assignee is not offered.
    expect(screen.queryByRole('option', { name: 'Farah Khan' })).not.toBeInTheDocument();
    await ue.click(await screen.findByRole('option', { name: 'Suresh Pillai' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Reassign' }));
    await waitFor(() => expect(onReassign).toHaveBeenCalledWith(SLA.atRisk[0], 'u1'));
  });

  it('without the assign right the row offers Open ticket instead', () => {
    render(<SlaDashboardScreen live={liveSla({ canAssign: false })} />);
    expect(screen.queryByRole('button', { name: 'Reassign' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open ticket' }).length).toBe(3);
  });

  it('no tickets and nothing finished in the period is the design empty state', () => {
    render(<SlaDashboardScreen live={liveSla({ sla: { ...SLA, open: 0, queues: SLA.queues.map((q) => ({ ...q, met: 0, breached: 0 })) } })} />);
    expect(screen.getByText('No tickets in this period.')).toBeInTheDocument();
  });

  it('period and queue are pick-one choices sent to the page; export runs', async () => {
    const onDays = vi.fn();
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<SlaDashboardScreen live={liveSla({ onDays, onExport })} />);
    await ue.click(screen.getByRole('combobox', { name: 'Period' }));
    await ue.click(await screen.findByRole('option', { name: 'Last 7 days' }));
    expect(onDays).toHaveBeenCalledWith('7');
    await ue.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalled();
  });

  it('no access and error states', () => {
    const { rerender } = render(<SlaDashboardScreen live={liveSla({ state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access to SLAs and desk reports/)).toBeInTheDocument();
    rerender(<SlaDashboardScreen live={liveSla({ state: 'error' })} />);
    expect(screen.getByText("We couldn't load SLAs and reports.")).toBeInTheDocument();
  });
});

describe('HLP-05 report tabs (were the desk reports page)', () => {
  it('desk numbers: tiles as numbers, no value in words, the agents table', () => {
    render(<SlaDashboardScreen live={liveSla({ tab: 'numbers', dashboard: { ...liveSla().dashboard!, mttaHours: null } })} />);
    expect(within(screen.getByRole('region', { name: 'Open tickets (backlog)' })).getByText('42')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Response targets met' })).getByText(/91\.5/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Time to pick up (MTTA)' })).getByText('Nothing to measure in this period')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Solved by an article' })).getByText('37')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Agents' })).toHaveTextContent('Suresh Pillai');
  });

  it('KPIs: each colour in words and a target set (toast)', async () => {
    const onSetTarget = vi.fn().mockResolvedValue(undefined);
    render(<SlaDashboardScreen live={liveSla({ tab: 'kpis', deskId: 'd-it', onSetTarget })} />);
    expect(screen.getByText('Amber · near the limit')).toBeInTheDocument();
    expect(screen.getByText('Green · on target')).toBeInTheDocument();
    expect(screen.getByText('No target set')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Set target' })[0]);
    await ue.click(screen.getByRole('button', { name: 'Save target' }));
    await waitFor(() => expect(onSetTarget).toHaveBeenCalledWith('d-it', { metric: 'sla_met_pct', target: 95, amber: 90 }));
  });

  it('KPIs need a queue first', () => {
    render(<SlaDashboardScreen live={liveSla({ tab: 'kpis', deskId: null })} />);
    expect(screen.getByText('Choose a queue to see its KPIs.')).toBeInTheDocument();
  });

  it('the report library runs a report into a table', async () => {
    render(<SlaDashboardScreen live={liveSla({ tab: 'library' })} />);
    await ue.click(screen.getByRole('button', { name: 'Run Tickets by status' }));
    expect(await screen.findByRole('table', { name: 'Tickets by status' })).toHaveTextContent('Waiting');
  });

  it('shows a new wall screen link once, with a copy button', async () => {
    const onCreateWallboard = vi.fn().mockResolvedValue({ id: 'w2', url: 'https://x.test/yx/wall/o/secret-token' });
    render(<SlaDashboardScreen live={liveSla({ tab: 'walls', onCreateWallboard })} />);
    await ue.click(screen.getByRole('button', { name: 'New wall screen' }));
    await ue.type(screen.getByRole('textbox', { name: /Name/ }), 'Floor TV');
    await ue.click(screen.getByRole('combobox', { name: /Desks/ }));
    await ue.click(await screen.findByRole('option', { name: /IT help desk/ }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Make the link' }));
    await waitFor(() => expect(onCreateWallboard).toHaveBeenCalledWith({ name: 'Floor TV', deskIds: ['d-it'] }));
    expect(await screen.findByRole('textbox', { name: 'Wall screen link' })).toHaveValue('https://x.test/yx/wall/o/secret-token');
    expect(screen.getByRole('button', { name: 'Copy wall screen link' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'I have copied it' }));
    expect(screen.queryByRole('textbox', { name: 'Wall screen link' })).not.toBeInTheDocument();
  });

  it('Make the link pressed with nothing filled names what is missing', async () => {
    const onCreateWallboard = vi.fn();
    render(<SlaDashboardScreen live={liveSla({ tab: 'walls', onCreateWallboard })} />);
    await ue.click(screen.getByRole('button', { name: 'New wall screen' }));
    await ue.click(screen.getByRole('button', { name: 'Make the link' }));
    expect(await screen.findByText('Name the wall screen.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one desk.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveFocus();
    expect(onCreateWallboard).not.toHaveBeenCalled();
  });

  it('picks the schedule frequency with a Segment and sends to chosen colleagues', async () => {
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    render(<SlaDashboardScreen live={liveSla({ tab: 'mine', onSchedule })} />);
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

  it('1844: a report may hold the desk fields offered (named in the list) and saves them as field columns', async () => {
    const onSaveCustom = vi.fn().mockResolvedValue(undefined);
    const fieldColumns = [{ value: 'field:office', label: 'Office' }, { value: 'field:asset_cost', label: 'Asset cost (₹)' }];
    const reports = [{ ...liveSla().customReports[0], columns: ['number', 'field:office'] }];
    render(<SlaDashboardScreen live={liveSla({ tab: 'mine', onSaveCustom, fieldColumns, customReports: reports })} />);
    expect(screen.getByText('Number, Office')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'New report' }));
    await ue.type(await screen.findByRole('textbox', { name: /Report name/ }), 'Costs by office');
    await ue.click(screen.getByRole('combobox', { name: /Columns/ }));
    await ue.click(await screen.findByRole('option', { name: /Asset cost/ }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Save report' }));
    await waitFor(() => expect(onSaveCustom).toHaveBeenCalledWith(null, expect.objectContaining({ columns: expect.arrayContaining(['number', 'field:asset_cost']) })));
  });

  it('1844 negative: without field columns (none the person may see) only the ticket details are offered', async () => {
    render(<SlaDashboardScreen live={liveSla({ tab: 'mine', fieldColumns: [] })} />);
    await ue.click(screen.getByRole('button', { name: 'New report' }));
    await ue.click(await screen.findByRole('combobox', { name: /Columns/ }));
    expect(await screen.findByRole('option', { name: 'Number' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Desk field/ })).toBeNull();
  });

  it('customer report: Show report pressed with no company says so', async () => {
    const onCustomerReport = vi.fn();
    render(<SlaDashboardScreen live={liveSla({ tab: 'customers', onCustomerReport })} />);
    await ue.click(screen.getByRole('button', { name: 'Show report' }));
    expect(await screen.findByText('Choose a company first.')).toBeInTheDocument();
    expect(onCustomerReport).not.toHaveBeenCalled();
  });

  it('shows NPS in survey rows and hides tabs the person cannot use', () => {
    render(<SlaDashboardScreen live={liveSla({ tab: 'surveys', canView: false })} />);
    expect(screen.getByRole('table', { name: 'Surveys' })).toHaveTextContent('+32');
    expect(screen.queryByRole('tab', { name: 'Response targets' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Surveys' })).toBeInTheDocument();
  });
});

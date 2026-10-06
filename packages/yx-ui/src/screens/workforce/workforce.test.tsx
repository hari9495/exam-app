import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DirectoryScreen } from './directory';
import { OrgChartScreen } from './org-chart';
import { TeamScreen } from './team';
import { ProbationScreen } from './probation';
import { BulkChangesScreen, type BulkChangesScreenProps } from './bulk';
import { csvCell, csvText } from './workforce-kit';
import { BATCH_DETAIL, BATCHES, BULK_RESULT, CHOICES, DIRECTORY, DIRECTORY_HR, ORG_CHART, PEOPLE, PERSON, PROBATIONS, TEAM, TODAY_ISO } from './data';
import type { DirectoryQuery } from './types';

const ok = () => vi.fn().mockResolvedValue(undefined);
const QUERY: DirectoryQuery = { q: '', legalEntityId: null, departmentId: null, locationId: null, offset: 0 };

describe('CSV export cells (OWASP CSV injection)', () => {
  it('quotes commas and quotes, and defuses formula-looking text', () => {
    expect(csvCell('Kulkarni, Arjun')).toBe('"Kulkarni, Arjun"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98450')).toBe("'+91 98450");
    expect(csvText([['a', null], [1, 'b']])).toBe('a,\r\n1,b\r\n');
  });
});

describe('Directory (P02 Q4, YX-SEC-17)', () => {
  it('shows Public fields to colleagues: no codes, no joining dates, no person panel', async () => {
    render(<DirectoryScreen state="ready" page={DIRECTORY} query={QUERY} onQuery={vi.fn()} choices={CHOICES} isHr={false} />);
    expect(screen.getAllByText('Arjun Kulkarni').length).toBeGreaterThan(0);
    expect(screen.queryByText('KF-0142')).toBeNull();
    await userEvent.click(screen.getAllByText('Kiran Joshi')[0]);
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).queryByText('Joined')).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Job history' })).toBeNull();
    expect(within(drawer).getByRole('link', { name: /Email Kiran/ })).toHaveAttribute('href', 'mailto:kiran.joshi@kaverifoods.test');
  });

  it('HR sees codes and the person behind the record with their roles', async () => {
    const loadPerson = vi.fn().mockResolvedValue(PERSON);
    const onOpenHistory = vi.fn();
    render(<DirectoryScreen state="ready" page={DIRECTORY_HR} query={QUERY} onQuery={vi.fn()} choices={CHOICES} isHr loadPerson={loadPerson} onOpenHistory={onOpenHistory} />);
    await userEvent.click(screen.getAllByText('Arjun Kulkarni')[0]);
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('KF-0142')).toBeInTheDocument();
    expect(await within(drawer).findByText('Candidate')).toBeInTheDocument();
    expect(within(drawer).getByText('+919845012345')).toBeInTheDocument();
    expect(loadPerson).toHaveBeenCalledWith('p-arjun');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Job history' }));
    expect(onOpenHistory).toHaveBeenCalledWith('p-arjun');
  });

  it('searches a moment after typing, from the first page', async () => {
    const onQuery = vi.fn();
    render(<DirectoryScreen state="ready" page={DIRECTORY} query={QUERY} onQuery={onQuery} choices={CHOICES} isHr={false} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search people' }), 'kir');
    await waitFor(() => expect(onQuery).toHaveBeenLastCalledWith({ ...QUERY, q: 'kir', offset: 0 }));
  });
});

describe('Org chart (M01 §3.2, Q5)', () => {
  it('offers the date and person links to HR only, and exports what it shows', async () => {
    const created: string[] = [];
    const url = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      void (b as Blob).text().then((t) => created.push(t));
      return 'blob:x';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { rerender } = render(<OrgChartScreen state="ready" data={ORG_CHART} today={TODAY_ISO} meId="p-divya" companyName="Kaveri Foods Pvt Ltd" />);
    expect(screen.queryByLabelText('View as on')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(created[0]).toContain('Arjun Kulkarni,Quality Analyst,Quality,Bengaluru head office,Divya Raghunathan,Lakshmi Venkatesan'));
    expect(created[0]).not.toMatch(/ctc|salary/i);
    rerender(<OrgChartScreen state="ready" data={{ ...ORG_CHART, asOf: '2026-08-01' }} today={TODAY_ISO} onAsOf={vi.fn()} companyName="Kaveri Foods Pvt Ltd" onOpenPerson={vi.fn()} />);
    expect(screen.getByText('As it was on 1 Aug 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Position' })).toBeNull();
    url.mockRestore();
  });
});

describe('My team (M01 §3.10; YX-SEC-27)', () => {
  it('lists direct, indirect and dotted-line reports; raising changes only for the reporting team', async () => {
    const onOpenHistory = vi.fn();
    render(<TeamScreen state="ready" members={TEAM} today={TODAY_ISO} onOpenHistory={onOpenHistory} raise={{ options: { people: PEOPLE, locations: [], departments: [], designations: [], grades: [], employmentTypes: [], costCentres: [], canPay: false, retroLimit: '2026-04-01', today: TODAY_ISO, types: ['promotion', 'transfer', 'redesignation', 'manager_change'] }, onPreview: vi.fn(), onSubmit: ok() }} />);
    expect(screen.getAllByText('Through Arjun Kulkarni').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Probation ends 14 Oct 2026').length).toBeGreaterThan(0);
    // Dotted-line reports are view only: no job history, no change (YX-EMP-04, P02 Q5).
    expect(screen.getAllByRole('button', { name: 'Raise change' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Job history' })).toHaveLength(4);
    await userEvent.click(screen.getAllByRole('button', { name: 'Raise change' })[0]);
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('combobox', { name: 'Kind of change' }));
    expect(screen.queryByRole('option', { name: 'Salary revision' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Correction' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Manager change' })).toBeInTheDocument();
  });
});

describe('Probation (M01 §3.4, YX-LC-01)', () => {
  it('HR confirms or extends with a reason; a waiting confirmation links to approval; managers only read', async () => {
    const onExtend = ok();
    const onConfirm = ok();
    const { unmount } = render(<ProbationScreen state="ready" rows={PROBATIONS} today={TODAY_ISO} canManage onConfirm={onConfirm} onExtend={onExtend} onOpenHistory={vi.fn()} changesHref="/yx/people/changes" />);
    expect(screen.getAllByText('Past the end date').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Review' })[0]).toHaveAttribute('href', '/yx/people/changes');
    expect(screen.queryByText('Meera Iyer')).toBeNull(); // confirmed: under "Recently confirmed"
    await userEvent.click(screen.getAllByRole('button', { name: 'Extend' })[0]);
    const dialog = await screen.findByRole('dialog');
    const extend = within(dialog).getByRole('button', { name: 'Extend probation' });
    expect(extend).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'More time on audits');
    await userEvent.click(extend);
    await waitFor(() => expect(onExtend).toHaveBeenCalledWith('p-kiran', 3, 'More time on audits'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[0]);
    const confirm = await screen.findByRole('dialog');
    await userEvent.type(within(confirm).getByLabelText(/Reason/), 'Review went well');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('p-kiran', '2026-10-15', 'Review went well'));
    unmount();
    render(<ProbationScreen state="ready" rows={PROBATIONS} today={TODAY_ISO} canManage={false} onConfirm={ok()} onExtend={ok()} onOpenHistory={vi.fn()} changesHref="#" />);
    expect(screen.queryByRole('button', { name: 'Extend' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Job history' }).length).toBeGreaterThan(0);
  });
});

describe('Bulk changes (M01 §3.3; YX-SEC-11)', () => {
  const props = (over: Partial<BulkChangesScreenProps> = {}): BulkChangesScreenProps => ({
    state: 'ready',
    batches: BATCHES,
    people: PEOPLE,
    canManage: true,
    canApprove: true,
    canPay: false,
    onCheckFile: vi.fn().mockResolvedValue(BULK_RESULT),
    onCheckReassign: vi.fn().mockResolvedValue({ ...BULK_RESULT, errors: 0, rows: BULK_RESULT.rows.slice(0, 1) }),
    loadBatch: vi.fn().mockResolvedValue(BATCH_DETAIL),
    onApprove: ok(),
    onReject: ok(),
    onCancel: ok(),
    ...over,
  });

  it('checks every row first; a file with a bad row cannot be sent', async () => {
    const p = props();
    render(<BulkChangesScreen {...p} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['employee_code,change_type,effective_date\nKF-0142,transfer,2026-11-01'], 'reorg.csv', { type: 'text/csv' }));
    await userEvent.type(screen.getByRole('textbox'), 'Quality team moves');
    await userEvent.click(screen.getByRole('button', { name: 'Check every row' }));
    await waitFor(() => expect(p.onCheckFile).toHaveBeenCalledWith({ csv: 'employee_code,change_type,effective_date\nKF-0142,transfer,2026-11-01', fileName: 'reorg.csv', reason: 'Quality team moves', dryRun: true }));
    expect(await screen.findByText('1 of 2 rows need fixing')).toBeInTheDocument();
    expect(screen.getAllByText('No current employee with the code KF-0999.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
  });

  it('a batch is approved as a whole; a recalculation needs a second, explicit approval', async () => {
    const rebase = Object.assign(new Error('Later changes are recalculated'), { code: 'REBASE_CONFIRMATION_REQUIRED' });
    const onApprove = vi.fn().mockRejectedValueOnce(rebase).mockResolvedValueOnce(undefined);
    render(<BulkChangesScreen {...props({ onApprove })} defaultBatchId="b-1" />);
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(/Transfer · 1 Nov 2026/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Approve all' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('b-1', false));
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Approve and recalculate' }));
    await waitFor(() => expect(onApprove).toHaveBeenLastCalledWith('b-1', true));
  });

  it('without manage rights there is no upload, only the batches', () => {
    render(<BulkChangesScreen {...props({ canManage: false })} />);
    expect(screen.queryByText('From a file')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download template' })).toBeNull();
    expect(screen.getAllByText('q3-reorg.csv').length).toBeGreaterThan(0);
  });
});

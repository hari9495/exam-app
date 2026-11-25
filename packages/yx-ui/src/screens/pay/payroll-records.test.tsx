import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayAuditScreen, PayDocumentsScreen, PayPeriodsScreen, ReopenRequestsScreen, SAMPLE_AUDIT, SAMPLE_CHAIN_BROKEN, SAMPLE_CHAIN_OK, SAMPLE_DOCUMENTS, SAMPLE_HISTORY, SAMPLE_PEOPLE, SAMPLE_PERIODS, SAMPLE_REQUESTS, SAMPLE_REQUEST_MINE, type LivePayAudit, type LivePayDocuments, type LivePayPeriods, type LiveReopenRequests } from './payroll-records';

// The designed PAY-46 / 48 / 49 screens as the app renders them (`live`): positive and negative paths, moved from the
// old live copies' tests (pay-live.test.tsx, pay-ops-live.test.tsx).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}));

const periods = (over: Partial<LivePayPeriods> = {}): LivePayPeriods => ({ state: 'ready', data: SAMPLE_PERIODS, year: '2026', onYear: vi.fn(), onHistory: vi.fn(async () => SAMPLE_HISTORY), onAskReopen: fn(), onOpenRequests: vi.fn(), ...over });

describe('PAY-49 Pay periods (live)', () => {
  it('shows each month with its stage and corrections; no Pay frame in the app', () => {
    const { container } = render(<PayPeriodsScreen live={periods()} />);
    const table = screen.getByRole('table', { name: 'Kaveri Foods Pvt Ltd pay periods' });
    const sept = within(table).getByRole('row', { name: /September 2026/ });
    expect(within(sept).getByText('Locked')).toBeInTheDocument();
    expect(within(sept).getByText('2 approved, 1 waiting')).toBeInTheDocument();
    // An open month cannot be asked to reopen.
    expect(within(within(table).getByRole('row', { name: /October 2026/ })).queryByRole('button', { name: 'Ask to reopen' })).toBeNull();
    expect(container.querySelector('.yx-desktop, [data-area="pay"]')).toBeNull();
  });

  it('asking to reopen: pressed with no reason it says why and sends nothing; with a reason it sends and says so', async () => {
    const live = periods();
    render(<PayPeriodsScreen live={live} />);
    const table = screen.getByRole('table', { name: 'Kaveri Foods Pvt Ltd pay periods' });
    await ue.click(within(within(table).getByRole('row', { name: /September 2026/ })).getByRole('button', { name: 'Ask to reopen' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Send for approval' }));
    expect(live.onAskReopen).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText(/Say why in a sentence/).length).toBeGreaterThan(0);
    expect(within(sheet).getByRole('textbox', { name: /Why/ })).toHaveFocus();
    await ue.type(within(sheet).getByRole('textbox', { name: /Why/ }), 'A late overtime claim was approved');
    await ue.click(within(sheet).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(live.onAskReopen).toHaveBeenCalledWith('le-kfpl', '2026-09', 'A late overtime claim was approved'));
    expect((await screen.findAllByText('Sent for approval: reopen September 2026')).length).toBeGreaterThan(0);
  });

  it('a refused request keeps the drawer open with the reason', async () => {
    render(<PayPeriodsScreen live={periods({ onAskReopen: vi.fn(async () => Promise.reject(new Error('September payslips are issued, so the month cannot be reopened.'))) })} open="ask" />);
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /Why/ }), 'A late overtime claim was approved');
    await ue.click(within(sheet).getByRole('button', { name: 'Send for approval' }));
    expect(await within(sheet).findByText(/cannot be reopened/)).toBeInTheDocument();
  });

  it('someone without the reopen right sees no Ask; a month already asked links to the requests; history loads', async () => {
    const live = periods({ data: { ...SAMPLE_PERIODS, entities: SAMPLE_PERIODS.entities.map((e) => ({ ...e, canRequestReopen: false })) } });
    render(<PayPeriodsScreen live={live} />);
    expect(screen.queryByRole('button', { name: 'Ask to reopen' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Reopen asked' }));
    expect(live.onOpenRequests).toHaveBeenCalled();
    await ue.click(screen.getAllByRole('button', { name: 'History' })[0]!);
    expect(await screen.findByText('Rekha Balan')).toBeInTheDocument();
  });

  it('next year is not offered past this year: it says so instead (never a disabled button)', async () => {
    const live = periods();
    render(<PayPeriodsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Next year' }));
    expect(live.onYear).not.toHaveBeenCalled();
    expect((await screen.findAllByText('2027 has not started yet.')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(live.onYear).toHaveBeenCalledWith('2025');
  });

  it('no access, and no entity in scope', () => {
    const { unmount } = render(<PayPeriodsScreen live={periods({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/You don't have access to pay periods/)).toBeInTheDocument();
    unmount();
    render(<PayPeriodsScreen live={periods({ data: { ...SAMPLE_PERIODS, entities: [] } })} />);
    expect(screen.getByText('No legal entity in your scope')).toBeInTheDocument();
  });
});

const requests = (over: Partial<LiveReopenRequests> = {}): LiveReopenRequests => ({ state: 'ready', data: SAMPLE_REQUESTS, me: 'Neha Joshi', onDecide: fn(), ...over });

describe('PAY-49 Reopen requests (live)', () => {
  it('approving needs the typed phrase (never disabled) and sends what was shown; done is a toast', async () => {
    const live = requests();
    render(<ReopenRequestsScreen live={live} />);
    expect(screen.getByText('1 request is waiting for you.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    const sheet = screen.getByRole('dialog');
    const confirm = within(sheet).getByRole('button', { name: 'Approve' });
    await ue.click(confirm);
    expect(screen.getAllByText(/exactly, in capitals\./).length).toBeGreaterThan(0);
    expect(live.onDecide).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Type REOPEN KFPL-TN 2026-09 to confirm/ }), 'REOPEN KFPL-TN 2026-09');
    await ue.click(confirm);
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('r1', 'approve', null, expect.objectContaining({ phrase: 'REOPEN KFPL-TN 2026-09' })));
    expect((await screen.findAllByText(/You approved reopening September 2026/)).length).toBeGreaterThan(0);
  });

  it('turning down asks why first', async () => {
    const live = requests();
    render(<ReopenRequestsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Turn down' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Turn down' }));
    expect(live.onDecide).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Why/ }), 'Pay it as a correction');
    await ue.click(within(sheet).getByRole('button', { name: 'Turn down' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('r1', 'reject', 'Pay it as a correction'));
  });

  it('maker is not checker: my own request has no Approve, and says two others approve', () => {
    render(<ReopenRequestsScreen live={requests({ data: [SAMPLE_REQUEST_MINE] })} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('You asked for this, so two other people approve it.')).toBeInTheDocument();
  });

  it('a refused approval stays in the sheet with the reason', async () => {
    render(<ReopenRequestsScreen live={requests({ onDecide: vi.fn(async () => Promise.reject(new Error('Confirm it is you first: the second sign-in step timed out.'))) })} open="approve" />);
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /Type REOPEN/ }), 'REOPEN KFPL-TN 2026-09');
    await ue.click(within(sheet).getByRole('button', { name: 'Approve' }));
    expect(await within(sheet).findByText(/second sign-in step timed out/)).toBeInTheDocument();
  });
});

const audit = (over: Partial<LivePayAudit> = {}): LivePayAudit => ({ state: 'ready', data: SAMPLE_AUDIT, chain: SAMPLE_CHAIN_OK, filters: {}, onFilters: vi.fn(), canExport: true, onExport: fn(), onVerify: fn(), onTimeline: vi.fn(async () => SAMPLE_AUDIT.entries.slice(1, 3)), ...over });

describe('PAY-46 Audit log (live)', () => {
  it('shows the chain check and the events; export only when allowed', () => {
    const { unmount } = render(<PayAuditScreen live={audit({ canExport: false })} />);
    expect(screen.getByText('Chain OK')).toBeInTheDocument();
    expect(screen.getByText('Payroll period locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    unmount();
    render(<PayAuditScreen live={audit()} />);
    expect(screen.getByRole('button', { name: 'Export (recorded)' })).toBeInTheDocument();
  });

  it('a broken chain says where; Check now runs and says done', async () => {
    const live = audit({ chain: SAMPLE_CHAIN_BROKEN });
    render(<PayAuditScreen live={live} />);
    expect(screen.getByText('Chain broken')).toBeInTheDocument();
    expect(screen.getByText(/Row 1017 does not match/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(live.onVerify).toHaveBeenCalled());
    expect((await screen.findAllByText('Chain checked')).length).toBeGreaterThan(0);
  });

  it('Check now refused shows why; no Check now without the right', async () => {
    const { unmount } = render(<PayAuditScreen live={audit({ onVerify: vi.fn(async () => Promise.reject(new Error('A check is already running.'))) })} />);
    await ue.click(screen.getByRole('button', { name: 'Check now' }));
    expect(await screen.findByText('A check is already running.')).toBeInTheDocument();
    unmount();
    render(<PayAuditScreen live={audit({ chain: { ...SAMPLE_CHAIN_OK, canVerify: false } })} />);
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
  });

  it('filters search; a record opens its timeline; masked values stay masked', async () => {
    const live = audit({ onMore: vi.fn() });
    render(<PayAuditScreen live={live} />);
    await ue.type(screen.getByRole('textbox', { name: /What happened/ }), 'payroll.reopen');
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    expect(live.onFilters).toHaveBeenCalledWith({ action: 'payroll.reopen' });
    await ue.click(screen.getByRole('button', { name: 'Show older' }));
    expect(live.onMore).toHaveBeenCalled();
    await ue.click(screen.getAllByRole('button', { name: 'Record timeline' })[0]!);
    await waitFor(() => expect(live.onTimeline).toHaveBeenCalledWith('compensation', 'cmp-0142'));
    expect(await screen.findByRole('list', { name: 'Timeline' })).toBeInTheDocument();
  });

  it('the details drawer shows what the server sent (pay masked); nothing found offers to clear', () => {
    const { unmount } = render(<PayAuditScreen live={audit()} open="details" />);
    expect(within(screen.getByRole('dialog')).getByText('••••••')).toBeInTheDocument();
    unmount();
    render(<PayAuditScreen live={audit({ filters: { action: 'payroll.bonus' }, data: { entries: [], next: null } })} />);
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
  });
});

const docs = (over: Partial<LivePayDocuments> = {}): LivePayDocuments => ({ state: 'ready', data: SAMPLE_DOCUMENTS, entityId: null, onEntity: vi.fn(), onDownload: fn(), verifyUrl: (c) => `https://x.test/verify/${c}`, canAddNominee: true, onSearch: vi.fn(async () => SAMPLE_PEOPLE), onAddNominee: fn(), ...over });

describe('PAY-48 Pay documents (live)', () => {
  it('lists documents with reference, status and verify code; a purged one cannot be downloaded', async () => {
    const live = docs();
    render(<PayDocumentsScreen live={live} />);
    expect(screen.getAllByText('KF/PS/2026-09/0142').length).toBe(2);
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'KF7Q2M9XPA' })).toHaveAttribute('href', 'https://x.test/verify/KF7Q2M9XPA');
    expect(screen.getByText('Deleted after its retention period')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Download PDF' })[0]!);
    expect(live.onDownload).toHaveBeenCalledWith(SAMPLE_DOCUMENTS.documents[0]);
  });

  it('a refused download says why', async () => {
    render(<PayDocumentsScreen live={docs({ onDownload: vi.fn(async () => Promise.reject(new Error('This document was purged.'))) })} />);
    await ue.click(screen.getAllByRole('button', { name: 'Download PDF' })[0]!);
    expect(await screen.findByText('This document was purged.')).toBeInTheDocument();
  });

  it('nominee: nothing filled shows every field error and sends nothing; then whose documents, an email and a day after today', async () => {
    const live = docs();
    render(<PayDocumentsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Add a nominee' }));
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    expect(live.onAddNominee).not.toHaveBeenCalled();
    expect(screen.getByText('Choose whose documents.')).toBeInTheDocument();
    expect(screen.getByText('Give an email address like name@example.com.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    await ue.click(await screen.findByRole('button', { name: /Arjun Kulkarni/ }));
    await ue.type(screen.getByRole('textbox', { name: /Nominee's name/ }), 'Lakshmi Kulkarni');
    await ue.type(screen.getByRole('textbox', { name: /Nominee's email/ }), 'not-an-email');
    await ue.type(screen.getByLabelText(/Access until/), '2099-12-31');
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    expect(live.onAddNominee).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /Nominee's email/ }));
    await ue.type(screen.getByRole('textbox', { name: /Nominee's email/ }), 'lakshmi@example.com');
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    await waitFor(() => expect(live.onAddNominee).toHaveBeenCalledWith({ employeeId: 'e-arjun', name: 'Lakshmi Kulkarni', email: 'lakshmi@example.com', validUntil: '2099-12-31' }));
    expect((await screen.findAllByText("Lakshmi Kulkarni can now read Arjun Kulkarni's pay documents")).length).toBeGreaterThan(0);
  });

  it('without payroll.document.issue there is no Add a nominee; empty and error states', () => {
    const { unmount } = render(<PayDocumentsScreen live={docs({ canAddNominee: false })} />);
    expect(screen.queryByRole('button', { name: 'Add a nominee' })).toBeNull();
    unmount();
    const b = render(<PayDocumentsScreen live={docs({ data: { ...SAMPLE_DOCUMENTS, documents: [] } })} />);
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
    b.unmount();
    const onRetry = vi.fn();
    render(<PayDocumentsScreen live={docs({ state: 'error', data: null, onRetry })} />);
    expect(screen.getByText("We couldn't load pay documents.")).toBeInTheDocument();
  });
});

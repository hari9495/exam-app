import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeopleListScreen, type DeskPerson, type DirectorySource, type PeopleListScreenProps } from './people-list';
import { PrivacyScreen, type PrivacyRequestRow } from './privacy';
import { SetupStart, presetPolicy, type SetupChecklist } from './setup-start';
import { DESK } from './data';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

const PEOPLE: DeskPerson[] = [
  { id: 'p1', name: 'Asha Rao', email: 'asha@kaveri.test', team: 'Sales', location: 'Chennai office', locationId: 'l1', source: 'csv', hasLogin: true, directoryActive: null },
  { id: 'p2', name: 'Vikram Shah', email: 'vikram@kaveri.test', team: 'IT', location: null, locationId: null, source: 'ldap', hasLogin: false, directoryActive: false },
];
const SOURCES: DirectorySource[] = [
  { id: 's1', kind: 'ldap', name: 'Head office AD', ldap: { url: 'ldaps://dc1.kaveri.test', bindDn: 'CN=read,DC=kaveri,DC=test', baseDn: 'DC=kaveri,DC=test', filter: null }, scimUrl: null, groupMap: [], schedule: 'daily', status: 'active', lastSyncAt: '2026-10-07T04:00:00Z', lastResult: { ok: true, read: 120, applied: 118 }, people: 118, disabled: 3, version: 1 },
];
const REQUESTS: PrivacyRequestRow[] = [
  { id: 'r1', kind: 'erasure', source: 'portal', note: 'Please remove my messages', status: 'open', decisionNote: null, result: null, createdAt: '2026-10-06T05:00:00Z', doneAt: null, person: { id: 'x1', name: 'Neha Iyer', email: 'neha@client.test' } },
];
const CHECKLIST: SetupChecklist = {
  done: 1,
  total: 3,
  standalone: true,
  steps: [
    { key: 'desk', label: 'Create your first desk', done: true, link: '/yx/desk/setup' },
    { key: 'sla', label: 'Set response targets (SLA)', done: false, link: '/yx/desk/setup?tab=sla' },
    { key: 'portal', label: 'Open a help portal', done: false, link: '/yx/desk/setup?tab=portal', optional: true },
  ],
};

const peopleProps = (over: Partial<PeopleListScreenProps> = {}): PeopleListScreenProps => ({
  state: 'ready',
  people: PEOPLE,
  search: '',
  onSearch: () => {},
  onSavePerson: vi.fn().mockResolvedValue(undefined),
  onImport: vi.fn().mockResolvedValue({ imported: 0, rows: 2, problems: [] }),
  sources: SOURCES,
  desks: [DESK],
  onSaveSource: vi.fn().mockResolvedValue({ id: 's1' }),
  onSyncNow: vi.fn().mockResolvedValue({ ok: true }),
  onNewToken: vi.fn().mockResolvedValue({ scimToken: 'tok' }),
  ...over,
});

describe('SD-1.29 people list', () => {
  it('checks a CSV file and shows each problem with its row number; Import stays off', async () => {
    const onImport = vi.fn().mockResolvedValue({ imported: 0, rows: 2, problems: [{ row: 3, problem: 'The email is missing or not valid.' }] });
    render(<PeopleListScreen {...peopleProps({ onImport })} />);
    await ue.click(screen.getByRole('tab', { name: 'Import from CSV' }));
    const file = new File(['name,email\nAsha Rao,asha@kaveri.test\nNo Mail,\n'], 'people.csv', { type: 'text/csv' });
    await ue.upload(screen.getByTestId('csv-file'), file);
    await ue.click(await screen.findByRole('button', { name: 'Check the file' }));
    expect(onImport).toHaveBeenCalledWith('name,email\nAsha Rao,asha@kaveri.test\nNo Mail,\n', true);
    expect(within(await screen.findByRole('list', { name: 'Problems in the file' })).getByText('Row 3: The email is missing or not valid.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('shows the SCIM token once, with copy buttons, and hides it when copied', async () => {
    const onSaveSource = vi.fn().mockResolvedValue({ id: 's2', scimToken: 'scim_secret_1', scimUrl: 'https://api.example.test/api/v1/desk/scim/o/s2/v2' });
    render(<PeopleListScreen {...peopleProps({ onSaveSource })} />);
    await ue.click(screen.getByRole('tab', { name: 'Directory sync' }));
    await ue.click(screen.getByRole('button', { name: 'Connect with SCIM' }));
    await ue.click(await screen.findByRole('button', { name: 'Connect and show the token' }));
    expect(onSaveSource).toHaveBeenCalledWith(null, { kind: 'scim', name: 'Identity provider', groupMap: [] });
    expect(await screen.findByRole('textbox', { name: 'SCIM token' })).toHaveValue('scim_secret_1');
    expect(screen.getByRole('button', { name: 'Copy scim base address' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'I have copied them' }));
    expect(screen.queryByRole('textbox', { name: 'SCIM token' })).not.toBeInTheDocument();
  });

  it('warns about seat cost when a group gets agent seats', async () => {
    render(<PeopleListScreen {...peopleProps()} />);
    await ue.click(screen.getByRole('tab', { name: 'Directory sync' }));
    await ue.click(screen.getByRole('button', { name: 'Settings for Head office AD' }));
    await ue.click(await screen.findByRole('button', { name: 'Add a group rule' }));
    expect(screen.getByText(/₹999 a month/)).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Collaborator' }));
    expect(screen.queryByText(/₹999 a month/)).not.toBeInTheDocument();
  });
});

describe('SD-1.30 privacy requests', () => {
  it('asks for confirmation before erasing, then erases', async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    render(<PrivacyScreen state="ready" status="open" onStatus={() => {}} requests={REQUESTS} legalHold={false} settings={{ retentionMonths: null, legalHold: false, binDays: 30 }} onDecide={onDecide} onSaveSettings={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Complete the request from Neha Iyer' }));
    const dialog = await screen.findByRole('dialog', { name: /Erase Neha Iyer’s data for good/ });
    expect(within(dialog).getByText('This cannot be undone')).toBeInTheDocument();
    expect(onDecide).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('button', { name: 'Erase for good' }));
    expect(onDecide).toHaveBeenCalledWith(REQUESTS[0], 'complete', '');
  });

  it('a legal hold blocks erasing and refusing needs a note', async () => {
    render(<PrivacyScreen state="ready" status="open" onStatus={() => {}} requests={REQUESTS} legalHold settings={{ retentionMonths: 24, legalHold: true, binDays: 30 }} onDecide={vi.fn()} onSaveSettings={vi.fn()} />);
    expect(screen.getByText('A legal hold is on')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Complete the request from Neha Iyer' }));
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Erase for good' })).toBeDisabled();
  });
});

describe('Set-up checklist', () => {
  it('shows each step as done or to do with a link', () => {
    render(<SetupStart checklist={CHECKLIST} onCreateDesk={vi.fn()} onCreatePolicy={vi.fn()} onCreateMailbox={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Set-up checklist' });
    const items = within(list).getAllByRole('listitem');
    expect(within(items[0]).getByText('Done')).toBeInTheDocument();
    expect(within(items[1]).getByText('To do')).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Do it: Set response targets (SLA)' })).toHaveAttribute('href', '/yx/desk/setup?tab=sla');
    expect(screen.getByText('1 of 3 done.')).toBeInTheDocument();
  });

  it('the wizard creates the desk, then sets targets from a preset', async () => {
    const onCreateDesk = vi.fn().mockResolvedValue({ id: 'd9' });
    const onCreatePolicy = vi.fn().mockResolvedValue(undefined);
    render(<SetupStart checklist={CHECKLIST} onCreateDesk={onCreateDesk} onCreatePolicy={onCreatePolicy} onCreateMailbox={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Set up a desk in 3 steps' }));
    await ue.type(screen.getByRole('textbox', { name: /Desk name/ }), 'IT help desk');
    await ue.type(screen.getByRole('textbox', { name: /Short key/ }), 'it');
    await ue.click(screen.getByRole('button', { name: 'Create desk' }));
    expect(onCreateDesk).toHaveBeenCalledWith({ name: 'IT help desk', key: 'IT', kind: 'custom' });
    await ue.click(await screen.findByRole('radio', { name: 'Faster' }));
    await ue.click(screen.getByRole('button', { name: 'Set these targets' }));
    expect(onCreatePolicy).toHaveBeenCalledWith('d9', presetPolicy('faster'));
  });
});

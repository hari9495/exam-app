import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PreRegisterScreen, VisitorDeskScreen, VisitorKioskScreen } from './visitors';
import type { VisitView } from './visitors-data';
import type { KioskNeeds, LiveVisitorKiosk } from './visitor-kiosk';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { visitorSettingsPage, visitorTypesFromRows, type VisitorSettingsData, type VisitorTypesData } from '../settings/visitors-live';

// Visitors slice 2 (answers 601, 602, 604, 606, 610): the visitor kiosk, walk-ins and deciding at the desk, the host's
// approval card, visitor types on Settings 3.12. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 10, 12);
const SAMPLE = { id: '', name: '', mobile: '', company: '', purpose: 'Meeting' as const, host: '', location: '', from: TODAY, to: TODAY, status: 'Expected' as const };
const NEEDS: KioskNeeds = { notice: { text: 'Wear your badge.', version: 'v-1' }, nda: { title: 'Visitor NDA', text: 'Keep it confidential.', versionId: 'nda1' }, induction: { title: 'Plant safety induction', text: 'Wear shoes.', versionId: 'ind1' } };

const kiosk = (over: Partial<LiveVisitorKiosk> = {}): LiveVisitorKiosk => ({
  state: 'ready',
  onRetry: vi.fn(),
  info: { company: 'Kaveri Foods', location: 'Chennai office', open: true, photo: false, retentionDays: 90, types: [{ value: 't1', label: 'Contractor' }] },
  needs: vi.fn(async () => NEEDS),
  walkIn: vi.fn(async () => ({ state: 'waiting' as const, id: 'w1', host: 'Anita' })),
  status: vi.fn(async () => ({ state: 'badge' as const, name: 'Priyanka Sethi', host: 'Anita', badge: 'V-0414', passCode: 'V-AAAA-BBBB' })),
  pass: vi.fn(async () => ({ state: 'notice' as const, id: 'p1', name: 'Kiran Rao', host: 'Anita', needs: { ...NEEDS, nda: null } })),
  checkIn: vi.fn(async () => ({ state: 'badge' as const, name: 'Kiran Rao', host: 'Anita', badge: 'V-0415', passCode: 'V-CCCC-DDDD' })),
  pollMs: 20,
  ...over,
});

describe('VIS-03 kiosk (live)', () => {
  it('walk-in: details are required (errors), the NDA and induction each need their tick, then waiting and the badge', async () => {
    const live = kiosk({ pollMs: 400 });
    show(<VisitorKioskScreen visit={SAMPLE} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: "I don't have a pass" }));
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter the name of the person you are meeting.')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Your name/), 'Priyanka Sethi');
    await ue.type(screen.getByLabelText(/^Mobile/), '9811044319');
    await ue.type(screen.getByLabelText(/^Company/), 'Fairview');
    await ue.type(screen.getByLabelText(/^Who are you meeting/), 'Anita Desai');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Before you enter')).toBeInTheDocument();
    expect(live.needs).toHaveBeenCalledWith({ typeId: null, mobile: '9811044319', company: 'Fairview' });
    expect(screen.getByText(/Keep it confidential/)).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: 'I have read and accept the visitor notice' }));
    await ue.click(screen.getByRole('button', { name: 'Accept and continue' }));
    expect(screen.getByText('Tick to accept Visitor NDA.')).toBeInTheDocument();
    expect(live.walkIn).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('checkbox', { name: 'I accept Visitor NDA' }));
    await ue.click(screen.getByRole('checkbox', { name: /I have read Plant safety induction/ }));
    await ue.click(screen.getByRole('button', { name: 'Accept and continue' }));
    await waitFor(() => expect(live.walkIn).toHaveBeenCalledWith(expect.objectContaining({ name: 'Priyanka Sethi', hostName: 'Anita Desai', photoBase64: null, noticeVersion: 'v-1', ndaVersionId: 'nda1', inductionVersionId: 'ind1' })));
    expect(await screen.findByText("We've told Anita")).toBeInTheDocument();
    expect(await screen.findByText("You're checked in")).toBeInTheDocument();
    expect(live.status).toHaveBeenCalledWith('w1');
  });

  it('pass: the code is required; then only what is left to read; a refused or closed kiosk says see reception', async () => {
    const live = kiosk();
    const { unmount } = show(<VisitorKioskScreen visit={SAMPLE} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Scan my QR pass' }));
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Type the code under your QR pass/)).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Pass code/), 'V-7KQ2-MX4P');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Before you enter')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Visitor NDA/ })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: 'I have read and accept the visitor notice' }));
    await ue.click(screen.getByRole('checkbox', { name: /Plant safety induction/ }));
    await ue.click(screen.getByRole('button', { name: 'Accept and continue' }));
    await waitFor(() => expect(live.checkIn).toHaveBeenCalledWith('p1', { noticeVersion: 'v-1', ndaVersionId: null, inductionVersionId: 'ind1' }));
    expect(await screen.findByText("You're checked in")).toBeInTheDocument();
    unmount();
    const refused = kiosk({ pass: vi.fn(async () => ({ state: 'see-reception' as const })) });
    const r2 = show(<VisitorKioskScreen visit={SAMPLE} today={TODAY} live={refused} />);
    await ue.click(screen.getByRole('button', { name: 'Scan my QR pass' }));
    await ue.type(screen.getByLabelText(/^Pass code/), 'V-7KQ2-MX4P');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Please see the reception desk')).toBeInTheDocument();
    r2.unmount();
    show(<VisitorKioskScreen visit={SAMPLE} today={TODAY} live={kiosk({ info: { ...kiosk().info!, open: false } })} />);
    expect(screen.getByText('Please see the reception desk')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan my QR pass' })).not.toBeInTheDocument();
  });

  it('the host declines: the kiosk says so', async () => {
    const live = kiosk({ status: vi.fn(async () => ({ state: 'rejected' as const, host: 'Anita' })), info: { ...kiosk().info!, types: [] } });
    show(<VisitorKioskScreen visit={SAMPLE} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: "I don't have a pass" }));
    expect(screen.queryByLabelText(/You are visiting as/)).not.toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Your name/), 'P S');
    await ue.type(screen.getByLabelText(/^Mobile/), '9811044319');
    await ue.type(screen.getByLabelText(/^Who are you meeting/), 'Anita');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Before you enter');
    for (const c of screen.getAllByRole('checkbox')) await ue.click(c);
    await act(async () => void (await ue.click(screen.getByRole('button', { name: 'Accept and continue' }))));
    expect(await screen.findByText("Your visit can't go ahead today")).toBeInTheDocument();
  });
});

const v = (over: Partial<VisitView> = {}): VisitView => ({
  id: 'w1', name: 'Mohan Lal', mobile: '+919000011111', email: null, company: 'Acme', purpose: 'vendor', host: 'Anita Desai', location: 'Chennai office', locationId: 'maa',
  startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T12:30:00.000Z', status: 'waiting', statusText: 'Waiting for host', passCode: 'V-7KQ2-MX4P', badge: null, vehicle: null, noticeAcceptedAt: '2026-11-12T08:30:00.000Z', checkedInAt: null, checkedOutAt: null, walkIn: true, approvalDueAt: '2026-11-12T08:40:00.000Z', ...over,
});
const walkIns = (over = {}) => ({
  types: [{ value: 't1', label: 'Customer' }],
  hosts: vi.fn(async () => [{ value: 'h1', label: 'Anita Desai' }]),
  needs: vi.fn(async () => ({ ...NEEDS, induction: null, inHours: false, hours: '09:00 to 18:30' })),
  onAdd: vi.fn(async () => ({ name: 'Mohan Lal' })),
  onDecide: vi.fn(async () => undefined),
  visitNeeds: vi.fn(async () => ({ ...NEEDS, nda: null })),
  ...over,
});
const desk = (over = {}) => ({
  state: 'ready' as const, onRetry: vi.fn(), locations: [{ value: 'maa', label: 'Chennai office' }], locationId: 'maa', onLocation: vi.fn(), today: TODAY,
  visits: [v()], canChange: true, onFind: vi.fn(), onCheckIn: vi.fn(async () => v({ status: 'on_site', statusText: 'On site' })), onCheckOut: vi.fn(), walkIns: walkIns(), ...over,
});

describe('VIS-01 walk-ins at the desk (live)', () => {
  it('adds a walk-in: name, mobile, host, the reason outside the hours and each tick are required; then the host is asked', async () => {
    const live = desk({ visits: [] });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Add walk-in' }));
    const d = screen.getByRole('dialog', { name: /Add a walk-in/ });
    await waitFor(() => expect(live.walkIns.needs).toHaveBeenCalled());
    await ue.click(within(d).getByRole('button', { name: 'Ask the host' }));
    for (const t of ["Enter the visitor's name.", 'Choose who they are visiting.', /Say why they come in now/, 'Tick that the visitor read and accepted the notice.', 'Tick that the visitor accepted Visitor NDA.']) expect(within(d).getByText(t)).toBeInTheDocument();
    expect(live.walkIns.onAdd).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Visitor's name/), 'Mohan Lal');
    await ue.type(within(d).getByLabelText(/^Mobile/), '9000011111');
    await ue.click(within(d).getByRole('combobox', { name: 'Visiting' }));
    await ue.click(await screen.findByRole('option', { name: /Anita Desai/ }));
    await ue.type(within(d).getByLabelText(/^Why now/), 'Urgent boiler repair');
    await ue.click(within(d).getByRole('checkbox', { name: 'The visitor read and accepted the notice' }));
    await ue.click(within(d).getByRole('checkbox', { name: 'The visitor accepted Visitor NDA' }));
    await ue.click(within(d).getByRole('button', { name: 'Ask the host' }));
    await waitFor(() => expect(live.walkIns.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mohan Lal', hostUserId: 'h1', ndaVersionId: 'nda1', inductionVersionId: null, hoursReason: 'Urgent boiler repair', noticeVersion: 'v-1' })));
    expect((await screen.findAllByText('Mohan Lal is waiting for the host')).length).toBeGreaterThan(0);
  });

  it('decide for the host: only after the timeout; a refusal needs the reason; acting: no walk-in button', async () => {
    const before = desk({ visits: [v({ approvalDueAt: new Date(Date.now() + 5 * 60_000).toISOString() })] });
    const { unmount } = show(<VisitorDeskScreen visits={[]} today={TODAY} live={before} />);
    expect(screen.getByText(/is waiting for Anita Desai to approve. After/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decide for host' })).not.toBeInTheDocument();
    unmount();
    const after = desk({ visits: [v({ approvalDueAt: new Date(Date.now() - 60_000).toISOString() })] });
    const r = show(<VisitorDeskScreen visits={[]} today={TODAY} live={after} />);
    await ue.click(screen.getByRole('button', { name: 'Decide for host' }));
    const d = screen.getByRole('dialog', { name: /Decide for Anita Desai/ });
    await ue.click(within(d).getByRole('radio', { name: 'The visit cannot go ahead' }));
    await ue.click(within(d).getByRole('button', { name: 'Decline the visit' }));
    expect(within(d).getByText('Say why the visit cannot go ahead.')).toBeInTheDocument();
    expect(after.walkIns.onDecide).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Reason/), 'Host on leave');
    await ue.click(within(d).getByRole('button', { name: 'Decline the visit' }));
    await waitFor(() => expect(after.walkIns.onDecide).toHaveBeenCalledWith('w1', false, 'Host on leave'));
    r.unmount();
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={desk({ canChange: false })} />);
    expect(screen.queryByRole('button', { name: 'Add walk-in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decide for host' })).not.toBeInTheDocument();
  });

  it('check-in of a typed visit asks for the induction tick, then sends it', async () => {
    const live = desk({ visits: [v({ id: 'e1', status: 'expected', statusText: 'Expected', walkIn: false })] });
    show(<VisitorDeskScreen visits={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    const d = screen.getByRole('dialog', { name: /Check in Mohan Lal/ });
    await waitFor(() => expect(live.walkIns.visitNeeds).toHaveBeenCalledWith('e1'));
    await ue.click(within(d).getByRole('button', { name: 'Check in' }));
    expect(await within(d).findByText('Tick that the visitor read Plant safety induction.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('checkbox', { name: 'The visitor read Plant safety induction' }));
    await ue.click(within(d).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(live.onCheckIn).toHaveBeenCalledWith('e1', false, { ndaAccepted: false, inductionAccepted: true }));
  });
});

describe('VIS-02 the host approval card (live)', () => {
  const approvals = (over = {}) => ({ rows: [{ id: 'w1', name: 'Priyanka Sethi', company: 'Fairview', purpose: 'audit', location: 'Chennai office', arrivedAt: '2026-11-12T04:01:00.000Z', dueAt: '2026-11-12T04:11:00.000Z', hasPhoto: true }], photo: vi.fn(async () => 'blob:photo-1'), onDecide: vi.fn(async () => undefined), ...over });
  const pre = (over = {}) => ({ state: 'ready' as const, onRetry: vi.fn(), visits: [], locations: [{ value: 'maa', label: 'Chennai office' }], today: TODAY, canChange: true, onInvite: vi.fn(), onCancel: vi.fn(), approvals: approvals(), ...over });

  it('shows the walk-in with the photo; approve (toast); the photo URL is dropped when the card goes', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const live = pre();
    const { rerender } = show(<PreRegisterScreen visits={[]} today={TODAY} live={live} />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Photo of Priyanka Sethi' })).toHaveAttribute('src', 'blob:photo-1'));
    expect(screen.getByText(/Fairview · Audit · at Chennai office reception/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(live.approvals.onDecide).toHaveBeenCalledWith('w1', true));
    rerender(<ToastProvider><PreRegisterScreen visits={[]} today={TODAY} live={{ ...live, approvals: { ...live.approvals, rows: [] } }} /></ToastProvider>);
    expect(screen.queryByText('A walk-in is asking for you')).not.toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith('blob:photo-1');
    revoke.mockRestore();
  });

  it('acting for someone else: no buttons; no photo: the placeholder', () => {
    const live = pre({ canChange: false, approvals: approvals({ rows: [{ ...approvals().rows[0], hasPhoto: false }] }) });
    show(<PreRegisterScreen visits={[]} today={TODAY} live={live} />);
    expect(screen.getByText('A walk-in is asking for you')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(live.approvals.photo).not.toHaveBeenCalled();
  });
});

describe('Settings 3.12: kiosk and visitor types (live)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.12')!;
  const data: VisitorSettingsData = { canEdit: true, values: { 'visitors.kiosk': 'off' }, defaults: { 'visitors.kiosk': 'off' }, choices: {}, labels: {}, overrides: {}, lastChange: null };
  const types: VisitorTypesData = { types: [{ id: 'a', name: 'Contractor', escort: true, ndaPolicyId: 'p1', nda: 'Visitor NDA', inductionPolicyId: null, induction: null }], policies: [{ id: 'p1', title: 'Visitor NDA' }, { id: 'p2', title: 'Plant safety induction' }] };
  it('the kiosk is a toggle, off by default; types show their policies and save back by place', () => {
    const page = visitorSettingsPage(design, data, types);
    const all = page.sections.flatMap((s) => s.settings);
    expect(all.find((s) => s.key === 'vis.kiosk')).toMatchObject({ kind: 'toggle', value: false, starter: true });
    const list = all.find((s) => s.key === 'vis.types')!;
    expect(list.rows).toEqual([['Contractor', 'Yes', 'Visitor NDA', 'No']]);
    expect(list.columnOptions?.NDA).toEqual(['No', 'Visitor NDA', 'Plant safety induction']);
    expect(visitorTypesFromRows([['Contractor', 'No', 'Visitor NDA', 'Plant safety induction'], ['Customer', 'No', 'No', 'No']], types)).toEqual([
      { id: 'a', name: 'Contractor', escort: false, ndaPolicyId: 'p1', inductionPolicyId: 'p2' },
      { name: 'Customer', escort: false, ndaPolicyId: null, inductionPolicyId: null },
    ]);
    expect(visitorSettingsPage(design, data).sections.flatMap((s) => s.settings).some((s) => s.key === 'vis.types')).toBe(false);
  });
});

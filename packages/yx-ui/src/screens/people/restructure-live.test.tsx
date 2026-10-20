import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { RestructureWizard } from './changes';
import { RestructureRecord, type LiveRestructure, type RestructureInput, type RestructurePreview, type RestructureRecordData } from './restructure';

// People › Restructure (PPL-09) and the continuity checklist (PPL-10) with the live app's data.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const person = (name: string, o: Partial<RestructurePreview['people'][number]> = {}): RestructurePreview['people'][number] => ({
  employeeId: name.toLowerCase(),
  name,
  code: 'TN0001',
  status: 'ready',
  reason: null,
  from: { entity: 'Kaveri TN', code: 'TN0001', location: 'Hosur plant', department: 'Quality', manager: null },
  to: { entity: 'Kaveri Foods', code: 'TN0001', location: 'Bengaluru', department: 'Quality', manager: null },
  service: { from: '2019-06-03', kept: true },
  leave: [{ name: 'Privilege leave', days: 12, action: 'carried' }],
  pay: 'kept',
  ...o,
});

describe('Restructure wizard (PPL-09)', () => {
  const live = (o: Partial<LiveRestructure> = {}): LiveRestructure => ({
    state: 'ready',
    onRetry: vi.fn(),
    setup: {
      today: '2026-10-20',
      entities: [
        { id: 'kf', name: 'Kaveri Foods', shortName: 'KF', people: 152 },
        { id: 'tn', name: 'Kaveri TN', shortName: 'TN', people: 2 },
      ],
      locations: [
        { id: 'hsr', name: 'Hosur plant', legalEntityId: 'tn', people: 2 },
        { id: 'blr', name: 'Bengaluru', legalEntityId: 'kf', people: 152 },
      ],
      departments: [],
      masters: [],
      costCentres: [],
      open: [],
    },
    people: [],
    onPreview: vi.fn(async (input: RestructureInput): Promise<RestructurePreview> => ({
      people: [person('Divya'), input.overrides.some((x) => x.leaveOut) ? person('Imran', { status: 'left_out', reason: 'Left out: retiring', to: null }) : person('Imran', { status: 'failed', reason: 'Has an open exit case. Leave them out, or close the exit case first.', to: null })],
      checks: [{ id: 'pay', title: 'October 2026 payroll of Kaveri Foods is open', status: 'Ready' }],
      counts: { ready: 1, failed: input.overrides.length ? 0 : 1, leftOut: input.overrides.length },
    })),
    onSend: vi.fn(async () => undefined),
    onOpen: vi.fn(),
    ...o,
  });

  it('checks each person, says who cannot move and why, and sends only once they are left out (typed confirmation)', async () => {
    const l = live();
    wrap(<RestructureWizard live={l} />);
    await ue.click(screen.getByRole('combobox', { name: /From entity/ }));
    await ue.click(await screen.findByRole('option', { name: /Kaveri TN/ }));
    await ue.click(screen.getByRole('combobox', { name: /Into entity/ }));
    await ue.click(await screen.findByRole('option', { name: /Kaveri Foods/ }));
    await ue.click(screen.getByRole('combobox', { name: 'Location in Kaveri Foods for Hosur plant' }));
    await ue.click(await screen.findByRole('option', { name: 'Bengaluru' }));
    await ue.click(screen.getByRole('textbox', { name: /Effective date/ }));
    await ue.keyboard('01/11/2026{Enter}');
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Merger');
    await waitFor(() => expect(l.onPreview).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(l.onPreview).mock.calls.at(-1)![0]).toMatchObject({ kind: 'merge', fromEntityId: 'tn', intoEntityId: 'kf', effectiveDate: '2026-11-01', locationMap: { hsr: 'blr' }, masterMap: {}, defaults: { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' }, reason: 'Merger' });
    expect(await screen.findByText('1 person needs their own decision')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Imran can’t move'.replace('’', "'"))).toBeInTheDocument();
    expect(screen.getByText('Has an open exit case. Leave them out, or close the exit case first.', { selector: 'div' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Leave out' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add an override' });
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Retiring 31 Oct');
    await ue.click(within(dialog).getByRole('button', { name: 'Add override' }));
    await waitFor(() => expect(vi.mocked(l.onPreview).mock.calls.at(-1)![0].overrides).toEqual([{ employeeId: 'imran', leaveOut: true, reason: 'Retiring 31 Oct' }]), { timeout: 3000 });
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send for approval' })).toBeEnabled(), { timeout: 3000 });
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    const confirm = await screen.findByRole('dialog');
    await ue.type(within(confirm).getByRole('textbox'), 'MERGE TN NOV 2026');
    await ue.click(within(confirm).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(l.onSend).toHaveBeenCalledWith(expect.objectContaining({ overrides: [{ employeeId: 'imran', leaveOut: true, reason: 'Retiring 31 Oct' }] }), 'Merge Kaveri TN into Kaveri Foods'));
  });
});

describe('Restructure record (PPL-09) and continuity checklist (PPL-10)', () => {
  const base: RestructureRecordData = {
    id: 'r1',
    kind: 'merge',
    title: 'Merge Kaveri TN into Kaveri Foods',
    effectiveDate: '2026-11-01',
    status: 'pending',
    count: 1,
    moved: 0,
    failed: 0,
    requestedBy: 'Lakshmi',
    mine: false,
    reason: 'Merger',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    canDecide: true,
    canCancel: false,
    people: [{ employeeId: 'divya', name: 'Divya', status: 'pending', reason: null, result: null, openItems: 0 }],
  };

  it('the approver approves once; the sender sees no approve button', async () => {
    const onApprove = vi.fn(async () => undefined);
    const { unmount } = wrap(<RestructureRecord state="ready" onRetry={vi.fn()} data={base} today={new Date(2026, 9, 20)} onApprove={onApprove} onReject={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Approve and move 1 people' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve and move 1 people' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    unmount();
    wrap(<RestructureRecord state="ready" onRetry={vi.fn()} data={{ ...base, canDecide: false, canCancel: true, mine: true }} today={new Date(2026, 9, 20)} onApprove={onApprove} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel restructure' })).toBeInTheDocument();
  });

  it('after the move: who moved, who could not and why, and each person’s checklist kept up to date', async () => {
    const items = [{ id: 'i1', key: 'esi', title: 'ESI: the same IP number carries over', owner: 'Payroll', dueOn: '2026-11-30', status: 'open' as const, note: null, version: 1 }];
    const onItem = vi.fn(async () => undefined);
    const done: RestructureRecordData = {
      ...base,
      status: 'done',
      moved: 1,
      failed: 1,
      canDecide: false,
      people: [
        { employeeId: 'divya', name: 'Divya', status: 'moved', reason: null, result: person('Divya', { status: 'moved' }), openItems: 1 },
        { employeeId: 'imran', name: 'Imran', status: 'failed', reason: 'Has a transfer on 05 Nov 2026, on or after the move date.', result: null, openItems: 0 },
      ],
    };
    wrap(<RestructureRecord state="ready" onRetry={vi.fn()} data={done} today={new Date(2026, 10, 2)} onItems={async () => items} onItem={onItem} />);
    expect(screen.getByText('1 moved · 1 couldn’t move'.replace('’', "'"))).toBeInTheDocument();
    expect(screen.getByText('Has a transfer on 05 Nov 2026, on or after the move date.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continuity checklist (1)' }));
    const drawer = await screen.findByRole('dialog', { name: 'Continuity checklist · Divya' });
    expect(await within(drawer).findByText('ESI: the same IP number carries over')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(onItem).toHaveBeenCalledWith(items[0], true));
  });
});

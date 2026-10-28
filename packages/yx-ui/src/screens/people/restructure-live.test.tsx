import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { RestructureWizard } from './changes';
import { FinishedRestructuresScreen, quarterOf, RestructureRecord, shortReason, type LiveRestructure, type RestructureInput, type RestructurePreview, type RestructureRecordData } from './restructure';

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
        { id: 'hsr', name: 'Hosur plant', legalEntityId: 'tn', people: 2, state: 'Karnataka' },
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
    await ue.click(screen.getByRole('textbox', { name: /Effective date/ }));
    await ue.keyboard('01/11/2026{Enter}');
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Merger');
    // Step 1 as in the design: the real count and a counts-per-place summary; later steps not started.
    expect(screen.getByText(/^Moves 2 employments with one preview/)).toBeInTheDocument();
    expect(screen.getByText('Who moves (2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close the old entity/ })).toHaveTextContent('Not started');
    // The place in the new entity is chosen on step 2; nothing is guessed and Continue waits for it.
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    const place = screen.getByRole('combobox', { name: 'Location in Kaveri Foods for Hosur plant' });
    expect(place).toHaveTextContent('Choose…');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText('Choose a place in Kaveri Foods for every row first')).toBeInTheDocument();
    expect(l.onPreview).not.toHaveBeenCalled();
    await ue.click(place);
    await ue.click(await screen.findByRole('option', { name: 'Bengaluru' }));
    await waitFor(() => expect(l.onPreview).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(l.onPreview).mock.calls.at(-1)![0]).toMatchObject({ kind: 'merge', fromEntityId: 'tn', intoEntityId: 'kf', effectiveDate: '2026-11-01', locationMap: { hsr: 'blr' }, masterMap: {}, defaults: { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' }, reason: 'Merger' });
    expect(screen.getByRole('button', { name: /Close the old entity/ })).toHaveTextContent('Not started');
    await ue.click(screen.getByRole('button', { name: /What moves/ }));
    expect(await screen.findByText('1 person needs their own decision')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'People who need their own decision' })).getByRole('listitem')).toHaveTextContent('Imran: has an open exit case');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: /Close the old entity/ })).toHaveTextContent("Needs changes · 1 can't move");
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

  it('never guesses a place in the new entity: only an exact same-name match starts chosen', async () => {
    const m = (id: string, name: string, openTo: string[] | null, tn = 0) => ({ kind: 'department' as const, id, name, byEntity: (tn ? { tn } : {}) as Record<string, number>, openTo });
    const base = live();
    const l = live({ setup: { ...base.setup!, departments: [m('prod', 'Production', ['tn'], 1), m('eng', 'Engineering', null), m('qtn', 'Quality', ['tn'], 1), m('qkf', 'quality', ['kf'])] } });
    wrap(<RestructureWizard live={l} />);
    await ue.click(screen.getByRole('combobox', { name: /From entity/ }));
    await ue.click(await screen.findByRole('option', { name: /Kaveri TN/ }));
    await ue.click(screen.getByRole('combobox', { name: /Into entity/ }));
    await ue.click(await screen.findByRole('option', { name: /Kaveri Foods/ }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('combobox', { name: 'Department in Kaveri Foods for Production' })).toHaveTextContent('Choose…');
    expect(screen.getByRole('combobox', { name: 'Department in Kaveri Foods for Quality' })).toHaveTextContent('quality');
    expect(screen.getByRole('combobox', { name: 'Location in Kaveri Foods for Hosur plant' })).toHaveTextContent('Choose…');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  const DRAFT = { id: 'd1', state: { kind: 'merge' as const, fromEntityId: 'tn', intoEntityId: 'kf', effectiveDate: '2026-11-01', locationMap: { hsr: 'blr' }, reason: 'Merger', step: 'close' } };

  it('continues a saved draft; step 3 lists what moves with the people, opens the blocked payroll and itemises what follows from the plan', async () => {
    const l = live({
      draft: DRAFT,
      letterTypes: [{ value: 'appointment', label: 'Appointment letter' }, { value: 'transfer', label: 'Transfer letter' }],
      onSaveDraft: vi.fn(async () => undefined),
      onOpenPayroll: vi.fn(),
      onPreview: vi.fn(async (): Promise<RestructurePreview> => ({
        people: [person('Divya')],
        checks: [
          { id: 'journeys', title: '3 open onboarding and exit journeys will move with them', status: 'Ready' },
          { id: 'approvals', title: '11 approvals and 2 cases will move with them', status: 'Ready' },
          { id: 'last', title: 'Last payroll month (October 2026) of Kaveri TN run and locked', status: 'Blocked', note: 'October 2026 payroll is not locked yet. Lock it first.', payrollRunId: 'run1', month: 'October' },
        ],
        counts: { ready: 1, failed: 0, leftOut: 0 },
      })),
    });
    wrap(<RestructureWizard live={l} />);
    expect(await screen.findByText('3 open onboarding and exit journeys will move with them', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('11 approvals and 2 cases will move with them')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open October payroll' }));
    expect(l.onOpenPayroll).toHaveBeenCalledWith('run1');
    // After approval: the month, the quarter and the state come from the plan (move on 1 Nov: October, Q3, Karnataka).
    expect(screen.getByText('Final PF and ESI challans for October filed')).toBeInTheDocument();
    expect(screen.getByText('TDS return for Q3 (Oct–Dec) filed')).toBeInTheDocument();
    expect(screen.getByText('Part-year Form 16 from Kaveri TN for moved staff')).toBeInTheDocument();
    expect(screen.getByText('Karnataka professional tax final return filed')).toBeInTheDocument();
    expect(screen.getByText('PF, ESI and PT registrations surrendered')).toBeInTheDocument();
    expect(screen.queryByText(/Tamil Nadu|September/)).toBeNull();
    // Letters: the transfer letter template starts chosen; bulk issue after approval.
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('combobox', { name: /Letter template/ })).toHaveTextContent('Transfer letter');
    expect(screen.getByText(/opens the bulk issue for the 1 person who moved/)).toBeInTheDocument();
    // Save and exit keeps the wizard as it was left, on the same draft.
    await ue.click(screen.getByRole('button', { name: 'Save and exit' }));
    expect(l.onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ kind: 'merge', fromEntityId: 'tn', intoEntityId: 'kf', effectiveDate: '2026-11-01', locationMap: { hsr: 'blr' }, reason: 'Merger', letterType: 'transfer', step: 'letters' }), 'Merge Kaveri TN into Kaveri Foods', 'd1');
  });

  it('the start page lists the person’s saved drafts: continue one, or delete it after confirming', async () => {
    const l = live({ drafts: [{ id: 'd1', title: 'Merge Kaveri TN into Kaveri Foods', updatedAt: '2026-10-20T10:00:00Z' }], onContinueDraft: vi.fn(), onDeleteDraft: vi.fn(async () => undefined), onSaveDraft: vi.fn(async () => undefined) });
    wrap(<RestructureWizard live={l} />);
    // The drafts are one view of the start page (founder 28 Oct 2026: the page fits without a scroll bar).
    await ue.click(screen.getByRole('radio', { name: 'Saved drafts (1)' }));
    const list = screen.getByRole('list', { name: 'Saved drafts' });
    expect(within(list).getByText('Merge Kaveri TN into Kaveri Foods')).toBeInTheDocument();
    await ue.click(within(list).getByRole('button', { name: 'Continue' }));
    expect(l.onContinueDraft).toHaveBeenCalledWith('d1');
    await ue.click(within(list).getByRole('button', { name: 'Delete' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(l.onDeleteDraft).toHaveBeenCalledWith('d1'));
    // A new plan saved from the start: no draft id yet.
    await ue.click(screen.getByRole('radio', { name: 'New restructure' }));
    await ue.click(screen.getByRole('button', { name: 'Save and exit' }));
    expect(l.onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ kind: 'merge', fromEntityId: null, step: 'scope' }), 'Restructure', null);
  });

  const ENTITY_PEOPLE = [
    { id: 'divya', name: 'Divya Raghunathan', code: 'TN0001', locationId: 'hsr', location: 'Hosur plant' },
    { id: 'imran', name: 'Imran Sheikh', code: 'TN0002', locationId: 'hsr', location: 'Hosur plant' },
  ];
  // The API moves only the picked people: the dry run answers with them alone.
  const pickedPreview = vi.fn(async (input: RestructureInput): Promise<RestructurePreview> => ({
    people: (input.employeeIds ?? ['divya', 'imran']).map((e) => person(e === 'divya' ? 'Divya' : 'Imran')),
    checks: [],
    counts: { ready: 1, failed: 0, leftOut: 0 },
  }));
  const partOf = async (l: LiveRestructure) => {
    wrap(<RestructureWizard live={l} />);
    await ue.click(screen.getByRole('radio', { name: 'Move part of the entity to another one' }));
    await ue.click(screen.getByRole('combobox', { name: /From entity/ }));
    await ue.click(await screen.findByRole('option', { name: /Kaveri TN/ }));
    await ue.click(screen.getByRole('combobox', { name: /Into entity/ }));
    await ue.click(await screen.findByRole('option', { name: /Kaveri Foods/ }));
    await ue.click(screen.getByRole('textbox', { name: /Effective date/ }));
    await ue.keyboard('01/11/2026{Enter}');
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Divya moves');
  };

  it('pick people: only the picked people are sent and checked; By location again clears them', async () => {
    const l = live({ onEntityPeople: vi.fn(async () => ENTITY_PEOPLE), onPreview: pickedPreview, onSaveDraft: vi.fn(async () => undefined) });
    await partOf(l);
    expect(screen.getByRole('radio', { name: 'By location' })).toHaveAttribute('aria-checked', 'true');
    await ue.click(screen.getByRole('radio', { name: 'Pick people' }));
    expect(l.onEntityPeople).toHaveBeenCalledWith('tn');
    expect(screen.getByText('Only the people you pick move.')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: /People/ }));
    await ue.click(await screen.findByRole('option', { name: /Divya Raghunathan · TN0001/ }));
    await ue.keyboard('{Escape}');
    expect(screen.getByText(/^Moves 1 employment with one preview/)).toBeInTheDocument();
    // Only Divya's location needs a place in the new entity.
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('1 person')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: 'Location in Kaveri Foods for Hosur plant' }));
    await ue.click(await screen.findByRole('option', { name: 'Bengaluru' }));
    await waitFor(() => expect(l.onPreview).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(l.onPreview).mock.calls.at(-1)![0]).toMatchObject({ kind: 'demerge', employeeIds: ['divya'], locationIds: [], locationMap: { hsr: 'blr' } });
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    const table = screen.getByRole('table', { name: /Each person after the move/ });
    expect(within(table).getByText('Divya')).toBeInTheDocument();
    expect(within(table).queryByText('Imran')).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save and exit' }));
    expect(l.onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ kind: 'demerge', employeeIds: ['divya'], locationIds: [] }), 'Move part of Kaveri TN to Kaveri Foods', null);
    // Back to By location: the picked people are gone and the plan is by location again.
    await ue.click(screen.getByRole('button', { name: /What moves/ }));
    await ue.click(screen.getByRole('radio', { name: 'By location' }));
    await ue.click(screen.getByRole('combobox', { name: /Locations/ }));
    await ue.click(await screen.findByRole('option', { name: /Hosur plant/ }));
    await ue.keyboard('{Escape}');
    await waitFor(() => expect(vi.mocked(l.onPreview).mock.calls.at(-1)![0]).toMatchObject({ locationIds: ['hsr'] }), { timeout: 3000 });
    expect(vi.mocked(l.onPreview).mock.calls.at(-1)![0]).not.toHaveProperty('employeeIds');
    await ue.click(screen.getByRole('radio', { name: 'Pick people' }));
    expect(screen.queryByText(/Divya Raghunathan · TN0001/)).toBeNull();
  });

  it('pick people with no one picked: Continue stays enabled and says what is missing; nothing is checked', async () => {
    const l = live({ onEntityPeople: vi.fn(async () => ENTITY_PEOPLE), onPreview: vi.fn(pickedPreview) });
    await partOf(l);
    await ue.click(screen.getByRole('radio', { name: 'Pick people' }));
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeEnabled();
    await ue.click(next);
    expect(screen.getByText('Pick at least one person who moves.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pick people' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 700));
    expect(l.onPreview).not.toHaveBeenCalled();
  });

  it('a draft saved with picked people continues with them (inside one entity)', async () => {
    const l = live({ onEntityPeople: vi.fn(async () => ENTITY_PEOPLE), onPreview: vi.fn(pickedPreview), draft: { id: 'd2', state: { kind: 'within', fromEntityId: 'tn', effectiveDate: '2026-11-01', employeeIds: ['imran'], target: { locationId: 'hsr' }, reason: 'Imran moves' } } });
    wrap(<RestructureWizard live={l} />);
    expect(screen.getByRole('radio', { name: 'Pick people' })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('Imran Sheikh · TN0002')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Departments/ })).toBeNull();
    await waitFor(() => expect(l.onPreview).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(l.onPreview).mock.calls.at(-1)![0]).toMatchObject({ kind: 'within', employeeIds: ['imran'], locationIds: [], departmentIds: [] });
  });

  it('finished restructures: done, rejected and cancelled ones; Open goes to the record; an empty list says so', async () => {
    const row = (id: string, status: 'done' | 'rejected' | 'cancelled', o: object = {}) => ({ id, kind: 'demerge' as const, title: `Move ${id} from Kaveri TN to Kaveri Foods`, effectiveDate: '2026-10-01', status, count: 1, moved: 0, failed: 0, requestedBy: null, mine: false, openItems: 0, ...o });
    const l = live({ finished: [row('Divya', 'done', { moved: 1, openItems: 3 }), row('Imran', 'rejected'), row('Arjun', 'cancelled')] });
    const { unmount } = wrap(<RestructureWizard live={l} />);
    await ue.click(screen.getByRole('radio', { name: 'Finished (3)' }));
    const table = screen.getByRole('table', { name: 'Finished restructures' });
    const divya = within(table).getByText('Move Divya from Kaveri TN to Kaveri Foods').closest('tr')!;
    expect(divya).toHaveTextContent('1 moved');
    expect(divya).toHaveTextContent('3 open items');
    expect(divya).toHaveTextContent('Done');
    expect(within(table).getByText('Move Imran from Kaveri TN to Kaveri Foods').closest('tr')).toHaveTextContent(/1 person · none moved.*Rejected/);
    expect(within(table).getByText('Move Arjun from Kaveri TN to Kaveri Foods').closest('tr')).toHaveTextContent('Cancelled');
    await ue.click(within(divya).getByRole('button', { name: 'Open' }));
    expect(l.onOpen).toHaveBeenCalledWith('Divya');
    unmount();
    wrap(<RestructureWizard live={live({ finished: [] })} />);
    await ue.click(screen.getByRole('radio', { name: 'Finished (0)' }));
    expect(screen.getByText('No finished restructures yet')).toBeInTheDocument();
    expect(screen.getByText('Done, rejected and cancelled restructures show here.')).toBeInTheDocument();
  });

  it('payroll’s finished list (done ones only): its own empty wording', () => {
    wrap(<FinishedRestructuresScreen state="ready" onRetry={vi.fn()} rows={[]} onOpen={vi.fn()} />);
    expect(screen.getByText('Done restructures into your legal entities show here.')).toBeInTheDocument();
    expect(screen.queryByText(/rejected and cancelled/)).toBeNull();
  });

  it('no finished list without the data (no access, or it could not load)', () => {
    wrap(<RestructureWizard live={live()} />);
    expect(screen.queryByText('Finished restructures')).not.toBeInTheDocument();
    // Only the plan: no view switch at all.
    expect(screen.queryByRole('radiogroup', { name: 'Show' })).toBeNull();
  });

  it('the finished list and the wizard are both reachable, and the plan keeps what was typed', async () => {
    const row = { id: 'f1', kind: 'merge' as const, title: 'Merge Kaveri TN into Kaveri Foods', effectiveDate: '2026-10-01', status: 'done' as const, count: 2, moved: 2, failed: 0, requestedBy: null, mine: false, openItems: 0 };
    wrap(<RestructureWizard live={live({ finished: [row] })} />);
    // The plan shows first; the finished list waits behind its own view.
    expect(screen.getByRole('radio', { name: 'New restructure' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('table', { name: 'Finished restructures' })).toBeNull();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Board resolution');
    await ue.click(screen.getByRole('radio', { name: 'Finished (1)' }));
    expect(screen.getByRole('table', { name: 'Finished restructures' })).toHaveTextContent('Merge Kaveri TN into Kaveri Foods');
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    await ue.click(screen.getByRole('radio', { name: 'New restructure' }));
    expect(screen.getByRole('textbox', { name: /Reason/ })).toHaveValue('Board resolution');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('names the financial-year quarter of a day', () => {
    expect(quarterOf(new Date(2026, 9, 31))).toBe('Q3 (Oct–Dec)');
    expect(quarterOf(new Date(2026, 8, 30))).toBe('Q2 (Jul–Sep)');
    expect(quarterOf(new Date(2027, 0, 5))).toBe('Q4 (Jan–Mar)');
    expect(quarterOf(new Date(2026, 3, 1))).toBe('Q1 (Apr–Jun)');
  });

  it('says each reason in plain words, never a permission key', () => {
    expect(shortReason('Keeping their pay needs pay access (employee.salary.manage). Choose "Assign new" for salary.')).toBe('keeping their pay needs pay access');
    expect(shortReason('Retiring 31 Oct 2026')).toBe('retiring 31 Oct 2026');
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
    await ue.click(screen.getByRole('button', { name: 'Approve and move 1 person' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve and move 1 person' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    unmount();
    wrap(<RestructureRecord state="ready" onRetry={vi.fn()} data={{ ...base, canDecide: false, canCancel: true, mine: true }} today={new Date(2026, 9, 20)} onApprove={onApprove} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel restructure' })).toBeInTheDocument();
  });

  it('after the move: who moved, who could not and why, and each person’s checklist kept up to date', async () => {
    const items = [
      { id: 'i1', key: 'esi', title: 'ESI: the same IP number carries over', owner: 'Payroll', dueOn: '2026-11-30', status: 'open' as const, note: null, version: 1, canSet: true },
      // Payroll sees HR's item with its owner but cannot tick it (founder 28 Oct 2026).
      { id: 'i2', key: 'costcentre', title: 'Cost centre: choose one of Kaveri Foods', owner: 'HR', dueOn: '2026-11-30', status: 'open' as const, note: null, version: 1, canSet: false },
    ];
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
    expect(within(drawer).getByText('Cost centre: choose one of Kaveri Foods')).toBeInTheDocument();
    expect(within(drawer).getAllByRole('button', { name: 'Mark done' })).toHaveLength(1);
    await ue.click(within(drawer).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(onItem).toHaveBeenCalledWith(items[0], true));
  });
});

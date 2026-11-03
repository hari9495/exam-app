import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CompetencyFrameworkScreen, HandoverListScreen, PipRecordScreen, type Competency, type HandoverRow, type LiveCompetencies, type LiveHandover, type LivePip } from './perf-people';
import { CycleSetupScreen, ReviewAcknowledgeScreen, ReviewWorkspaceScreen } from './perf-reviews';
import { CalibrationPlan, type PlannedSession } from './growth-kit';
import { ACKNOWLEDGED, REVIEW, SETUP_CALIBRATION, WORKSPACE } from './perf-live-samples';
import { PIP_NOT_MET } from './perf-data-2';

// The "live, gap" pieces of 3 Nov 2026 (positive and negative): PRF-04 calibration in the wizard and its days, PRF-05 /
// PRF-06 downloads, PRF-12 one more extension after "not met", PRF-13 reassign to HR and the audit entry, PRF-14 import
// and the skills test.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const ok = async () => {};

describe('PRF-05 / PRF-06 downloads', () => {
  const finished = { ...REVIEW, status: 'ready' as const, can: { ...REVIEW.can, skip: false } };

  it('a submitted review offers "Download PDF"; a refusal says so on the page', async () => {
    const onDownload = vi.fn().mockRejectedValueOnce(new Error('No such review.')).mockResolvedValueOnce(undefined);
    show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, review: finished, onDownload }} />);
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(await screen.findByText(/The PDF didn’t download\. No such review\./)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/didn’t download/)).toBeNull());
  });

  it('an open review, or no download given: no button', () => {
    const { rerender } = show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, onDownload: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
    rerender(<ToastProvider><ReviewWorkspaceScreen live={{ ...WORKSPACE, review: finished }} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
  });

  it('PRF-06: "Download review" once acknowledged, not before', async () => {
    const onDownload = vi.fn(ok);
    const { rerender } = show(<ReviewAcknowledgeScreen live={{ review: ACKNOWLEDGED, onAcknowledge: vi.fn(), onDisagree: vi.fn(), onDownload }} />);
    await ue.click(screen.getByRole('button', { name: 'Download review' }));
    expect(onDownload).toHaveBeenCalled();
    rerender(<ToastProvider><ReviewAcknowledgeScreen live={{ review: { ...ACKNOWLEDGED, status: 'released', released: { ...ACKNOWLEDGED.released!, acknowledgedAt: null } }, onAcknowledge: vi.fn(), onDisagree: vi.fn(), onDownload }} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: 'Download review' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Acknowledge review' })).toBeInTheDocument();
  });
});

const ROWS: HandoverRow[] = [
  { id: 'h1', employee: 'Ravi Menon', artefact: 'Manager review stage', detail: 'H1 · manager review', from: 'Priya Nair', to: 'Karthik S', effective: new Date(2026, 10, 1), status: 'Moved' },
  { id: 'h2', employee: 'Sana Nizami', artefact: 'Goal parent', detail: '“LIMS upgrade” was aligned to the old manager’s goal', from: 'Priya Nair', to: 'Karthik S', effective: new Date(2026, 10, 1), status: 'Needs decision' },
];
const handover = (o: Partial<LiveHandover> = {}): LiveHandover => ({
  state: 'ready',
  onRetry: vi.fn(),
  rows: ROWS,
  parentOptions: vi.fn(async () => []),
  onDecide: vi.fn(ok),
  onWithHr: vi.fn(async () => ({ moved: 1, skipped: [{ id: 'h1', reason: 'It needs no decision: it already moved to the new manager.' }] })),
  auditOf: vi.fn(async () => [{ id: 'a1', at: new Date(2026, 10, 1), who: null, what: 'moved the goal parent of Sana Nizami from Priya Nair to Karthik S when the manager changed' }, { id: 'a2', at: new Date(2026, 10, 2, 10), who: 'Lakshmi Rao', what: 'reassigned the decision to HR' }]),
  ...o,
});

describe('PRF-13 reassign to HR and the audit entry', () => {
  it('HR picks rows, is told which move, and the server’s skips come back in the toast', async () => {
    const live = handover({ rows: [...ROWS, { ...ROWS[1], id: 'h3', employee: 'Deepa Rao', withHr: true, to: 'HR' }] });
    show(<HandoverListScreen persona="hr" rows={[]} live={live} />);
    await ue.click(screen.getByRole('checkbox', { name: /Select all/i }));
    await ue.click(screen.getByRole('button', { name: 'Reassign to HR' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('Reassign 1 decision to HR?')).toBeInTheDocument();
    expect(within(d).getByText('Moves to HR')).toBeInTheDocument();
    expect(within(d).getByText('Stays')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Reassign to HR' }));
    await waitFor(() => expect(live.onWithHr).toHaveBeenCalledWith(['h2', 'h3']));
    expect((await screen.findAllByText('1 decision moved to HR')).length).toBeGreaterThan(0);
  });

  it('nothing that needs a decision: refused inside the dialog, nothing sent', async () => {
    const live = handover({ rows: [{ ...ROWS[1], withHr: true, to: 'HR' }] });
    show(<HandoverListScreen persona="hr" rows={[]} live={live} />);
    await ue.click(screen.getByRole('checkbox', { name: /Select all/i }));
    await ue.click(screen.getByRole('button', { name: 'Reassign to HR' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Reassign to HR' }));
    expect(await within(d).findByText(/None of the chosen rows needs a decision/)).toBeInTheDocument();
    expect(live.onWithHr).not.toHaveBeenCalled();
  });

  it('View audit entry opens the trail; a refusal shows in the drawer', async () => {
    const live = handover({ auditOf: vi.fn().mockRejectedValueOnce(new Error('No such hand-over.')).mockResolvedValue([{ id: 'a1', at: new Date(2026, 10, 1), who: null, what: 'moved it when the manager changed' }]) });
    show(<HandoverListScreen persona="hr" rows={[]} live={live} />);
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('Sana Nizami'))!;
    await ue.click(within(row).getByRole('button', { name: /More|Actions/i }));
    await ue.click(await screen.findByRole('menuitem', { name: 'View audit entry' }));
    expect(await within(screen.getByRole('dialog')).findByText('No such hand-over.')).toBeInTheDocument();
    await ue.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })[0]);
    await ue.click(within(row).getByRole('button', { name: /More|Actions/i }));
    await ue.click(await screen.findByRole('menuitem', { name: 'View audit entry' }));
    expect(await within(screen.getByRole('dialog')).findByText(/moved it when the manager changed/)).toBeInTheDocument();
  });

  it('the new manager has neither', () => {
    show(<HandoverListScreen persona="mgr" rows={[]} live={handover()} />);
    expect(screen.queryByRole('button', { name: 'Reassign to HR' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Select all/i })).toBeNull();
  });
});

const COMPS: Competency[] = [{ id: 'k1', name: 'Food safety', group: 'Functional', description: 'HACCP', starter: false, status: 'Active', levels: ['Aware', 'Applies'], roles: [], usedIn: [], version: 3 }];
const comps = (o: Partial<LiveCompetencies> = {}): LiveCompetencies => ({ state: 'ready', onRetry: vi.fn(), items: COMPS, designations: [], onSave: vi.fn(async (_id, x) => ({ ...COMPS[0], ...x })), onRetire: vi.fn(ok), onMerge: vi.fn(ok), onLoadStarters: vi.fn(ok), ...o });
const csvFile = (text: string) => new File([text], 'competencies.csv', { type: 'text/csv' });

describe('PRF-14 import and the skills test', () => {
  it('a file with bad rows lists them and imports nothing; a good file imports and tells', async () => {
    const onImport = vi.fn()
      .mockResolvedValueOnce({ message: '1 row has a problem. Nothing was imported. Fix the file and import it again.', problems: [{ line: 3, name: 'Coaching', problems: ['Give 2 to 10 levels, separated by "|".'] }] })
      .mockResolvedValueOnce({ imported: 2 });
    show(<CompetencyFrameworkScreen items={[]} live={comps({ onImport })} />);
    await ue.click(screen.getByRole('button', { name: 'Import' }));
    const d = screen.getByRole('dialog');
    const input = d.querySelector('input[type="file"]') as HTMLInputElement;
    await ue.upload(input, csvFile('name,group,levels\nA,core,x'));
    expect(await within(d).findByText('Give 2 to 10 levels, separated by "|".')).toBeInTheDocument();
    expect(within(d).getByText(/Rows with problems \(1\)/)).toBeInTheDocument();
    expect(onImport).toHaveBeenCalledWith('name,group,levels\nA,core,x');
    await ue.upload(d.querySelector('input[type="file"]') as HTMLInputElement, csvFile('name,group,levels\nOwnership,core,Learns|Owns'));
    expect((await screen.findAllByText('2 competencies imported')).length).toBeGreaterThan(0);
  });

  it('no import without the live route', () => {
    show(<CompetencyFrameworkScreen items={[]} live={comps()} />);
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose a question tag' })).toBeNull();
  });

  it('chooses a question tag as the skills test and saves it with the version', async () => {
    const live = comps({ questionTags: vi.fn(async () => [{ value: 't1', label: 'Food safety', questions: 12 }]) });
    show(<CompetencyFrameworkScreen items={[]} live={live} />);
    expect(screen.getByText('None. Add one from the question bank.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Choose a question tag' }));
    const d = screen.getByRole('dialog');
    await ue.click(await within(d).findByRole('combobox'));
    await ue.click(await screen.findByRole('option', { name: 'Food safety (12 questions)' }));
    await ue.click(within(d).getByRole('button', { name: 'Save skills test' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledWith('k1', expect.objectContaining({ questionTagId: 't1', version: 3 })));
  });

  it('shows the linked test with its question count and link', () => {
    show(<CompetencyFrameworkScreen items={[]} live={comps({ items: [{ ...COMPS[0], skillsTest: 'Food safety', skillsTestQuestions: 1, skillsTestHref: '/v2/questions?tagId=t1' }], questionTags: vi.fn(async () => []) })} />);
    expect(screen.getByRole('link', { name: 'Food safety (1 question)' })).toHaveAttribute('href', '/v2/questions?tagId=t1');
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });
});

const pipLive = (over: Partial<LivePip> = {}): LivePip => ({
  today: new Date(2026, 10, 3),
  can: { decide: false, acknowledge: false, checkin: false, employeeNote: false, outcome: false, letter: false, startExit: true, extend: false, extendAgain: true },
  extendDays: 30,
  extendAgainDays: 45,
  askHrHref: '/yx/desk/help',
  onDecide: vi.fn(ok),
  onAcknowledge: vi.fn(ok),
  onCheckin: vi.fn(ok),
  onEmployeeNote: vi.fn(ok),
  onOutcome: vi.fn(ok),
  onLetter: vi.fn(ok),
  onStartExit: vi.fn(ok),
  onExtendAgain: vi.fn(ok),
  ...over,
});

describe('PRF-12 extend once more after "not met" (founder answer a)', () => {
  it('needs a reason of 10 characters; then extends by the company’s days', async () => {
    const live = pipLive();
    show(<PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Extend plan' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(/It runs 45 more days, to 18 Dec 2026/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Extend by 45 days' }));
    expect(within(d).getByText('Give the reason, in at least 10 characters.')).toBeInTheDocument();
    expect(live.onExtendAgain).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox'), 'Two goals nearly met; give a final month.');
    await ue.click(within(d).getByRole('button', { name: 'Extend by 45 days' }));
    await waitFor(() => expect(live.onExtendAgain).toHaveBeenCalledWith('Two goals nearly met; give a final month.'));
  });

  it('after it was extended again (or an exit case is open): only the exit case is left', () => {
    show(<PipRecordScreen persona="hr" pip={{ ...PIP_NOT_MET, reextended: true }} tab="outcome" live={pipLive({ can: { ...pipLive().can, extendAgain: false } })} />);
    expect(screen.queryByRole('button', { name: 'Extend plan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open exit case in People' })).toBeInTheDocument();
  });

  it('the outcome of a plan extended again offers no third extension', async () => {
    show(<PipRecordScreen persona="hr" pip={{ ...PIP_NOT_MET, status: 'Extended', reextended: true }} tab="outcome" live={pipLive({ can: { ...pipLive().can, outcome: true, extendAgain: false } })} />);
    await ue.click(screen.getByRole('button', { name: 'Record outcome' }));
    const d = screen.getByRole('dialog');
    expect(within(d).queryByRole('radio', { name: /Extend by/ })).toBeNull();
    expect(within(d).getByRole('radio', { name: /Met/ })).toBeInTheDocument();
  });
});

describe('PRF-04 calibration in the wizard and the stage days', () => {
  it('the kit block: adding needs a name and a facilitator; a session can be removed', async () => {
    const changes: PlannedSession[][] = [];
    function Host() {
      const [v, setV] = useState<PlannedSession[]>([]);
      return <CalibrationPlan sessions={v} onChange={(n) => { changes.push(n); setV(n); }} facilitators={[{ value: 'u1', label: 'Lakshmi Rao' }]} departments={[{ value: 'd1', label: 'Quality' }]} />;
    }
    show(<Host />);
    await ue.click(screen.getByRole('button', { name: 'Add session' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add session' }));
    expect(within(d).getByText('Name the session.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Session name/ }), 'Quality');
    await ue.click(within(d).getByRole('button', { name: 'Add session' }));
    expect(within(d).getByText('Choose who runs the session.')).toBeInTheDocument();
    await ue.click(within(d).getAllByRole('combobox')[0]);
    await ue.click(await screen.findByRole('option', { name: 'Lakshmi Rao' }));
    await ue.click(within(d).getByRole('button', { name: 'Add session' }));
    expect(changes.at(-1)).toEqual([{ name: 'Quality', facilitatorUserId: 'u1', departmentIds: [] }]);
    expect(screen.getByRole('cell', { name: 'Every department' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remove' }));
    expect(changes.at(-1)).toEqual([]);
  });

  it('the live wizard shows days per stage and saves the planned sessions with the cycle', async () => {
    const onSave = vi.fn(async () => SETUP_CALIBRATION.cycle!);
    show(<CycleSetupScreen live={{ ...SETUP_CALIBRATION, onSave, onPeer: vi.fn(ok) }} defaultStep="stages" />);
    expect(screen.getByRole('columnheader', { name: 'Days' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1 session' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Quality and lab' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '15 days' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Save and exit/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ calibration: [{ name: 'Quality and lab', facilitatorUserId: 'u1', departmentIds: ['d1'] }] }), SETUP_CALIBRATION.cycle!.id));
  });

  it('calibration on with no session: the step says so and nothing is saved', async () => {
    const onSave = vi.fn(async () => SETUP_CALIBRATION.cycle!);
    show(<CycleSetupScreen live={{ ...SETUP_CALIBRATION, cycle: { ...SETUP_CALIBRATION.cycle!, calibration: [] }, onSave }} defaultStep="stages" />);
    await ue.click(screen.getByRole('checkbox', { name: 'Include Calibration' }));
    await ue.click(screen.getByRole('button', { name: /Save and exit/ }));
    expect(await screen.findByText('A draft needs every step filled in before it is saved.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

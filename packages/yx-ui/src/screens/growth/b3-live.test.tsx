import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CompetencyFrameworkScreen, HandoverListScreen, SuggestedAgendaPanel, type Competency, type HandoverRow, type LiveCompetencies, type LiveHandover } from './perf-people';
import { DisputeRaiseScreen, DisputeRecordScreen, ReviewAssistantPanel, type DisputeCase, type LiveDisputeRaise, type LiveDisputeRecord, type LiveReviewAssistant } from './perf-reviews';
import { ManagerCoachHome, type LiveCoach } from './perf-goals';
import { ReviewAcknowledgeScreen, ReviewWorkspaceScreen } from './perf-reviews';
import { ACKNOWLEDGED, REVIEW, WORKSPACE } from './perf-live-samples';

// Performance builder 3: the live paths of PRF-13 … PRF-17 (positive and negative), inside the toast provider.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const ok = async () => {};

const ROWS: HandoverRow[] = [
  { id: 'h1', employee: 'Ravi Menon', artefact: 'Manager review stage', detail: 'H1 · manager review', from: 'Priya Nair', to: 'Karthik S', effective: new Date(2026, 10, 1), status: 'Moved' },
  { id: 'h2', employee: 'Sana Nizami', artefact: 'Goal parent', detail: '“LIMS upgrade” was aligned to the old manager’s goal', from: 'Priya Nair', to: 'Karthik S', effective: new Date(2026, 10, 1), status: 'Needs decision' },
];
const handover = (o: Partial<LiveHandover> = {}): LiveHandover => ({ state: 'ready', onRetry: vi.fn(), rows: ROWS, parentOptions: vi.fn(async () => [{ value: 'g1', label: 'Zero line stops' }]), onDecide: vi.fn(ok), ...o });

describe('PRF-13 hand-over list (live)', () => {
  it('re-parent: saving without a goal says what is missing; leaving it unaligned saves and tells', async () => {
    const live = handover();
    show(<HandoverListScreen persona="mgr" rows={[]} live={live} />);
    expect(screen.getByText('1 need a decision · 2 artefacts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reassign to HR' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Re-parent goal' }));
    const d = screen.getByRole('dialog');
    await waitFor(() => expect(live.parentOptions).toHaveBeenCalledWith('h2'));
    await ue.click(within(d).getByRole('button', { name: 'Save decision' }));
    expect(within(d).getByText('Choose the goal to align it to, or leave it unaligned.')).toBeInTheDocument();
    expect(live.onDecide).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('radio', { name: 'Leave unaligned' }));
    await ue.click(within(d).getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('h2', { decision: 'unaligned' }));
    expect((await screen.findAllByText('Goal left unaligned')).length).toBeGreaterThan(0);
  });

  it('aligns to one of the new manager’s goals; a refusal stays in the dialog', async () => {
    const live = handover({ onDecide: vi.fn(async () => Promise.reject(new Error('This hand-over was already decided. Reload the list.'))) });
    show(<HandoverListScreen persona="mgr" rows={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Re-parent goal' }));
    const d = screen.getByRole('dialog');
    await ue.click(await within(d).findByRole('combobox'));
    await ue.click(screen.getByRole('option', { name: 'Zero line stops' }));
    await ue.click(within(d).getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('h2', { decision: 'realigned', parentGoalId: 'g1' }));
    expect(await within(screen.getByRole('dialog')).findByText(/already decided/)).toBeInTheDocument();
  });

  it('empty and error states', () => {
    const { rerender } = show(<HandoverListScreen persona="mgr" rows={[]} live={handover({ rows: [] })} />);
    expect(screen.getByText('Nothing to hand over')).toBeInTheDocument();
    rerender(
      <ToastProvider>
        <HandoverListScreen persona="hr" rows={[]} live={handover({ state: 'error' })} />
      </ToastProvider>,
    );
    expect(screen.getAllByRole('button', { name: /Try again|Retry/ }).length).toBeGreaterThan(0);
  });
});

const COMPS: Competency[] = [
  { id: 'k1', name: 'Food safety', group: 'Functional', description: 'HACCP', starter: true, status: 'Active', levels: ['Aware', 'Applies', 'Leads'], roles: [{ role: 'QA Engineer', designationId: 'd1', level: 2 }], usedIn: ['Annual'], version: 3 },
  { id: 'k2', name: 'Ownership', group: 'Core', description: 'Owns outcomes', starter: false, status: 'Active', levels: ['Some', 'Most'], roles: [], usedIn: [], version: 1 },
];
const comps = (o: Partial<LiveCompetencies> = {}): LiveCompetencies => ({ state: 'ready', onRetry: vi.fn(), items: COMPS, designations: [{ value: 'd1', label: 'QA Engineer' }, { value: 'd2', label: 'Line Supervisor' }], onSave: vi.fn(async (_id, x) => ({ ...COMPS[0], ...x, id: 'k9', roles: [] })), onRetire: vi.fn(ok), onMerge: vi.fn(ok), onLoadStarters: vi.fn(ok), ...o });

describe('PRF-14 competency framework (live)', () => {
  it('adding needs a name and 2 to 10 levels; then it saves with the group chosen', async () => {
    const live = comps();
    show(<CompetencyFrameworkScreen items={[]} live={live} />);
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Add competency' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add competency' }));
    expect(within(d).getByText('Give the competency a name of at least 2 characters.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), 'Customer focus');
    await ue.click(within(d).getByRole('radio', { name: 'Leadership' }));
    await ue.clear(within(d).getByRole('textbox', { name: /^Levels/ }));
    await ue.type(within(d).getByRole('textbox', { name: /^Levels/ }), 'Only one');
    await ue.click(within(d).getByRole('button', { name: 'Add competency' }));
    expect(within(d).getByText('Write 2 to 10 levels, one per line, the lowest first.')).toBeInTheDocument();
    expect(live.onSave).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /^Levels/ }), '{Enter}And two');
    await ue.click(within(d).getByRole('button', { name: 'Add competency' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledWith(null, { name: 'Customer focus', group: 'Leadership', description: '', levels: ['Only one', 'And two'], roles: [] }));
    expect((await screen.findAllByText('Customer focus added')).length).toBeGreaterThan(0);
  });

  it('maps a role (choose both or be told), keeps the existing ones and the version', async () => {
    const live = comps();
    show(<CompetencyFrameworkScreen items={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Map a role' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Map role' }));
    expect(within(d).getByText('Choose the job title.')).toBeInTheDocument();
    await ue.click(within(d).getAllByRole('combobox')[0]);
    expect(screen.queryByRole('option', { name: 'QA Engineer' })).toBeNull();
    await ue.click(screen.getByRole('option', { name: 'Line Supervisor' }));
    await ue.click(within(d).getAllByRole('combobox')[1]);
    await ue.click(screen.getByRole('option', { name: /Level 3/ }));
    await ue.click(within(d).getByRole('button', { name: 'Map role' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledWith('k1', expect.objectContaining({ roles: [{ designationId: 'd1', level: 2 }, { designationId: 'd2', level: 3 }], version: 3 })));
  });

  it('retire and merge ask first; merging needs the one to keep', async () => {
    const live = comps();
    show(<CompetencyFrameworkScreen items={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Merge into…' }));
    let d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Merge competency' }));
    expect(within(d).getByText('Choose the competency to keep.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('combobox'));
    await ue.click(screen.getByRole('option', { name: /Ownership/ }));
    await ue.click(within(d).getByRole('button', { name: 'Merge competency' }));
    await waitFor(() => expect(live.onMerge).toHaveBeenCalledWith('k1', 'k2'));
    await ue.click(screen.getByRole('button', { name: 'Retire' }));
    d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Retire competency' }));
    await waitFor(() => expect(live.onRetire).toHaveBeenCalled());
  });

  it('empty: loads the starter library', async () => {
    const live = comps({ items: [] });
    show(<CompetencyFrameworkScreen items={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Load starter library' }));
    await waitFor(() => expect(live.onLoadStarters).toHaveBeenCalled());
  });
});

const raise = (o: Partial<LiveDisputeRaise> = {}): LiveDisputeRaise => ({ state: 'ready', onRetry: vi.fn(), cycle: 'H1 FY 2026-27', score: 2.6, band: 'Partly meets', disagreement: { raisedOn: new Date(2026, 9, 10), answeredOn: new Date(2026, 9, 20) }, escalateBy: new Date(2026, 10, 4), why: null, dispute: null, steps: [], onRaise: vi.fn(ok), onUpload: vi.fn(ok), ...o });

describe('PRF-15 disputes (live)', () => {
  it('the employee is told what to write; then the escalation is raised', async () => {
    const live = raise();
    show(<DisputeRaiseScreen live={live} />);
    expect(screen.getByText(/You can escalate until 4 Nov 2026/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Escalate dispute' }));
    expect(screen.getByText('Say what you are escalating and why, in at least 20 characters.')).toBeInTheDocument();
    expect(live.onRaise).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What are you escalating/ }), 'The supplier strike caused the delay on goal 2.');
    await ue.click(screen.getByRole('radio', { name: /Correction of a factual error/ }));
    await ue.click(screen.getByRole('button', { name: 'Escalate dispute' }));
    await waitFor(() => expect(live.onRaise).toHaveBeenCalledWith({ grounds: 'The supplier strike caused the delay on goal 2.', sought: 'correct' }));
    expect((await screen.findAllByText('Escalation raised')).length).toBeGreaterThan(0);
  });

  it('too early or too late: no button, the reason stays', () => {
    show(<DisputeRaiseScreen live={raise({ why: 'HR has not answered your disagreement yet. You can escalate once they have.' })} />);
    expect(screen.getByText(/HR has not answered/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escalate dispute' })).toBeNull();
  });

  const CASE: DisputeCase = {
    id: 'x1', ref: 'PRF-D-0001', employee: 'Divya R', cycle: 'H1', raised: new Date(2026, 10, 1), status: 'Escalated', grounds: 'Strike', sought: 'Fresh review', legalHold: false, decision: null,
    steps: [], activity: [], evidence: [{ id: 'review', kind: 'Review as released', label: 'Final 2.6', at: new Date(2026, 10, 1), hash: 'a'.repeat(64) }],
  };
  const record = (o: Partial<LiveDisputeRecord> = {}): LiveDisputeRecord => ({ state: 'ready', onRetry: vi.fn(), dispute: CASE, signatories: [{ value: 'u1', label: 'Legal' }], exports: [], onLegalHold: vi.fn(ok), onDecide: vi.fn(ok), onExport: vi.fn(async () => ({ exportId: 'e1', ref: 'PRF-D-0001-EXP-01' })), onDownload: vi.fn(ok), ...o });

  it('HR exports evidence after confirming, and it downloads at once', async () => {
    const live = record();
    show(<DisputeRecordScreen dispute={CASE} live={live} />);
    await ue.click(screen.getByRole('tab', { name: /Evidence/ }));
    expect(screen.getByText('aaaa…aaaa')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Export evidence' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Generate export' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Export evidence' }));
    await waitFor(() => expect(live.onExport).toHaveBeenCalledWith(['review'], 'u1'));
    await waitFor(() => expect(live.onDownload).toHaveBeenCalledWith('e1', 'PRF-D-0001-EXP-01'));
  });

  it('exporting nothing is refused with a reason', async () => {
    const live = record();
    show(<DisputeRecordScreen dispute={CASE} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Export evidence' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('checkbox', { name: /Final 2.6/ }));
    await ue.click(within(d).getByRole('button', { name: 'Generate export' }));
    expect(within(d).getByText('Choose at least one item to export.')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('a decision needs a choice and its reasons; the legal hold switch saves', async () => {
    const live = record();
    show(<DisputeRecordScreen dispute={CASE} live={live} />);
    await ue.click(screen.getByRole('switch', { name: /Legal hold/ }));
    await waitFor(() => expect(live.onLegalHold).toHaveBeenCalledWith(true));
    await ue.click(screen.getByRole('button', { name: 'Record decision' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Record decision' }));
    expect(within(d).getByText('Choose the decision.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('radio', { name: 'Not upheld' }));
    await ue.type(within(d).getByRole('textbox', { name: /Decision and reasons/ }), 'The rating reflects the year.');
    await ue.click(within(d).getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith({ decision: 'not_upheld', note: 'The rating reflects the year.' }));
  });
});

const coach = (o: Partial<LiveCoach> = {}): LiveCoach => ({ state: 'ready', onRetry: vi.fn(), firstName: 'Priya', weekOf: new Date(2026, 10, 2), optedOut: false, looksAt: ['No feedback given in 6 weeks'], nudges: [{ id: 'n1', person: 'Divya R', signal: '1:1 overdue by 9 days.', action: 'Book 1:1', link: '/yx/performance/one-on-ones' }], onAct: vi.fn(), onDismiss: vi.fn(ok), onOptOut: vi.fn(ok), ...o });

describe('PRF-16 coach and agenda (live)', () => {
  it('act, dismiss and turn off', async () => {
    const live = coach();
    show(<ManagerCoachHome nudges={[]} weekOf={new Date()} live={live} />);
    expect(screen.getByText(/Priya$/)).toBeInTheDocument();
    expect(screen.getByText(/no AI model sees your team/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Book 1:1' }));
    expect(live.onAct).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
    await ue.click(screen.getByRole('link', { name: 'Turn off coach nudges' }));
    expect(live.onOptOut).toHaveBeenCalledWith(true);
  });

  it('dismiss hides the nudge; opted out offers to turn it on; company off and no team say so', async () => {
    const live = coach();
    const { rerender } = show(<ManagerCoachHome nudges={[]} weekOf={new Date()} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Dismiss nudge about Divya R' }));
    expect(live.onDismiss).toHaveBeenCalledWith('n1');
    const out = coach({ optedOut: true });
    rerender(<ToastProvider><ManagerCoachHome nudges={[]} weekOf={new Date()} live={out} /></ToastProvider>);
    await ue.click(screen.getByRole('link', { name: 'Turn coach nudges on' }));
    expect(out.onOptOut).toHaveBeenCalledWith(false);
    rerender(<ToastProvider><ManagerCoachHome nudges={[]} weekOf={new Date()} live={coach({ state: 'company-off' })} /></ToastProvider>);
    expect(screen.getByText(/Your company has turned off coach nudges/)).toBeInTheDocument();
    rerender(<ToastProvider><ManagerCoachHome nudges={[]} weekOf={new Date()} live={coach({ state: 'not-manager' })} /></ToastProvider>);
    expect(screen.getByText('No team yet')).toBeInTheDocument();
  });

  it('suggested agenda: adds on choice; a refusal stays', async () => {
    const onAdd = vi.fn(async (x: { id: string }) => (x.id === 'bad' ? Promise.reject(new Error('This 1:1 is closed.')) : undefined));
    show(<SuggestedAgendaPanel employee="Divya R" items={[{ id: 'a', text: 'Follow up: data', why: 'Open action' }, { id: 'bad', text: 'Other', why: 'x' }]} onAdd={onAdd} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add to agenda' })[0]);
    expect(await screen.findByText('Added')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add to agenda' }));
    expect(await screen.findByText('This 1:1 is closed.')).toBeInTheDocument();
  });
});

const assistant = (o: Partial<LiveReviewAssistant> = {}): LiveReviewAssistant => ({
  reason: null,
  onDraft: vi.fn(async () => ({ draft: 'The employee automated 310 cases.', basis: 'Draft from goals, 1 Apr 2026 to 30 Sep 2026' })),
  onCheck: vi.fn(async () => [{ id: 'w1', kind: 'Gendered or loaded word' as const, match: 'emotional', suggestion: 'Describe what happened.' }]),
  onDecide: vi.fn(ok),
  ...o,
});

describe('PRF-17 review assistant (live)', () => {
  it('draft: shown first, used only when chosen', async () => {
    const live = assistant();
    const onSummary = vi.fn();
    show(<ReviewAssistantPanel assistant={{ enabled: true, live }} summary="" rating={3} onSummary={onSummary} />);
    await ue.click(screen.getByRole('button', { name: 'Help me draft' }));
    expect(await screen.findByText('The employee automated 310 cases.')).toBeInTheDocument();
    expect(onSummary).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Use as starting text' }));
    expect(onSummary).toHaveBeenCalledWith('The employee automated 310 cases.');
  });

  it('check wording: flags from the server; Accept marks only the manager’s own text and is recorded', async () => {
    const live = assistant();
    const onSummary = vi.fn();
    show(<ReviewAssistantPanel assistant={{ enabled: true, live }} summary="She is emotional." rating={3} onSummary={onSummary} />);
    await ue.click(screen.getByRole('button', { name: 'Check wording' }));
    expect(live.onCheck).toHaveBeenCalledWith('She is emotional.', 3);
    await ue.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(onSummary).toHaveBeenCalledWith('She is [describe the behaviour].');
    expect(live.onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), 'accepted');
  });

  it('a drafting refusal stays; off and not set up say so', async () => {
    const live = assistant({ onDraft: vi.fn(async () => Promise.reject(new Error('AI is not configured for your organization.'))) });
    const { rerender } = show(<ReviewAssistantPanel assistant={{ enabled: true, live }} summary="" rating={null} onSummary={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Help me draft' }));
    expect(await screen.findByText(/not configured/)).toBeInTheDocument();
    rerender(<ToastProvider><ReviewAssistantPanel assistant={{ enabled: true, live: assistant({ reason: 'not-configured' }) }} summary="" rating={null} onSummary={vi.fn()} /></ToastProvider>);
    expect(screen.getByText(/AI is not set up for your company yet/)).toBeInTheDocument();
    rerender(<ToastProvider><ReviewAssistantPanel assistant={{ enabled: true, live: assistant({ reason: 'company-off' }) }} summary="" rating={null} onSummary={vi.fn()} /></ToastProvider>);
    expect(screen.getByText(/hasn’t turned on AI review summaries/)).toBeInTheDocument();
  });
});

describe('hookups on the live PRF-05 and PRF-06 pages', () => {
  const managerReview = { ...REVIEW, role: 'manager' as const, can: { ...REVIEW.can, self: false, manager: true, skip: false } };

  it('PRF-05: the current manager gets the assistant under the summary, and the nominate link when given', async () => {
    const live = assistant();
    show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, review: managerReview, assistant: live, nominateHref: '/yx/performance/reviews/r1/nominations' }} />);
    expect(screen.getByRole('region', { name: 'Review assistant' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nominate reviewers' })).toHaveAttribute('href', '/yx/performance/reviews/r1/nominations');
    await ue.click(screen.getByRole('button', { name: 'Check wording' }));
    await waitFor(() => expect(live.onCheck).toHaveBeenCalled());
  });

  it('PRF-05: anyone else (the skip-level here) gets no assistant and no nominate link', () => {
    show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, assistant: assistant() }} />);
    expect(screen.queryByRole('region', { name: 'Review assistant' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nominate reviewers' })).toBeNull();
  });

  it('PRF-06: once HR answered, the acknowledged review links to the escalation; without it, no link', () => {
    const { rerender } = show(<ReviewAcknowledgeScreen live={{ review: ACKNOWLEDGED, onAcknowledge: vi.fn(), onDisagree: vi.fn(), escalate: { href: '/yx/performance/reviews/r1/dispute', label: 'Escalate the dispute' } }} />);
    expect(screen.getByRole('link', { name: 'Escalate the dispute' })).toHaveAttribute('href', '/yx/performance/reviews/r1/dispute');
    rerender(<ToastProvider><ReviewAcknowledgeScreen live={{ review: ACKNOWLEDGED, onAcknowledge: vi.fn(), onDisagree: vi.fn(), escalate: null }} /></ToastProvider>);
    expect(screen.queryByRole('link', { name: 'Escalate the dispute' })).toBeNull();
  });
});

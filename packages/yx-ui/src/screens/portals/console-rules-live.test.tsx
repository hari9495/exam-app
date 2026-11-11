import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { GoldenCasesScreen, PublishSchedulerScreen, RuleSetEditorScreen, type LiveGolden, type LivePublish, type LiveRuleEditor } from './console-rules';
import { parseValues, slabsFrom, slabsTo } from './console-rules-live';
import * as L from './console-rules-samples';

// Console C-1 (answers 1041 to 1044): the drawn YX-01 to YX-03 screens with the live rule store. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const editor = (over: Partial<LiveRuleEditor> = {}): LiveRuleEditor => ({ state: 'ready', me: L.STAFF.anand, sets: L.LIVE_ROWS, onOpen: vi.fn(), onCopy: vi.fn().mockResolvedValue(undefined), detail: null, onSave: vi.fn().mockResolvedValue(undefined), onSendForReview: vi.fn().mockResolvedValue(undefined), onGolden: vi.fn(), onReview: vi.fn(), ...over });
const golden = (over: Partial<LiveGolden> = {}): LiveGolden => ({ state: 'ready', me: L.STAFF.farah, detail: L.LIVE_DETAIL, run: null, onRun: vi.fn().mockResolvedValue(undefined), queue: L.LIVE_ROWS.filter((r) => r.state !== 'published'), onOpen: vi.fn(), onRequestChanges: vi.fn().mockResolvedValue(undefined), onApprove: vi.fn(), ...over });
const publish = (over: Partial<LivePublish> = {}): LivePublish => ({ state: 'ready', choices: [L.LIVE_ROWS[0]!], chosen: 'r1', onChoose: vi.fn(), detail: L.LIVE_DETAIL, impact: L.LIVE_IMPACT, onPublish: vi.fn().mockResolvedValue(undefined), published: null, ...over });

describe('YX-01 rule sets, live', () => {
  it('lists the versions with their review state; without the key it says so', () => {
    const { unmount } = wrap(<RuleSetEditorScreen live={editor()} />);
    expect(screen.getByText('Changes requested')).toBeTruthy();
    expect(screen.getByText('In review')).toBeTruthy();
    unmount();
    wrap(<RuleSetEditorScreen live={editor({ state: 'no-access' })} />);
    expect(screen.getByText("You can't open the rule sets.")).toBeTruthy();
  });

  it('changes requested: the drafter reads the note, saves and sends it for review again', async () => {
    const live = editor({ detail: L.LIVE_CHANGES });
    wrap(<RuleSetEditorScreen openId="r1" live={live} />);
    expect(screen.getByText(/Add the February case/)).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Send for review' }));
    await waitFor(() => expect(live.onSendForReview).toHaveBeenCalled());
    expect(live.onSave).toHaveBeenCalledWith(expect.objectContaining({ validFrom: '2027-04-01', values: expect.objectContaining({ kind: 'pt', slabs: [{ from: '0', to: '29999.99', amount: '0' }, { from: '30000', to: null, amount: '200' }] }) }));
  });

  it('negative: a short source or broken values stop the save with the reasons; nothing is sent', async () => {
    const live = editor({ detail: { ...L.LIVE_PF, source: 'too short' } });
    wrap(<RuleSetEditorScreen openId="r3" live={live} />);
    await ue.clear(screen.getByRole('textbox', { name: /The rule as data/ }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByText('Give the source (at least 20 characters).', { selector: 'li' })).toBeTruthy();
    expect(screen.getByText('The values are not valid: an object with a "kind".', { selector: 'li' })).toBeTruthy();
    expect(live.onSave).not.toHaveBeenCalled();
  });

  it('negative: in review, the drafter cannot change it; someone else gets Review, not Save', () => {
    const { unmount } = wrap(<RuleSetEditorScreen openId="r1" live={editor({ detail: L.LIVE_DETAIL })} />);
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    unmount();
    wrap(<RuleSetEditorScreen openId="r1" live={editor({ detail: L.LIVE_DETAIL, me: L.STAFF.farah })} />);
    expect(screen.getByRole('button', { name: 'Review' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send for review' })).toBeNull();
  });
});

describe('YX-02 golden cases and review, live', () => {
  it('runs the golden cases (a dry run) and shows what fails', async () => {
    const live = golden();
    const { rerender } = wrap(<GoldenCasesScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Run all cases' }));
    expect(live.onRun).toHaveBeenCalled();
    rerender(<ToastProvider><GoldenCasesScreen live={{ ...live, run: L.LIVE_RUN }} /></ToastProvider>);
    expect(screen.getByText('1 cases fail, so this version can\'t be published')).toBeTruthy();
    expect(screen.getByText(/saves nothing/)).toBeTruthy();
  });

  it('asks for changes with a note; a short note is refused with the reason', async () => {
    const live = golden({ run: L.LIVE_RUN });
    wrap(<GoldenCasesScreen tab="queue" defaultReviewOpen live={live} />);
    const drawer = screen.getByRole('dialog');
    await ue.click(within(drawer).getByRole('combobox', { name: /Decision/ }));
    await ue.click(screen.getByRole('option', { name: 'Request changes' }));
    await ue.type(within(drawer).getByRole('textbox', { name: /What to change/ }), 'short');
    await ue.click(within(drawer).getByRole('button', { name: 'Record decision' }));
    expect(within(drawer).getByText('Say what to change (at least 10 characters).')).toBeTruthy();
    expect(live.onRequestChanges).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /What to change/ }), ': add the February case.');
    await ue.click(within(drawer).getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(live.onRequestChanges).toHaveBeenCalledWith('r1', 'short: add the February case.'));
  });

  it('negative: approving needs every case passing; the drafter cannot review their own', async () => {
    const live = golden({ run: L.LIVE_RUN });
    const { unmount } = wrap(<GoldenCasesScreen tab="queue" defaultReviewOpen live={live} />);
    await ue.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: /Decision/ }));
    await ue.click(screen.getByRole('option', { name: 'Approve for publishing' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record decision' }));
    expect(live.onApprove).not.toHaveBeenCalled();
    expect(screen.getByText('Every golden case must pass before you can approve.')).toBeTruthy();
    unmount();
    const self = golden({ me: L.STAFF.anand, run: { ...L.LIVE_RUN, passed: 3, cases: L.LIVE_RUN.cases.map((c) => ({ ...c, pass: true })) } });
    wrap(<GoldenCasesScreen tab="queue" defaultReviewOpen live={self} />);
    expect(screen.getByText('You drafted this change')).toBeTruthy();
    await ue.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: /Decision/ }));
    await ue.click(screen.getByRole('option', { name: 'Approve for publishing' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record decision' }));
    expect(self.onApprove).not.toHaveBeenCalled();
  });
});

describe('YX-03 publish, live', () => {
  it('shows the impact as numbers only and publishes the chosen version', async () => {
    const live = publish();
    wrap(<PublishSchedulerScreen current="review" live={live} />);
    expect(screen.getAllByText('1,184 companies · 2,14,630 employees').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Publish rule set' }));
    await waitFor(() => expect(live.onPublish).toHaveBeenCalledWith('r1'));
  });

  it('negative: nothing in review that someone else drafted means nothing to publish', () => {
    wrap(<PublishSchedulerScreen live={publish({ choices: [], chosen: null, detail: null, impact: null })} />);
    expect(screen.getByText('Nothing to publish.')).toBeTruthy();
  });
});

describe('rule store helpers', () => {
  it('slabs round-trip; values parse only as an object with a kind', () => {
    const v = L.LIVE_DETAIL.values;
    expect(slabsTo(slabsFrom(v))).toEqual(v.slabs);
    expect(parseValues('{"kind":"pf","employeeRate":"0.12"}')).toEqual({ kind: 'pf', employeeRate: '0.12' });
    for (const bad of ['', '[]', '{"rate":1}', 'not json']) expect(parseValues(bad)).toBeNull();
  });
});

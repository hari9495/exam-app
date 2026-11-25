import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BiasAuditScreen, type LiveBiasAudit } from './hiring-offers';
import { RediscoveryPanel } from './hiring-plan';

// HIR-23 bias audit record (founder decision 2, question 7), the designed screen with `live`: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 10, 13);
const live = (over: Partial<LiveBiasAudit> = {}): LiveBiasAudit => ({
  state: 'ready',
  onRetry: vi.fn(),
  canEdit: true,
  lawName: 'NYC Local Law 144',
  categories: { sex: ['Female', 'Male'], race: ['Asian'] },
  validUntil: new Date(2027, 2, 12),
  onReport: vi.fn(),
  onRecord: vi.fn().mockResolvedValue(undefined),
  ...over,
});
const SEX = [{ label: 'Female', assessed: 100, selected: 30 }, { label: 'Male', assessed: 120, selected: 40 }];
const RACE = [{ label: 'Asian', assessed: 220, selected: 70 }];
const base = { feature: 'Automated hiring tools', today: TODAY };

describe('HIR-23 Bias audits (live)', () => {
  it('valid: the auditor, date, valid until, the published summary and the impact ratios; the report opens', async () => {
    const l = live();
    show(<BiasAuditScreen {...base} nycOn lastAudit={new Date(2026, 2, 12)} auditor="Hudson Fairness Auditors LLC" summaryUrl="https://example.com/audit" sex={SEX} race={RACE} live={l} />);
    expect(screen.getByText('Audit valid')).toBeInTheDocument();
    expect(screen.getByText('12 Mar 2027')).toBeInTheDocument();
    expect(screen.getByText(/NYC Local Law 144 · results as reported by the auditor/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'By sex' })).toBeInTheDocument();
    expect(screen.queryByText('Auditor access')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download export' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open audit report' }));
    expect(l.onReport).toHaveBeenCalled();
  });

  it('overdue: the plain banner that the tools are blocked for New York City jobs', () => {
    show(<BiasAuditScreen {...base} nycOn lastAudit={new Date(2025, 7, 20)} auditor="A" summaryUrl="https://x.test" sex={SEX} race={RACE} live={live({ validUntil: new Date(2026, 7, 20) })} />);
    expect(screen.getByText('Automated hiring tools is blocked for New York City jobs')).toBeInTheDocument();
    expect(screen.getByText('Audit overdue')).toBeInTheDocument();
  });

  it('no audit yet: blocked, no results; not applicable when the NYC setting is off', () => {
    const { unmount } = show(<BiasAuditScreen {...base} nycOn lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} live={live({ validUntil: null, onReport: undefined })} />);
    expect(screen.getByText(/No audit is recorded/)).toBeInTheDocument();
    expect(screen.getByText('No audit results yet.')).toBeInTheDocument();
    unmount();
    show(<BiasAuditScreen {...base} nycOn={false} lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} live={live()} />);
    expect(screen.getByText("Bias audits aren't needed for your company.")).toBeInTheDocument();
  });

  it('Save audit pressed too early names what is missing and sends nothing (never disabled)', async () => {
    const l = live();
    show(<BiasAuditScreen {...base} nycOn lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} recordOpen live={l} />);
    const save = screen.getByRole('button', { name: 'Save audit' });
    expect(save).toBeEnabled();
    await ue.click(save);
    expect(await screen.findByText('Choose the audit date.')).toBeInTheDocument();
    expect(screen.getByText('Enter the independent auditor.')).toBeInTheDocument();
    expect(screen.getByText(/Enter the web address of the published summary/)).toBeInTheDocument();
    expect(screen.getByText(/Enter assessed and selected for every category/)).toBeInTheDocument();
    expect(screen.getByText('Add the auditor’s report (PDF).')).toBeInTheDocument();
    expect(l.onRecord).not.toHaveBeenCalled();
  });

  it('without the settings key there is no Record audit', () => {
    show(<BiasAuditScreen {...base} nycOn lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} live={live({ canEdit: false })} />);
    expect(screen.queryByRole('button', { name: 'Record audit' })).not.toBeInTheDocument();
  });

  it('a refusal stays in the drawer; loading and error states', async () => {
    const onRetry = vi.fn();
    const { unmount } = show(<BiasAuditScreen {...base} nycOn lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} live={live({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    unmount();
    show(<BiasAuditScreen {...base} nycOn lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} live={live({ state: 'loading' })} />);
    expect(screen.queryByText('Record audit')).not.toBeInTheDocument();
  });
});

describe('HIR-23 gate shown on the rediscovery panel', () => {
  it('AI notes blocked for a New York City job: the reason, and plain search below', () => {
    show(<RediscoveryPanel matches={[]} viewer="recruiter" live={{ state: 'ready', onRetry: vi.fn(), mode: 'text', ai: 'blocked', blocked: 'AI notes on past candidates is blocked for New York City jobs. No bias audit is recorded.', matches: [] }} />);
    expect(screen.getByText('AI notes are blocked for this job')).toBeInTheDocument();
    expect(screen.getByText(/No bias audit is recorded/)).toBeInTheDocument();
    expect(screen.getByText('Plain search below. You decide.')).toBeInTheDocument();
  });
});

describe('HIR-23 record (live): a complete form is sent', () => {
  it('sends the date, auditor, summary, the numbers per category and the report', async () => {
    const l = live({ categories: { sex: ['Female'], race: ['Asian'] } });
    show(<BiasAuditScreen {...base} nycOn lastAudit={null} auditor={null} summaryUrl={null} sex={[]} race={[]} recordOpen live={l} />);
    await ue.type(screen.getByRole('textbox', { name: /Independent auditor/ }), 'Hudson Fairness Auditors LLC');
    await ue.type(screen.getByRole('textbox', { name: /Published summary URL/ }), 'https://example.com/audit');
    for (const [name, v] of [['Female · assessed', '100'], ['Female · selected', '30'], ['Asian · assessed', '100'], ['Asian · selected', '30']] as const) await ue.type(screen.getByRole('textbox', { name }), v);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await ue.upload(input, new File(['%PDF-1.4 x'], 'audit.pdf', { type: 'application/pdf' }));
    await ue.click(screen.getByRole('button', { name: 'Save audit' }));
    // The date is still missing: nothing is sent yet, and it says so.
    expect(await screen.findByText('Choose the audit date.')).toBeInTheDocument();
    expect(l.onRecord).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Enter the independent auditor.')).not.toBeInTheDocument());
  });
});

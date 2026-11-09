import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen, type LiveSettingsPage } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { hiringSettingsChanges, hiringSettingsPage, type HiringSettingsData } from './hiring-live';

// Settings 6.1 Hiring, the designed page with `live` (founder answers 291, 302): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.1')!;
const DATA: HiringSettingsData = {
  canEdit: true,
  people: [
    { id: 'u1', name: 'Neha Joshi' },
    { id: 'u2', name: 'Arjun Kulkarni' },
  ],
  values: { 'ats.retention_months': '12', 'hiring.reject.email_candidate': 'off', 'ats.referral.bonus_inr': '25000', 'ats.referral.qualify_days': '90', 'hiring.requisition.default_recruiter': 'none' },
  defaults: { 'ats.retention_months': '12', 'hiring.reject.email_candidate': 'off', 'ats.referral.bonus_inr': '25000', 'ats.referral.qualify_days': '90', 'hiring.requisition.default_recruiter': 'none' },
  choices: { 'ats.retention_months': ['6', '9', '12', '18', '24', '36'], 'hiring.reject.email_candidate': ['off', 'on'], 'ats.referral.bonus_inr': ['0', '5000', '25000', '50000'], 'ats.referral.qualify_days': ['30', '60', '90', '180'], 'hiring.requisition.default_recruiter': ['none'] },
  lastChange: null,
  pipelines: [{ id: 'p1', name: 'Standard', isDefault: true, jobs: 3, stages: [{ id: 's1', name: 'Applied', category: 'active', daysTarget: 3, limit: null }] }],
  scorecards: [{ id: 'sc1', name: 'Engineer round 1', scaleMax: 4, items: ['Problem solving', 'Teamwork'] }],
};
const live = (over: Partial<LiveSettingsPage> = {}): LiveSettingsPage => ({ page: hiringSettingsPage(design, DATA), canEdit: true, lastChange: null, onSave: vi.fn().mockResolvedValue(undefined), onRowAction: vi.fn(), ...over });
const show = (l: LiveSettingsPage) => render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" live={l} /></ToastProvider>);

describe('Settings 6.1 Hiring (live)', () => {
  it('shows only the designed fields with a company setting behind them, with real values; no sample values', () => {
    show(live());
    expect(screen.getByText('Default recruiter for new requisitions')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Default for new jobs · 3 jobs')).toBeInTheDocument();
    expect(screen.getByText('Engineer round 1')).toBeInTheDocument();
    expect(screen.getByText('₹25,000')).toBeInTheDocument();
    expect(screen.getByText('90 days')).toBeInTheDocument();
    // Designed fields with nothing behind them yet are left out, never shown with sample data.
    for (const t of ['Offer expires after', 'Headcount plan approvers', 'AI interview', 'Careers site colour', 'Plant worker', 'Recruiting cost categories']) expect(screen.queryByText(t)).not.toBeInTheDocument();
    // Fixed rows: the referral rule is edited, never added to; templates are read-only lists.
    expect(screen.queryByRole('button', { name: /Add referral rule|Add pipeline template|Add scorecard/ })).not.toBeInTheDocument();
  });

  it('a change saves through onSave as company settings, then a toast', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave, savedTitle: 'Hiring settings saved' }));
    await ue.click(screen.getByRole('checkbox', { name: /Tell candidates when they are not selected/ }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, rows] = onSave.mock.calls[0]!;
    expect(hiringSettingsChanges(values, rows, DATA)).toEqual([{ key: 'hiring.reject.email_candidate', value: 'on' }]);
    expect((await screen.findAllByText('Hiring settings saved')).length).toBeGreaterThan(0);
  });

  it('a refusal stays on the page with the reason and the edits are kept', async () => {
    show(live({ onSave: vi.fn().mockRejectedValue(new Error('That person is not an active user of your company. Choose someone from the list.')) }));
    await ue.click(screen.getByRole('checkbox', { name: /Tell candidates when they are not selected/ }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/not an active user of your company/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Tell candidates when they are not selected/ })).toBeChecked();
  });

  it('without the key every value is read-only: no save, no edit, no request-access button', () => {
    show(live({ canEdit: false }));
    expect(screen.getByText('You can view these settings but not change them')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
  });

  it('Stage targets on a pipeline row opens the stage editor (answer 302)', async () => {
    const onRowAction = vi.fn();
    show(live({ onRowAction }));
    const table = screen.getByRole('table', { name: 'Pipeline templates' });
    await ue.click(within(table).getByRole('button', { name: /Stage targets/ }));
    expect(onRowAction).toHaveBeenCalledWith('hire.pipelines', 0);
  });

  it('maps the referral rule and the default recruiter back to the company settings', () => {
    expect(hiringSettingsChanges({ 'hire.default_recruiter': 'u2', 'hire.retention_months': '18' }, { 'hire.referral_rules': [['All roles', '₹50,000', '60 days', 'Payroll, or outside payroll']] }, DATA)).toEqual([
      { key: 'hiring.requisition.default_recruiter', value: 'u2' },
      { key: 'ats.retention_months', value: '18' },
      { key: 'ats.referral.bonus_inr', value: '50000' },
      { key: 'ats.referral.qualify_days', value: '60' },
    ]);
    // An unchanged rule sends nothing.
    expect(hiringSettingsChanges({}, { 'hire.referral_rules': [['All roles', '₹25,000', '90 days', '']] }, DATA)).toEqual([]);
  });
});

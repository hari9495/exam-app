import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import { ToastProvider } from '../../components/notify';
import * as clb01 from './clb-01.stories';
import * as clb02 from './clb-02.stories';
import * as t913 from '../portals/t9-13-contractor.stories';
import { belowMinimum } from '../portals/contractor-portal';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { clraSettingsPage, type ClraSettingsData } from '../settings/contract-labour-live';

// Founder answers 803, 807, 810 (11 Nov 2026). Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const one = composeStories(clb01);
const two = composeStories(clb02);
const portal = composeStories(t913);

describe('803: the 12-month peak before the first nightly count', () => {
  it('a site not counted yet says "Counted tonight"; a counted site shows its number', () => {
    show(<one.PeakNotCounted />);
    expect(screen.getByText('Counted tonight')).toBeInTheDocument();
    expect(screen.getByText('71')).toBeInTheDocument();
  });
  it('negative: without a peak at all (the drawn register) the fact is not shown', () => {
    show(<one.Register />);
    expect(screen.queryByText('Highest in 12 months')).toBeNull();
  });
  it('Settings 4.9 registrations: "Counted tonight" until the count, then the number', () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.9')!;
    const data: ClraSettingsData = { canEdit: true, values: {}, defaults: {}, choices: {}, lastChange: null, law: [], registrations: [{ locationId: 'h', registrationNo: 'TN/1', maxWorkers: 60, validTo: null }, { locationId: 'b', registrationNo: 'KA/1', maxWorkers: 30, validTo: null }] as ClraSettingsData['registrations'], sites: [{ id: 'h', name: 'Hosur' }, { id: 'b', name: 'Bengaluru' }] as ClraSettingsData['sites'], peaks: [{ locationId: 'h', peak: 52, peakOn: '2026-10-01' }] };
    const reg = clraSettingsPage(design, data).sections.flatMap((s) => s.settings).find((x) => x.key === 'clra.registrations')!;
    expect(reg.rows!.map((r) => r.at(-1))).toEqual(['52', 'Counted tonight']);
  });
});

describe('807: a month with 0 days asks first', () => {
  it('0 days: "Confirm 0 days?" naming the workers', () => {
    show(<two.ConfirmZeroDays />);
    expect(screen.getByRole('dialog', { name: 'Confirm 0 days?' })).toBeInTheDocument();
    expect(screen.getByText(/No days on site in .*0 days: /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm 0 days' })).toBeInTheDocument();
  });
  it('negative: a month with days keeps the usual question', () => {
    show(<two.ConfirmMonth />);
    expect(screen.queryByText('Confirm 0 days?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm month' })).toBeInTheDocument();
  });
});

describe('810: below the minimum wage is a warning at deploy, never a block', () => {
  const h = { monthly: '16137.00', daily: '620.65', source: 'KA 2026-04, unskilled', verify: true };
  it('the rule: below warns; at or above, or no wage or no minimum, does not', () => {
    expect(belowMinimum(9000, h)).toMatch(/₹9,000 a month is below the minimum wage of ₹16,137/);
    expect(belowMinimum(16137, h)).toBeNull();
    expect(belowMinimum(null, h)).toBeNull();
    expect(belowMinimum(9000, null)).toBeNull();
  });
  it('staff deploy sheet: the warning shows and Deploy stays available', async () => {
    show(<two.LowWage />);
    expect(screen.getByText('Below the minimum wage')).toBeInTheDocument();
    expect(screen.getByText(/can still be deployed/)).toBeInTheDocument();
  });
  it('negative: a wage at the minimum shows no warning', () => {
    show(<two.Deploy />);
    expect(screen.queryByText('Below the minimum wage')).toBeNull();
  });
  it('portal add worker: the warning shows; without a wage it does not', async () => {
    const { unmount } = show(<portal.LowWage />);
    expect(screen.getByText('Below the minimum wage')).toBeInTheDocument();
    unmount();
    show(<portal.UnderAge />);
    expect(screen.queryByText('Below the minimum wage')).toBeNull();
    void ue;
  });
});

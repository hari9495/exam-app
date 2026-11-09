import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { hiringSettingsChanges, hiringSettingsPage, type HiringSettingsData } from '../settings/hiring-live';
import { BulkActionsSheet } from './pipeline-sheets';
import { sampleBulk } from './hir-04-pipeline.stories';
import { DayBoard, InterviewDaySheet } from './interview-day';

// Offers round 3 (founder answers 376, 402, 404, 423 and careers answer 443): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.1')!;
const DEFAULTS = { 'hiring.offer.band_approver': 'hr_head', 'hiring.offer.expiry_days': '7', 'hiring.resume_quarantine.tell_applicant': 'on' };
const DATA: HiringSettingsData = {
  canEdit: true,
  people: [],
  values: { ...DEFAULTS },
  defaults: DEFAULTS,
  choices: { 'hiring.offer.expiry_days': ['3', '5', '7', '10', '14', '30'], 'hiring.resume_quarantine.tell_applicant': ['off', 'on'] },
  lastChange: null,
  pipelines: [],
  scorecards: [],
  offerApprovers: [{ id: 'u9', name: 'Meenakshi Sundaram' }],
};
const fieldOf = (data: HiringSettingsData, k: string) => hiringSettingsPage(design, data).sections.flatMap((x) => x.settings).find((d) => d.key === k);

describe('Settings 6.1: offer expiry (404), the approver above the range (376), the quarantine email (443)', () => {
  it('one "Offer expires after" from the company setting, saved to the one key', () => {
    expect(fieldOf(DATA, 'hire.offer_expiry')).toMatchObject({ kind: 'select', value: '7', optionLabels: expect.objectContaining({ '14': '14 days' }), starter: true });
    expect(hiringSettingsChanges({ 'hire.offer_expiry': '14' }, {}, DATA)).toEqual([{ key: 'hiring.offer.expiry_days', value: '14' }]);
  });

  it('the quarantine email switch is drawn under candidate data, on by default; off saves "off"', () => {
    const section = hiringSettingsPage(design, DATA).sections.find((s) => s.settings.some((d) => d.key === 'hire.resume_quarantine_notice'))!;
    expect(section.title).toBe('Background checks and candidate data');
    expect(fieldOf(DATA, 'hire.resume_quarantine_notice')).toMatchObject({ value: true, starter: true });
    expect(hiringSettingsChanges({ 'hire.resume_quarantine_notice': false }, {}, DATA)).toEqual([{ key: 'hiring.resume_quarantine.tell_applicant', value: 'off' }]);
  });

  it('a named approver who lost the offer-pay key stays named with a warning; a valid one has none', () => {
    const stale = { ...DATA, values: { ...DATA.values, 'hiring.offer.band_approver': 'u7' }, staleBandApprover: { id: 'u7', name: 'Ravi Kumar' } };
    const f = fieldOf(stale, 'hire.band_approver')!;
    expect(f).toMatchObject({ value: 'u7', starter: false, optionLabels: expect.objectContaining({ u7: 'Ravi Kumar (cannot approve)' }) });
    expect(f.warning).toMatch(/Ravi Kumar can no longer see offer pay/);
    const ok = fieldOf({ ...DATA, values: { ...DATA.values, 'hiring.offer.band_approver': 'u9' } }, 'hire.band_approver')!;
    expect(ok.warning).toBeUndefined();
    expect(ok.value).toBe('u9');
  });
});

describe('Bulk actions: Make bulk offers (402)', () => {
  it('with the offer-pay key it hands over the ticked candidates; without it there is no button', async () => {
    const onBulkOffers = vi.fn();
    const { unmount } = show(<BulkActionsSheet {...sampleBulk} open onOpenChange={() => {}} job="QA Chemist" defaultSelected={['e1', 'e2']} onBulkOffers={onBulkOffers} />);
    await ue.click(screen.getByRole('button', { name: 'Make bulk offers' }));
    expect(onBulkOffers).toHaveBeenCalledWith(['e1', 'e2']);
    unmount();
    show(<BulkActionsSheet {...sampleBulk} open onOpenChange={() => {}} job="QA Chemist" defaultSelected={['e1']} />);
    expect(screen.queryByRole('button', { name: 'Make bulk offers' })).not.toBeInTheDocument();
  });
});

describe('Interview day: remove single slots (423)', () => {
  const JOBS = [{ value: 'j1', label: 'GET', stages: [{ value: 's1', label: 'Shortlisted' }] }];
  const PEOPLE = [{ value: 'u1', label: 'Prakash Menon' }];

  it('the plan sheet lists each slot to untick; with every slot unticked it asks to keep one', async () => {
    const onCreate = vi.fn(async () => undefined);
    show(<InterviewDaySheet open onOpenChange={() => {}} jobs={JOBS} people={PEOPLE} slotMinutes={60} today={new Date(2026, 10, 10)} onCreate={onCreate} />);
    expect(screen.getByText('Untick a slot to leave it out, for example a lunch break. Auto-assign skips it.')).toBeInTheDocument();
    const times = ['10:00 am', '11:00 am', '12:00 pm', '1:00 pm', '2:00 pm', '3:00 pm'];
    for (const t of times) expect(screen.getByRole('checkbox', { name: t })).toBeChecked();
    for (const t of times) await ue.click(screen.getByRole('checkbox', { name: t }));
    await ue.click(screen.getByRole('button', { name: 'Plan the day' }));
    expect(screen.getByText('Keep at least one slot.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('checkbox', { name: '10:00 am' }));
    expect(screen.queryByText('Keep at least one slot.')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '1:00 pm' })).not.toBeChecked();
  });

  it('the board removes one slot with a toast; a refusal shows its words; nobody can remove the last slot', async () => {
    const onRemoveSlot = vi.fn(async () => undefined);
    const base = { drive: 'Campus day', date: new Date(2026, 10, 14), panels: [{ id: 'pa', name: 'Panel A', room: 'Room 1', members: 'Prakash' }], placed: [{ candidate: 'Asha Rao', panel: 'pa', start: 600, result: 'ready' as const }], unassigned: [], status: 'draft' as const, assignedYet: true, canManage: true, onAssign: vi.fn(), onSend: vi.fn() };
    const { unmount } = show(<DayBoard {...base} slots={[600, 780]} onRemoveSlot={onRemoveSlot} />);
    await ue.click(screen.getByRole('button', { name: 'Remove the 1:00 pm slot' }));
    expect(onRemoveSlot).toHaveBeenCalledWith(780);
    expect((await screen.findAllByText('Slot 1:00 pm removed')).length).toBeGreaterThan(0);
    unmount();
    const refused = vi.fn(async () => { throw new Error('An invite was already sent for this slot. Cancel or move that interview first.'); });
    const second = show(<DayBoard {...base} slots={[600, 780]} onRemoveSlot={refused} />);
    await ue.click(screen.getByRole('button', { name: 'Remove the 10:00 am slot' }));
    expect(await screen.findByText(/already sent for this slot/)).toBeInTheDocument();
    second.unmount();
    show(<DayBoard {...base} slots={[600]} onRemoveSlot={onRemoveSlot} />);
    expect(screen.queryByRole('button', { name: /Remove the/ })).not.toBeInTheDocument();
  });
});

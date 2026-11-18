import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen, type LiveSettingsPage } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { hiringSettingsChanges, hiringSettingsPage, type HiringSettingsData } from './hiring-live';
import { RETIRED_PAGE_KEYS } from './retired-page-keys';

// Settings 6.1 Hiring, the designed page with `live` (founder answers 291, 302, 341, 345, 348): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.1')!;
const DEFAULTS = {
  'ats.retention_months': '12',
  'hiring.reject.email_candidate': 'off',
  'ats.referral.bonus_inr': '25000',
  'ats.referral.qualify_days': '90',
  'hiring.requisition.default_recruiter': 'none',
  'ats.headcount_plan': 'advisory',
  'ats.headcount_plan.manager_view': 'own_department',
  'ats.referral.self_apply_days': '90',
  'hiring.pay_range.show': 'off',
  'hiring.pay_history.ask': 'off',
  'hiring.rediscovery.ai': 'off',
  'hiring.rehire_flag.blocks_screening': 'off',
  'hiring.internal.after_probation': 'on',
  'hiring.internal.months_in_role': '12',
  'hiring.internal.tell_manager': 'on_apply',
  'hiring.notetaker.enabled': 'off',
  'hiring.notetaker.ai_draft': 'off',
  'hiring.notetaker.keep_days': '90',
  'hiring.bias_audit.nyc': 'off',
  'hiring.bgv.decider_other_person': 'on',
  'hiring.record_visibility': 'off',
  'hiring.reminders': 'off',
  'hiring.interview_hours.from': '09:30',
  'hiring.interview_hours.to': '18:30',
  'hiring.interview_hours.days': 'mon,tue,wed,thu,fri',
};
const DATA: HiringSettingsData = {
  canEdit: true,
  people: [
    { id: 'u1', name: 'Neha Joshi' },
    { id: 'u2', name: 'Arjun Kulkarni' },
  ],
  values: { ...DEFAULTS },
  defaults: DEFAULTS,
  choices: {
    'ats.retention_months': ['6', '9', '12', '18', '24', '36'],
    'hiring.reject.email_candidate': ['off', 'on'],
    'ats.referral.bonus_inr': ['0', '5000', '25000', '50000'],
    'ats.referral.qualify_days': ['30', '60', '90', '180'],
    'hiring.requisition.default_recruiter': ['none'],
    'ats.headcount_plan': ['off', 'advisory', 'required'],
    'ats.referral.self_apply_days': ['0', '30', '60', '90', '180'],
    'hiring.internal.months_in_role': ['0', '3', '6', '9', '12', '18', '24'],
    'hiring.internal.tell_manager': ['on_apply', 'at_offer'],
    'hiring.notetaker.keep_days': ['30', '90', '180', '365'],
  },
  lastChange: null,
  pipelines: [{ id: 'p1', name: 'Standard', isDefault: true, jobs: 3, stages: [{ id: 's1', name: 'Applied', category: 'active', daysTarget: 3, limit: null }] }],
  scorecards: [
    {
      id: 'sc1',
      name: 'Engineer round 1',
      scaleMax: 4,
      passBar: 2.5,
      inUse: false,
      items: [
        { id: 'i1', label: 'Problem solving', guidance: null, weight: 2, competencyId: null },
        { id: 'i2', label: 'Teamwork', guidance: null, weight: 1, competencyId: null },
      ],
    },
  ],
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
    // Designed fields with nothing behind them yet are left out, never shown with sample data.
    for (const t of ['Headcount plan approvers', 'AI interview', 'Careers site colour', 'Plant worker', 'Recruiting cost categories']) expect(screen.queryByText(t)).not.toBeInTheDocument();
    // Fixed rows: the referral rule is edited, never added to; without a scorecard editor templates are read-only lists.
    expect(screen.queryByRole('button', { name: /Add referral rule|Add pipeline template|Add scorecard/ })).not.toBeInTheDocument();
    // Answer 345: skills with weights in per cent (an older 2:1 template reads 67 % and 33 %) and the pass bar.
    expect(screen.getByText('Problem solving 67 %, Teamwork 33 %')).toBeInTheDocument();
  });

  it('answer 341: the seven settings are on the page with their defaults; plan mode is the joined Segment', () => {
    show(live());
    const plan = screen.getByRole('radiogroup', { name: 'Requisitions and the headcount plan' });
    expect(within(plan).getByRole('radio', { name: 'Advisory' })).toBeChecked();
    expect(within(plan).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Not used', 'Advisory', 'Required']);
    expect(screen.getByRole('checkbox', { name: /Hiring managers see their department’s headcount plan/ })).toBeChecked();
    for (const t of [/Show the pay range on new jobs/, /Ask applicants about their current or past pay/, /AI notes on past candidates/, /Not eligible for rehire/]) expect(screen.getByRole('checkbox', { name: t })).not.toBeChecked();
    expect(screen.getByText('No referral credit if the person applied themselves within')).toBeInTheDocument();
  });

  it('answer 341: changes map back to the company settings with their stored values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave }));
    await ue.click(screen.getByRole('radio', { name: 'Required' }));
    await ue.click(screen.getByRole('checkbox', { name: /Hiring managers see their department’s headcount plan/ }));
    await ue.click(screen.getByRole('checkbox', { name: /Show the pay range on new jobs/ }));
    await ue.click(screen.getByRole('checkbox', { name: /Ask applicants about their current or past pay/ }));
    await ue.click(screen.getByRole('checkbox', { name: /AI notes on past candidates/ }));
    await ue.click(screen.getByRole('checkbox', { name: /Not eligible for rehire/ }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, rows] = onSave.mock.calls[0]!;
    expect(hiringSettingsChanges(values, rows, DATA)).toEqual(
      expect.arrayContaining([
        { key: 'ats.headcount_plan', value: 'required' },
        { key: 'ats.headcount_plan.manager_view', value: 'off' },
        { key: 'hiring.pay_range.show', value: 'on' },
        { key: 'hiring.pay_history.ask', value: 'on' },
        { key: 'hiring.rediscovery.ai', value: 'on' },
        { key: 'hiring.rehire_flag.blocks_screening', value: 'on' },
      ]),
    );
    expect(hiringSettingsChanges({ 'hire.referral_self_apply_days': '30', 'hire.plan_manager_view': true }, {}, DATA)).toEqual([
      { key: 'ats.referral.self_apply_days', value: '30' },
      { key: 'ats.headcount_plan.manager_view', value: 'own_department' },
    ]);
  });

  it('HIR-13 (decision 6): who can apply for internal jobs, with the defaults; changes map to the company settings', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave }));
    expect(screen.getByRole('heading', { name: 'Internal jobs' })).toBeInTheDocument();
    const probation = screen.getByRole('checkbox', { name: /Only people past probation can apply for internal jobs/ });
    expect(probation).toBeChecked();
    const tell = screen.getByRole('radiogroup', { name: 'Tell the current manager' });
    expect(within(tell).getByRole('radio', { name: 'When they apply' })).toBeChecked();
    expect(screen.getByText('Time in their current role before applying')).toBeInTheDocument();
    await ue.click(probation);
    await ue.click(within(tell).getByRole('radio', { name: 'At the offer stage' }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, rows] = onSave.mock.calls[0]!;
    expect(hiringSettingsChanges(values, rows, DATA)).toEqual(expect.arrayContaining([{ key: 'hiring.internal.after_probation', value: 'off' }, { key: 'hiring.internal.tell_manager', value: 'at_offer' }]));
    expect(hiringSettingsChanges({ 'hire.internal_months_in_role': '6' }, {}, DATA)).toEqual([{ key: 'hiring.internal.months_in_role', value: '6' }]);
  });

  it('HIR-25 (decision 2): the notetaker and the AI draft are off by default; changes map to the company settings', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave }));
    expect(screen.getByRole('heading', { name: 'Interview notetaker' })).toBeInTheDocument();
    const on = screen.getByRole('checkbox', { name: /^Interview notetaker/ });
    const ai = screen.getByRole('checkbox', { name: /AI drafts a scorecard from the transcript/ });
    expect(on).not.toBeChecked();
    expect(ai).not.toBeChecked();
    await ue.click(on);
    await ue.click(ai);
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, rows] = onSave.mock.calls[0]!;
    expect(hiringSettingsChanges(values, rows, DATA)).toEqual(expect.arrayContaining([{ key: 'hiring.notetaker.enabled', value: 'on' }, { key: 'hiring.notetaker.ai_draft', value: 'on' }]));
    expect(hiringSettingsChanges({ 'hire.notetaker_keep_days': '30' }, {}, DATA)).toEqual([{ key: 'hiring.notetaker.keep_days', value: '30' }]);
  });

  it('HIR-23: "We use an automated tool for jobs in New York City" is off by default and saves to its company setting', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave }));
    const nyc = screen.getByRole('checkbox', { name: /We use an automated tool for jobs in New York City/ });
    expect(nyc).not.toBeChecked();
    await ue.click(nyc);
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, rows] = onSave.mock.calls[0]!;
    expect(hiringSettingsChanges(values, rows, DATA)).toEqual([{ key: 'hiring.bias_audit.nyc', value: 'on' }]);
  });

  it('answer 2427: record visibility and the daily reminders are company switches on 6.1 (off by default) and save as on/off', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave }));
    const own = screen.getByRole('checkbox', { name: /Recruiters see only their own candidates/ });
    const rem = screen.getByRole('checkbox', { name: /Send the hiring team daily reminders/ });
    expect(own).not.toBeChecked();
    expect(rem).not.toBeChecked();
    await ue.click(own);
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, rows] = onSave.mock.calls[0]!;
    expect(hiringSettingsChanges(values, rows, DATA)).toEqual([{ key: 'hiring.record_visibility', value: 'on' }]);
  });

  it('answer 348: a default recruiter who no longer qualifies reads as None, with a warning naming them', () => {
    show(live({ page: hiringSettingsPage(design, { ...DATA, staleRecruiter: 'Kavya Rao' }) }));
    expect(screen.getByText(/Kavya Rao no longer holds the recruiter key or has left/)).toBeInTheDocument();
  });

  it('answer 348: no warning while the default qualifies', () => {
    show(live({ page: hiringSettingsPage(design, { ...DATA, values: { ...DEFAULTS, 'hiring.requisition.default_recruiter': 'u1' } }) }));
    expect(screen.queryByText(/no longer holds the recruiter key/)).not.toBeInTheDocument();
  });

  it('answer 345: with a scorecard editor, Add scorecard and each row’s Edit open it (even on a read-only page)', async () => {
    const edit = vi.fn();
    show(live({ canEdit: false, listEditors: { 'hire.scorecards': edit } }));
    await ue.click(screen.getByRole('button', { name: 'Add scorecard' }));
    expect(edit).toHaveBeenLastCalledWith('new');
    await ue.click(screen.getByRole('button', { name: 'Edit Engineer round 1' }));
    expect(edit).toHaveBeenLastCalledWith(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    show(live({ onSave: vi.fn().mockRejectedValue(new Error('Choose someone who holds the recruiter key.')) }));
    await ue.click(screen.getByRole('checkbox', { name: /Tell candidates when they are not selected/ }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Choose someone who holds the recruiter key/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Tell candidates when they are not selected/ })).toBeChecked();
  });

  it('without the key every value is read-only: no save, no edit, no request-access button', () => {
    show(live({ canEdit: false }));
    expect(screen.getByText('You can view these settings but not change them')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
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

  it('answer 362: who decides a BGV discrepancy is on the page (default on, someone else) and saves on/off', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(live({ onSave }));
    const box = screen.getByRole('checkbox', { name: /A discrepancy is decided by someone other than who recorded it/ });
    expect(box).toBeChecked();
    await ue.click(box);
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, rows] = onSave.mock.calls[0]!;
    expect(hiringSettingsChanges(values, rows, DATA)).toEqual([{ key: 'hiring.bgv.decider_other_person', value: 'off' }]);
  });

  it('answer 362: read-only without the key', () => {
    show(live({ canEdit: false }));
    expect(screen.getByText('A discrepancy is decided by someone other than who recorded it')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /A discrepancy is decided/ })).not.toBeInTheDocument();
  });

  it('answer 384: the referral settings are on 6.1 only, never on Company rules', () => {
    const elsewhere = Object.values(RETIRED_PAGE_KEYS).flat();
    for (const k of ['ats.referral.bonus_inr', 'ats.referral.qualify_days', 'ats.referral.self_apply_days']) expect(elsewhere).not.toContain(k);
    show(live());
    expect(screen.getAllByText('Referral bonus rules').length).toBeGreaterThan(0);
    expect(screen.getByText('No referral credit if the person applied themselves within')).toBeInTheDocument();
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
  it('HIR-09 answers 332, 334, 337: the band approver (a named person too), the clawback basis and e-signed letters', async () => {
    const data: HiringSettingsData = {
      ...DATA,
      values: { ...DATA.values, 'hiring.offer.band_approver': 'hr_head', 'hiring.offer.clawback_basis': 'full' },
      defaults: { ...DATA.defaults, 'hiring.offer.band_approver': 'hr_head', 'hiring.offer.clawback_basis': 'full' },
      offerApprovers: [{ id: 'u9', name: 'Meenakshi Sundaram' }],
      offerLetters: [{ id: 't1', name: 'Offer letter', esign: false }, { id: 't2', name: 'Plant offer', esign: true }],
    };
    const page = hiringSettingsPage(design, data);
    const field = (k: string) => page.sections.flatMap((x) => x.settings).find((d) => d.key === k)!;
    expect(field('hire.band_approver')).toMatchObject({ value: 'hr_head', options: ['hr_head', 'hiring_manager', 'u9'], optionLabels: expect.objectContaining({ u9: 'Meenakshi Sundaram' }) });
    expect(field('hire.clawback_basis')).toMatchObject({ value: 'full', optionLabels: expect.objectContaining({ pro_rata: 'The part for the months not served' }) });
    expect(field('hire.offer_esign')).toMatchObject({ value: ['t2'], optionLabels: { t1: 'Offer letter', t2: 'Plant offer' } });
    expect(hiringSettingsChanges({ 'hire.band_approver': 'u9', 'hire.clawback_basis': 'pro_rata', 'hire.offer_esign': ['t1'] }, {}, data)).toEqual([
      { key: 'hiring.offer.band_approver', value: 'u9' },
      { key: 'hiring.offer.clawback_basis', value: 'pro_rata' },
      { key: 'offer_template.esign', value: 't1:on' },
      { key: 'offer_template.esign', value: 't2:off' },
    ]);
    // Unchanged e-sign choice: nothing to save; a company with no offer letters gets no e-sign field.
    expect(hiringSettingsChanges({ 'hire.offer_esign': ['t2'] }, {}, data)).toEqual([]);
    expect(hiringSettingsPage(design, { ...data, offerLetters: [] }).sections.flatMap((x) => x.settings).some((d) => d.key === 'hire.offer_esign')).toBe(false);
  });
  it('answer 2434: stage message templates list every channel with its stage; absent when the lists were not read', () => {
    const data: HiringSettingsData = {
      ...DATA,
      messages: [
        { channel: 'email', id: null, name: 'Application received', triggerStageId: 's1', triggerMode: 'manual', subject: 'Thanks', body: 'Hi', enabled: true, isDefault: true },
        { channel: 'whatsapp', id: 'w1', name: 'Reminder', triggerStageId: null, triggerMode: 'manual', body: 'Hi', enabled: false, isDefault: false },
      ],
    };
    const field = (p: ReturnType<typeof hiringSettingsPage>) => p.sections.flatMap((x) => x.settings).find((d) => d.key === 'hire.stage_messages');
    expect(field(hiringSettingsPage(design, data))).toMatchObject({
      kind: 'list',
      readOnlyList: true,
      rows: [
        ['Application received', 'Email', 'Applied', 'Sent by hand · Standard wording'],
        ['Reminder', 'WhatsApp', 'No stage', 'Sent by hand · Off'],
      ],
    });
    expect(field(hiringSettingsPage(design, DATA))).toBeUndefined();
    expect(hiringSettingsChanges({}, { 'hire.stage_messages': [['x', 'Email', 'No stage', 'Sent by hand']] }, data)).toEqual([]);
  });
  it('answers 2423 and 2510: interview hours (09:30 to 18:30, Monday to Friday by default) save as company settings', () => {
    const page = hiringSettingsPage(design, DATA);
    const field = (k: string) => page.sections.flatMap((x) => x.settings).find((d) => d.key === k)!;
    expect(field('hire.interview_from')).toMatchObject({ kind: 'time', value: '09:30', starter: true });
    expect(field('hire.interview_to')).toMatchObject({ kind: 'time', value: '18:30', after: 'hire.interview_from' });
    expect(field('hire.interview_days')).toMatchObject({ kind: 'multiselect', value: ['mon', 'tue', 'wed', 'thu', 'fri'], starter: true });
    expect(hiringSettingsChanges({ 'hire.interview_from': '10:00', 'hire.interview_days': ['sat', 'mon'] }, {}, DATA)).toEqual([
      { key: 'hiring.interview_hours.from', value: '10:00' },
      { key: 'hiring.interview_hours.days', value: 'mon,sat' },
    ]);
    const changed = hiringSettingsPage(design, { ...DATA, values: { ...DATA.values, 'hiring.interview_hours.days': 'mon,sat' } });
    expect(changed.sections.flatMap((x) => x.settings).find((d) => d.key === 'hire.interview_days')).toMatchObject({ value: ['mon', 'sat'], starter: false });
  });

  it('answer 2510: an end time before the start is refused on the page, before anything is saved', async () => {
    const onSave = vi.fn();
    render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" live={{ page: hiringSettingsPage(design, DATA), canEdit: true, state: 'ready', onSave, savedTitle: 'Hiring settings saved' } as LiveSettingsPage} /></ToastProvider>);
    const to = screen.getByLabelText(/^Candidates may book interviews until/);
    await ue.clear(to);
    await ue.type(to, '08:00');
    await ue.tab();
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

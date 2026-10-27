import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PersonHistoryScreen, type PersonHistoryScreenProps } from './person-history';
import { ChangeDrawer, changeInput, DesignImpact, draftForm, draftFromForm, ImpactPanel, moveInput, moveNeeds, orList, routeLine, type ChangeDraft } from './history-kit';
import { EMPTY_HIRE, HireDrawer, hireInput, type HireDraft } from './hire';
import { AS_OF, AS_OF_PAY, HISTORY, IMPACT, IMPACT_LOWERS_PAY, OPTIONS, PEOPLE, TODAY_ISO } from './data';

const ok = () => vi.fn().mockResolvedValue(undefined);
const draft = (over: Partial<ChangeDraft>): ChangeDraft => ({ employeeId: 'p-arjun', changeType: 'promotion', effectiveDate: new Date(2026, 10, 1), values: {}, dotted: null, payMode: 'amount', pay: '', confirm: false, reason: 'Promotion', overrideReason: '', ...over });

function History(over: Partial<PersonHistoryScreenProps>) {
  return (
    <PersonHistoryScreen
      state="ready"
      people={PEOPLE}
      personId="p-arjun"
      onPickPerson={vi.fn()}
      today={TODAY_ISO}
      asOf={TODAY_ISO}
      onAsOf={vi.fn()}
      view={AS_OF}
      history={HISTORY}
      payShown={false}
      onShowPay={ok()}
      {...over}
    />
  );
}

describe('changeInput (P06 §4.3, YX-HIS-12, R1)', () => {
  it('5c-D2: a new designation or a correction can set the skill class (a dated job fact)', () => {
    expect(changeInput(draft({ changeType: 'redesignation', values: { designationId: 'des-sr', skillClass: 'skilled' } }), OPTIONS).input?.payload).toEqual({ assignment: { designationId: 'des-sr', skillClass: 'skilled' } });
    expect(changeInput(draft({ changeType: 'correction', values: { skillClass: 'highly_skilled' } }), OPTIONS).input?.payload).toEqual({ assignment: { skillClass: 'highly_skilled' } });
  });

  it('builds the payload for the kind of change, with pay as an amount or a percentage', () => {
    expect(changeInput(draft({ values: { designationId: 'des-sr', gradeId: 'g-g3' }, pay: '780000' }), OPTIONS).input).toEqual({
      employeeId: 'p-arjun',
      changeType: 'promotion',
      effectiveDate: '2026-11-01',
      payload: { assignment: { designationId: 'des-sr', gradeId: 'g-g3' }, compensation: { annualCtc: '780000' } },
      reason: 'Promotion',
    });
    expect(changeInput(draft({ changeType: 'salary_revision', payMode: 'percent', pay: '7.5' }), OPTIONS).input?.payload).toEqual({ compensation: { increasePercent: '7.5' } });
    expect(changeInput(draft({ changeType: 'transfer', values: { locationId: 'loc-chn' } }), OPTIONS).input?.payload).toEqual({ assignment: { locationId: 'loc-chn' } });
    expect(changeInput(draft({ changeType: 'confirmation' }), OPTIONS).input?.payload).toEqual({ status: 'confirmed' });
  });

  it('without pay access pay is never sent; a salary revision then cannot be built', () => {
    const noPay = { ...OPTIONS, canPay: false };
    expect(changeInput(draft({ values: { designationId: 'des-sr', gradeId: 'g-g3' }, pay: '780000' }), noPay).input?.payload).toEqual({ assignment: { designationId: 'des-sr', gradeId: 'g-g3' } });
    expect(changeInput(draft({ changeType: 'salary_revision', pay: '780000' }), noPay).errors.map((e) => e.fieldId)).toContain('ch-pay');
  });

  it('asks for what is missing, and an override reason before the retro limit', () => {
    const { errors } = changeInput(draft({ employeeId: null, changeType: null, effectiveDate: null, reason: '' }), OPTIONS);
    expect(errors.map((e) => e.fieldId)).toEqual(['ch-person', 'ch-type', 'ch-date', 'ch-reason']);
    expect(changeInput(draft({ values: {} }), OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-designationId']);
    expect(changeInput(draft({ values: {} }), OPTIONS, 'both').errors.map((e) => e.fieldId)).toEqual(['ch-designationId', 'ch-gradeId']);
    expect(changeInput(draft({ changeType: 'confirmation' as never, values: {} }), OPTIONS).errors).toEqual([]);
    expect(changeInput(draft({ values: { designationId: 'x', gradeId: 'g' }, pay: '12abc' }), OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-pay']);
    const early = draft({ values: { designationId: 'x', gradeId: 'g' }, effectiveDate: new Date(2026, 2, 31) });
    expect(changeInput(early, OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-override']);
    expect(changeInput({ ...early, overrideReason: 'Board approved backdating' }, OPTIONS).input?.overrideReason).toBe('Board approved backdating');
  });
});

describe('inter-entity transfer (PPL-04, a one-person restructure)', () => {
  const moveDraft = (over: Partial<ChangeDraft>) => draft({ changeType: 'entity_transfer', reason: 'Chennai sales now sit under the TN entity', ...over });
  const options = { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' } as const;

  it('sends the new entity, location and options; asks for the entity and location first', () => {
    expect(moveInput(moveDraft({ entityId: 'le-tn', values: { locationId: 'loc-hsr' }, transfer: { ...options, leave: 'lapse' } }), OPTIONS, 'le-kf').input).toEqual({ employeeId: 'p-arjun', fromEntityId: 'le-kf', intoEntityId: 'le-tn', effectiveDate: '2026-11-01', locationId: 'loc-hsr', options: { ...options, leave: 'lapse' }, reason: 'Chennai sales now sit under the TN entity' });
    expect(moveInput(moveDraft({ values: {} }), OPTIONS, 'le-kf').errors.map((e) => e.fieldId)).toEqual(['ch-entity', 'ch-locationId']);
  });

  it('a department, designation or employment type only for the old entity is required (never labelled optional)', () => {
    const plant = { value: 'et-plant', label: 'Fixed-term (plant)', entities: ['le-tn'] };
    const shared = { value: 'et-perm', label: 'Permanent', entities: [] };
    const o = { ...OPTIONS, employmentTypes: [plant, shared] };
    expect(moveNeeds({ departmentId: null, designationId: null, employmentTypeId: 'et-plant' }, o, 'le-kf')).toEqual(['employmentTypeId']);
    expect(moveNeeds({ employmentTypeId: 'et-perm' }, o, 'le-kf')).toEqual([]);
    expect(moveNeeds({ employmentTypeId: 'et-plant' }, o, null)).toEqual([]);
    const d = moveDraft({ entityId: 'le-kf', values: { locationId: 'loc-blr' }, transfer: options });
    expect(moveInput(d, OPTIONS, 'le-tn', ['employmentTypeId']).errors).toEqual([{ fieldId: 'ch-employmentTypeId', message: 'Choose the new employment type' }]);
    expect(moveInput({ ...d, values: { locationId: 'loc-blr', employmentTypeId: 'et-perm' } }, OPTIONS, 'le-tn', ['employmentTypeId']).input).toMatchObject({ employmentTypeId: 'et-perm' });
  });

  it('the options start on the company defaults, named for the person (code, service start)', async () => {
    const legalEntities = [{ value: 'le-kf', label: 'Kaveri Foods Pvt Ltd' }, { value: 'le-tn', label: 'Kaveri Foods (Tamil Nadu)' }];
    const onDefaults = vi.fn().mockResolvedValue({ options, employeeCode: 'KF-0142', serviceFrom: '2019-07-14', current: { departmentId: null, designationId: null, employmentTypeId: null } });
    const move = { entities: legalEntities, onDefaults, onPreview: vi.fn().mockResolvedValue(IMPACT), onSubmit: ok() };
    render(<ChangeDrawer options={OPTIONS} employeeId="p-arjun" initial={moveDraft({})} onPreview={vi.fn()} onSubmit={ok()} onClose={vi.fn()} move={move} />);
    expect(await screen.findByText('Transfer options')).toBeTruthy();
    expect(await screen.findByRole('radio', { name: 'Keep KF-0142' })).toHaveProperty('ariaChecked', 'true');
    expect(screen.getByRole('radio', { name: 'Continue from 14 Jul 2019' })).toBeTruthy();
    expect(onDefaults).toHaveBeenCalledWith('p-arjun');
  });
});

describe('a promotion that lowers pay: a warning, never a block', () => {
  it('the raiser sees it before sending and the approver before approving; none when pay goes up', () => {
    const { unmount } = render(<DesignImpact impact={IMPACT_LOWERS_PAY} />);
    expect(screen.getByText('Check before you send')).toBeTruthy();
    expect(screen.getByText(/lowers the annual CTC/)).toBeTruthy();
    unmount();
    render(<ImpactPanel impact={IMPACT_LOWERS_PAY} />);
    expect(screen.getByText('Check before you approve')).toBeTruthy();
  });

  it('no warning on a raise, or on an older impact without warnings', () => {
    render(<DesignImpact impact={{ ...IMPACT, warnings: [] }} />);
    expect(screen.queryByText(/Check before/)).toBeNull();
    render(<ImpactPanel impact={IMPACT} />);
    expect(screen.queryByText(/Check before/)).toBeNull();
  });
});

describe('ImpactPanel (YX-HIS-11, YX-HIS-06, R1)', () => {
  it('shows what moves, the later changes recalculated, and hides pay without access', () => {
    const { rerender } = render(<ImpactPanel impact={IMPACT} />);
    expect(screen.getByText('Senior QA Engineer')).toBeTruthy();
    expect(screen.getByText('1 later change will be recalculated')).toBeTruthy();
    expect(screen.getAllByText(/₹7,80,000/).length).toBe(1);
    rerender(<ImpactPanel impact={{ ...IMPACT, pay: 'hidden', rebased: [{ ...IMPACT.rebased[0], pay: 'hidden' }], retro: { from: '2026-04-01', months: ['2026-04', '2026-05'] } }} />);
    expect(screen.queryByText(/₹/)).toBeNull();
    expect(screen.getByText(/Only people with pay access see the amounts/)).toBeTruthy();
    expect(screen.getByText(/Apr 2026, May 2026/)).toBeTruthy();
  });
});

describe('PersonHistoryScreen (P06 §4.7, §7)', () => {
  it('before the first day: future tense and a button to that day', async () => {
    const onAsOf = vi.fn();
    render(<History onAsOf={onAsOf} view={{ ...AS_OF, assignment: null, employee: { ...AS_OF.employee, joinedOn: '2099-01-04' } }} />);
    expect(screen.getByText('Not joined yet on this date.')).toBeInTheDocument();
    expect(screen.getAllByText('Joins on 4 Jan 2099').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'See the first day' }));
    expect(onAsOf).toHaveBeenCalledWith('2099-01-04');
  });

  it('shows the facts in force, the changes and the corrected records; pay only after Show pay (R1)', async () => {
    const onShowPay = ok();
    render(<History onShowPay={onShowPay} />);
    expect(screen.getByText('Quality Analyst')).toBeTruthy();
    expect(screen.getByText('Skilled')).toBeTruthy();
    expect(screen.getByText('Divya Raghunathan')).toBeTruthy();
    expect(screen.queryByText('Annual CTC')).toBeNull();
    expect(screen.getByText('Corrected records')).toBeTruthy();
    expect(screen.getByText(/Joining record had the wrong grade/)).toBeTruthy();
    const changes = screen.getByRole('table', { name: 'Changes' });
    expect(within(changes).getByText('Promotion after the 2026 review')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(onShowPay).toHaveBeenCalledWith(true);
  });

  it('with pay shown: the amount and the pay history', () => {
    render(<History view={AS_OF_PAY} payShown />);
    expect(screen.getByText('Annual CTC')).toBeTruthy();
    expect(screen.getAllByText('₹5,83,200').length).toBeGreaterThan(0);
    expect(screen.getByText('Pay history')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide pay' })).toBeTruthy();
  });

  it('a manager: no Show pay, no Change; another date can be viewed and reset', async () => {
    const onAsOf = vi.fn();
    render(<History view={{ ...AS_OF, payAccess: false, asOf: '2026-11-01' }} asOf="2026-11-01" onAsOf={onAsOf} />);
    expect(screen.queryByRole('button', { name: 'Show pay' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getByText('Includes scheduled changes')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(onAsOf).toHaveBeenCalledWith(TODAY_ISO);
  });

  it('no person chosen yet: says what to do', () => {
    render(<History personId={null} view={null} history={null} />);
    expect(screen.getByText('Choose a person to see their job history.')).toBeTruthy();
  });

  it('Change opens the form; it cannot be sent before the impact is previewed (YX-HIS-11)', async () => {
    const onPreview = vi.fn().mockResolvedValue(IMPACT);
    const onSubmit = ok();
    render(<History change={{ options: OPTIONS, onPreview, onSubmit }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    // PPL-04: the impact previews by itself once the form is complete; Send before that shows what is missing
    expect(screen.queryByRole('button', { name: 'Preview impact' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Send for approval' }));
    expect((await screen.findAllByText('Choose the kind of change')).length).toBeGreaterThan(0);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Add person (P01 §4.4 / §4.5a, PPL-36)', () => {
  const full: HireDraft = { ...EMPTY_HIRE, givenName: ' Kiran ', familyName: 'Joshi', workEmail: 'kiran.j@kaverifoods.in', legalEntityId: 'le-kfpl', joinedOn: new Date(2026, 9, 1), locationId: 'loc-blr', departmentId: 'd-qa', designationId: 'des-qa', employmentTypeId: 'et-perm', costCentreId: 'cc-eng', annualCtc: '540000', reason: 'Offer accepted' };

  it('builds the join body with the whole job; pay only for pay access (R1)', () => {
    expect(hireInput(full, true).input).toEqual({
      givenName: 'Kiran',
      familyName: 'Joshi',
      workEmail: 'kiran.j@kaverifoods.in',
      legalEntityId: 'le-kfpl',
      joinedOn: '2026-10-01',
      status: 'probation',
      assignment: { locationId: 'loc-blr', departmentId: 'd-qa', designationId: 'des-qa', employmentTypeId: 'et-perm', gradeId: null, managerEmployeeId: null, costCentres: [{ costCentreId: 'cc-eng', percent: '100' }] },
      compensation: { currency: 'INR', annualCtc: '540000' },
      reason: 'Offer accepted',
    });
    expect(hireInput(full, false).input).not.toHaveProperty('compensation');
  });

  it('lists what is missing or malformed', () => {
    expect(hireInput(EMPTY_HIRE, true).errors.map((e) => e.fieldId)).toEqual(['hire-given', 'hire-entity', 'hire-joined', 'hire-location', 'hire-department', 'hire-designation', 'hire-type', 'hire-cc', 'hire-reason']);
    const bad = hireInput({ ...full, workEmail: 'kiran@', mobilePhone: 'call me', employeeCode: 'KF 01;', annualCtc: '5,40,000' }, true);
    expect(bad.errors.map((e) => e.fieldId)).toEqual(['hire-email', 'hire-phone', 'hire-code', 'hire-ctc']);
  });

  it('YX-HIS-12: a reason for a past joining date goes with the hire, and is at least 10 characters', () => {
    expect(hireInput({ ...full, overrideReason: ' Migrated from the old system ' }, true).input).toMatchObject({ overrideReason: 'Migrated from the old system' });
    expect(hireInput({ ...full, overrideReason: 'short' }, true).errors.map((e) => e.fieldId)).toEqual(['hire-back']);
    expect(hireInput(full, true).input).not.toHaveProperty('overrideReason');
  });

  it('YX-ORG-27: a possible match is linked only after HR confirms it is the same person', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0, delay: null }); // no pause per keystroke: this test fills the whole form and ran past 5 s under full-suite load
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('match'), { code: 'POSSIBLE_SAME_PERSON', body: { personIds: ['person-9'] } }))
      .mockResolvedValueOnce({ id: 'e-new' });
    const onCreated = vi.fn();
    render(<HireDrawer options={OPTIONS} legalEntities={[{ value: 'le-kfpl', label: 'Kaveri Foods Pvt Ltd' }]} onSubmit={onSubmit} onClose={() => {}} onCreated={onCreated} />);
    const dialog = screen.getByRole('dialog');
    const pick = async (name: string, option: string) => {
      await u.click(within(dialog).getByRole('combobox', { name }));
      await u.click(await screen.findByRole('option', { name: option }));
    };
    await u.type(within(dialog).getByLabelText(/First name/), 'Kiran');
    await u.type(within(dialog).getByLabelText(/Work email/), 'kiran.j@kaverifoods.in');
    await pick('Legal entity', 'Kaveri Foods Pvt Ltd');
    // Entity-only masters of another entity are not offered (YX-ORG-15).
    await u.click(within(dialog).getByRole('combobox', { name: 'Location' }));
    expect(screen.queryByRole('option', { name: 'Hosur plant' })).toBeNull();
    await u.click(await screen.findByRole('option', { name: 'Bengaluru head office' }));
    await pick('Department', 'Quality');
    await pick('Designation', 'Quality Analyst');
    await pick('Employment type', 'Permanent');
    await pick('Cost centre', 'CC-BLR-ENG · Engineering Bengaluru');
    await u.type(within(dialog).getByLabelText(/Joins on/), '1/10/2026');
    await u.type(within(dialog).getByLabelText(/^Reason/), 'Offer accepted');
    await u.click(within(dialog).getByRole('button', { name: 'Add person' }));
    const box = await screen.findByText('This email or phone already belongs to someone here');
    expect(box.closest('.yx-drawer__notice')).not.toBeNull(); // above the buttons, not scrolled away at the top of the form
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('personId');
    const link = within(dialog).getByRole('button', { name: 'Link and add' });
    expect(link).toBeDisabled();
    await u.click(within(dialog).getByRole('checkbox', { name: 'I checked: this is the same person' }));
    await u.click(link);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('e-new'));
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ personId: 'person-9', givenName: 'Kiran', joinedOn: '2026-10-01' });
  });

  it('any other refusal is shown and nothing is linked', async () => {
    const onSubmit = vi.fn().mockRejectedValue(Object.assign(new Error('That email or phone belongs to another person.'), { code: 'CONFLICT' }));
    const { rerender } = render(<HireDrawer options={OPTIONS} legalEntities={[]} onSubmit={onSubmit} onClose={() => {}} />);
    // Incomplete: listed, not sent.
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Fix these before saving')).toBeInTheDocument();
    rerender(<HireDrawer options={{ ...OPTIONS, canPay: false }} legalEntities={[]} onSubmit={onSubmit} onClose={() => {}} />);
    expect(screen.queryByLabelText(/Annual CTC/)).toBeNull();
  });
});

describe('G1: hours a week and service dates (gap pass C1, C3)', () => {
  it('"Employment type or hours" sets part-time hours, back to full-time, or nothing', () => {
    const t = { changeType: 'employment_type_change' as const };
    expect(changeInput(draft({ ...t, hours: 'set', hoursValue: '24' }), OPTIONS).input?.payload).toEqual({ assignment: { hoursPerWeek: '24' } });
    expect(changeInput(draft({ ...t, hours: 'full' }), OPTIONS).input?.payload).toEqual({ assignment: { hoursPerWeek: null } });
    expect(changeInput(draft({ ...t, hours: 'set', hoursValue: '24.25' }), OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-hours']);
    expect(changeInput(draft({ ...t, hours: 'set', hoursValue: '90' }), OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-hours']);
    // A promotion never carries hours, whatever the draft holds.
    expect(changeInput(draft({ values: { designationId: 'des-sr', gradeId: 'g-g3' }, hours: 'set', hoursValue: '24' }), OPTIONS).input?.payload).toEqual({ assignment: { designationId: 'des-sr', gradeId: 'g-g3' } });
  });

  it('the hire form sends hours only when given', () => {
    const base: HireDraft = { ...EMPTY_HIRE, givenName: 'Meera', legalEntityId: 'le-kfpl', joinedOn: new Date(2026, 10, 2), locationId: 'loc-blr', departmentId: 'dep-qa', designationId: 'des-qa', employmentTypeId: 'et-perm', costCentreId: 'cc-eng', reason: 'Offer accepted' };
    expect(hireInput(base, false).input?.assignment.hoursPerWeek).toBeUndefined();
    expect(hireInput({ ...base, hoursPerWeek: '37.5' }, false).input?.assignment.hoursPerWeek).toBe('37.5');
    expect(hireInput({ ...base, hoursPerWeek: 'abc' }, false).errors.map((e) => e.fieldId)).toEqual(['hire-hours']);
  });

  it('shows hours with the FTE, and the three service dates with an edit for HR', async () => {
    const view = { ...AS_OF, assignment: { ...AS_OF.assignment!, hoursPerWeek: '24.0', normalWeekHours: '48', ftePercent: '50.00' } };
    const onSave = ok();
    render(<History view={view} serviceDates={{ companyStart: '2021-06-01', employerStart: '2024-01-15', continuousServiceFrom: '2022-03-10', source: 'rehire_break_counted', reason: null }} onSaveServiceDates={onSave} />);
    expect(screen.getByText('24 hours (50 % of a 48-hour week)')).toBeInTheDocument();
    expect(screen.getByText('Company start')).toBeInTheDocument();
    expect(screen.getByText(/Earlier service counted, the break not/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit continuous service' }));
    // No red error while typing: the reason is asked for only on save.
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'A');
    expect(screen.queryByText('Enter the reason for the new dates')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findAllByText('Enter the reason for the new dates')).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'cquired company');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ continuousServiceFrom: null, reason: 'Acquired company' }));
  });
});

describe('PPL-04 change drawer: fields per type, the route line, drafts', () => {
  const open = (initial: Partial<ChangeDraft>, extra: Record<string, unknown> = {}) => {
    const props = { onPreview: vi.fn().mockReturnValue(new Promise(() => undefined)), onSubmit: ok(), onRoute: vi.fn().mockResolvedValue(['Priya Nair', 'Lakshmi Venkatesan']), onSaveDraft: ok(), onClose: vi.fn(), ...extra };
    render(<ChangeDrawer options={OPTIONS} employeeId="p-arjun" initial={draft({ effectiveDate: null, reason: '', ...initial })} {...props} />);
    return props;
  };
  const fields = () => screen.queryAllByRole('combobox').map((x) => x.getAttribute('aria-label'));

  it('a transfer asks only for the new location, and needs it', async () => {
    open({ changeType: 'transfer' });
    expect(fields()).toContain('New location');
    for (const f of ['New department', 'New manager', 'New cost centre', 'New designation']) expect(fields()).not.toContain(f);
    expect(screen.queryByText('Dotted-line managers')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect((await screen.findAllByText('Choose the new location')).length).toBeGreaterThan(0);
  });

  it("a promotion follows the company's rule (designation or grade by default); a manager change needs the new manager, with dotted lines", async () => {
    open({ changeType: 'promotion' });
    expect(fields()).toEqual(expect.arrayContaining(['New designation', 'New grade']));
    expect(fields()).not.toContain('New skill class');
    expect(screen.getByText('Choose a new designation, a new grade, or both.')).toBeTruthy();
    const errs = (values: Record<string, string>, rule?: 'either' | 'both' | 'grade' | 'designation') => changeInput(draft({ values, pay: '' }), OPTIONS, rule).errors.map((e) => e.fieldId);
    expect(errs({ designationId: 'des-sr' })).toEqual([]);
    expect(errs({ gradeId: 'g-g3' })).toEqual([]);
    expect(errs({})).toEqual(['ch-designationId']);
    expect(errs({ designationId: 'des-sr' }, 'both')).toEqual(['ch-gradeId']);
    expect(errs({ designationId: 'des-sr' }, 'grade')).toEqual(['ch-gradeId']);
    expect(errs({ gradeId: 'g-g3' }, 'designation')).toEqual(['ch-designationId']);
    expect(changeInput(draft({ changeType: 'manager_change', values: {}, dotted: ['p-x'] }), OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-managerEmployeeId']);
  });

  it("marks what the person's entity requires: both, when the company's rule says so", async () => {
    const entity = PEOPLE.find((p) => p.id === 'p-arjun')!.legalEntityId!;
    const props = { onPreview: vi.fn().mockReturnValue(new Promise(() => undefined)), onSubmit: ok(), onClose: vi.fn() };
    render(<ChangeDrawer options={{ ...OPTIONS, promotionMustChange: { [entity]: 'both' } }} employeeId="p-arjun" initial={draft({ effectiveDate: null, reason: '', changeType: 'promotion', values: { designationId: 'des-sr' } })} {...props} />);
    expect(screen.queryByText('Choose a new designation, a new grade, or both.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect((await screen.findAllByText('Choose the new grade')).length).toBeGreaterThan(0);
  });

  it('starts with the route: who decides, recomputed when pay goes on the change', async () => {
    const p = open({ changeType: 'promotion' });
    expect(await screen.findByText('Goes to Priya Nair or Lakshmi Venkatesan.')).toBeTruthy();
    expect(p.onRoute).toHaveBeenCalledWith('p-arjun', null, false);
    expect(routeLine([])).toBeNull();
    expect(orList(['A', 'B', 'C'])).toBe('A, B or C');
    expect(orList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C or 2 others');
  });

  it('without a route keeps the general sentence; with pay asks again', async () => {
    const p = open({ changeType: 'salary_revision', pay: '780000' }, { onRoute: vi.fn().mockResolvedValue([]) });
    await waitFor(() => expect(p.onRoute).toHaveBeenCalledWith('p-arjun', null, true));
    expect(screen.getByText(/Someone who approves job changes decides it/)).toBeTruthy();
  });

  it('Save draft keeps the half-filled form; a saved form opens as it was', async () => {
    const p = open({ changeType: 'transfer', values: { locationId: 'loc-x' }, effectiveDate: new Date(2026, 10, 2) });
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(p.onSaveDraft).toHaveBeenCalled());
    const saved = draftForm(p.onSaveDraft.mock.calls[0][0]);
    expect(saved).toMatchObject({ changeType: 'transfer', effectiveDate: '2026-11-02', values: { locationId: 'loc-x' } });
    expect(draftFromForm(JSON.parse(JSON.stringify(saved))).effectiveDate).toEqual(new Date(2026, 10, 2));
    expect(p.onClose).toHaveBeenCalled();
  });
});

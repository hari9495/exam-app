import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PersonHistoryScreen, type PersonHistoryScreenProps } from './person-history';
import { JobChangesScreen, type JobChangesScreenProps } from './job-changes';
import { changeInput, ImpactPanel, type ChangeDraft } from './history-kit';
import { EMPTY_HIRE, HireDrawer, hireInput, type HireDraft } from './hire';
import { AS_OF, AS_OF_PAY, CHANGES, HISTORY, IMPACT, OPTIONS, PEOPLE, TODAY_ISO } from './data';

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

function Changes(over: Partial<JobChangesScreenProps>) {
  return (
    <JobChangesScreen
      state="ready"
      today={TODAY_ISO}
      rows={CHANGES}
      canApprove
      canManage
      personHref={(id) => `/people/${id}`}
      onPreview={vi.fn().mockResolvedValue(IMPACT)}
      onApprove={ok()}
      onReject={ok()}
      onCancel={ok()}
      onReschedule={ok()}
      {...over}
    />
  );
}

describe('changeInput (P06 §4.3, YX-HIS-12, R1)', () => {
  it('builds the payload for the kind of change, with pay as an amount or a percentage', () => {
    expect(changeInput(draft({ values: { designationId: 'des-sr', gradeId: 'g-g3' }, pay: '780000' }), OPTIONS).input).toEqual({
      employeeId: 'p-arjun',
      changeType: 'promotion',
      effectiveDate: '2026-11-01',
      payload: { assignment: { designationId: 'des-sr', gradeId: 'g-g3' }, compensation: { annualCtc: '780000' } },
      reason: 'Promotion',
    });
    expect(changeInput(draft({ changeType: 'salary_revision', payMode: 'percent', pay: '7.5' }), OPTIONS).input?.payload).toEqual({ compensation: { increasePercent: '7.5' } });
    expect(changeInput(draft({ changeType: 'transfer', values: { costCentreId: 'cc-eng' } }), OPTIONS).input?.payload).toEqual({ assignment: { costCentres: [{ costCentreId: 'cc-eng', percent: '100' }] } });
    expect(changeInput(draft({ changeType: 'confirmation' }), OPTIONS).input?.payload).toEqual({ status: 'confirmed' });
  });

  it('without pay access pay is never sent; a salary revision then cannot be built', () => {
    const noPay = { ...OPTIONS, canPay: false };
    expect(changeInput(draft({ values: { designationId: 'des-sr' }, pay: '780000' }), noPay).input?.payload).toEqual({ assignment: { designationId: 'des-sr' } });
    expect(changeInput(draft({ changeType: 'salary_revision', pay: '780000' }), noPay).errors.map((e) => e.fieldId)).toContain('ch-pay');
  });

  it('asks for what is missing, and an override reason before the retro limit', () => {
    const { errors } = changeInput(draft({ employeeId: null, changeType: null, effectiveDate: null, reason: '' }), OPTIONS);
    expect(errors.map((e) => e.fieldId)).toEqual(['ch-person', 'ch-type', 'ch-date', 'ch-reason']);
    expect(changeInput(draft({ values: {} }), OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-values']);
    expect(changeInput(draft({ values: { designationId: 'x' }, pay: '12abc' }), OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-pay']);
    const early = draft({ values: { designationId: 'x' }, effectiveDate: new Date(2026, 2, 31) });
    expect(changeInput(early, OPTIONS).errors.map((e) => e.fieldId)).toEqual(['ch-override']);
    expect(changeInput({ ...early, overrideReason: 'Board approved backdating' }, OPTIONS).input?.overrideReason).toBe('Board approved backdating');
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
  it('shows the facts in force, the changes and the corrected records; pay only after Show pay (R1)', async () => {
    const onShowPay = ok();
    render(<History onShowPay={onShowPay} />);
    expect(screen.getByText('Quality Analyst')).toBeTruthy();
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

  it('Change opens the form; it previews before it can be sent (YX-HIS-11)', async () => {
    const onPreview = vi.fn().mockResolvedValue(IMPACT);
    const onSubmit = ok();
    render(<History change={{ options: OPTIONS, onPreview, onSubmit }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    const send = await screen.findByRole('button', { name: 'Send for approval' });
    expect(send.hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Preview impact' }));
    expect((await screen.findAllByText('Choose the kind of change')).length).toBeGreaterThan(0);
    expect(onPreview).not.toHaveBeenCalled();
  });
});

describe('JobChangesScreen (PPL-05; YX-SEC-11, YX-HIS-06, Q7)', () => {
  it('lists changes waiting for approval; Review shows the impact; approving confirms the recalculation', async () => {
    const onApprove = ok();
    const onPreview = vi.fn().mockResolvedValue(IMPACT);
    render(<Changes onApprove={onApprove} onPreview={onPreview} />);
    const table = screen.getByRole('table', { name: 'Job changes' });
    expect(within(table).getByText('Rahul Sharma')).toBeTruthy();
    expect(within(table).queryByText(/Promotion after the 2026 review/)).toBeNull();
    const row = [...table.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Rahul Sharma')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Review' }));
    expect(onPreview).toHaveBeenCalledWith('c-rahul');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve and recalculate' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('c-rahul', true));
  });

  it('reject asks for a reason first', async () => {
    const onReject = ok();
    render(<Changes onReject={onReject} />);
    const row = [...screen.getByRole('table', { name: 'Job changes' }).querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Kavya Reddy')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const confirm = await screen.findByRole('button', { name: 'Reject change' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await userEvent.type(screen.getByRole('textbox'), 'Not this year');
    await userEvent.click(confirm);
    await waitFor(() => expect(onReject).toHaveBeenCalledWith('c-kavya', 'Not this year'));
  });

  it('scheduled changes can be cancelled with a reason; done ones have no actions', async () => {
    const onCancel = ok();
    const { unmount } = render(<Changes defaultView="scheduled" onCancel={onCancel} />);
    const row = [...screen.getByRole('table', { name: 'Job changes' }).querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Promotion')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /More actions|Actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cancel change' }));
    await userEvent.type(screen.getByRole('textbox'), 'Review postponed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel change' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledWith('c-promo', 'Review postponed'));
    unmount();
    render(<Changes defaultView="done" />);
    const done = screen.getByRole('table', { name: 'Job changes' });
    expect(within(done).queryByRole('button', { name: /More actions|Actions|Review/ })).toBeNull();
  });

  it('without approve or manage grants: a read-only list', () => {
    render(<Changes canApprove={false} canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New change' })).toBeNull();
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
    const u = userEvent.setup({ pointerEventsCheck: 0 });
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
    await screen.findByText('This email or phone already belongs to someone here');
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

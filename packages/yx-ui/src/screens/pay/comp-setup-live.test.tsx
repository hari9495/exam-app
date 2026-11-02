import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompensationScreen, ComponentLibraryScreen, PayslipLayoutScreen, TemplateBuilderScreen } from './comp-setup';
import type { LiveCompensation, LiveComponentLibrary, LivePayslipLayout, LiveTemplates } from './comp-setup-live';
import { BREAKUP, BREAKUP_BELOW, COMPONENTS, IN_FORCE, PAYSLIP_LAYOUTS, PEOPLE_HITS, SETUP_ENTITIES, STAT_PROFILE, TEMPLATES, TODAY } from './live/fixtures-5ab';

// The designed PAY-12 / 42, PAY-13, PAY-14 and PAY-15 screens with the live app's data: what each live page must do.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));
/** A toast (its text is also read out in a live region). */
const toastSays = async (text: string | RegExp) => expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
const pickOption = async (combo: RegExp | string, option: RegExp | string, root: HTMLElement = document.body) => {
  await ue.click(within(root).getByRole('combobox', { name: combo }));
  await ue.click(await screen.findByRole('option', { name: option }));
};

// ------------------------------------------------------------------ PAY-12 Compensation (+ PAY-42 Suggest split)
const compLive = (o: Partial<LiveCompensation> = {}): LiveCompensation => ({
  onSearch: vi.fn(async () => PEOPLE_HITS),
  employee: { id: 'e-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142' },
  onEmployee: vi.fn(),
  state: 'ready',
  onRetry: vi.fn(),
  current: IN_FORCE,
  templates: TEMPLATES,
  today: TODAY,
  onPreview: vi.fn(async () => BREAKUP),
  onSubmit: vi.fn(async () => ({ changeId: 'ch2', status: 'pending' })),
  onLetter: vi.fn(async () => ({ referenceNo: 'KF/REV/2026/0142' })),
  profile: STAT_PROFILE,
  onSaveProfile: ok(),
  onSuggest: vi.fn(async () => [
    { templateVersionId: 'v2', template: 'Staff standard · version 2', monthlyGross: '58700.00', takeHomeBeforeTax: '56700.00', codeWageAddBack: '0.00' },
    { templateVersionId: 'v3', template: 'Hosur plant workers · version 1', problem: 'Only for Kaveri Foods Pvt Ltd (Tamil Nadu)' },
  ]),
  ...o,
});
const openRevise = async () => {
  await ue.click(screen.getByRole('button', { name: 'Revise compensation' }));
  return screen.getByRole('dialog');
};

describe('Compensation (PAY-12 live)', () => {
  it('shows the salary in force with its lines', () => {
    render(<CompensationScreen live={compLive()} />);
    expect(screen.getByRole('heading', { name: 'Arjun Kulkarni' })).toBeInTheDocument();
    expect(screen.getByText('₹6,60,000.00', { selector: 'dd *, dd' })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Current breakup' })).getByText('House rent allowance')).toBeInTheDocument();
  });

  it('works out the breakup first, then needs a reason, then sends for approval', async () => {
    const live = compLive();
    render(<CompensationScreen live={live} />);
    const dialog = await openRevise();
    await pickOption(/Salary template/, /Staff standard · version 2/, dialog);
    await ue.type(within(dialog).getByRole('textbox', { name: /New annual CTC/ }), '726000');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect((await within(dialog).findAllByText('Provident fund 2025-v1')).length).toBe(2);
    expect(live.onPreview).toHaveBeenCalledWith(expect.objectContaining({ templateVersionId: 'v2', annualCtc: '726000' }));
    expect(live.onSubmit).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(within(dialog).getByText('Say why (at least 3 letters).')).toBeInTheDocument();
    expect(live.onSubmit).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Annual review');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(live.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ annualCtc: '726000', templateVersionId: 'v2', reason: 'Annual review' })));
    await toastSays('Sent for approval. It takes effect once someone else approves it.');
  });

  it('pressed too early: names the missing template and focuses it; nothing is worked out', async () => {
    const live = compLive();
    render(<CompensationScreen live={live} />);
    const dialog = await openRevise();
    await ue.click(within(dialog).getByRole('button', { name: 'Work out the breakup' }));
    expect(within(dialog).getByText('Choose the salary template.')).toBeInTheDocument();
    expect(live.onPreview).not.toHaveBeenCalled();
  });

  it('shows the minimum-wage warning the API returns', async () => {
    render(<CompensationScreen live={compLive({ onPreview: vi.fn(async () => BREAKUP_BELOW) })} />);
    const dialog = await openRevise();
    await pickOption(/Salary template/, /Staff standard · version 2/, dialog);
    await ue.type(within(dialog).getByRole('textbox', { name: /New annual CTC/ }), '726000');
    await ue.click(within(dialog).getByRole('button', { name: 'Work out the breakup' }));
    expect(await within(dialog).findByText(/below the minimum or floor wage/)).toBeInTheDocument();
  });

  it('a refused change keeps the drawer open with the reason', async () => {
    render(<CompensationScreen live={compLive({ onSubmit: vi.fn(async () => Promise.reject(new Error('A salary change for Arjun Kulkarni is already waiting for approval.'))) })} />);
    const dialog = await openRevise();
    await pickOption(/Salary template/, /Staff standard · version 2/, dialog);
    await ue.type(within(dialog).getByRole('textbox', { name: /New annual CTC/ }), '726000');
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Annual review');
    await ue.click(within(dialog).getByRole('button', { name: 'Work out the breakup' }));
    await within(dialog).findAllByText('Provident fund 2025-v1');
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(await within(dialog).findByText(/already waiting for approval/)).toBeInTheDocument();
  });

  it('suggest split offers only templates that pass; Use needs a choice (PAY-42)', async () => {
    render(<CompensationScreen live={compLive()} />);
    const dialog = await openRevise();
    await ue.type(within(dialog).getByRole('textbox', { name: /New annual CTC/ }), '726000');
    await ue.click(within(dialog).getByRole('button', { name: 'Suggest split' }));
    const split = await screen.findByRole('dialog', { name: 'Suggest split' });
    expect(within(split).getByText(/Not offered: Hosur plant workers · version 1/)).toBeInTheDocument();
    await ue.click(within(split).getByRole('button', { name: 'Use option' }));
    expect(within(split).getByText('Choose an option.')).toBeInTheDocument();
    await ue.click(within(split).getByRole('radio', { name: 'Staff standard · version 2' }));
    await ue.click(within(split).getByRole('button', { name: /^Use Staff standard/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Suggest split' })).toBeNull());
    expect(within(screen.getByRole('dialog')).getByRole('combobox', { name: /Salary template/ })).toHaveTextContent(/Staff standard · version 2/);
  });

  it('the revision letter needs a signatory, then shows its reference in a toast', async () => {
    const live = compLive();
    render(<CompensationScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Issue the revision letter' }));
    expect(screen.getByText('Give the name of the person who signs the letter.')).toBeInTheDocument();
    expect(live.onLetter).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Letter signed by/ }), 'Lakshmi Iyer');
    await ue.click(screen.getByRole('button', { name: 'Issue the revision letter' }));
    await toastSays('Revision letter KF/REV/2026/0142 issued.');
    expect(live.onLetter).toHaveBeenCalledWith('ch1', 'Lakshmi Iyer');
  });

  it('the statutory profile is saved only with a reason', async () => {
    const live = compLive();
    render(<CompensationScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Statutory profile' }));
    await ue.click(screen.getByRole('button', { name: 'Save statutory profile' }));
    expect(screen.getByText('Say why (at least 5 letters).')).toBeInTheDocument();
    expect(live.onSaveProfile).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Opted out of VPF');
    await ue.click(screen.getByRole('button', { name: 'Save statutory profile' }));
    await waitFor(() => expect(live.onSaveProfile).toHaveBeenCalledWith(expect.objectContaining({ pf: 'yes', esi: 'by_wage', reason: 'Opted out of VPF' })));
    await toastSays('Statutory profile saved.');
  });

  it('someone who can see pay but not change it gets no Revise button', () => {
    render(<CompensationScreen live={compLive({ onSubmit: undefined, onSuggest: undefined })} />);
    expect(screen.queryByRole('button', { name: 'Revise compensation' })).toBeNull();
  });

  it('no salary key: no access before anyone is chosen, and no person search', () => {
    render(<CompensationScreen live={compLive({ employee: null, state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('no person yet, no access, and a load error with retry', async () => {
    const { rerender } = render(<CompensationScreen live={compLive({ employee: null })} />);
    expect(screen.getByText('Find a person to see their pay')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Type at least 2 letters of the name.')).toBeInTheDocument();
    rerender(<CompensationScreen live={compLive({ state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access to/)).toBeInTheDocument();
    const onRetry = vi.fn();
    rerender(<CompensationScreen live={compLive({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------ PAY-13 Template builder
const tplLive = (o: Partial<LiveTemplates> = {}): LiveTemplates => ({
  state: 'ready',
  onRetry: vi.fn(),
  entities: SETUP_ENTITIES,
  templates: TEMPLATES,
  components: COMPONENTS,
  today: TODAY,
  onCreate: ok(),
  onCheck: vi.fn(async () => ({ ok: true, type: 'number' as const, uses: ['monthly_ctc'] })),
  onValidate: vi.fn(async () => ({ sample: BREAKUP, codeWageFlag: false })),
  onSaveVersion: ok(),
  ...o,
});

describe('Template builder (PAY-13 live)', () => {
  it('validates on the sample, asks to confirm, then publishes the version', async () => {
    const live = tplLive();
    render(<TemplateBuilderScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Staff standard' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Validate and publish' }));
    await waitFor(() => expect(live.onValidate).toHaveBeenCalledWith(expect.objectContaining({ balancing: 'special' })));
    await ue.click(await screen.findByRole('button', { name: 'Publish version' }));
    await waitFor(() => expect(live.onSaveVersion).toHaveBeenCalledWith('t1', expect.objectContaining({ validFrom: TODAY })));
    await toastSays(/Staff standard: version 3 published\./);
  });

  it('shows a formula problem on leaving the field and will not publish it', async () => {
    const live = tplLive({ onCheck: vi.fn(async () => ({ ok: false, message: 'process is not a name you can use here.' })) });
    render(<TemplateBuilderScreen live={live} />);
    const formula = screen.getByRole('textbox', { name: 'Formula' });
    await ue.clear(formula);
    await ue.type(formula, 'process.exit()');
    await ue.tab();
    await toastSays('process is not a name you can use here.');
    await ue.click(screen.getByRole('button', { name: 'Validate and publish' }));
    expect(live.onValidate).not.toHaveBeenCalled();
    expect(live.onSaveVersion).not.toHaveBeenCalled();
  });

  it('a sample run the API refuses is shown and nothing is published', async () => {
    const live = tplLive({ onValidate: vi.fn(async () => Promise.reject(new Error('basic uses special, which uses basic.'))) });
    render(<TemplateBuilderScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Validate and publish' }));
    await toastSays('basic uses special, which uses basic.');
    expect(screen.queryByRole('button', { name: 'Publish version' })).toBeNull();
    expect(live.onSaveVersion).not.toHaveBeenCalled();
  });

  it('creates a template; Create pressed with no name says so', async () => {
    const live = tplLive();
    render(<TemplateBuilderScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'New template' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByText('Name the template.')).toBeInTheDocument();
    expect(live.onCreate).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sales staff');
    await ue.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(live.onCreate).toHaveBeenCalledWith('Sales staff', null));
  });

  it('no templates yet, loading and no access', () => {
    const { rerender } = render(<TemplateBuilderScreen live={tplLive({ templates: [] })} />);
    expect(screen.getByText('No salary templates yet')).toBeInTheDocument();
    rerender(<TemplateBuilderScreen live={tplLive({ state: 'loading', templates: null })} />);
    expect(screen.getByRole('status', { name: 'Loading salary templates' })).toBeInTheDocument();
    rerender(<TemplateBuilderScreen live={tplLive({ state: 'no-access', templates: null })} />);
    expect(screen.getByText(/You don't have access to salary templates/)).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ PAY-14 Component library
const libLive = (o: Partial<LiveComponentLibrary> = {}): LiveComponentLibrary => ({ state: 'ready', onRetry: vi.fn(), rows: COMPONENTS, onSave: ok(), onInstallStarter: vi.fn(async () => ({ componentsAdded: 3 })), ...o });

describe('Component library (PAY-14 live)', () => {
  it('a statutory component changes only its name and payslip display', async () => {
    render(<ComponentLibraryScreen live={libLive()} />);
    await ue.click(screen.getByText('Provident fund (employee)'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Statutory component')).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /Part of PF wage/ })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: /Shown on payslip/ })).toBeEnabled();
  });

  it('Save pressed with nothing filled names the fields; filled, it adds the component', async () => {
    const live = libLive();
    render(<ComponentLibraryScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Add component' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save component' }));
    expect(within(dialog).getByText('Name the component.')).toBeInTheDocument();
    expect(within(dialog).getByText('Give the component a code.')).toBeInTheDocument();
    expect(live.onSave).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Shift allowance');
    await ue.type(within(dialog).getByRole('textbox', { name: /Code/ }), 'basic');
    await ue.click(within(dialog).getByRole('button', { name: 'Save component' }));
    expect(within(dialog).getByText('Code basic is already used.')).toBeInTheDocument();
    await ue.clear(within(dialog).getByRole('textbox', { name: /Code/ }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Code/ }), 'shift');
    await ue.click(within(dialog).getByRole('button', { name: 'Save component' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledWith(null, expect.objectContaining({ code: 'shift', name: 'Shift allowance', kind: 'earning' })));
    await toastSays('Shift allowance created. Add it to a template to use it.');
  });

  it('a refused save keeps the drawer open with the reason', async () => {
    render(<ComponentLibraryScreen live={libLive({ onSave: vi.fn(async () => Promise.reject(new Error('Someone changed this a moment ago. Reload to see their change.'))) })} />);
    await ue.click(screen.getByText('Night shift allowance'));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save component' }));
    expect(await within(dialog).findByText(/Someone changed this a moment ago/)).toBeInTheDocument();
  });

  it('adds the starter set and says how many were added', async () => {
    render(<ComponentLibraryScreen live={libLive()} />);
    await ue.click(screen.getByRole('button', { name: 'Add the India starter set' }));
    await toastSays('3 starter components added.');
  });

  it('empty, error with retry, and no access', async () => {
    const { rerender } = render(<ComponentLibraryScreen live={libLive({ rows: [] })} />);
    expect(screen.getByText('No components yet')).toBeInTheDocument();
    const onRetry = vi.fn();
    rerender(<ComponentLibraryScreen live={libLive({ state: 'error', rows: null, onRetry })} />);
    await ue.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ComponentLibraryScreen live={libLive({ state: 'no-access', rows: null })} />);
    expect(screen.getByText(/You don't have access to the component library/)).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ PAY-15 Payslip layout
const layoutLive = (o: Partial<LivePayslipLayout> = {}): LivePayslipLayout => ({ state: 'ready', onRetry: vi.fn(), entities: SETUP_ENTITIES, entityId: 'le-kfpl', onEntity: vi.fn(), data: PAYSLIP_LAYOUTS, onSave: ok(), onPreview: ok(), onActivate: ok(), ...o });
const previewed = { ...PAYSLIP_LAYOUTS, layouts: PAYSLIP_LAYOUTS.layouts.map((l) => (l.status === 'draft' ? { ...l, previewedAt: '2026-10-27T05:00:00Z' } : l)) };

describe('Payslip layout (PAY-15 live)', () => {
  it('keeps the wage-slip particulars shown; Publish before a preview says to preview first', async () => {
    const live = layoutLive();
    render(<PayslipLayoutScreen live={live} />);
    expect(within(screen.getByRole('list', { name: 'Always shown' })).getByText('Net wages paid')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Net wages paid/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Department/ })).toBeEnabled();
    const publish = screen.getByRole('button', { name: 'Publish layout' });
    expect(publish).toBeEnabled();
    await ue.click(publish);
    expect(screen.getByText(/Preview the PDF first/)).toBeInTheDocument();
    expect(live.onActivate).not.toHaveBeenCalled();
  });

  it('a previewed draft is published after the confirm', async () => {
    const live = layoutLive({ data: previewed });
    render(<PayslipLayoutScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Publish layout' }));
    const confirm = await screen.findByRole('dialog', { name: /Publish layout version/ });
    await ue.click(within(confirm).getByRole('button', { name: 'Publish layout' }));
    await waitFor(() => expect(live.onActivate).toHaveBeenCalled());
    await toastSays(/Layout version \d published\./);
  });

  it('saves a second language with English always kept (5b-D2)', async () => {
    const live = layoutLive({ data: { mandatory: ['netPay'], layouts: [] } });
    render(<PayslipLayoutScreen live={live} />);
    await pickOption('Second language', /Tamil/);
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledWith(expect.any(Array), ['en', 'ta']));
  });

  it('Preview with no saved draft, or with unsaved changes, says to save first', async () => {
    const live = layoutLive({ data: { mandatory: ['netPay'], layouts: [] } });
    const { rerender } = render(<PayslipLayoutScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Preview PDF' }));
    expect(screen.getByText('Save the draft first, then preview it.')).toBeInTheDocument();
    rerender(<PayslipLayoutScreen live={layoutLive({ onPreview: live.onPreview })} />);
    await ue.click(screen.getByRole('checkbox', { name: /UAN/ }));
    await ue.click(screen.getByRole('button', { name: 'Preview PDF' }));
    expect(live.onPreview).not.toHaveBeenCalled();
  });

  it('no entity chosen, load error with retry', async () => {
    const { rerender } = render(<PayslipLayoutScreen live={layoutLive({ entityId: null, data: null })} />);
    expect(screen.getByText('Each legal entity has its own payslip layout.')).toBeInTheDocument();
    const onRetry = vi.fn();
    rerender(<PayslipLayoutScreen live={layoutLive({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------------------------ round 2 (founder answer 2)

describe('Compensation history and the stale split (PAY-12, PAY-42 live)', () => {
  const HISTORY = [
    { kind: 'request' as const, changeId: 'ch3', status: 'pending', validFrom: '2026-12-01', validTo: null, annualCtc: '1500000.00', previousCtc: null, reason: 'Promotion', requestedBy: { userId: 'u1', name: 'Lakshmi Rao' }, requestedAt: '2026-10-20T05:00:00.000Z', decidedBy: null, decidedAt: null, template: null },
    { kind: 'salary' as const, changeId: 'ch2', status: 'approved', validFrom: '2026-04-01', validTo: null, annualCtc: '1400000.00', previousCtc: '1250000.00', reason: 'Annual review', requestedBy: { userId: 'u1', name: 'Lakshmi Rao' }, requestedAt: '2026-03-20T05:00:00.000Z', decidedBy: { userId: 'u2', name: 'Meera Iyer' }, decidedAt: '2026-03-28T05:00:00.000Z', template: { name: 'Staff standard', version: 3 } },
  ];
  it('lists the salaries and the waiting request with who asked and approved (positive)', () => {
    render(<CompensationScreen live={compLive({ history: HISTORY })} />);
    const h = screen.getByRole('region', { name: 'Compensation history' });
    expect(h).toHaveTextContent(/revised CTC to ₹14,00,000 from 1 Apr 2026 \(Annual review, \+12%\) · Staff standard v3 · approved by Meera Iyer/);
    expect(h).toHaveTextContent(/asked for CTC ₹15,00,000 from 1 Dec 2026 \(Promotion\): waiting for approval/);
    expect(within(h).getAllByText('Lakshmi Rao').length).toBeGreaterThan(0);
  });

  it('no history yet says so; a failed history read leaves the panel out (negative)', () => {
    const { unmount } = render(<CompensationScreen live={compLive({ history: [] })} />);
    expect(screen.getByText('No earlier salaries.')).toBeInTheDocument();
    unmount();
    render(<CompensationScreen live={compLive({ history: undefined })} />);
    expect(screen.queryByRole('region', { name: 'Compensation history' })).toBeNull();
  });

  const openSplit = async () => {
    const dialog = await openRevise();
    await ue.type(within(dialog).getByRole('textbox', { name: /New annual CTC/ }), '726000');
    await ue.click(within(dialog).getByRole('button', { name: 'Suggest split' }));
    return screen.findByRole('dialog', { name: 'Suggest split' });
  };
  const SUGGESTED = vi.fn(async () => [{ templateVersionId: 'v2', template: 'Staff standard · version 2', monthlyGross: '58700.00', takeHomeBeforeTax: '56700.00', codeWageAddBack: '0.00', madeAt: '2026-10-29T05:00:00.000Z' }]);

  it('a law published after the options were made: Use is stopped, the warning says what changed, Refresh works them out again (negative then positive)', async () => {
    const onSuggest = vi.fn(SUGGESTED);
    const onCheckSplit = vi.fn().mockResolvedValueOnce({ stale: true, changes: [{ statute: 'IN.MW', jurisdiction: 'IN-KA', version: '2026-10', validFrom: '2026-10-01', publishedAt: '2026-10-29T06:00:00.000Z' }] }).mockResolvedValue({ stale: false, changes: [] });
    render(<CompensationScreen live={compLive({ onSuggest, onCheckSplit })} />);
    const split = await openSplit();
    await ue.click(within(split).getByRole('radio', { name: 'Staff standard · version 2' }));
    await ue.click(within(split).getByRole('button', { name: /^Use Staff standard/ }));
    expect(await within(split).findByText('These suggestions are out of date')).toBeInTheDocument();
    expect(within(split).getByText(/changed from 1 Oct 2026 after these options were made/)).toBeInTheDocument();
    expect(onCheckSplit).toHaveBeenCalledWith('2026-10-29T05:00:00.000Z', expect.any(String));
    expect(screen.getByRole('dialog', { name: 'Suggest split' })).toBeInTheDocument();
    await ue.click(within(split).getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Suggest split' })).queryByText('These suggestions are out of date')).toBeNull());
    const fresh = screen.getByRole('dialog', { name: 'Suggest split' });
    await ue.click(within(fresh).getByRole('radio', { name: 'Staff standard · version 2' }));
    await ue.click(within(fresh).getByRole('button', { name: /^Use Staff standard/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Suggest split' })).toBeNull());
  });

  it('fresh options are used straight away after the check (positive)', async () => {
    const onCheckSplit = vi.fn(async () => ({ stale: false, changes: [] }));
    render(<CompensationScreen live={compLive({ onSuggest: SUGGESTED, onCheckSplit })} />);
    const split = await openSplit();
    await ue.click(within(split).getByRole('radio', { name: 'Staff standard · version 2' }));
    await ue.click(within(split).getByRole('button', { name: /^Use Staff standard/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Suggest split' })).toBeNull());
    expect(onCheckSplit).toHaveBeenCalledTimes(1);
  });
});

describe('design samples: no greyed-out buttons (house rules 2 and 3)', () => {
  it('moving the first component up says it is already first; the order stays', async () => {
    const u = userEvent.setup();
    render(<TemplateBuilderScreen />);
    const ups = screen.getAllByRole('button', { name: /^Move .* up$/ });
    const first = ups[0]!.getAttribute('aria-label')!.replace(/^Move | up$/g, '');
    await u.click(ups[0]!);
    expect(screen.getAllByText(`${first} is already first.`)[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Move .* up$/ })[0]).toHaveAccessibleName(`Move ${first} up`);
  });

  it('Revise compensation while the pay details load says to wait; no drawer opens', async () => {
    const u = userEvent.setup();
    render(<CompensationScreen state="loading" />);
    await u.click(screen.getByRole('button', { name: 'Revise compensation' }));
    expect(screen.getAllByText('Wait for the pay details to load.')[0]).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Revise compensation' })).not.toBeInTheDocument();
  });
});

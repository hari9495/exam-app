import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayImportsScreen, PaySetupScreen, PayslipLayoutLiveScreen, parseCsv } from './setup';
import { CompensationLiveScreen, ComponentLibraryLiveScreen, TemplatesLiveScreen } from './structures';
import type { Breakup, PayComponent, SetupEntity } from './types-5b';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ENTITIES: SetupEntity[] = [
  { id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: ['payroll.setup.manage', 'payroll.statutory.setup', 'payroll.template.manage', 'payroll.import.run'] },
];
const comp = (over: Partial<PayComponent>): PayComponent => ({
  id: over.code!,
  code: 'basic',
  name: 'Basic',
  kind: 'earning',
  taxable: true,
  pfWage: true,
  esiWage: true,
  ptWage: true,
  gratuityWage: true,
  bonusWage: true,
  codeWagePart: true,
  codeExclusion: false,
  prorated: true,
  onPayslip: true,
  inCtc: true,
  prorationText: null,
  rounding: 'rupee',
  ledger: null,
  statutory: null,
  status: 'active',
  usedAt: null,
  version: 1,
  ...over,
});
const COMPONENTS = [
  comp({ code: 'basic' }),
  comp({ code: 'special', name: 'Special allowance', pfWage: false }),
  comp({ code: 'pf_employee', name: 'Provident fund (employee)', kind: 'deduction', statutory: 'pf_employee', pfWage: false }),
];
const BREAKUP: Breakup = {
  lines: [
    { code: 'basic', name: 'Basic', kind: 'earning', monthly: '24200.00', annual: '290400.00', citation: null },
    {
      code: 'pf_employee',
      name: 'Provident fund (employee)',
      kind: 'deduction',
      monthly: '1800.00',
      annual: '21600.00',
      citation: { statute: 'IN.PF', jurisdiction: 'IN', version: '2025-v1', verify: true },
    },
  ],
  monthlyGross: '58700.00',
  monthlyCtc: '60500.00',
  annualCtc: '726000.00',
  codeWageAddBack: '0.00',
  esiCovered: false,
  rounds: 1,
  minWage: null,
  verify: true,
  warnings: ['The pay is below the minimum or floor wage for this place (YX-PAY-22).'],
};

describe('Payroll set-up (PAY-16 / CMP-02)', () => {
  it('lists what is missing and saves edited registrations; a legal option is picked with the joined control', async () => {
    const onSaveRegistrations = vi.fn(async () => ({}));
    const onSetOption = vi.fn(async () => ({}));
    render(
      <PaySetupScreen
        state="ready"
        entities={ENTITIES}
        entityId="e1"
        onEntity={() => undefined}
        setup={{
          ready: false,
          steps: [
            { key: 'registrations', done: false },
            { key: 'pay_groups', done: true },
          ],
        }}
        registrations={{
          registrations: [
            { id: 'r1', statute: 'IN.PF', state: null, status: 'off', registrationNo: null, startOn: null, appliedOn: null, responsiblePerson: null, responsibleDesignation: null, version: 1 },
          ],
          completeness: { complete: false, missing: ['IN.TDS: the entity TAN'] },
        }}
        options={[]}
        onSaveRegistrations={onSaveRegistrations}
        onSetOption={onSetOption}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('IN.TDS: the entity TAN')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: 'Registration number' }), 'KNBNG0045123000');
    await ue.click(screen.getByRole('button', { name: 'Save registrations' }));
    await waitFor(() => expect(onSaveRegistrations).toHaveBeenCalledWith([expect.objectContaining({ statute: 'IN.PF', registrationNo: 'KNBNG0045123000' })]));
    expect(screen.getByRole('button', { name: 'Save option' })).toBeDisabled();
    await ue.click(screen.getByRole('radio', { name: 'On actual wage' }));
    await ue.type(screen.getByLabelText('From'), '2026-04-01');
    await ue.click(screen.getByRole('button', { name: 'Save option' }));
    await waitFor(() => expect(onSetOption).toHaveBeenCalledWith('pf.on_actual_wage', 'yes', '2026-04-01'));
  });
});

describe('Component library (PAY-14)', () => {
  it('groups by type; a statutory component changes only its name and payslip display', async () => {
    render(<ComponentLibraryLiveScreen state="ready" rows={COMPONENTS} onSave={vi.fn()} onInstallStarter={vi.fn(async () => ({ componentsAdded: 0 }))} />);
    expect(screen.getByRole('table', { name: 'Earnings' })).toBeInTheDocument();
    const row = within(screen.getByRole('table', { name: 'Deductions' })).getByRole('row', { name: /Provident fund/ });
    await ue.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('switch', { name: /PF wage/ })).toBeDisabled();
    expect(within(dialog).getByRole('switch', { name: /On payslip/ })).toBeEnabled();
  });
});

describe('Salary templates (PAY-13)', () => {
  it('shows a formula problem on leaving the field and saves only after a sample run', async () => {
    const onCheck = vi.fn(async () => ({ ok: false, message: 'process is not a name you can use here.' }));
    const onValidate = vi.fn(async () => ({ sample: BREAKUP, codeWageFlag: false }));
    const onSaveVersion = vi.fn(async () => ({}));
    render(
      <TemplatesLiveScreen
        state="ready"
        entities={ENTITIES}
        components={COMPONENTS}
        today="2026-10-09"
        templates={[{ id: 't1', name: 'Standard', legalEntityId: null, status: 'active', versions: [] }]}
        onCreate={vi.fn()}
        onCheck={onCheck}
        onValidate={onValidate}
        onSaveVersion={onSaveVersion}
      />,
    );
    await ue.click(screen.getByRole('button', { name: 'New version' }));
    const dialog = screen.getByRole('dialog');
    const formula = within(dialog).getAllByRole('textbox', { name: 'Formula' })[0];
    await ue.clear(formula);
    await ue.type(formula, 'process.exit()');
    await ue.tab();
    expect(await within(dialog).findByText('process is not a name you can use here.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save version' })).toBeDisabled();
    await ue.click(within(dialog).getByRole('button', { name: 'Test on the sample' }));
    expect(await within(dialog).findByRole('table', { name: 'Salary breakup' })).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Save version' }));
    await waitFor(() => expect(onSaveVersion).toHaveBeenCalledWith('t1', expect.objectContaining({ balancing: 'special' })));
  });
});

describe('Compensation (PAY-12)', () => {
  it('works out the breakup with its warning and cites the rule; sending needs a reason', async () => {
    const onPreview = vi.fn(async () => BREAKUP);
    const onSubmit = vi.fn(async () => ({ changeId: 'c1', status: 'pending' }));
    render(
      <CompensationLiveScreen
        onSearch={vi.fn(async () => [])}
        employee={{ id: 'p1', name: 'Arjun Kulkarni' }}
        onEmployee={() => undefined}
        state="ready"
        current={null}
        templates={[{ id: 't1', name: 'Standard', legalEntityId: null, status: 'active', versions: [{ id: 'v1', version: 1, validFrom: '2026-04-01', codeWageFlag: false, validatedAt: '' }] }]}
        today="2026-10-09"
        onPreview={onPreview}
        onSubmit={onSubmit}
        onLetter={vi.fn()}
        profile={null}
        onSaveProfile={vi.fn()}
      />,
    );
    await ue.click(screen.getByRole('combobox', { name: 'Template' }));
    await ue.click(await screen.findByRole('option', { name: /Standard · version 1/ }));
    await ue.type(screen.getByRole('textbox', { name: 'Annual CTC' }), '726000');
    await ue.click(screen.getByRole('button', { name: 'Work out the breakup' }));
    expect(await screen.findByText(/below the minimum or floor wage/)).toBeInTheDocument();
    expect(screen.getByText('Provident fund 2025-v1 (verify)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Annual review');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ annualCtc: '726000', templateVersionId: 'v1', reason: 'Annual review' })));
  });
});

describe('Payslip layout (PAY-15)', () => {
  it('keeps the wage-slip particulars shown and asks for a preview before use', () => {
    render(
      <PayslipLayoutLiveScreen
        state="ready"
        entities={ENTITIES}
        entityId="e1"
        onEntity={() => undefined}
        data={{ mandatory: ['netPay'], layouts: [{ id: 'l1', version: 1, blocks: [{ key: 'netPay', shown: true }], languages: ['en'], status: 'draft', previewedAt: null, activatedAt: null }] }}
        onSave={vi.fn()}
        onPreview={vi.fn()}
        onActivate={vi.fn()}
      />,
    );
    expect(within(screen.getByRole('list', { name: 'Always shown' })).getByText('Net wages paid')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Net wages paid/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Department/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use this layout' })).toBeDisabled();
  });

  it('saves a second language with English always kept (5b-D2)', async () => {
    const onSave = vi.fn(async () => ({}));
    render(<PayslipLayoutLiveScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={() => undefined} data={{ mandatory: ['netPay'], layouts: [] }} onSave={onSave} onPreview={vi.fn()} onActivate={vi.fn()} />);
    await ue.click(screen.getByRole('combobox', { name: 'Second language' }));
    await ue.click(await screen.findByRole('option', { name: /Tamil/ }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.any(Array), ['en', 'ta']));
  });
});

describe('Imports (PAY-2.12)', () => {
  it('reads pasted rows; rows with errors block the commit', async () => {
    expect(parseCsv('employeeCode,month,componentCode,amount\nKF-0142,2026-03,basic,24200\n')).toEqual([{ employeeCode: 'KF-0142', month: '2026-03', componentCode: 'basic', amount: '24200' }]);
    const onStage = vi.fn(async () => ({
      id: 'b1',
      kind: 'as_paid_lines' as const,
      rows: 1,
      valid: 0,
      errors: [{ row: 1, message: 'No employee with that code in this legal entity.' }],
      status: 'staged',
    }));
    render(<PayImportsScreen state="ready" entities={ENTITIES} today="2026-10-09" onStage={onStage} onCommit={vi.fn()} onGoLive={vi.fn()} />);
    await ue.click(screen.getByRole('textbox', { name: /Rows/ }));
    await ue.paste('employeeCode,month,componentCode,amount\nNOPE,2026-03,basic,1');
    await ue.click(screen.getByRole('button', { name: 'Check 1 rows' }));
    expect(await screen.findByText(/Row 1: No employee/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit 0 rows' })).toBeDisabled();
  });
});

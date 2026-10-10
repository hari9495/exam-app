import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinerPanel, LetterTemplatesScreen, PortalScreen, ReadyToOnboardScreen } from './joining';
import type { JoinerForms, JoinerPlaces, Letter, LetterTemplates, PortalMe } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PLACES: JoinerPlaces = { entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }], locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }], departments: [], designations: [], employmentTypes: [], managers: [] };
const SECTIONS = { personal: 'done', identity: 'done', bank: 'to_do', emergency: 'to_do', nominees: 'to_do', tax: 'to_do' } as const;
const ANSWERS = { personal: null, identity: { legalName: 'Sneha Pillai', pan: '••••••234F', aadhaar: null, uan: null }, bank: null, emergency: null, nominees: null, tax: null };
const LETTER: Letter = { id: 'l1', title: 'Appointment letter: Sneha Pillai', letterType: 'appointment', personId: 'p1', referenceNo: 'KFPL/APT/2026/000001', verifyCode: 'ABCDEFGHJK', status: 'issued', renderError: null, issuedAt: '2026-10-09T05:00:00Z', personSigns: true, acceptedAt: null, signature: { status: 'open', signedAt: null }, supersededById: null };

describe('Joiner panel (6b)', () => {
  const forms: JoinerForms = { id: 'pb1', status: 'invited', outcome: null, completion: 40, sections: { ...SECTIONS }, answers: ANSWERS, identityAttested: false, bgv: { requested: false, consent: null, checks: [] }, version: 3 };
  const base = { forms, places: PLACES, plan: { departmentId: 'd', designationId: 'g', employmentTypeId: 't' }, canJoin: true, onPlan: vi.fn(), onCancel: vi.fn(), bgv: { onAsk: vi.fn(), onAdd: vi.fn(), onUpdate: vi.fn() } };

  it('Mark joined waits for the joining day and needs the identity check', async () => {
    const onJoin = vi.fn(async () => ({}));
    const { rerender } = render(<JoinerPanel {...base} onJoin={onJoin} today="2026-10-09" joiningOn="2026-10-19" />);
    expect(screen.getByRole('button', { name: 'Mark joined' })).toBeDisabled();
    expect(screen.getByText('••••••234F')).toBeInTheDocument();
    rerender(<JoinerPanel {...base} onJoin={onJoin} today="2026-10-19" joiningOn="2026-10-19" />);
    await ue.click(screen.getByRole('button', { name: 'Mark joined' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Mark joined' })).toBeDisabled();
    await ue.click(within(dialog).getByRole('checkbox', { name: /original ID/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Mark joined' }));
    expect(onJoin).toHaveBeenCalledWith({ identityAttested: true, status: 'probation' });
  });

  it('no background check before consent: HR can only ask for it', () => {
    render(<JoinerPanel {...base} onJoin={vi.fn()} today="2026-10-09" joiningOn="2026-10-19" />);
    expect(screen.getByRole('button', { name: 'Ask for consent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a check' })).toBeNull();
  });
});

describe('Joining portal (T9-01)', () => {
  const ME: PortalMe = { company: 'Kaveri Foods', employer: 'Kaveri Foods Pvt Ltd', name: 'Sneha Pillai', joiningOn: '2026-10-19', location: 'Hosur plant', designation: 'Supervisor', manager: 'Divya', completion: 30, sections: { ...SECTIONS }, answers: ANSWERS, steppedUp: false, documents: [{ typeKey: 'pan_card', name: 'PAN card', status: 'requested', rejectReason: null, personUploads: true }], bgv: null, letters: [LETTER], esignAccepted: false };
  const props = () => ({ state: 'ready' as const, data: ME, onSave: vi.fn(), onStepUpCode: vi.fn(async () => ({})), onStepUp: vi.fn(), onUpload: vi.fn(), onBgv: vi.fn(), onDownload: vi.fn(), onSignCode: vi.fn(async () => ({})), onSign: vi.fn(async () => ({})), onSignOut: vi.fn() });

  it('bank details first ask for a fresh code', async () => {
    const p = props();
    render(<PortalScreen {...p} />);
    const bank = screen.getByText('Bank account').closest('li')!;
    await ue.click(within(bank).getByRole('button', { name: 'Fill in' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByRole('textbox', { name: /Account number/ })).toBeNull();
    await ue.click(within(sheet).getByRole('button', { name: 'Send me a code' }));
    expect(p.onStepUpCode).toHaveBeenCalled();
  });

  it('accepting a letter needs the e-sign agreement, "I accept" and the code', async () => {
    const p = props();
    render(<PortalScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Read and accept' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Accept' })).toBeDisabled();
    await ue.click(within(dialog).getByRole('checkbox', { name: /electronically/ }));
    await ue.click(within(dialog).getByRole('checkbox', { name: /I accept it/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Send me a code' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Code/ }), '123456');
    await ue.click(within(dialog).getByRole('button', { name: 'Accept' }));
    expect(p.onSign).toHaveBeenCalledWith(LETTER, { code: '123456', accept: true, disclosureAccepted: true });
  });
});

describe('Letter templates (PPL-29)', () => {
  const DATA: LetterTemplates = {
    templates: [{ id: 't1', letterType: 'appointment', name: 'Appointment letter', legalEntityId: null, language: 'en', source: 'starter', fields: ['employee_name'], requiresApproval: true, personSigns: true, companyDsc: false, version: 1, status: 'draft', previewViewed: false, createdAt: '2026-10-09T05:00:00Z' }],
    starters: [{ letterType: 'welcome', name: 'Welcome and joining instructions', added: false }],
    fields: [{ key: 'employee_name', label: 'Full name', personal: false, flag: false }],
  };
  it('a draft is used only after its sample preview', async () => {
    const onPreview = vi.fn(async () => ({}));
    render(<LetterTemplatesScreen state="ready" data={DATA} signatories={[]} entities={[]} users={[]} onStarter={vi.fn()} onUpload={vi.fn()} onPreview={onPreview} onWord={vi.fn()} onStatus={vi.fn()} onAddSignatory={vi.fn()} onRemoveSignatory={vi.fn()} />);
    const row = screen.getByRole('row', { name: /Appointment letter/ });
    expect(within(row).getByRole('button', { name: 'Use it' })).toBeDisabled();
    await ue.click(within(row).getByRole('button', { name: 'Sample preview' }));
    expect(onPreview).toHaveBeenCalled();
    expect(screen.getByText('{{employee_name}}')).toBeInTheDocument();
  });
});

describe('Ready to onboard (PPL-12)', () => {
  it('a current employee is sent to job changes, never onboarded', () => {
    render(
      <ReadyToOnboardScreen
        state="ready"
        places={PLACES}
        onCreate={vi.fn()}
        changesHref="/yx/people/changes"
        rows={[
          { offerId: 'o1', name: 'Asha Rao', email: 'a@x.test', phone: null, startDate: '2026-11-01', jobTitle: 'Inspector', personType: 'new' },
          { offerId: 'o2', name: 'Divya R', email: 'd@x.test', phone: null, startDate: '2026-11-01', jobTitle: 'Lead', personType: 'internal' },
        ]}
      />,
    );
    expect(within(screen.getByRole('row', { name: /Asha Rao/ })).getByRole('button', { name: 'Create joiner' })).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Divya R/ })).getByRole('link', { name: 'Job change' })).toHaveAttribute('href', '/yx/people/changes');
  });
});

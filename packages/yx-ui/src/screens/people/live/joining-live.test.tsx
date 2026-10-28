import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinerPanel, PortalScreen } from './joining';
import type { JoinerForms, JoinerPlaces, Letter, PortalMe } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PLACES: JoinerPlaces = { entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }], locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }], departments: [], designations: [], employmentTypes: [], managers: [] };
const SECTIONS = { personal: 'done', identity: 'done', bank: 'to_do', emergency: 'to_do', nominees: 'to_do', tax: 'to_do' } as const;
const ANSWERS = { personal: null, identity: { legalName: 'Sneha Pillai', pan: '••••••234F', aadhaar: null, uan: null }, bank: null, emergency: null, nominees: null, tax: null };
const LETTER: Letter = { id: 'l1', title: 'Appointment letter: Sneha Pillai', letterType: 'appointment', personId: 'p1', referenceNo: 'KFPL/APT/2026/000001', verifyCode: 'ABCDEFGHJK', status: 'issued', renderError: null, issuedAt: '2026-10-09T05:00:00Z', personSigns: true, acceptedAt: null, signature: { status: 'open', signedAt: null }, supersededById: null };

describe('Joiner panel (6b)', () => {
  const forms: JoinerForms = { id: 'pb1', status: 'invited', outcome: null, completion: 40, sections: { ...SECTIONS }, answers: ANSWERS, identityAttested: false, bgv: { requested: false, consent: null, checks: [] }, version: 3 };
  const base = { forms, places: PLACES, plan: { departmentId: 'd', designationId: 'g', employmentTypeId: 't' }, canJoin: true, onPlan: vi.fn(), bgv: { onAsk: vi.fn(), onAdd: vi.fn(), onUpdate: vi.fn() } };

  it('Mark joined waits for the joining day and needs the identity check', async () => {
    const onJoin = vi.fn(async () => ({}));
    const { rerender } = render(<JoinerPanel {...base} onJoin={onJoin} today="2026-10-09" joiningOn="2026-10-19" />);
    expect(screen.getByRole('button', { name: 'Mark joined' })).toBeDisabled();
    expect(screen.getByText('••••••234F')).toBeInTheDocument();
    rerender(<JoinerPanel {...base} onJoin={onJoin} today="2026-10-19" joiningOn="2026-10-19" />);
    await ue.click(screen.getByRole('button', { name: 'Mark joined' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Mark joined' }));
    expect(within(dialog).getByText("Tick that you checked the joiner's original ID today.")).toBeInTheDocument();
    expect(onJoin).not.toHaveBeenCalled();
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
    await ue.click(within(dialog).getByRole('button', { name: 'Accept' }));
    expect(within(dialog).getByText('Tick that you agree to accept letters electronically.')).toBeInTheDocument();
    expect(within(dialog).getByText('Send yourself a code, then enter it.')).toBeInTheDocument();
    expect(p.onSign).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('checkbox', { name: /electronically/ }));
    await ue.click(within(dialog).getByRole('checkbox', { name: /I accept it/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Send me a code' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Code/ }), '123456');
    await ue.click(within(dialog).getByRole('button', { name: 'Accept' }));
    expect(p.onSign).toHaveBeenCalledWith(LETTER, { code: '123456', accept: true, disclosureAccepted: true });
  });
});


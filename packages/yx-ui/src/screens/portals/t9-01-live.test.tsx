import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PreboardingPortalScreen, preItemsOf, type LivePreboardingPortal } from './t9-workforce';
import { ConsentPanel } from './portals-kit';
import type { Letter, PortalMe } from '../people/live/types';

// T9-01 live (ported from the stand-in's joining-live tests, plus the design's new parts): the fresh code before PAN,
// ID and bank, the emailed-code acceptance, the outcome of a closed joining, decline with a reason, nominees per
// scheme, consent withdrawal, loading and "could not load", buttons never disabled.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const LETTER: Letter = { id: 'l1', title: 'Appointment letter: Sneha Pillai', letterType: 'appointment', personId: 'p1', referenceNo: 'KFPL/APT/2026/000001', verifyCode: 'ABCDEFGHJK', status: 'issued', renderError: null, issuedAt: '2026-10-09T05:00:00Z', personSigns: true, acceptedAt: null, signature: { status: 'open', signedAt: null }, supersededById: null };
const ME: PortalMe = {
  company: 'Kaveri Foods',
  employer: 'Kaveri Foods Pvt Ltd',
  name: 'Sneha Pillai',
  joiningOn: '2026-10-19',
  location: 'Hosur plant',
  designation: 'Supervisor',
  manager: 'Divya Raghunathan',
  completion: 30,
  sections: { personal: 'done', identity: 'done', bank: 'to_do', emergency: 'to_do', nominees: 'to_do', tax: 'to_do' },
  answers: { personal: null, identity: { legalName: 'Sneha Pillai', pan: '••••••234F', aadhaar: null, uan: null }, bank: null, emergency: null, nominees: null, tax: null },
  steppedUp: false,
  documents: [
    { typeKey: 'pan_card', name: 'PAN card', status: 'rejected', rejectReason: 'The photo is blurred.', personUploads: true, dueOn: '2026-10-12' },
    { typeKey: 'photo', name: 'Photograph', status: 'requested', rejectReason: null, personUploads: false, dueOn: null },
  ],
  bgv: { notice: 'BGV v1', items: ['What we check: your identity.', 'You can withdraw this consent at any time.'], consented: true, consentedAt: '2026-10-01T05:00:00Z' },
  letters: [LETTER],
  esignAccepted: false,
  tasks: [{ id: 't1', title: 'How things work here', dueOn: '2026-10-20', status: 'to_do' }],
  firstDay: { reportingTime: '09:30', address: 'SIPCOT Phase II, Hosur, 635109', buddy: 'Faisal Khan', batch: null },
  dateMoved: { from: '2026-10-12' },
};
const live = (over: Partial<LivePreboardingPortal> = {}): LivePreboardingPortal => ({
  tenant: 'kaveri',
  state: 'ready',
  me: ME,
  email: 'sneha@mail.test',
  today: '2026-10-09',
  onRetry: vi.fn(),
  onSignOut: vi.fn(),
  onSave: vi.fn(async () => ({})),
  onStepUpCode: vi.fn(async () => ({})),
  onStepUp: vi.fn(async () => ({})),
  onUpload: vi.fn(async () => ({})),
  onBgv: vi.fn(async () => ({})),
  onDownload: vi.fn(async () => ({})),
  onSignCode: vi.fn(async () => ({})),
  onSign: vi.fn(async () => ({})),
  onDecline: vi.fn(async () => ({})),
  ...over,
});
const openItem = async (title: string) => ue.click(within(screen.getByText(title).closest('li')!).getByRole('button', { name: /Open|Fix/ }));

describe('T9-01 joining portal, live', () => {
  it('the checklist: own tasks with due dates, HR-owned documents, the first day, date moved', () => {
    window.location.hash = '';
    render(<PreboardingPortalScreen live={live()} />);
    expect(screen.getByRole('heading', { name: 'Welcome, Sneha' })).toBeInTheDocument();
    expect(screen.getByText('Your joining date moved to 19 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/It was 12 Oct 2026/)).toBeInTheDocument();
    const task = screen.getByText('How things work here').closest('li')!;
    expect(within(task).getByText(/Due 20 Oct 2026/)).toBeInTheDocument();
    expect(within(task).queryByRole('button')).toBeNull();
    expect(within(screen.getByText('Photograph').closest('li')!).getByText('HR completes this')).toBeInTheDocument();
    expect(screen.getByText('PAN card: The photo is blurred.')).toBeInTheDocument();
    expect(screen.getByText('9:30 am · Hosur plant')).toBeInTheDocument();
    expect(screen.getByText('Faisal Khan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue: Emergency contact' })).toBeInTheDocument();
  });

  it('bank details first ask for a fresh code; Verify pressed too early shows the error, never disabled', async () => {
    const p = live();
    render(<PreboardingPortalScreen live={p} />);
    await openItem('Bank account for salary');
    expect(screen.queryByRole('textbox', { name: /Account number/ })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(p.onStepUpCode).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByText('Enter the 6-digit code from your email.')).toBeInTheDocument();
    expect(p.onStepUp).not.toHaveBeenCalled();
  });

  it('PAN and ID too: the code, then the form; a bad PAN is refused before sending', async () => {
    const p = live();
    render(<PreboardingPortalScreen live={p} />);
    await ue.click(within(screen.getByText('PAN and ID').closest('li')!).getByRole('button', { name: 'Change' }));
    await ue.click(screen.getByRole('button', { name: 'Send me a code' }));
    await ue.type(screen.getByRole('textbox', { name: /digit 1/i }), '123456');
    await ue.click(screen.getByRole('button', { name: 'Verify' }));
    expect(p.onStepUp).toHaveBeenCalledWith('123456');
    await ue.type(await screen.findByRole('textbox', { name: /^PAN/ }), 'ABC12');
    await ue.click(screen.getByRole('button', { name: 'Save PAN and ID' }));
    expect(screen.getByRole('textbox', { name: /^PAN/ })).toHaveAttribute('aria-invalid', 'true');
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('accepting a letter needs the e-sign agreement, "I accept" and the code', async () => {
    window.location.hash = 'offer';
    const p = live();
    render(<PreboardingPortalScreen live={p} />);
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
    window.location.hash = '';
  });

  it('documents: the letter download and the camera upload are there', async () => {
    window.location.hash = 'documents';
    const { container } = render(<PreboardingPortalScreen live={live()} />);
    expect(screen.getByText('Upload this again')).toBeInTheDocument();
    expect(container.querySelector('input[type=file]')).toHaveAttribute('capture', 'environment');
    expect(screen.getByText(/HR adds this one/)).toBeInTheDocument();
    window.location.hash = '';
  });

  it('nominees: each scheme must add up to 100 before saving; saved in the per-scheme shape', async () => {
    window.location.hash = '';
    const p = live();
    render(<PreboardingPortalScreen live={p} />);
    await openItem('Family and nominees');
    await ue.click(screen.getByRole('button', { name: 'Save nominees' }));
    expect(screen.getByText('Add at least one nominee.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add nominee' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Add nominee' }));
    expect(within(dialog).getByText('Give the nominee’s name.')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Anil');
    await ue.type(within(dialog).getByRole('textbox', { name: /Relation/ }), 'Father');
    await ue.click(within(dialog).getByRole('button', { name: 'Add nominee' }));
    for (const k of ['PF', 'Gratuity', 'Group insurance']) {
      await ue.clear(screen.getByRole('textbox', { name: `Anil ${k} share` }));
      await ue.type(screen.getByRole('textbox', { name: `Anil ${k} share` }), k === 'PF' ? '90' : '100');
    }
    await ue.click(screen.getByRole('button', { name: 'Save nominees' }));
    expect(screen.getByText(/PF: shares add up to 90%/)).toBeInTheDocument();
    expect(p.onSave).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: 'Anil PF share' }));
    await ue.type(screen.getByRole('textbox', { name: 'Anil PF share' }), '100');
    await ue.click(screen.getByRole('button', { name: 'Save nominees' }));
    expect(p.onSave).toHaveBeenCalledWith('nominees', { nominees: [{ name: 'Anil', relation: 'Father', pf: 100, gratuity: 100, insurance: 100 }] });
    expect((await screen.findAllByText('Nominees saved')).length).toBeGreaterThan(0);
  });

  it('tax: Form 12B with TDS above the gross is refused before sending', async () => {
    const p = live();
    render(<PreboardingPortalScreen live={p} />);
    await openItem('Choose your tax regime');
    await ue.click(screen.getByRole('button', { name: 'Save choice' }));
    expect(screen.getByText('Choose a regime.')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: /New regime/ }));
    await ue.click(screen.getByRole('checkbox', { name: /another employer/ }));
    await ue.type(screen.getByRole('textbox', { name: /Gross salary/ }), '1000');
    await ue.type(screen.getByRole('textbox', { name: /TDS already deducted/ }), '2000');
    await ue.click(screen.getByRole('button', { name: 'Save choice' }));
    expect(screen.getByText(/TDS is more than the gross salary/)).toBeInTheDocument();
    expect(p.onSave).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /TDS already deducted/ }));
    await ue.type(screen.getByRole('textbox', { name: /TDS already deducted/ }), '100');
    await ue.click(screen.getByRole('button', { name: 'Save choice' }));
    expect(p.onSave).toHaveBeenCalledWith('tax', { regime: 'new', previousIncome: { grossSalary: 1000, tds: 100 } });
  });

  it('background check: withdraw consent, with the warning that checks stop', async () => {
    const p = live();
    render(<PreboardingPortalScreen live={p} />);
    await ue.click(within(screen.getByText('Background check consent').closest('li')!).getByRole('button', { name: 'Change' }));
    await ue.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Background checks stop at once/)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Withdraw consent' }));
    expect(p.onBgv).toHaveBeenCalledWith(false, 'BGV v1');
    expect((await screen.findAllByText('Consent withdrawn. Background checks stopped.')).length).toBeGreaterThan(0);
  });

  it('decline: a reason is needed; then the joiner’s reason is sent', async () => {
    const p = live();
    render(<PreboardingPortalScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Decline offer' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Decline offer' }));
    expect(within(dialog).getByText('Choose a reason.')).toBeInTheDocument();
    expect(p.onDecline).not.toHaveBeenCalled();
  });

  it('a closed joining shows only its outcome, with sign out', () => {
    const p = live({ me: { company: 'Kaveri Foods', name: 'Sneha Pillai', closed: { outcome: 'withdrawn', on: '2026-10-08' } } });
    render(<PreboardingPortalScreen live={p} />);
    expect(screen.getByText('This offer has been withdrawn')).toBeInTheDocument();
    expect(screen.getByText(/withdrew the offer on 8 Oct 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline offer' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Checklist' })).toBeNull();
    // In the header band next to the email, not a lone button in the page body.
    expect(screen.getByRole('button', { name: 'Sign out' }).closest('.yx-tportal__bar')).not.toBeNull();
  });

  it('declined and joined read as their own outcome', () => {
    const { rerender } = render(<PreboardingPortalScreen live={live({ me: { company: 'Kaveri Foods', name: 'Sneha', closed: { outcome: 'reneged', on: '2026-10-08' } } })} />);
    expect(screen.getByText('You declined this offer')).toBeInTheDocument();
    rerender(<PreboardingPortalScreen live={live({ me: { company: 'Kaveri Foods', name: 'Sneha', closed: { outcome: 'joined', on: '2026-10-19' } } })} />);
    expect(screen.getByText('Welcome to Kaveri Foods')).toBeInTheDocument();
  });

  it('loading, then "could not load" with Try again', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<PreboardingPortalScreen live={live({ me: null, state: 'loading' })} />);
    expect(screen.getByLabelText('Loading your joining checklist')).toBeInTheDocument();
    rerender(<PreboardingPortalScreen live={live({ me: null, state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('the checklist counts the joiner’s items, not the tasks after joining', () => {
    const items = preItemsOf(ME);
    expect(items.find((i) => i.id === 'task:t1')).toMatchObject({ later: true, section: 'After you join' });
    expect(items.find((i) => i.id === 'doc:photo')).toMatchObject({ hrOwned: true });
    expect(items.find((i) => i.id === 'letter:l1')).toMatchObject({ section: 'E-sign', status: 'todo' });
  });
});

describe('ConsentPanel (kit): async accept', () => {
  it('a refused accept leaves the panel as it was; a done one shows "Consent recorded"; no link when the summary is the notice', async () => {
    const onAccept = vi.fn().mockRejectedValueOnce(new Error('no')).mockResolvedValueOnce({});
    render(<ConsentPanel title="Consent" summary="All of it" purposes={[{ id: 'a', label: 'I agree', required: true }]} noticeLabel="notice" noticeVersion="v1" noticeHref={null} acceptLabel="Give consent" onAccept={onAccept} />);
    expect(screen.queryByRole('link', { name: 'notice' })).toBeNull();
    await ue.click(screen.getByRole('checkbox', { name: /I agree/ }));
    await ue.click(screen.getByRole('button', { name: 'Give consent' }));
    expect(screen.queryByText('Consent recorded')).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Give consent' }));
    expect(await screen.findByText('Consent recorded')).toBeInTheDocument();
  });
});

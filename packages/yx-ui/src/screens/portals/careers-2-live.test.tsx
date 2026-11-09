import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TenantLogo } from '../../components/brand';
import { ID_SPECS } from '../../lib/validators';
import { CareersJobScreen } from './t9-candidate';
import { CandidatePortalScreen } from './t9-09-candidate-pages';
import { JOB_DETAIL } from './t9-cand-data';
import { CAND_BRAND, CAND_PORTAL, KAVERI_LOGO } from './t9-cand-pages-data';
import { ApplicationDrawer } from '../hiring/candidate-application';
import { sampleApplication } from '../hiring/hir-05-candidate.stories';
import { CreateJobSheet } from '../hiring/hiring-plan';

// Careers follow-ups (founder answers 355-359, 362): the international number on jobs outside India, the company logo
// and white-label on the candidate pages, and the pay-history card on the HIR-05 Application drawer. Positive and negative.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 10, 9);
const pdf = () => new File(['%PDF-1.7'], 'asha-rao.pdf', { type: 'application/pdf' });

describe('International number (answer 359)', () => {
  it('the check takes any country code and refuses a number without one or too short', () => {
    expect(ID_SPECS.intlPhone.normalise('+44 7400 123456')).toBe('+447400123456');
    expect(ID_SPECS.intlPhone.validate('+447400123456')).toBeNull();
    expect(ID_SPECS.intlPhone.validate('+971501234567')).toBeNull();
    expect(ID_SPECS.intlPhone.validate('+4412')).toMatch(/country code/);
    expect(ID_SPECS.intlPhone.normalise('')).toBe('');
  });

  const live = (onSubmit: (a: unknown) => Promise<void>, internationalPhone: boolean) => ({
    allJobsHref: '/yx/careers/kaveri',
    apply: { upload: async () => undefined, onSubmit, resumeAccept: ['.pdf'], internationalPhone, notices: [{ purpose: 'application', text: 'We use your details for this job.', required: true }] },
  });
  const fill = async (number: string) => {
    await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
    await ue.type(screen.getByLabelText(/^Email/), 'asha@example.in');
    await ue.type(screen.getByLabelText(/Mobile number/), number);
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, pdf());
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
  };

  it('a job outside India sends a UK number with its country code', async () => {
    const onSubmit = vi.fn(async () => undefined);
    wrap(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={TODAY} live={live(onSubmit, true)} />);
    expect(screen.getByText('Start with + and your country code')).toBeInTheDocument();
    expect(screen.queryByText('+91')).not.toBeInTheDocument();
    await fill('+44 7400 123456');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ phone: '+447400123456' })));
  });

  it('a job outside India refuses a number without the country code; a job in India still asks for 10 digits', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const { unmount } = wrap(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={TODAY} live={live(onSubmit, true)} />);
    await fill('12');
    expect((await screen.findAllByText(/Enter your number with the country code/)).length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
    wrap(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={TODAY} live={live(onSubmit, false)} />);
    expect(screen.getByText('+91')).toBeInTheDocument();
    await fill('447400123456');
    expect((await screen.findAllByText(/10-digit mobile number/)).length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Company logo and white-label (answers 356, 357, 362)', () => {
  it('the kit logo shows the image with the company name as alt text; without one, the name', () => {
    const { unmount } = render(<TenantLogo src={KAVERI_LOGO} name="Kaveri Foods" size="md" />);
    expect(screen.getByRole('img', { name: 'Kaveri Foods logo' })).toHaveAttribute('data-size', 'md');
    unmount();
    render(<TenantLogo src={null} name="Kaveri Foods" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Kaveri Foods')).toBeInTheDocument();
  });

  it('the candidate page shows the logo; white-label hides "Powered by YukthiX", the default keeps it', () => {
    const { unmount } = wrap(<CandidatePortalScreen brand={{ ...CAND_BRAND, logoUrl: KAVERI_LOGO, whiteLabel: true }} state="ready" portal={CAND_PORTAL} />);
    expect(screen.getByRole('img', { name: 'Kaveri Foods logo' })).toBeInTheDocument();
    expect(screen.queryByText(/Powered by/)).not.toBeInTheDocument();
    unmount();
    wrap(<CandidatePortalScreen brand={CAND_BRAND} state="ready" portal={CAND_PORTAL} />);
    expect(screen.queryByRole('img', { name: 'Kaveri Foods logo' })).not.toBeInTheDocument();
    expect(screen.getByText(/Powered by/)).toBeInTheDocument();
  });
});

describe('Pay history on the Application drawer (answer 355)', () => {
  it('shows the pay given when applying to a pay-key holder; nothing when the answer is not sent', () => {
    const { unmount } = wrap(<ApplicationDrawer {...sampleApplication} app={{ ...sampleApplication.app!, currentPay: 960000 }} />);
    expect(screen.getByText('Pay history')).toBeInTheDocument();
    expect(screen.getByText(/9,60,000 a year/)).toBeInTheDocument();
    unmount();
    wrap(<ApplicationDrawer {...sampleApplication} app={{ ...sampleApplication.app!, currentPay: null }} />);
    expect(screen.queryByText('Pay history')).not.toBeInTheDocument();
  });
});

describe('Create job: Apply by and Experience (answer 353)', () => {
  it('both are optional: left empty they are not sent; typed experience is sent', async () => {
    const onCreate = vi.fn(async () => undefined);
    const { unmount } = wrap(<CreateJobSheet open onOpenChange={() => undefined} onCreate={onCreate} />);
    expect(screen.getByText('Applications close after this day')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Job title/), 'QA Chemist');
    await ue.click(screen.getByRole('button', { name: 'Create job' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'QA Chemist', applyBy: undefined, experience: undefined })));
    unmount();
    onCreate.mockClear();
    wrap(<CreateJobSheet open onOpenChange={() => undefined} onCreate={onCreate} />);
    await ue.type(screen.getByLabelText(/Job title/), 'QA Chemist');
    await ue.type(screen.getByLabelText(/^Experience/), '3 to 5 years');
    await ue.click(screen.getByRole('button', { name: 'Create job' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ experience: '3 to 5 years' })));
  });
});

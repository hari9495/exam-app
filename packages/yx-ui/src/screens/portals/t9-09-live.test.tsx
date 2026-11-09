import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CareersJobScreen, CareersSiteScreen } from './t9-candidate';
import { ApplicationStatusScreen, CandidatePortalScreen, InterviewBookingScreen, OfferAcceptScreen } from './t9-09-candidate-pages';
import { CAREERS_CONFIG, CAREERS_JOBS, JOB_DETAIL } from './t9-cand-data';
import { APP_STATUS, CAND_BRAND, CAND_PORTAL, INTERVIEW, INTERVIEW_SELF_BOOK, OFFER } from './t9-cand-pages-data';

// T9-09 live (founder decisions 8 and 10, answers 224 and 242): the careers home and job page with the real apply form,
// and the candidate pages outside the app. Positive and negative paths; buttons are never greyed out.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const TODAY = new Date(2026, 9, 20);
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const pdf = () => new File(['%PDF-1.7'], 'asha-rao.pdf', { type: 'application/pdf' });

describe('T9-09 careers home (live)', () => {
  it('Apply on a job hands the job to the live page; company pages and the assistant show', async () => {
    const onApply = vi.fn();
    const onAsk = vi.fn(async () => 'Yes, rotating shifts.');
    wrap(<CareersSiteScreen config={CAREERS_CONFIG} jobs={CAREERS_JOBS} live={{ onApply, companies: [{ name: 'Kaveri Retail', href: '/r' }], assistant: { onAsk } }} />);
    await ue.click(screen.getByRole('button', { name: 'Apply for QA Chemist' }));
    expect(onApply).toHaveBeenCalledWith(CAREERS_JOBS[0]);
    expect(screen.getByRole('link', { name: 'Kaveri Retail' })).toHaveAttribute('href', '/r');
    // Asked empty: the field says so; then the answer shows.
    await ue.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByText('Type a question first')).toBeInTheDocument();
    expect(onAsk).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText('Your question'), 'Night shifts?');
    await ue.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Yes, rotating shifts.')).toBeInTheDocument();
  });
});

describe('T9-09 job page (live)', () => {
  const live = (onSubmit = vi.fn(async () => undefined), askPay = true) => ({
    allJobsHref: '/yx/careers/kaveri',
    apply: { upload: async () => undefined, onSubmit, resumeAccept: ['.pdf'], askPay, notices: [{ purpose: 'application', text: 'We use your details for this job.', required: true }], honeypot: true },
  });

  it('pressed too early, Send names the first gap and focuses it; then sends consent and the pay answer', async () => {
    const onSubmit = vi.fn(async () => undefined);
    wrap(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={TODAY} live={live(onSubmit)} />);
    expect(screen.queryByText(/We never ask about your current or past salary/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send application' });
    expect(send).toBeEnabled();
    await ue.click(send);
    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
    await ue.type(screen.getByLabelText(/^Email/), 'asha@example.in');
    await ue.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, pdf());
    await ue.type(screen.getByLabelText(/current or last pay/), '520000');
    await ue.click(send);
    expect(await screen.findByText('Tick the box so we can process your application.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
    await ue.click(send);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Asha Rao', email: 'asha@example.in', consents: ['application'], currentPay: 520000, website: undefined })));
    expect(await screen.findByText('Application sent')).toBeInTheDocument();
  });

  it('no pay question where the law bans it; a refusal from the server shows its own words', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('The privacy notice changed while you were applying. Reload the page and read it again.');
    });
    wrap(<CareersJobScreen tenant="Kaveri Foods" detail={JOB_DETAIL} today={TODAY} live={live(onSubmit, false)} />);
    expect(screen.queryByLabelText(/current or last pay/)).not.toBeInTheDocument();
    expect(screen.getByText(/We never ask about your current or past salary for this job/)).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
    await ue.type(screen.getByLabelText(/^Email/), 'asha@example.in');
    await ue.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, pdf());
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText(/The privacy notice changed/)).toBeInTheDocument();
    expect(screen.queryByText('Application sent')).not.toBeInTheDocument();
  });

  it('an on-hold or closed job says it is not accepting applications (answer 242)', () => {
    wrap(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={TODAY} state="closed" live={live()} />);
    expect(screen.getByText('This role is not accepting applications.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See open jobs' })).toHaveAttribute('href', '/yx/careers/kaveri');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('Candidate pages outside the app (decision 10)', () => {
  it('status: the bucket and steps; a bad link says so', () => {
    const { unmount } = wrap(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={APP_STATUS} />);
    expect(screen.getByRole('heading', { name: 'QA Chemist' })).toBeInTheDocument();
    expect(screen.getAllByText('Under review').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'See all your applications' })).toHaveAttribute('href', '#portal');
    unmount();
    wrap(<ApplicationStatusScreen brand={CAND_BRAND} state="not-found" status={null} />);
    expect(screen.getByText('We could not find this application.')).toBeInTheDocument();
  });

  it('portal: saves details (name required), applies in one click, links interviews and offers', async () => {
    const onSaveDetails = vi.fn(async () => undefined);
    const onQuickApply = vi.fn(async () => undefined);
    const live = { onSaveDetails, onUploadResume: vi.fn(async () => undefined), onQuickApply, interviewHref: (t: string) => `/yx/interview/${t}`, offerHref: (t: string) => `/yx/offer/${t}` };
    wrap(<CandidatePortalScreen brand={CAND_BRAND} state="ready" portal={CAND_PORTAL} live={live} />);
    expect(screen.getByRole('link', { name: 'Choose a time' })).toHaveAttribute('href', '/yx/interview/iv1');
    expect(screen.getByRole('link', { name: 'View offer' })).toHaveAttribute('href', '/yx/offer/of1');
    await ue.clear(screen.getByLabelText(/Full name/));
    await ue.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveFocus();
    expect(onSaveDetails).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/Full name/), 'Asha R');
    await ue.click(screen.getByRole('button', { name: 'Save details' }));
    expect(onSaveDetails).toHaveBeenCalledWith({ name: 'Asha R', phone: '9876543210' });
    expect((await screen.findAllByText('Your details are saved')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Apply for Area Sales Officer' }));
    expect(onQuickApply).toHaveBeenCalledWith(CAND_PORTAL.openJobs[0]);
    expect((await screen.findAllByText('You applied for Area Sales Officer')).length).toBeGreaterThan(0);
  });

  it('offer: accept by link; decline asks first; expired cannot be answered; a refusal is shown', async () => {
    const onRespond = vi.fn(async () => undefined);
    const { unmount } = wrap(<OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={OFFER} live={{ onRespond, today: TODAY }} />);
    await ue.click(screen.getByRole('button', { name: 'Decline' }));
    expect(within(screen.getByRole('dialog')).getByText('Decline this offer?')).toBeInTheDocument();
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(onRespond).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Accept offer' }));
    expect(onRespond).toHaveBeenCalledWith('accept');
    expect((await screen.findAllByText('You accepted this offer')).length).toBeGreaterThan(0);
    unmount();
    wrap(<OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={{ ...OFFER, expiresAt: new Date(2026, 9, 1) }} live={{ onRespond, today: TODAY }} />);
    expect(screen.getByText('This offer has expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept offer' })).not.toBeInTheDocument();
  });

  it('interview: Confirm without a time asks for one; confirms a proposed time; asks for another with a note', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const onReschedule = vi.fn(async () => undefined);
    const live = { onConfirm, onBook: vi.fn(async () => undefined), onDecline: vi.fn(async () => undefined), onReschedule };
    const { unmount } = wrap(<InterviewBookingScreen brand={CAND_BRAND} state="ready" interview={INTERVIEW} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Confirm this time' }));
    expect(screen.getByText('Choose one of the times')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    await ue.click(screen.getAllByRole('radio')[1]);
    await ue.click(screen.getByRole('button', { name: 'Confirm this time' }));
    expect(onConfirm).toHaveBeenCalledWith('s2');
    expect((await screen.findAllByText('Your interview is confirmed')).length).toBeGreaterThan(0);
    unmount();
    wrap(<InterviewBookingScreen brand={CAND_BRAND} state="ready" interview={INTERVIEW} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'None of these work' }));
    await ue.click(screen.getByRole('button', { name: 'Ask for another time' }));
    expect(screen.getByText('Say which times suit you')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Times that suit you/), 'Weekday mornings');
    await ue.click(screen.getByRole('button', { name: 'Ask for another time' }));
    expect(onReschedule).toHaveBeenCalledWith('Weekday mornings');
  });

  it('interview self-booking books the chosen free time', async () => {
    const onBook = vi.fn(async () => undefined);
    wrap(<InterviewBookingScreen brand={CAND_BRAND} state="ready" interview={INTERVIEW_SELF_BOOK} live={{ onConfirm: vi.fn(), onBook, onDecline: vi.fn(), onReschedule: vi.fn() }} />);
    expect(screen.getByText('Book a time (45 minutes)')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('radio')[2]);
    await ue.click(screen.getByRole('button', { name: 'Book this time' }));
    expect(onBook).toHaveBeenCalledWith(INTERVIEW_SELF_BOOK.selfBook.available[2]);
  });
});

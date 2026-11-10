import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { CareersHome } from './careers/[orgSlug]/careers-home';
import { JobPage } from './apply/[applyToken]/job-page';
import YxApplicationStatusPage from './application/[statusToken]/page';
import YxCandidatePortalPage from './candidate/[portalToken]/page';
import YxOfferPage from './offer/[token]/page';
import YxInterviewPage from './interview/[token]/page';
import type { CareersPageResponse, PublicJob } from '../../lib/types';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: 'http://api' }));

// T9-09 public careers pages and the candidate pages outside the app (founder decisions 8 and 10), on their designs.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
function mockFetch(routes: Record<string, { status?: number; body: unknown }>) {
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${init?.method ?? 'GET'} ${url.replace('http://api/public', '')}`;
    const r = routes[key];
    if (!r) return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as Response;
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body } as Response;
  }) as unknown as typeof fetch;
}
const push = jest.fn();
beforeEach(() => {
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
});

const CAREERS: CareersPageResponse = {
  orgName: 'Kaveri Foods',
  companyName: null,
  headline: 'Grow with us',
  intro: null,
  assistantEnabled: false,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  accentColor: null,
  textColor: null,
  companies: [],
  config: { theme: 'classic', accent: null, sections: [{ id: 'hero', type: 'hero', title: 'Grow with us', text: '' }, { id: 'jobs', type: 'jobs', title: 'Open jobs' }] },
  jobs: [
    { slug: 'qa-chemist-hosur-abc123', applyToken: 't1', title: 'QA Chemist', location: 'Hosur', employmentType: 'FULL_TIME', department: 'Quality', salaryMin: null, salaryMax: null, salaryCurrency: null, postedAt: '2026-10-01T00:00:00.000Z' },
    { slug: null, applyToken: 't2', title: 'Old job', location: null, employmentType: null, department: null, salaryMin: null, salaryMax: null, salaryCurrency: null, postedAt: '2026-10-01T00:00:00.000Z' },
  ],
};

const JOB: PublicJob = {
  jobTitle: 'QA Chemist',
  jobDescription: 'Test raw materials.',
  location: 'Hosur',
  employmentType: 'FULL_TIME',
  postedAt: '2026-10-01T00:00:00.000Z',
  orgName: 'Kaveri Foods',
  orgLogo: null,
  consents: [{ purpose: 'application', version: 3, text: 'We use your details for this job.', required: true }],
  customFields: [],
  salary: { min: 450000, max: 600000, currency: 'INR', period: 'year' },
  askPayHistory: true,
  careers: { orgSlug: 'kaveri', jobSlug: 'qa-chemist-hosur-abc123' },
};

describe('Careers home (T9-09)', () => {
  it('shows the jobs and Apply opens the job page (or the apply link of an older job)', async () => {
    wrap(<CareersHome orgSlug="kaveri" company={null} data={CAREERS} />);
    expect(screen.getByRole('heading', { name: 'Grow with us' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Apply for QA Chemist' }));
    expect(push).toHaveBeenCalledWith('/yx/careers/kaveri/jobs/qa-chemist-hosur-abc123');
    await ue.click(screen.getByRole('button', { name: 'Apply for Old job' }));
    expect(push).toHaveBeenCalledWith('/yx/apply/t2');
  });

  it('an unknown or switched-off careers page says so', () => {
    wrap(<CareersHome orgSlug="nope" company={null} data={null} />);
    expect(screen.getByText('This careers page is not available.')).toBeInTheDocument();
  });
});

describe('Job page and apply (T9-09, answers 224 and 242)', () => {
  it('sends the application with the notice version shown and the pay answer', async () => {
    mockFetch({ 'POST /jobs/t1/apply': { status: 201, body: { received: true } }, 'POST /jobs/t1/parse-resume': { body: {} } });
    wrap(<JobPage applyToken="t1" job={JOB} address="https://x/yx/careers/kaveri/jobs/qa" allJobsHref="/yx/careers/kaveri" />);
    expect(screen.getByText('₹4,50,000 – ₹6,00,000')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
    await ue.type(screen.getByLabelText(/^Email/), 'asha@example.in');
    await ue.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }));
    await ue.type(screen.getByLabelText(/current or last pay/), '520000');
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText('Application sent')).toBeInTheDocument();
    const sent = calls.find((c) => c.url.endsWith('/apply'))!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ name: 'Asha Rao', email: 'asha@example.in', phone: '9876543210', currentPay: 520000, consents: [{ purpose: 'application', version: 3 }] });
    expect(sent).not.toHaveProperty('website');
  });

  it('the server refusal shows its own words; no job means not accepting applications', async () => {
    mockFetch({ 'POST /jobs/t1/apply': { status: 409, body: { message: 'The privacy notice changed while you were applying. Reload the page and read it again.' } } });
    const { unmount } = wrap(<JobPage applyToken="t1" job={{ ...JOB, askPayHistory: false }} address="a" allJobsHref={null} />);
    expect(screen.queryByLabelText(/current or last pay/)).not.toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
    await ue.type(screen.getByLabelText(/^Email/), 'asha@example.in');
    await ue.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }));
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText(/The privacy notice changed/)).toBeInTheDocument();
    unmount();
    wrap(<JobPage applyToken={null} job={null} address="a" allJobsHref="/yx/careers/kaveri" />);
    expect(screen.getByText('This role is not accepting applications.')).toBeInTheDocument();
  });
});

describe('Candidate pages outside the app (decision 10)', () => {
  it('status page: this application in candidate words; a bad link says so', async () => {
    (useParams as jest.Mock).mockReturnValue({ statusToken: 's1' });
    mockFetch({ 'GET /applications/s1': { body: { jobTitle: 'QA Chemist', location: 'Hosur', appliedAt: '2026-10-02T00:00:00.000Z', statusBucket: 'Under review', orgName: 'Kaveri Foods', careersSlug: 'kaveri', accent: null } } });
    const { unmount } = wrap(<YxApplicationStatusPage />);
    expect(await screen.findByRole('heading', { name: 'QA Chemist' })).toBeInTheDocument();
    expect(screen.getByText('2 Oct 2026')).toBeInTheDocument();
    unmount();
    (useParams as jest.Mock).mockReturnValue({ statusToken: 'bad' });
    wrap(<YxApplicationStatusPage />);
    expect(await screen.findByText('We could not find this application.')).toBeInTheDocument();
  });

  it('candidate page: applications, interview and offer links, one-click apply', async () => {
    (useParams as jest.Mock).mockReturnValue({ portalToken: 'p1' });
    const portal = {
      candidateName: 'Asha Rao',
      candidateEmail: 'asha@example.in',
      candidatePhone: '9876543210',
      resume: { hasResume: true, parseStatus: 'done' },
      orgName: 'Kaveri Foods',
      careersSlug: 'kaveri',
      accent: null,
      applications: [{ jobTitle: 'QA Chemist', stage: 'Under review', rejected: false, appliedAt: '2026-10-02T00:00:00.000Z', statusToken: 's1', interviews: [{ token: 'iv1', status: 'proposed', location: 'Hosur', timeZone: 'Asia/Kolkata', confirmed: false, slots: [] }], offers: [{ token: 'of1', status: 'sent', compensation: 'x', startDate: '2026-12-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z' }] }],
    };
    mockFetch({ 'GET /portal/p1': { body: portal }, 'GET /portal/p1/open-jobs': { body: { hasResume: true, requiresConsent: false, requiredFieldCount: 0, jobs: [{ applyToken: 't9', title: 'Area Sales Officer', location: 'Madurai', employmentType: null }] } }, 'POST /portal/p1/apply/t9': { body: { statusToken: 'x' } } });
    wrap(<YxCandidatePortalPage />);
    expect(await screen.findByRole('link', { name: 'Choose a time' })).toHaveAttribute('href', '/yx/interview/iv1');
    expect(screen.getByRole('link', { name: 'View offer' })).toHaveAttribute('href', '/yx/offer/of1');
    await ue.click(screen.getByRole('button', { name: 'Apply for Area Sales Officer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/portal/p1/apply/t9'))).toBe(true));
  });

  it('offer: accept by link; a second answer is refused with the server words', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: 'of1' });
    mockFetch({ 'GET /offers/of1': { body: { jobTitle: 'QA Chemist', orgName: 'Kaveri Foods', compensation: '₹6,00,000 a year', startDate: '2026-12-01T00:00:00.000Z', expiresAt: '2099-12-01T00:00:00.000Z', status: 'sent', pdfUrl: null } }, 'POST /offers/of1/respond': { status: 409, body: { message: 'This offer is no longer available' } } });
    wrap(<YxOfferPage />);
    await ue.click(await screen.findByRole('button', { name: 'Accept offer' }));
    expect(await screen.findByText('This offer is no longer available')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ action: 'accept' });
  });

  it('offer with e-sign (answer 337): the code is emailed and goes with the acceptance and the disclosure', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: 'of2' });
    mockFetch({
      'GET /offers/of2': { body: { jobTitle: 'QA Chemist', orgName: 'Kaveri Foods', compensation: '₹6,00,000 a year', startDate: '2026-12-01T00:00:00.000Z', expiresAt: '2099-12-01T00:00:00.000Z', status: 'sent', pdfUrl: null, esign: true } },
      'POST /offers/of2/esign-code': { body: { sent: true, to: 'j•••@mail.test' } },
      'POST /offers/of2/respond': { status: 201, body: { status: 'accepted' } },
    });
    wrap(<YxOfferPage />);
    await ue.click(await screen.findByRole('checkbox', { name: /sign this offer electronically/ }));
    await ue.click(screen.getByRole('button', { name: 'Email me a code' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/offers/of2/esign-code'))).toBe(true));
    await ue.type(screen.getByLabelText(/Code from the email/), '654321');
    await ue.click(screen.getByRole('button', { name: 'Sign and accept' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/offers/of2/respond'))?.body).toEqual({ action: 'accept', code: '654321', disclosureAccepted: true }));
  });

  it('interview: confirms the chosen proposed time', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: 'iv1' });
    mockFetch({
      'GET /interviews/iv1': { body: { jobTitle: 'QA Chemist', orgName: 'Kaveri Foods', slots: [{ id: 's1', startsAt: '2026-11-12T04:30:00.000Z', endsAt: '2026-11-12T05:15:00.000Z' }, { id: 's2', startsAt: '2026-11-12T08:30:00.000Z', endsAt: '2026-11-12T09:15:00.000Z' }], location: 'Hosur', timeZone: 'Asia/Kolkata', panel: ['Meera'], status: 'proposed', confirmedSlotId: null } },
      'POST /interviews/iv1/respond': { status: 201, body: { status: 'confirmed' } },
    });
    wrap(<YxInterviewPage />);
    await ue.click((await screen.findAllByRole('radio'))[1]);
    await ue.click(screen.getByRole('button', { name: 'Confirm this time' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ action: 'confirm', slotId: 's2' }));
    expect((await screen.findAllByText('Your interview is confirmed')).length).toBeGreaterThan(0);
  });
});

describe('Careers follow-ups (answers 353, 356, 357, 359, 362)', () => {
  it('a job outside India sends the number with its country code; the closing day and experience show', async () => {
    mockFetch({ 'POST /jobs/t1/apply': { status: 201, body: { received: true } }, 'POST /jobs/t1/parse-resume': { body: {} } });
    wrap(<JobPage applyToken="t1" job={{ ...JOB, askPayHistory: false, internationalPhone: true, applyBy: '2099-12-31', experience: '3 to 5 years' }} address="a" allJobsHref={null} />);
    expect(screen.getByText(/3 to 5 years/)).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
    await ue.type(screen.getByLabelText(/^Email/), 'asha@example.in');
    await ue.type(screen.getByLabelText(/Mobile number/), '+44 7400 123456');
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }));
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText('Application sent')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/apply'))!.body).toMatchObject({ phone: '+447400123456' });
  });

  it('the offer page carries the company logo and hides Powered by for a white-label company; without them it keeps the default', async () => {
    (useParams as jest.Mock).mockReturnValue({ token: 'of3' });
    const offer = { jobTitle: 'QA Chemist', orgName: 'Kaveri Foods', compensation: 'x', startDate: '2026-12-01T00:00:00.000Z', expiresAt: '2099-12-01T00:00:00.000Z', status: 'sent', pdfUrl: null };
    mockFetch({ 'GET /offers/of3': { body: { ...offer, brand: { orgName: 'Kaveri Foods', orgLogo: 'https://blob/logo.png', careersSlug: 'kaveri', accent: '#1F6F4A', whiteLabel: true } } } });
    const { unmount } = wrap(<YxOfferPage />);
    expect(await screen.findByRole('img', { name: 'Kaveri Foods logo' })).toHaveAttribute('src', 'https://blob/logo.png');
    expect(screen.queryByText(/Powered by/)).not.toBeInTheDocument();
    unmount();
    mockFetch({ 'GET /offers/of3': { body: offer } });
    wrap(<YxOfferPage />);
    expect(await screen.findByRole('button', { name: 'Accept offer' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Kaveri Foods logo' })).not.toBeInTheDocument();
    expect(screen.getByText(/Powered by/)).toBeInTheDocument();
  });
});

describe('New York City notice (answer 474)', () => {
  it('a NYC job shows the notice; "Assess me another way" goes with the application; no notice elsewhere', async () => {
    mockFetch({ 'POST /jobs/t1/apply': { status: 201, body: { received: true } }, 'POST /jobs/t1/parse-resume': { body: {} } });
    const { unmount } = wrap(<JobPage applyToken="t1" job={{ ...JOB, askPayHistory: false, internationalPhone: true, nycNotice: { assesses: ['An AI draft of the interview scorecard'], businessDays: 10 } }} address="a" allJobsHref={null} />);
    expect(screen.getByRole('region', { name: 'Automated tool notice' })).toHaveTextContent('at least 10 business days before');
    await ue.type(screen.getByLabelText(/Full name/), 'Mia Chen');
    await ue.type(screen.getByLabelText(/^Email/), 'mia@example.com');
    await ue.type(screen.getByLabelText(/Mobile number/), '+1 212 555 0123');
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }));
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
    await ue.click(screen.getByRole('checkbox', { name: 'Assess me another way (no automated tool)' }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText('Application sent')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/apply'))!.body).toMatchObject({ alternativeProcess: true });
    unmount();
    wrap(<JobPage applyToken="t1" job={{ ...JOB, nycNotice: null }} address="a" allJobsHref={null} />);
    expect(screen.queryByRole('region', { name: 'Automated tool notice' })).not.toBeInTheDocument();
  });
});

describe('New York City notice on the status page (answer 502)', () => {
  it('the candidate asks for another process; the page then says when; no notice: no button', async () => {
    (useParams as jest.Mock).mockReturnValue({ statusToken: 's9' });
    const base = { jobTitle: 'QA Engineer', location: 'New York office', appliedAt: '2026-11-02T00:00:00.000Z', statusBucket: 'Application received', orgName: 'Kaveri Foods', careersSlug: null, accent: null };
    mockFetch({
      'GET /applications/s9': { body: { ...base, toolNotice: { assesses: ['An AI draft of the interview scorecard'], businessDays: 10, requestedAt: null } } },
      'POST /applications/s9/alternative-process': { body: { ...base, toolNotice: { assesses: ['An AI draft of the interview scorecard'], businessDays: 10, requestedAt: '2026-11-12T05:00:00.000Z' } } },
    });
    const { unmount } = wrap(<YxApplicationStatusPage />);
    await ue.click(await screen.findByRole('button', { name: 'Assess me another way' }));
    expect(await screen.findByText('You asked for another process')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/applications/s9/alternative-process'))).toBe(true);
    unmount();
    mockFetch({ 'GET /applications/s9': { body: { ...base, toolNotice: null } } });
    wrap(<YxApplicationStatusPage />);
    expect(await screen.findByText('QA Engineer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assess me another way' })).not.toBeInTheDocument();
  });
});

describe('WhatsApp tick (answers 561 and 691)', () => {
  const portal = { candidateName: 'Asha Rao', candidateEmail: 'asha@example.in', candidatePhone: '9876543210', resume: { hasResume: true, parseStatus: 'done' }, orgName: 'Kaveri Foods', careersSlug: null, accent: null, applications: [], whatsappOptedIn: false };
  const open = { hasResume: true, requiresConsent: false, requiredFieldCount: 0, jobs: [] };

  it('candidate page: ticking posts optIn true and shows it on; a refusal shows the reason', async () => {
    (useParams as jest.Mock).mockReturnValue({ portalToken: 'p2' });
    mockFetch({ 'GET /portal/p2': { body: portal }, 'GET /portal/p2/open-jobs': { body: open }, 'POST /portal/p2/whatsapp': { body: { whatsappOptedIn: true } } });
    const { unmount } = wrap(<YxCandidatePortalPage />);
    await ue.click(await screen.findByRole('checkbox', { name: 'Message me on WhatsApp about jobs' }));
    expect(await screen.findByText('WhatsApp messages on')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/portal/p2/whatsapp'))?.body).toEqual({ optIn: true });
    expect(screen.getByRole('checkbox', { name: 'Message me on WhatsApp about jobs' })).toBeChecked();
    unmount();
    mockFetch({ 'GET /portal/p2': { body: portal }, 'GET /portal/p2/open-jobs': { body: open }, 'POST /portal/p2/whatsapp': { status: 409, body: { message: 'Add a mobile number first: we have none to message on WhatsApp.' } } });
    wrap(<YxCandidatePortalPage />);
    await ue.click(await screen.findByRole('checkbox', { name: 'Message me on WhatsApp about jobs' }));
    expect(await screen.findByText(/Add a mobile number first/)).toBeInTheDocument();
  });

  it('candidate page with no mobile number: no tick, it says why', async () => {
    (useParams as jest.Mock).mockReturnValue({ portalToken: 'p3' });
    mockFetch({ 'GET /portal/p3': { body: { ...portal, candidatePhone: null } }, 'GET /portal/p3/open-jobs': { body: open } });
    wrap(<YxCandidatePortalPage />);
    expect(await screen.findByText(/no mobile number for you/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });
});

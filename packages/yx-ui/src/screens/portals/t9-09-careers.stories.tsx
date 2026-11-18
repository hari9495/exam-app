import type { Meta, StoryObj } from '@storybook/react-vite';
import { CareersJobScreen, CareersSiteScreen } from './t9-candidate';
import { ApplicationStatusScreen, CandidatePortalScreen, InterviewBookingScreen, OfferAcceptScreen } from './t9-09-candidate-pages';
import { CAREERS_CONFIG, CAREERS_JOBS, JOB_DETAIL } from './t9-cand-data';
import { APP_STATUS, CAND_BRAND, CAND_PORTAL, INTERVIEW, INTERVIEW_SELF_BOOK, KAVERI_LOGO, OFFER } from './t9-cand-pages-data';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-09 · Careers site', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };
const later = () => new Promise<void>((r) => setTimeout(r, 400));
// The apply form as the live job page fills it: the company's notices, the pay question where the law allows, its own question.
const APPLY = {
  upload: () => Promise.resolve(),
  onSubmit: later,
  resumeAccept: ['.pdf'],
  askPay: true,
  questions: [{ id: 'q1', label: 'Notice period (days)', type: 'number' as const, required: true }],
  notices: [{ purpose: 'application', text: 'Kaveri Foods uses your details only to consider you for this job and keeps them for 12 months.', required: true }],
  honeypot: true,
};

export const Home: S = { name: 'Careers home', render: () => <CareersSiteScreen config={CAREERS_CONFIG} jobs={CAREERS_JOBS} /> };
export const HomePhone: S = { name: 'Careers home · phone', globals: phone, render: () => <CareersSiteScreen config={CAREERS_CONFIG} jobs={CAREERS_JOBS} /> };
export const WhiteLabel: S = { name: 'Careers home · white-label', render: () => <CareersSiteScreen config={{ ...CAREERS_CONFIG, whiteLabel: true }} jobs={CAREERS_JOBS} /> };
export const NoJobs: S = { name: 'Careers home · no open jobs', render: () => <CareersSiteScreen config={CAREERS_CONFIG} jobs={[]} /> };
export const Job: S = { name: 'Job page with pay range and apply', render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} /> };
export const JobPhone: S = { name: 'Job page · phone', globals: phone, render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} /> };
export const Applied: S = { name: 'Job page · application sent', render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} state="sent" /> };
export const Closed: S = { name: 'Job page · closed', render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} state="closed" /> };
// Answer 224: the pay-history question on the apply page, only where the job asks and its location's law allows.
export const JobPayQuestion: S = {
  name: 'Job page · pay question where the law allows',
  render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={{ ...JOB_DETAIL, closesOn: null, experience: null }} today={TODAY} live={{ allJobsHref: '#careers', apply: APPLY }} />,
};
// Answer 242: an on-hold (or closed) job's apply link.
export const JobOnHold: S = {
  name: 'Job page · not accepting applications (on hold)',
  render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={{ ...JOB_DETAIL, closesOn: null }} today={TODAY} state="closed" live={{ allJobsHref: '#careers', apply: APPLY }} />,
};
// Careers answer 359: a job placed outside India takes a number with any country code.
export const JobInternationalPhone: S = {
  name: 'Job page · outside India (international number)',
  render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={{ ...JOB_DETAIL, job: { ...JOB_DETAIL.job, location: 'Dubai office' }, closesOn: null }} today={TODAY} live={{ allJobsHref: '#careers', apply: { ...APPLY, askPay: false, internationalPhone: true } }} />,
};
// Answer 474: a New York City job tells candidates about the automated tool; the form offers another process.
export const JobNycNotice: S = {
  name: 'Job page · New York City automated tool notice',
  render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={{ ...JOB_DETAIL, job: { ...JOB_DETAIL.job, location: 'New York office' }, closesOn: null }} today={TODAY} live={{ allJobsHref: '#careers', apply: { ...APPLY, askPay: false, internationalPhone: true, toolNotice: { assesses: ['An AI draft of the interview scorecard, from the interview transcript (a person on the panel checks and submits it)'], businessDays: 10 } } }} />,
};
// Careers answer 357/362: the candidate pages carry the company's logo and colour.
export const PortalWithLogo: S = { name: 'Candidate page · company logo', render: () => <CandidatePortalScreen brand={{ ...CAND_BRAND, logoUrl: KAVERI_LOGO }} state="ready" portal={CAND_PORTAL} /> };

// Decision 10: the candidate pages outside the app, in the T9-09 portal style.
export const Status: S = { name: 'Application status', render: () => <ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={APP_STATUS} /> };
export const StatusPhone: S = { name: 'Application status · phone', globals: phone, render: () => <ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={APP_STATUS} /> };
export const StatusDecision: S = { name: 'Application status · decision made', render: () => <ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, bucket: 'A decision has been made; the team will follow up' }} /> };
// Answer 502: a New York City candidate added by a recruiter opens the link in the notice email.
export const StatusNycNotice: S = {
  name: 'Application status · New York City notice, ask for another process',
  render: () => <ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, location: 'New York office', toolNotice: { assesses: ['An AI draft of the interview scorecard, from the interview transcript (a person on the panel checks and submits it)'], businessDays: 10, requestedAt: null } }} onAskAlternative={async () => {}} />,
};
// Answer 561: the candidate ticks or unticks WhatsApp messages about jobs on their status page.
export const StatusWhatsapp: S = { name: 'Application status · Message me on WhatsApp about jobs', render: () => <ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, whatsapp: { optedIn: true, hasPhone: true } }} onWhatsapp={async () => {}} /> };
export const StatusNotFound: S = { name: 'Application status · link not valid', render: () => <ApplicationStatusScreen brand={CAND_BRAND} state="not-found" status={null} /> };
export const Portal: S = { name: 'Candidate page', render: () => <CandidatePortalScreen brand={CAND_BRAND} state="ready" portal={CAND_PORTAL} /> };
// Answer 691: the WhatsApp tick on the candidate page, for all their applications.
export const PortalWhatsapp: S = { name: 'Candidate page · Message me on WhatsApp about jobs', render: () => <CandidatePortalScreen brand={CAND_BRAND} state="ready" portal={{ ...CAND_PORTAL, whatsappOptedIn: false }} /> };
export const PortalPhone: S = { name: 'Candidate page · phone', globals: phone, render: () => <CandidatePortalScreen brand={CAND_BRAND} state="ready" portal={CAND_PORTAL} /> };
export const PortalEmpty: S = { name: 'Candidate page · no applications, full form to apply', render: () => <CandidatePortalScreen brand={CAND_BRAND} state="ready" portal={{ ...CAND_PORTAL, hasResume: false, oneClick: false, applications: [] }} /> };
export const Offer: S = { name: 'Offer to accept', render: () => <OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={OFFER} /> };
export const OfferPhone: S = { name: 'Offer to accept · phone', globals: phone, render: () => <OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={OFFER} /> };
export const OfferSign: S = { name: 'Offer · sign with a code (e-sign on)', render: () => <OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={{ ...OFFER, esign: true }} live={{ today: new Date(2026, 10, 9), onRespond: async () => undefined, onSendCode: async () => ({ to: 'j•••@gmail.com' }) }} /> };
export const OfferLetterSign: S = { name: 'Offer · issued company letter, sign with a code', render: () => <OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={{ ...OFFER, esign: true, letter: { referenceNo: 'KF/OFR/2026/000012' } }} live={{ today: new Date(2026, 10, 9), onRespond: async () => undefined, onSendCode: async () => ({ to: 'j•••@gmail.com' }) }} /> };
export const OfferAccepted: S = { name: 'Offer · accepted', render: () => <OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={{ ...OFFER, status: 'accepted' }} /> };
export const OfferExpired: S = { name: 'Offer · expired', render: () => <OfferAcceptScreen brand={CAND_BRAND} state="ready" offer={{ ...OFFER, expiresAt: new Date(2026, 9, 1) }} /> };
export const Interview: S = { name: 'Interview · choose a proposed time', render: () => <InterviewBookingScreen brand={CAND_BRAND} state="ready" interview={INTERVIEW} /> };
export const InterviewPhone: S = { name: 'Interview · phone', globals: phone, render: () => <InterviewBookingScreen brand={CAND_BRAND} state="ready" interview={INTERVIEW} /> };
export const InterviewSelfBook: S = { name: 'Interview · book a free time', render: () => <InterviewBookingScreen brand={CAND_BRAND} state="ready" interview={INTERVIEW_SELF_BOOK} /> };
export const InterviewConfirmed: S = { name: 'Interview · confirmed', render: () => <InterviewBookingScreen brand={CAND_BRAND} state="ready" interview={{ ...INTERVIEW, status: 'confirmed', confirmedSlotId: 's2' }} /> };

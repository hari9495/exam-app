import '../components/print.css';
import '../components/careers.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { EmailLayout, LetterDocument, PayslipDocument, numberToIndianWords, type Letterhead, type PayslipData } from '../components/print';
import { formatINR } from '../lib/format';

const meta: Meta = { title: 'Surfaces/Print, PDF and email', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

// Tenant logo slot: a simple bordered wordmark stands in for the tenant's uploaded logo.
const TenantLogo = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 18 }}>
    <span aria-hidden="true" style={{ display: 'inline-flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', border: '2px solid currentColor', borderRadius: 6 }}>
      N
    </span>
    Nilgiri Foods
  </span>
);

const COMPANY: Letterhead = {
  name: 'Nilgiri Foods Private Limited',
  address: ['SIDCO Industrial Estate, Kurichi', 'Coimbatore 641021', 'Tamil Nadu'],
  registration: 'CIN U15410TZ1986PTC001842 · GSTIN 33AABCN1234F1Z5',
  logo: <TenantLogo />,
};

const PAYSLIP: PayslipData = {
  company: COMPANY,
  period: 'September 2026',
  payDate: d(2026, 9, 30),
  employee: {
    name: 'Lakshmi Venkatesan',
    code: 'NF-00412',
    designation: 'Quality lead',
    department: 'Quality',
    location: 'Coimbatore plant',
    joinedOn: d(2015, 6, 1),
    pan: 'AKPPV4821K',
    uan: '100912345678',
    bankName: 'Canara Bank',
    accountNumber: '0874101045213',
  },
  paidDays: 30,
  lopDays: 0,
  earnings: [
    { label: 'Basic', amount: 56000, ytd: 336000 },
    { label: 'House rent allowance', amount: 22400, ytd: 134400 },
    { label: 'Special allowance', amount: 31650, ytd: 189900 },
    { label: 'Conveyance allowance', amount: 1600, ytd: 9600 },
    { label: 'Night shift allowance', amount: 2800, ytd: 14000 },
  ],
  deductions: [
    { label: 'Provident fund (employee)', amount: 1800, ytd: 10800 },
    { label: 'Professional tax', amount: 208, ytd: 1250 },
    { label: 'Income tax (TDS)', amount: 0, ytd: 0 },
    { label: 'Canteen', amount: 392, ytd: 2352 },
  ],
};

export const PayslipA4: S = { name: 'Payslip (A4)', render: () => <PayslipDocument data={PAYSLIP} /> };

export const PayslipWithLop: S = {
  name: 'Payslip with loss of pay and TDS',
  render: () => (
    <PayslipDocument
      data={{
        ...PAYSLIP,
        employee: { ...PAYSLIP.employee, name: 'Arjun Kulkarni', code: 'NF-01127', designation: 'Area sales manager', department: 'Sales', location: 'Kochi' },
        paidDays: 28,
        lopDays: 2,
        earnings: [
          { label: 'Basic', amount: 71867, ytd: 446667 },
          { label: 'House rent allowance', amount: 35933, ytd: 223333 },
          { label: 'Special allowance', amount: 48200, ytd: 300400 },
          { label: 'Sales incentive (Q2)', amount: 42500, ytd: 42500 },
        ],
        deductions: [
          { label: 'Provident fund (employee)', amount: 1800, ytd: 10800 },
          { label: 'Professional tax', amount: 208, ytd: 1250 },
          { label: 'Income tax (TDS)', amount: 24650, ytd: 118400 },
        ],
      }}
    />
  ),
};

const OFFER_BODY = `
<p>Dear Meera,</p>
<p>We are pleased to offer you the position of <strong>Accounts executive</strong> in the Finance team at our Coimbatore head office, reporting to Sana Nizami, Finance manager.</p>
<p>Your annual cost to company will be <strong>${formatINR(540000)}</strong> (${numberToIndianWords(540000)}). The salary breakup is in Annexure A.</p>
<ul>
  <li>Date of joining: on or before 3 November 2026</li>
  <li>Probation: 6 months</li>
  <li>Working days: Monday to Saturday, 9:00 am to 5:30 pm, with the second and fourth Saturdays off</li>
</ul>
<p>Please sign and return this letter by 10 October 2026 to accept the offer. Bring the documents listed in the joining checklist on your first day.</p>
<p>We look forward to working with you.</p>`;

export const OfferLetter: S = {
  render: () => (
    <LetterDocument
      data={{
        company: COMPANY,
        date: d(2026, 9, 29),
        reference: 'NF/HR/OFF/2026/0412',
        recipient: { name: 'Meera Iyer', lines: ['14, Bharathi Street, Ram Nagar', 'Coimbatore 641009'] },
        subject: 'Offer of employment',
        bodyHtml: OFFER_BODY,
        signatory: { name: 'Priya Raghavan', designation: 'Head of People' },
        annexures: [
          <div key="a" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Annexure A — Salary breakup</p>
            <div className="yx-print__body">
              <table>
                <thead>
                  <tr><th>Component</th><th>Monthly</th><th>Annual</th></tr>
                </thead>
                <tbody>
                  {([['Basic', 22500], ['House rent allowance', 9000], ['Special allowance', 11700], ['Employer PF', 1800]] as const).map(([k, m]) => (
                    <tr key={k}><td>{k}</td><td>{formatINR(m)}</td><td>{formatINR(m * 12)}</td></tr>
                  ))}
                  <tr><th>Cost to company</th><th>{formatINR(45000)}</th><th>{formatINR(540000)}</th></tr>
                </tbody>
              </table>
            </div>
          </div>,
        ],
      }}
    />
  ),
};

/* ---------------- Emails ---------------- */

const EMAIL_ADDRESS = 'Nilgiri Foods Private Limited, SIDCO Industrial Estate, Kurichi, Coimbatore 641021';
const Wrap = ({ children }: { children: ReactNode }) => <div style={{ padding: 24 }}>{children}</div>;

const LeaveApproved = () => (
  <EmailLayout
    logo={<TenantLogo />}
    preheader="Sana Nizami approved 3 days of casual leave"
    heading="Your leave is approved"
    action={{ label: 'View leave', href: 'https://nilgirifoods.yukthix.example/leave/LV-2026-0931' }}
    address={EMAIL_ADDRESS}
    preferencesHref="#preferences"
  >
    <p>Hi Arjun,</p>
    <p>Sana Nizami approved your casual leave.</p>
    <dl>
      <dt>Dates</dt>
      <dd>13 Oct 2026 to 15 Oct 2026</dd>
      <dt>Days</dt>
      <dd>3</dd>
      <dt>Balance after this</dt>
      <dd>4 days of casual leave</dd>
    </dl>
  </EmailLayout>
);

const PayslipReady = () => (
  <EmailLayout
    logo={<TenantLogo />}
    preheader="Your September 2026 payslip is ready"
    heading="Your September payslip is ready"
    action={{ label: 'View payslip', href: 'https://nilgirifoods.yukthix.example/payslips/2026-09' }}
    address={EMAIL_ADDRESS}
    preferencesHref="#preferences"
  >
    <p>Hi Lakshmi,</p>
    <p>{formatINR(110152)} was credited to your Canara Bank account ending 5213 on 30 Sep 2026.</p>
    <p>For your security, the payslip is not attached. Sign in to view or download it.</p>
  </EmailLayout>
);

const InterviewInvite = () => (
  <EmailLayout
    logo={<TenantLogo />}
    preheader="Interview for Accounts executive on 7 Oct 2026, 11:00 am"
    heading="Interview for Accounts executive"
    action={{ label: 'Confirm your slot', href: 'https://careers.nilgirifoods.example/i/7Q2M9K' }}
    address={EMAIL_ADDRESS}
    unsubscribeHref="#unsubscribe"
    preferencesHref="#preferences"
  >
    <p>Hi Meera,</p>
    <p>Thank you for applying to Nilgiri Foods. We would like to meet you.</p>
    <dl>
      <dt>Date</dt>
      <dd>7 Oct 2026</dd>
      <dt>Time</dt>
      <dd>11:00 am to 11:45 am</dd>
      <dt>Where</dt>
      <dd>Head office, SIDCO Industrial Estate, Kurichi, Coimbatore</dd>
      <dt>With</dt>
      <dd>Sana Nizami, Finance manager</dd>
    </dl>
    <p>If this time does not work, choose another slot from the same link.</p>
  </EmailLayout>
);

export const EmailLeaveApproved: S = { name: 'Email — leave approved', render: () => <Wrap><LeaveApproved /></Wrap> };
export const EmailPayslipReady: S = { name: 'Email — payslip ready', render: () => <Wrap><PayslipReady /></Wrap> };
export const EmailInterviewInvite: S = { name: 'Email — interview invite', render: () => <Wrap><InterviewInvite /></Wrap> };
export const EmailDark: S = { name: 'Email — dark mode', globals: { theme: 'dark' }, render: () => <Wrap><InterviewInvite /></Wrap> };
export const EmailMobile: S = {
  name: 'Email — mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <PayslipReady />,
};

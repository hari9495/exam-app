import { Children, createContext, useContext, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { formatDate, formatINR } from '../lib/format';
import { Button } from './button';

/* ================================================================== */
/* Amount in words (Indian system)                                     */
/* ================================================================== */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(belowHundred(r));
  return parts.join(' ');
}

/** Whole number in Indian words, lower case: 11245000 -> "one crore twelve lakh forty-five thousand". */
function integerWords(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerWords(crore)} crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Rupee amount in words for payslips and letters, Indian system (lakh, crore), sentence case:
 * 112450 -> "Rupees One lakh twelve thousand four hundred fifty only";
 * 1234.5 -> "Rupees One thousand two hundred thirty-four and fifty paise only";
 * 0.75 -> "Seventy-five paise only". Negative amounts are prefixed with "Minus".
 */
export function numberToIndianWords(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const totalPaise = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  let text: string;
  if (rupees === 0 && paise > 0) text = `${sentence(belowHundred(paise))} paise only`;
  else {
    text = `Rupees ${sentence(integerWords(rupees))}`;
    if (paise) text += ` and ${belowHundred(paise)} paise`;
    text += ' only';
  }
  return amount < 0 && totalPaise > 0 ? `Minus ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

/** Shows only the last `visible` characters: maskTail("ABCDE1234F") -> "XXXXXX234F". Keeps spaces out. */
export function maskTail(value: string, visible = 4): string {
  const v = value.replace(/\s+/g, '');
  if (v.length <= visible) return v;
  return 'X'.repeat(v.length - visible) + v.slice(-visible);
}

/* ================================================================== */
/* A4 print layout                                                     */
/* ================================================================== */

const PrintCtx = createContext<{ total: number; header?: ReactNode; footer?: ReactNode }>({ total: 1 });

export interface PrintLayoutProps {
  /** One <PrintPage> per A4 sheet. */
  children: ReactNode;
  /** Letterhead / running header on every page: tenant logo slot, company name and address (§40). */
  header?: ReactNode;
  /** Running footer text, left of the page number, e.g. "Computer-generated payslip. No signature needed." */
  footer?: ReactNode;
  className?: string;
  /** Accessible name of the document, e.g. "Payslip for September 2026". */
  label: string;
}

/**
 * A4 document (210 × 297 mm) for payslips, letters and reports: IBM Plex, black on white, company logo,
 * page numbers from CSS counters, no UI chrome. On screen the sheets are shown one under another;
 * `@media print` removes the sheet frame and breaks after each page.
 */
export function PrintLayout({ children, header, footer, className, label }: PrintLayoutProps) {
  const total = Children.toArray(children).filter(Boolean).length;
  return (
    <PrintCtx.Provider value={{ total, header, footer }}>
      <div className={cx('yx-print', className)} role="document" aria-label={label} tabIndex={0}>
        {children}
      </div>
    </PrintCtx.Provider>
  );
}

/** One A4 sheet with the running header and footer; the page number comes from a CSS counter. */
export function PrintPage({ children }: { children: ReactNode }) {
  const { total, header, footer } = useContext(PrintCtx);
  return (
    <section className="yx-print__page">
      {header && <header className="yx-print__header">{header}</header>}
      <div className="yx-print__content">{children}</div>
      <footer className="yx-print__footer">
        <span className="yx-print__footer-text">{footer}</span>
        <span className="yx-print__pageno" data-total={total} />
      </footer>
    </section>
  );
}

export interface Letterhead {
  name: string;
  /** Lines of the registered address. */
  address: string[];
  /** Tenant logo slot (img / svg). Letters and payslips carry the tenant brand only (Brand Part 5). */
  logo?: ReactNode;
  /** CIN, GSTIN or similar, shown small. */
  registration?: string;
}

export function LetterheadBlock({ company }: { company: Letterhead }) {
  return (
    <div className="yx-print__letterhead">
      {company.logo && <div className="yx-print__logo">{company.logo}</div>}
      <div className="yx-print__company">
        <p className="yx-print__company-name">{company.name}</p>
        <p className="yx-print__company-address">{company.address.join(', ')}</p>
        {company.registration && <p className="yx-print__company-address">{company.registration}</p>}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Payslip                                                             */
/* ================================================================== */

export interface PayslipLine {
  label: string;
  amount: number;
  /** Financial-year-to-date total. */
  ytd: number;
}

export interface PayslipData {
  company: Letterhead;
  /** "September 2026" */
  period: string;
  payDate: Date;
  employee: {
    name: string;
    code: string;
    designation: string;
    department: string;
    location: string;
    joinedOn: Date;
    /** Full PAN; printed masked. */
    pan: string;
    /** Full UAN; printed masked. */
    uan: string;
    bankName: string;
    /** Full account number; printed masked. */
    accountNumber: string;
    /** ESI insurance number when covered. Above the ESI ceiling the payslip says "Not covered". */
    esiNumber?: string;
  };
  paidDays: number;
  lopDays: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  /** Employer contributions (not in net), printed in their own box when the layout asks for it. */
  employer?: { label: string; amount: number }[];
  /** Tax summary for the year, when the layout asks for it. */
  tax?: { regime: string; projectedIncome: number; projectedTax: number; deductedToDate: number };
  /** Leave balances, when the layout asks for it. */
  leave?: { label: string; balance: number }[];
}

/** Payslip layout switches (Settings › Payslip layout). Every section is optional; the default is the standard payslip. */
export interface PayslipOptions {
  /** Year-to-date column (default true). Off leaves the column out; it never prints ₹0. */
  showYtd?: boolean;
  /** Prints each label again in this language under the English one. */
  secondLanguage?: 'Kannada' | 'Tamil' | 'Hindi';
  /** Paid / unpaid days strip above the tables (default true: shown in the details). */
  daysStrip?: boolean;
  employerBox?: boolean;
  taxSummary?: boolean;
  leaveBalances?: boolean;
  /** Reimbursement lines (label containing "allowance" for travel, or "reimbursement") in their own block. */
  reimbursementsBlock?: boolean;
}

const sum = (xs: PayslipLine[], k: 'amount' | 'ytd') => xs.reduce((a, x) => a + x[k], 0);

const SECOND: Record<NonNullable<PayslipOptions['secondLanguage']>, Record<string, string>> = {
  Kannada: { Earnings: 'ಗಳಿಕೆಗಳು', Deductions: 'ಕಡಿತಗಳು', Reimbursements: 'ಮರುಪಾವತಿಗಳು', Component: 'ಅಂಶ', 'This month': 'ಈ ತಿಂಗಳು', 'Year to date': 'ವರ್ಷದಿಂದ ಇಲ್ಲಿಯವರೆಗೆ', 'Gross earnings': 'ಒಟ್ಟು ಗಳಿಕೆ', 'Total deductions': 'ಒಟ್ಟು ಕಡಿತ', 'Net pay': 'ನಿವ್ವಳ ವೇತನ', Employee: 'ನೌಕರ' },
  Tamil: { Earnings: 'வருவாய்', Deductions: 'பிடித்தங்கள்', Reimbursements: 'திருப்பிச் செலுத்துதல்', Component: 'கூறு', 'This month': 'இந்த மாதம்', 'Year to date': 'ஆண்டு தொடக்கம் முதல்', 'Gross earnings': 'மொத்த வருவாய்', 'Total deductions': 'மொத்த பிடித்தங்கள்', 'Net pay': 'நிகர ஊதியம்', Employee: 'பணியாளர்' },
  Hindi: { Earnings: 'आय', Deductions: 'कटौतियाँ', Reimbursements: 'प्रतिपूर्ति', Component: 'घटक', 'This month': 'इस माह', 'Year to date': 'वर्ष में अब तक', 'Gross earnings': 'सकल आय', 'Total deductions': 'कुल कटौती', 'Net pay': 'शुद्ध वेतन', Employee: 'कर्मचारी' },
};

/** English label with the second-language label under it, when one is set and known. */
function L({ en, lang }: { en: string; lang?: PayslipOptions['secondLanguage'] }) {
  const second = lang ? SECOND[lang][en] : undefined;
  return (
    <>
      {en}
      {second && (
        <span className="yx-print__l2" lang={lang === 'Kannada' ? 'kn' : lang === 'Tamil' ? 'ta' : 'hi'}>
          {second}
        </span>
      )}
    </>
  );
}

function PayTable({ caption, lines, totalLabel, showYtd = true, lang }: { caption: string; lines: PayslipLine[]; totalLabel: string; showYtd?: boolean; lang?: PayslipOptions['secondLanguage'] }) {
  return (
    <table className="yx-print__table">
      <caption>
        <L en={caption} lang={lang} />
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <L en="Component" lang={lang} />
          </th>
          <th scope="col" data-num>
            <L en="This month" lang={lang} />
          </th>
          {showYtd && (
            <th scope="col" data-num>
              <L en="Year to date" lang={lang} />
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.label}>
            <th scope="row">{l.label}</th>
            <td data-num>{formatINR(l.amount)}</td>
            {showYtd && <td data-num>{formatINR(l.ytd)}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">
            <L en={totalLabel} lang={lang} />
          </th>
          <td data-num>{formatINR(sum(lines, 'amount'))}</td>
          {showYtd && <td data-num>{formatINR(sum(lines, 'ytd'))}</td>}
        </tr>
      </tfoot>
    </table>
  );
}

const isReimbursement = (l: PayslipLine) => /reimburse|leave travel/i.test(l.label);

/** A4 payslip: employer and employee details, earnings and deductions with YTD, net pay in figures and words. */
export function PayslipDocument({ data, options = {} }: { data: PayslipData; options?: PayslipOptions }) {
  const { showYtd = true, secondLanguage: lang, daysStrip = true, employerBox, taxSummary, leaveBalances, reimbursementsBlock } = options;
  const gross = sum(data.earnings, 'amount');
  const deductions = sum(data.deductions, 'amount');
  const net = gross - deductions;
  const e = data.employee;
  const reimbursements = reimbursementsBlock ? data.earnings.filter(isReimbursement) : [];
  const earnings = reimbursementsBlock ? data.earnings.filter((l) => !isReimbursement(l)) : data.earnings;
  const details: [string, ReactNode][] = [
    ['Employee', e.name],
    ['Employee ID', e.code],
    ['Designation', e.designation],
    ['Department', e.department],
    ['Location', e.location],
    ['Date of joining', formatDate(e.joinedOn)],
    ['PAN', maskTail(e.pan)],
    ['UAN', maskTail(e.uan)],
    ['ESI number', e.esiNumber ? maskTail(e.esiNumber) : gross > 21_000 ? 'Not covered (gross above ₹21,000)' : 'Not given'],
    ['Bank', `${e.bankName} ${maskTail(e.accountNumber)}`],
    ...(daysStrip
      ? ([
          ['Paid days', String(data.paidDays)],
          ['Loss of pay days', String(data.lopDays)],
        ] as [string, ReactNode][])
      : []),
    ['Pay date', formatDate(data.payDate)],
  ];
  return (
    <PrintLayout
      label={`Payslip for ${data.period}, ${e.name}`}
      header={<LetterheadBlock company={data.company} />}
      footer="This is a computer-generated payslip and does not need a signature."
    >
      <PrintPage>
        <h1 className="yx-print__title">Payslip for {data.period}</h1>
        <dl className="yx-print__details">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt>{k === 'Employee' ? <L en="Employee" lang={lang} /> : k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="yx-print__tables">
          <PayTable caption="Earnings" lines={earnings} totalLabel="Gross earnings" showYtd={showYtd} lang={lang} />
          <PayTable caption="Deductions" lines={data.deductions} totalLabel="Total deductions" showYtd={showYtd} lang={lang} />
        </div>
        {reimbursements.length > 0 && <PayTable caption="Reimbursements" lines={reimbursements} totalLabel="Total reimbursements" showYtd={showYtd} lang={lang} />}
        {employerBox && data.employer && data.employer.length > 0 && (
          <section className="yx-print__box" aria-label="Paid by the company">
            <h2 className="yx-print__box-title">Paid by the company (not in your net pay)</h2>
            <dl className="yx-print__details">
              {data.employer.map((x) => (
                <div key={x.label}>
                  <dt>{x.label}</dt>
                  <dd>{formatINR(x.amount)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {taxSummary && data.tax && (
          <section className="yx-print__box" aria-label="Tax summary">
            <h2 className="yx-print__box-title">Income tax this year ({data.tax.regime})</h2>
            <dl className="yx-print__details">
              <div>
                <dt>Projected income</dt>
                <dd>{formatINR(data.tax.projectedIncome)}</dd>
              </div>
              <div>
                <dt>Projected tax</dt>
                <dd>{formatINR(data.tax.projectedTax)}</dd>
              </div>
              <div>
                <dt>Deducted so far</dt>
                <dd>{formatINR(data.tax.deductedToDate)}</dd>
              </div>
            </dl>
          </section>
        )}
        {leaveBalances && data.leave && data.leave.length > 0 && (
          <section className="yx-print__box" aria-label="Leave balances">
            <h2 className="yx-print__box-title">Leave balances</h2>
            <dl className="yx-print__details">
              {data.leave.map((x) => (
                <div key={x.label}>
                  <dt>{x.label}</dt>
                  <dd>{x.balance} days</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <div className="yx-print__net">
          <p className="yx-print__net-label">
            <L en="Net pay" lang={lang} /> for {data.period}
          </p>
          <p className="yx-print__net-figure">{formatINR(net)}</p>
          <p className="yx-print__net-words">{numberToIndianWords(net)}</p>
        </div>
      </PrintPage>
    </PrintLayout>
  );
}

/* ================================================================== */
/* Letter                                                              */
/* ================================================================== */

export interface LetterData {
  company: Letterhead;
  date: Date;
  /** e.g. "NF/HR/OFF/2026/0412" */
  reference: string;
  recipient: { name: string; lines: string[] };
  subject: string;
  /**
   * The letter body as React content (paragraphs, lists, tables). Structured, never an HTML
   * string: a raw-HTML sink here would turn any tenant-controlled template or name into stored XSS.
   */
  body: ReactNode;
  signatory: { name: string; designation: string; /** Signature image slot, or "Signed digitally" text. */ signature?: ReactNode };
  /** Extra pages, e.g. an annexure with the salary breakup. */
  annexures?: ReactNode[];
}

/** A4 letter (offer, appointment, relieving…): letterhead, date, reference, recipient, body, signature block. */
export function LetterDocument({ data }: { data: LetterData }) {
  return (
    <PrintLayout label={`${data.subject}, ${data.recipient.name}`} header={<LetterheadBlock company={data.company} />} footer={data.company.name}>
      <PrintPage>
        <div className="yx-print__letter-meta">
          <p>
            <span className="yx-print__muted">Ref: </span>
            {data.reference}
          </p>
          <p>{formatDate(data.date)}</p>
        </div>
        <address className="yx-print__recipient">
          <strong>{data.recipient.name}</strong>
          {data.recipient.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </address>
        <p className="yx-print__subject">Subject: {data.subject}</p>
        <div className="yx-print__body">{data.body}</div>
        <div className="yx-print__signature">
          <p>For {data.company.name}</p>
          <div className="yx-print__sign-slot">{data.signatory.signature ?? <span className="yx-print__muted">Signed digitally</span>}</div>
          <p>
            <strong>{data.signatory.name}</strong>
          </p>
          <p>{data.signatory.designation}</p>
        </div>
      </PrintPage>
      {data.annexures?.map((a, i) => (
        <PrintPage key={i}>{a}</PrintPage>
      ))}
    </PrintLayout>
  );
}

/* ================================================================== */
/* Email                                                               */
/* ================================================================== */

export interface EmailLayoutProps {
  /** Tenant logo or name (emails to employees and candidates carry the tenant brand, Brand Part 5). */
  logo: ReactNode;
  /** Hidden preview text shown by mail apps after the subject. */
  preheader?: string;
  heading: string;
  children: ReactNode;
  /** The one button. */
  action?: { label: string; href: string };
  /** Registered address line(s) for the footer. */
  address: string;
  unsubscribeHref?: string;
  preferencesHref?: string;
  className?: string;
}

/**
 * Email preview (§40): single column, max 600 px, one primary button, text fallback link, footer with
 * address and unsubscribe / preferences, readable in dark mode (semantic tokens only).
 *
 * NOTE: this is the design reference and Storybook preview. Production emails are rendered on the
 * server (P04 notification engine) as table-based HTML with inline styles and a plain-text part,
 * because mail clients ignore stylesheets and CSS variables.
 */
export function EmailLayout({ logo, preheader, heading, children, action, address, unsubscribeHref, preferencesHref, className }: EmailLayoutProps) {
  return (
    <article className={cx('yx-email', className)} aria-label={`Email: ${heading}`}>
      {preheader && <span className="yx-visually-hidden">{preheader}</span>}
      <header className="yx-email__header">{logo}</header>
      <div className="yx-email__body">
        <h1 className="yx-email__heading">{heading}</h1>
        <div className="yx-email__content">{children}</div>
        {action && (
          <>
            <div className="yx-email__action">
              <Button variant="primary" size="lg" asChild>
                <a href={action.href}>{action.label}</a>
              </Button>
            </div>
            <p className="yx-email__fallback">
              If the button does not work, copy this link into your browser:
              <br />
              <a href={action.href}>{action.href}</a>
            </p>
          </>
        )}
      </div>
      <footer className="yx-email__footer">
        <p>{address}</p>
        {(unsubscribeHref || preferencesHref) && (
          <p>
            {preferencesHref && <a href={preferencesHref}>Email preferences</a>}
            {preferencesHref && unsubscribeHref && ' · '}
            {unsubscribeHref && <a href={unsubscribeHref}>Unsubscribe</a>}
          </p>
        )}
      </footer>
    </article>
  );
}

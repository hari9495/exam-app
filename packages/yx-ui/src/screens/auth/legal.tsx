import { useContext, type ReactNode } from 'react';
import { InlineAlert } from '../../components/feedback';
import { Link } from '../../components/button';
import { DataTable, type TableColumn } from '../../components/table';
import { TenantPortal } from '../portals/portals-kit';
import { AuthLanguageContext, LEGAL_LINKS } from './kit';

/**
 * SEC-02 · Legal notices: the public pages the sign-in footer links to (APX-G G-05 privacy, G-16 terms of use, G-17
 * accessibility, G-23 grievance officer, G-21 open-source notices). Same frame as the sign-in. Each says plainly what
 * it covers; the full texts need counsel's review (APX-G), so the page says so instead of inventing them.
 */
export type LegalDoc = keyof typeof LEGAL_LINKS;

export interface OpenSourceComponent {
  name: string;
  version: string;
  licence: string;
  /** Project home page, when the package names one. */
  url?: string | null;
}

export interface LegalNoticeScreenProps {
  doc: LegalDoc;
  /** The privacy and grievance contact. Null until YukthiX publishes it. */
  contactEmail?: string | null;
  /** G-21: the components this release ships, generated from the installed packages. */
  components?: OpenSourceComponent[];
  signInHref?: string;
}

const TITLES: Record<LegalDoc, string> = {
  privacy: 'Privacy notice',
  terms: 'Terms of use',
  accessibility: 'Accessibility statement',
  grievance: 'Grievance officer',
  openSource: 'Open-source notices',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="yx-legal__section">
      <h2 className="yx-legal__h2">{title}</h2>
      {children}
    </section>
  );
}

const OSS_COLUMNS: TableColumn<OpenSourceComponent>[] = [
  { key: 'name', header: 'Component', value: (r) => r.name, sortable: true, render: (r) => (r.url ? <Link href={r.url}>{r.name}</Link> : r.name) },
  { key: 'version', header: 'Version', type: 'id', value: (r) => r.version },
  { key: 'licence', header: 'Licence', value: (r) => r.licence, sortable: true },
];

interface Gap {
  id: string;
  where: string;
  what: string;
  wcag: string;
  plan: string;
}

// Answer 2352: the statement's honest list (G-1, the page behind an open dialog, was fixed by answer 2356).
const GAPS: Gap[] = [
  { id: 'G-2', where: 'Charts', what: 'Not yet checked that every chart has a text or table version of its numbers.', wcag: '1.1.1', plan: 'Check each chart; add a table view where missing.' },
  { id: 'G-3', where: 'Rich text editor, org chart, roster grid', what: 'Complex widgets not yet tested with a screen reader.', wcag: '2.1.1, 4.1.2', plan: 'A one-time NVDA pass, then fixes.' },
  { id: 'G-4', where: 'Whole app', what: 'No manual screen-reader (NVDA, JAWS or VoiceOver) pass has been done yet; only automated checks.', wcag: 'All', plan: 'NVDA pass on the main flows.' },
  { id: 'G-5', where: 'Screens at 150 % text', what: 'Only the main page frames were measured at 150 %. Parts drawn with fixed sizes do not grow with the text-size setting (browser zoom still enlarges them).', wcag: '1.4.4, 1.4.10', plan: 'Measure every screen at 150 %; move fixed sizes to the shared sizes.' },
  { id: 'G-6', where: 'High contrast', what: 'There is one high-contrast look (dark on light); a dark high-contrast look is not built. Your device’s own high-contrast mode still works.', wcag: 'Beyond AA', plan: 'A dark high-contrast look, later.' },
  { id: 'G-7', where: 'Older pages', what: 'The older exam console and older candidate pages are not built from the kit and do not have the Accessibility menu.', wcag: 'Various', plan: 'Being replaced by YukthiX screens.' },
  { id: 'G-8', where: 'Documents', what: 'Generated PDFs (payslips, letters, reports) are not tagged for screen readers.', wcag: '1.3.1', plan: 'Tagged PDFs, later.' },
  { id: 'G-9', where: 'Proctored tests', what: 'Camera and screen checks depend on the browser; a candidate who needs another way asks through an accommodation request (extra time, a reader, breaks).', wcag: '2.2.1', plan: 'Already offered: accommodation requests.' },
];
const GAP_COLUMNS: TableColumn<Gap>[] = [
  { key: 'id', header: 'Gap', type: 'id', value: (r) => r.id, width: 80 },
  { key: 'where', header: 'Where', value: (r) => r.where, width: 200 },
  { key: 'what', header: 'What', value: (r) => r.what },
  { key: 'wcag', header: 'WCAG', value: (r) => r.wcag, width: 110 },
  { key: 'plan', header: 'Plan', value: (r) => r.plan, width: 240 },
];

export function LegalNoticeScreen({ doc, contactEmail = null, components = [], signInHref = '/yx/sign-in' }: LegalNoticeScreenProps) {
  const lang = useContext(AuthLanguageContext);
  const contact = contactEmail ? (
    <Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>
  ) : (
    'the address YukthiX publishes here before go-live (until then, ask your company’s HR team)'
  );
  const drafting = doc !== 'openSource' && doc !== 'accessibility' && (
    <InlineAlert tone="info" title="Being finalised">
      The full text is reviewed by our lawyers before YukthiX goes live. This page says what it covers and how to reach us.
    </InlineAlert>
  );
  return (
    <TenantPortal
      tenant="YukthiX"
      portal="Legal and privacy"
      nav={(Object.keys(TITLES) as LegalDoc[]).map((d) => ({ label: TITLES[d], href: LEGAL_LINKS[d], active: d === doc }))}
      access={{ kind: 'public' }}
      footer={{ privacy: 'Privacy notice', hrefs: LEGAL_LINKS }}
      {...(lang ? { language: lang.value, onLanguageChange: lang.onChange } : { noLanguage: true })}
    >
      <article className="yx-legal" aria-labelledby="yx-legal-title">
        <div className="yx-signin__head">
          <h1 id="yx-legal-title" className="yx-signin__title">{TITLES[doc]}</h1>
          <p className="yx-signin__intro">
            <Link href={signInHref}>Back to sign in</Link>
          </p>
        </div>
        {drafting}
        {doc === 'privacy' && (
          <>
            <Section title="When your employer uses YukthiX">
              <p>Your employer decides which HR data is kept about you and why. YukthiX keeps and processes that data for your employer. For questions about your HR data, start with your company’s HR team. If you write to us about it, we pass your request to your employer.</p>
            </Section>
            <Section title="Data YukthiX is itself responsible for">
              <p>Company admin and billing contacts, support requests, security logs, and product-usage events that never include HR data. The notice lists each purpose, how long the data is kept and your rights over it.</p>
            </Section>
            <Section title="Questions and complaints">
              <p>Write to {contact}. See also the <Link href={LEGAL_LINKS.grievance}>grievance officer</Link> page.</p>
            </Section>
          </>
        )}
        {doc === 'terms' && (
          <>
            <Section title="Who the terms are between">
              <p>Your company’s contract with YukthiX sets the terms of the service. These terms of use are for the people who sign in.</p>
            </Section>
            <Section title="Using YukthiX">
              <ul className="yx-legal__list">
                <li>Use YukthiX for your work with your company.</li>
                <li>Keep your sign-in to yourself: your password, passkey and one-time codes.</li>
                <li>Don’t try to see data your role does not give you, or to break or slow down the service.</li>
              </ul>
            </Section>
          </>
        )}
        {doc === 'accessibility' && (
          <>
            {/* Answer 2352: the approved statement (docs/yukthix/accessibility-statement.md), 17 Nov 2026. */}
            <Section title="Our target">
              <p>YukthiX aims to conform to the Web Content Accessibility Guidelines (WCAG) 2.1, level AA. Today we partly conform: most of what we check passes, and the parts that do not are listed below. Nothing here has been checked by an independent auditor yet.</p>
              <p>This statement covers the YukthiX web app: the staff app, the sign-in pages, the careers and candidate pages, and the test (exam) screens. It does not yet cover the older exam console, the older candidate pages outside the YukthiX design, or documents we generate (payslips, letters and reports as PDF).</p>
            </Section>
            <Section title="What you can change yourself: the Accessibility menu">
              <p>Every page in scope has an Accessibility button (the person icon): on the staff top bar, on the sign-in pages, on the careers and candidate pages, and on the test screen. A company cannot turn it off. It offers:</p>
              <ul className="yx-legal__list">
                <li>Contrast: Normal or High contrast (black on white, text at 7:1 or more, black borders, underlined links, a thick focus outline).</li>
                <li>Text size: Bigger, Smaller and Normal, in five steps from 90 % to 150 %. Pages wrap to fit; at the larger steps some pages scroll.</li>
                <li>Text spacing (letter and word spacing) and Line height (1.5 times the text, with space between paragraphs), as WCAG 1.4.12 describes.</li>
                <li>Big cursor, Reduce motion (as well as your device’s own setting, which we always follow), Stronger focus outline and Underline links.</li>
                <li>Reset all.</li>
              </ul>
              <p>Signed in, your choices are saved on your account and follow you to every device. Signed out, they are kept in this browser. Your browser’s zoom, your device’s high-contrast mode and your own screen reader keep working too.</p>
            </Section>
            <Section title="How we check">
              <ul className="yx-legal__list">
                <li>Every screen is built from one design-system kit, and its rules are checked by automated tests on every change: every control looks clickable, pick-one choices are a proper radio group, and spacing comes from shared tokens.</li>
                <li>Automated WCAG 2.1 A and AA checks (axe-core) run over the key screens: sign-in, the staff app shell and home, careers, the candidate portal, the test runner and the Accessibility menu. Colour contrast is checked on the design library in light and dark.</li>
                <li>Text size at 100 % and 150 % is measured by a script on the main page frames: no overlapping blocks and no sideways scroll.</li>
              </ul>
            </Section>
            <Section title="Known gaps">
              <DataTable label="Known accessibility gaps" columns={GAP_COLUMNS} rows={GAPS} getRowId={(r) => r.id} rowNoun={['gap', 'gaps']} />
            </Section>
            <Section title="Feedback and contact">
              <p>If something does not work for you, tell your company’s HR team, or write to {contact}. We aim to reply within 5 working days.</p>
            </Section>
            <Section title="Preparation of this statement">
              <p>Prepared on 17 Nov 2026 by the YukthiX team from automated tests and our own review. It is reviewed every six months and after an independent audit.</p>
            </Section>
          </>
        )}
        {doc === 'grievance' && (
          <>
            <Section title="Your right to complain">
              <p>Under India’s Digital Personal Data Protection Act, 2023 you can complain about how your personal data is handled.</p>
            </Section>
            <Section title="Who answers">
              <p>For HR data your employer keeps, your employer’s grievance officer answers first: ask your HR team who that is. For data YukthiX is itself responsible for, write to YukthiX’s grievance officer at {contact}.</p>
            </Section>
            <Section title="If you are not satisfied">
              <p>You can then complain to the Data Protection Board of India.</p>
            </Section>
          </>
        )}
        {doc === 'openSource' && (
          <>
            <p className="yx-signin__intro">YukthiX is built with these open-source components. Each one’s licence and copyright notice ship with its source.</p>
            <DataTable label="Open-source components" columns={OSS_COLUMNS} rows={components} getRowId={(r) => r.name} rowNoun={['component', 'components']} />
          </>
        )}
      </article>
    </TenantPortal>
  );
}

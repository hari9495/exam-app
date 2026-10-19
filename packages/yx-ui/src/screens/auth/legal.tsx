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

export function LegalNoticeScreen({ doc, contactEmail = null, components = [], signInHref = '/yx/sign-in' }: LegalNoticeScreenProps) {
  const lang = useContext(AuthLanguageContext);
  const contact = contactEmail ? (
    <Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>
  ) : (
    'the address YukthiX publishes here before go-live (until then, ask your company’s HR team)'
  );
  const drafting = doc !== 'openSource' && (
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
            <Section title="Our target">
              <p>We build YukthiX to meet WCAG 2.1 level AA. Every screen in our design library is checked automatically for accessibility problems, and screens work with a keyboard and a screen reader.</p>
            </Section>
            <Section title="What is still open">
              <p>An independent audit is planned before public launch. Its date, scope and any known problems will be listed here.</p>
            </Section>
            <Section title="If something doesn’t work for you">
              <p>Tell your company’s HR team, or write to {contact}.</p>
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

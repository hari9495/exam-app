import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { LegalEntitiesScreen } from './entities';
import { LocationsScreen } from './locations';
import { StructureScreen } from './structure';
import { CompanySettingsScreen, type CompanySettingsScreenProps } from './settings';
import { ENTITIES, ERASURE_DRY_RUN, ERASURE_ON, ERASURE_ON_DUE, LOCATIONS, MASTERS, PAY_RANGES, RULES, SETTING_CHOICES, SETTING_OVERRIDES, SETTING_REGISTRY, STATES, TODAY_ISO } from './data';

const meta: Meta = { title: 'Screens/Settings/Organisation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const LINKS: StoryLink[] = [
  { id: 'settings', label: 'Security settings', href: '#settings', group: 'Security' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
  { id: 'entities', label: 'Legal entities', href: '#entities', group: 'Organisation' },
  { id: 'locations', label: 'Locations', href: '#locations', group: 'Organisation' },
  { id: 'structure', label: 'Structure', href: '#structure', group: 'Organisation' },
  { id: 'company-rules', label: 'Company rules', href: '#rules', group: 'Organisation' },
  { id: 'access-settings', label: 'Access and privacy', href: '#privacy', group: 'Access' },
  { id: 'payroll-rules', label: 'Payroll rules', href: '#payroll-rules', group: 'Payroll & Statutory' },
];
const Frame = ({ active, children }: { active: StoryLink['id']; children: React.ReactNode }) => (
  <LinksFrame active={active} links={LINKS}>
    {children}
  </LinksFrame>
);

export const LegalEntities: S = {
  render: () => (
    <Frame active="entities">
      <LegalEntitiesScreen
        state="ready"
        entities={ENTITIES}
        states={STATES}
        canManage
        canStatutory
        rules={RULES}
        onSaveRules={() => wait()}
        onSave={() => wait()}
        onSetDefault={() => wait()}
        onArchive={() => wait()}
        onRestore={() => wait()}
        onDelete={() => wait()}
        onLoadStatutory={async () => {
          await wait();
          return { pan: 'AABCK1234M', tan: 'BLRK01234E', gstin: '29AABCK1234M1Z5', cin: 'U15400KA2014PTC012345' };
        }}
        onSaveStatutory={() => wait()}
      />
    </Frame>
  ),
};

export const Locations: S = {
  render: () => (
    <Frame active="locations">
      <LocationsScreen state="ready" locations={LOCATIONS} entities={ENTITIES} states={STATES} canManage onSave={() => wait()} onArchive={() => wait()} onRestore={() => wait()} onDelete={() => wait()} />
    </Frame>
  ),
};

/** Polls for an element the story's own clicks open (play functions run before drawers mount). */
const find = async <T extends Element>(get: () => T | null | undefined): Promise<T> => {
  for (let i = 0; i < 50; i++) {
    const el = get();
    if (el) return el;
    await wait(20);
  }
  throw new Error('Not found');
};
const byText = (root: ParentNode, sel: string, text: string) => [...root.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.trim() === text);

export const LocationsRemoveGeofence: S = {
  name: 'Locations · taking a geofence off asks first',
  render: Locations.render,
  play: async ({ canvasElement }) => {
    const row = await find(() => [...canvasElement.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Hosur plant')));
    (await find(() => byText(row, 'button', 'Edit'))).click();
    (await find(() => document.querySelector<HTMLElement>('[role="dialog"] [role="checkbox"]'))).click();
    (await find(() => byText(document, '[role="dialog"] button', 'Save changes'))).click();
  },
};

const pay = { today: TODAY_ISO, onLoad: async () => (await wait(), PAY_RANGES), onCreate: () => wait(), onUpdate: () => wait(), onDelete: () => wait() };

export const Structure: S = {
  render: () => (
    <Frame active="structure">
      <StructureScreen state="ready" masters={MASTERS} entities={ENTITIES} canManage defaultOwnership="shared" pay={{ ...pay, canView: false, canManage: false }} onSave={() => wait()} onArchive={() => wait()} onRestore={() => wait()} onDelete={() => wait()} />
    </Frame>
  ),
};

/** Payroll Admin: grades with "Show pay" (R1). */
export const StructureWithPay: S = {
  render: () => (
    <Frame active="structure">
      <StructureScreen state="ready" initialKind="grades" masters={MASTERS} entities={ENTITIES} canManage={false} defaultOwnership="shared" pay={{ ...pay, canView: true, canManage: true }} onSave={() => wait()} onArchive={() => wait()} onRestore={() => wait()} onDelete={() => wait()} />
    </Frame>
  ),
};

export const NoAccess: S = {
  render: () => (
    <Frame active="locations">
      <LocationsScreen state="no-access" locations={[]} entities={[]} states={STATES} canManage={false} onSave={() => wait()} onArchive={() => wait()} onRestore={() => wait()} onDelete={() => wait()} />
    </Frame>
  ),
};

const settings: Omit<CompanySettingsScreenProps, 'section'> = {
  state: 'ready',
  registry: SETTING_REGISTRY,
  overrides: SETTING_OVERRIDES,
  choices: SETTING_CHOICES,
  canManage: true,
  heldGuards: ['access.role.manage'],
  today: TODAY_ISO,
  onSave: () => wait(),
  onRemove: () => wait(),
};

/** Group 1: probation per entity and grade, a scheduled attendance mode for the Hosur plant. */
export const CompanyRules: S = {
  render: () => (
    <Frame active="company-rules">
      <CompanySettingsScreen section="organisation" {...settings} />
    </Frame>
  ),
};

/** Group 2: manager access narrowed to direct reports. */
export const AccessAndPrivacy: S = {
  render: () => (
    <Frame active="access-settings">
      <CompanySettingsScreen section="access" {...settings} />
    </Frame>
  ),
};

const ERASURE_SWITCH_ON = { id: 's-erase', key: 'privacy.erasure.enabled', scopeType: 'tenant' as const, scopeId: 'org', value: 'on', validFrom: null };

/** Follow-up 12: Special data erasure is off; HR reads the dry run (what it would delete today, and whose) before turning it on. */
export const AccessAndPrivacyErasureDryRun: S = {
  name: 'Access and privacy · Special data erasure · dry run (off), whose data',
  render: () => (
    <Frame active="access-settings">
      <CompanySettingsScreen section="access" {...settings} erasure={ERASURE_DRY_RUN} />
    </Frame>
  ),
};

/** Erasure on: no one due (empty list); the last night's run, with one person not done (tried again the next night). */
export const AccessAndPrivacyErasureOn: S = {
  name: 'Access and privacy · Special data erasure · on, no one due, last run',
  render: () => (
    <Frame active="access-settings">
      <CompanySettingsScreen section="access" {...settings} overrides={[...SETTING_OVERRIDES, ERASURE_SWITCH_ON]} erasure={ERASURE_ON} />
    </Frame>
  ),
};

/** Erasure on: two people due at the next run, one an offer that never joined (counted from the day it was cancelled). */
export const AccessAndPrivacyErasureOnDue: S = {
  name: 'Access and privacy · Special data erasure · on, people due at the next run',
  render: () => (
    <Frame active="access-settings">
      <CompanySettingsScreen section="access" {...settings} overrides={[...SETTING_OVERRIDES, ERASURE_SWITCH_ON]} erasure={ERASURE_ON_DUE} />
    </Frame>
  ),
};

/** Without company-wide settings rights the dry run is not sent, so the card is not drawn (the switch still shows, read-only). */
export const AccessAndPrivacyErasureNoAccess: S = {
  name: 'Access and privacy · Special data erasure · no company-wide settings rights (no card)',
  render: () => (
    <Frame active="access-settings">
      <CompanySettingsScreen section="access" {...settings} canManage={false} />
    </Frame>
  ),
};

/** Settings admin without access management: guarded settings are disabled with the reason. */
export const AccessAndPrivacyGuarded: S = {
  render: () => (
    <Frame active="access-settings">
      <CompanySettingsScreen section="access" {...settings} heldGuards={[]} />
    </Frame>
  ),
};

/** Group 4 · Payroll rules (founder 30 Oct 2026, last 10, items 1 and 5): statutory bonus and loans and advances, per company or legal entity. */
export const PayrollRules: S = {
  render: () => (
    <Frame active="payroll-rules">
      <CompanySettingsScreen section="payroll" {...settings} />
    </Frame>
  ),
};

/** Payroll rules: changing a loan interest rate; Save pressed before a value was chosen shows the field error and focuses it. */
export const PayrollRulesLoanTooEarly: S = {
  name: 'Payroll rules · loan interest · pressed too early',
  render: () => (
    <Frame active="payroll-rules">
      <CompanySettingsScreen section="payroll" {...settings} story={{ editing: 'payroll.loan.interest_rate.loan', tooEarly: true }} />
    </Frame>
  ),
};

/** Payroll rules: the bonus eligibility rule editor (last day, first day or the highest rate in the month). */
export const PayrollRulesBonusRule: S = {
  name: 'Payroll rules · bonus eligibility rule editor',
  render: () => (
    <Frame active="payroll-rules">
      <CompanySettingsScreen section="payroll" {...settings} story={{ editing: 'payroll.bonus.eligibility_rate_on' }} />
    </Frame>
  ),
};

/** Someone who may see the payroll rules but not change them: no Change buttons. */
export const PayrollRulesReadOnly: S = {
  name: 'Payroll rules · read only',
  render: () => (
    <Frame active="payroll-rules">
      <CompanySettingsScreen section="payroll" {...settings} canManage={false} />
    </Frame>
  ),
};

export const PayrollRulesLoading: S = {
  name: 'Payroll rules · loading',
  render: () => (
    <Frame active="payroll-rules">
      <CompanySettingsScreen section="payroll" {...settings} state="loading" />
    </Frame>
  ),
};

export const PayrollRulesError: S = {
  name: 'Payroll rules · error',
  render: () => (
    <Frame active="payroll-rules">
      <CompanySettingsScreen section="payroll" {...settings} state="error" onRetry={() => {}} />
    </Frame>
  ),
};

export const CompanyRulesLoading: S = {
  render: () => (
    <Frame active="company-rules">
      <CompanySettingsScreen section="organisation" {...settings} state="loading" />
    </Frame>
  ),
};

export const CompanyRulesError: S = {
  render: () => (
    <Frame active="company-rules">
      <CompanySettingsScreen section="organisation" {...settings} state="error" onRetry={() => {}} />
    </Frame>
  ),
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { LegalEntitiesScreen } from './entities';
import { LocationsScreen } from './locations';
import { StructureScreen } from './structure';
import { CompanySettingsScreen, type CompanySettingsScreenProps } from './settings';
import { ENTITIES, LOCATIONS, MASTERS, PAY_RANGES, RULES, SETTING_CHOICES, SETTING_OVERRIDES, SETTING_REGISTRY, STATES, TODAY_ISO } from './data';

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

/** Settings admin without access management: guarded settings are disabled with the reason. */
export const AccessAndPrivacyGuarded: S = {
  render: () => (
    <Frame active="access-settings">
      <CompanySettingsScreen section="access" {...settings} heldGuards={[]} />
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

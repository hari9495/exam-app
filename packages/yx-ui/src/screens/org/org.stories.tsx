import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceShell, type WorkspaceLink } from '../auth/shell';
import { LegalEntitiesScreen } from './entities';
import { LocationsScreen } from './locations';
import { StructureScreen } from './structure';
import { CompanySettingsScreen, type CompanySettingsScreenProps } from './settings';
import { ENTITIES, LOCATIONS, MASTERS, PAY_RANGES, RULES, SETTING_CHOICES, SETTING_OVERRIDES, SETTING_REGISTRY, STATES, TODAY_ISO } from './data';

const meta: Meta = { title: 'Screens/Settings/Organisation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const LINKS: WorkspaceLink[] = [
  { id: 'settings', label: 'Security settings', href: '#settings', group: 'Security' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
  { id: 'entities', label: 'Legal entities', href: '#entities', group: 'Organisation' },
  { id: 'locations', label: 'Locations', href: '#locations', group: 'Organisation' },
  { id: 'structure', label: 'Structure', href: '#structure', group: 'Organisation' },
  { id: 'company-rules', label: 'Company rules', href: '#rules', group: 'Organisation' },
  { id: 'access-settings', label: 'Access and privacy', href: '#privacy', group: 'Access' },
];
const Frame = ({ active, children }: { active: WorkspaceLink['id']; children: React.ReactNode }) => (
  <WorkspaceShell active={active} links={LINKS} company="Kaveri Foods Pvt Ltd" profileHref="#profile" name="Arjun Kulkarni" email="arjun.k@kaverifoods.in" onSignOut={() => {}}>
    {children}
  </WorkspaceShell>
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

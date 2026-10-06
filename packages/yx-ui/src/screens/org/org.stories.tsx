import type { Meta, StoryObj } from '@storybook/react-vite';
import { SecurityShell, type SecurityShellLink } from '../auth/shell';
import { LegalEntitiesScreen } from './entities';
import { LocationsScreen } from './locations';
import { StructureScreen } from './structure';
import { ENTITIES, LOCATIONS, MASTERS, PAY_RANGES, RULES, STATES, TODAY_ISO } from './data';

const meta: Meta = { title: 'Screens/Settings/Organisation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const LINKS: SecurityShellLink[] = [
  { id: 'me', label: 'My security', href: '#me', group: 'Security' },
  { id: 'settings', label: 'Security settings', href: '#settings', group: 'Security' },
  { id: 'entities', label: 'Legal entities', href: '#entities', group: 'Organisation' },
  { id: 'locations', label: 'Locations', href: '#locations', group: 'Organisation' },
  { id: 'structure', label: 'Structure', href: '#structure', group: 'Organisation' },
];
const Frame = ({ active, children }: { active: SecurityShellLink['id']; children: React.ReactNode }) => (
  <SecurityShell title="Settings" active={active} links={LINKS} homeHref="#home" profileHref="#profile" name="Arjun Kulkarni" email="arjun.k@kaverifoods.in" onSignOut={() => {}}>
    {children}
  </SecurityShell>
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

import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { LegalEntitiesScreen } from './entities';
import { LocationsScreen } from './locations';
import { StructureScreen } from './structure';
import { ENTITIES, ERASURE_DRY_RUN, ERASURE_ON_DUE, LOCATIONS, MASTERS, PAY_RANGES, RULES, STATES, TODAY_ISO } from './data';
import { ErasureCard } from './erasure-card';

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

/** Answer 1781: the erasure dry run on Settings › 2.2 Directory & privacy, off (what it would delete today). */
export const ErasureDryRun: S = { render: () => <ErasureCard report={ERASURE_DRY_RUN} /> };

/** On, with people due at the next run and one not done last night. */
export const ErasureOnDue: S = { render: () => <ErasureCard report={ERASURE_ON_DUE} /> };

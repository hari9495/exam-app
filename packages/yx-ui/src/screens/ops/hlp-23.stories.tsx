import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, ok, play, press } from '../_kit/story-play';
import { FacilitiesScreen, type EquipmentPageView, type FacilitiesProps, type FacilitiesRegister } from '../desk/facilities';
import { OpsDesk } from './ops-kit';

// Helpdesk plan item 4: buildings (the company's locations), their floors or areas, and equipment owned by a team of a
// facilities desk; the equipment page lists its work orders and recurring maintenance.

const meta: Meta = { title: 'Screens/Helpdesk/HLP-23 · Buildings and equipment', component: FacilitiesScreen, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Buildings and equipment"><Story /></OpsDesk>] };
export default meta;
type S = StoryObj;

const REGISTER: FacilitiesRegister = {
  canEdit: true,
  desks: [{ id: 'd-fac', name: 'Facilities desk', groups: [{ id: 'g-mep', name: 'Electrical and HVAC' }, { id: 'g-civil', name: 'Civil works' }] }],
  buildings: [
    { id: 'l-blr', name: 'Bengaluru office', code: 'BLR', areas: [{ id: 'ar1', name: 'Ground floor', status: 'active', version: 1 }, { id: 'ar2', name: '2nd floor', status: 'active', version: 1 }, { id: 'ar3', name: 'Old canteen', status: 'retired', version: 2 }] },
    { id: 'l-che', name: 'Chennai plant', code: 'CHE', areas: [] },
  ],
  equipment: [
    { id: 'e1', name: 'Passenger lift', tag: 'BLR-LIFT-01', category: 'Lift', status: 'active', version: 3, deskId: 'd-fac', ownerGroupId: 'g-mep', ownerTeam: 'Electrical and HVAC', locationId: 'l-blr', building: 'Bengaluru office', areaId: 'ar1', area: 'Ground floor', canEdit: true },
    { id: 'e2', name: 'Diesel generator 250 kVA', tag: 'CHE-DG-02', category: 'Generator', status: 'active', version: 1, deskId: 'd-fac', ownerGroupId: 'g-mep', ownerTeam: 'Electrical and HVAC', locationId: 'l-che', building: 'Chennai plant', areaId: null, area: null, canEdit: true },
    { id: 'e3', name: 'Split AC 2 ton', tag: 'BLR-AC-14', category: 'Air conditioner', status: 'retired', version: 5, deskId: 'd-fac', ownerGroupId: 'g-mep', ownerTeam: 'Electrical and HVAC', locationId: 'l-blr', building: 'Bengaluru office', areaId: 'ar2', area: '2nd floor', canEdit: true },
  ],
};
const LIFT_PAGE: EquipmentPageView = {
  id: 'e1',
  name: 'Passenger lift',
  tag: 'BLR-LIFT-01',
  category: 'Lift',
  status: 'active',
  building: 'Bengaluru office',
  area: 'Ground floor',
  ownerTeam: 'Electrical and HVAC',
  maintenance: [{ id: 'r1', name: 'Lift monthly service', rrule: 'FREQ=MONTHLY;BYMONTHDAY=5', nextRunAt: '2026-12-05T04:30:00Z', state: 'active' }],
  workOrders: [
    { id: 't1', number: 'FAC-1042', subject: 'Lift monthly service', systemState: 'open', createdAt: '2026-11-05T04:30:00Z', resolvedAt: null, recurring: true },
    { id: 't2', number: 'FAC-1031', subject: 'Lift stuck between floors', systemState: 'solved', createdAt: '2026-10-21T07:10:00Z', resolvedAt: '2026-10-21T09:40:00Z', recurring: false },
    { id: 't3', number: 'FAC-1020', subject: 'Lift monthly service', systemState: 'closed', createdAt: '2026-10-05T04:30:00Z', resolvedAt: '2026-10-06T10:00:00Z', recurring: true },
  ],
};
const screen = (over: Partial<FacilitiesProps> = {}) => <FacilitiesScreen state="ready" register={REGISTER} onSaveArea={ok} onSaveEquipment={ok} onOpenEquipment={async () => LIFT_PAGE} onOpenTicket={() => undefined} {...over} />;

export const Equipment: S = { name: 'Equipment', render: () => screen() };
export const EquipmentPage: S = { name: 'An equipment page: maintenance and work orders', render: () => screen({ start: { page: LIFT_PAGE } }) };
// Answer 1914: 25 work orders at a time; Show more brings the older ones.
export const EquipmentPageMore: S = { name: 'An equipment page with older work orders (Show more)', render: () => screen({ start: { page: { ...LIFT_PAGE, moreWorkOrders: true } }, onMoreWorkOrders: async () => ({ items: [{ id: 't9', number: 'FAC-0988', subject: 'Lift door sensor', systemState: 'closed', createdAt: '2026-08-12T05:00:00Z', resolvedAt: '2026-08-12T08:15:00Z', recurring: false }], more: false }) }) };
export const EquipmentNew: S = { name: 'New equipment', render: () => screen({ start: { equipment: 'new' } }) };
export const EquipmentNewMissing: S = { name: 'Save pressed with nothing filled', render: () => screen({ start: { equipment: 'new' } }), play: play(press('Save equipment')) };
export const EquipmentEdit: S = { name: 'Edit or retire equipment', render: () => screen({ start: { equipment: 'e1' } }) };
export const EquipmentSaveFailed: S = { name: 'Saving refused (tag already used)', render: () => screen({ start: { equipment: 'new' }, onSaveEquipment: fails('Another piece of equipment already has this tag.') }) };
export const Buildings: S = { name: 'Buildings and their areas', render: () => screen({ start: { tab: 'buildings' } }) };
export const AreaNew: S = { name: 'New area in a building', render: () => screen({ start: { tab: 'buildings', area: { locationId: 'l-che' } } }) };
export const ReadOnly: S = { name: 'Desk staff: read only', render: () => screen({ register: { ...REGISTER, canEdit: false, desks: [], equipment: REGISTER.equipment.map((e) => ({ ...e, canEdit: false })) } }) };
export const Empty: S = { name: 'No equipment yet', render: () => screen({ register: { ...REGISTER, equipment: [] } }) };
export const Loading: S = { name: 'Loading', render: () => screen({ state: 'loading', register: null }) };
export const Error: S = { name: 'Could not load', render: () => screen({ state: 'error', register: null, onRetry: () => undefined }) };

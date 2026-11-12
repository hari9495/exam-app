import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, ok, play, press, pressFirst, type } from '../_kit/story-play';
import { TeamScreen, type TeamScreenProps } from '../desk/esm3';
import { AVAILABILITY, FORECAST, SHIFTS, TEAM } from '../desk/esm-data';
import { OpsDesk } from './ops-kit';

// Helpdesk HLP-17 · Desk team and shifts (the founder, 12 Nov 2026: draw the live stand-ins, then they are the live page).
// The desk team page (/yx/desk/team): each agent's presence, capacity and languages, the shift roster with import, and
// the lead's forecast and availability; an agent sees only their own presence.
const meta: Meta = { title: 'Screens/Helpdesk/HLP-17 · Desk team and shifts', component: TeamScreen, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Desk team"><Story /></OpsDesk>] };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Desk team (lead, agent)
const team = (over: Partial<TeamScreenProps> = {}) => (
  <TeamScreen state="ready" desks={[{ id: 'd-it', name: 'IT help desk' }]} deskId="d-it" onDesk={() => undefined} canLead canReport me={{ presence: 'available' }} onPresence={ok} team={TEAM} onRouting={ok} shifts={SHIFTS} range={{ from: '2026-10-26', to: '2026-11-01' }} onAddShift={ok} onRemoveShift={ok} onImportShifts={async () => ({ added: 4 })} forecast={FORECAST} availability={AVAILABILITY} mailbox={{ current: null, devAllowed: false, onLink: ok, onUnlink: ok }} {...over} />
);
export const Team: S = { name: 'Lead (capacity, shifts, forecast)', render: () => team() };
export const TeamAgent: S = { name: 'Agent (my presence only)', render: () => team({ canLead: false, canReport: false, forecast: null, availability: null }) };
export const TeamRouting: S = { name: 'Change capacity and languages', render: () => team(), play: play(pressFirst('Change capacity and languages')) };
export const TeamShiftMissing: S = { name: 'Add the shift pressed with nothing filled', render: () => team(), play: play(press('Add the shift')) };
export const TeamImportMissing: S = { name: 'Import shifts pressed with nothing pasted', render: () => team(), play: play(press('Import shifts')) };
export const TeamImported: S = { name: 'Shifts imported (toast)', render: () => team({ onImportShifts: async () => ({ added: 4 }) }), play: play(type(/^Or paste shifts/, 'suresh@kaverifoods.in, 2026-10-27 09:00, 2026-10-27 17:00, Day'), press('Import shifts')) };
export const TeamPresenceFailed: S = { name: 'Presence change refused', render: () => team({ onPresence: fails('You are signed out on another device.') }), play: play(async (s) => (await s.findByRole('radio', { name: 'Busy' })).click()) };
export const TeamEmpty: S = { name: 'No one on the desk', render: () => team({ team: [], shifts: [] }) };
export const TeamLoading: S = { name: 'Loading', render: () => team({ state: 'loading' }) };
export const TeamError: S = { name: 'Could not load', render: () => team({ state: 'error', onRetry: () => undefined }) };
export const TeamWorking: S = { name: 'Saving presence', render: () => team({ onPresence: never }), play: play(async (s) => (await s.findByRole('radio', { name: 'Busy' })).click()) };

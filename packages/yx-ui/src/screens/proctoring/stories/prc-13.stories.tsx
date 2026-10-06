import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveConsoleScreen } from '../live';
import { LIVE_TILES } from '../proctoring-data';

const meta: Meta<typeof LiveConsoleScreen> = { title: 'Screens/Proctoring/PRC-13 · Live console', component: LiveConsoleScreen, parameters: { layout: 'fullscreen' }, args: { tiles: LIVE_TILES } };
export default meta;
type S = StoryObj<typeof LiveConsoleScreen>;

export const Grid: S = { name: 'Tiles sorted by concern' };
export const HighConcernFilter: S = { name: 'Filtered to high concern', args: { defaultRisk: 'high' } };
export const TileDetail: S = { name: 'Tile detail: timeline, chat, actions', args: { defaultOpenId: 'a2' } };
export const TerminateConfirm: S = { name: 'End attempt: confirmation with reason', args: { defaultOpenId: 'a2', confirm: 'terminate' } };
export const PauseConfirm: S = { name: 'Pause: reason required', args: { defaultOpenId: 'a6', confirm: 'pause' } };
export const MissedStart: S = { name: 'Proctor missing: 10-minute fall-back', args: { missedStart: true } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };

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

// AS-5 part 2 (answer 2006): a real test's attempts from the monitoring socket; pause, resume and end with a reason.
const fn = async () => undefined;
export const LiveConsole: S = {
  name: 'Live · a real test',
  args: {
    live: {
      testName: 'Java Backend Developer · L2',
      connection: 'connected',
      state: 'ready',
      onRetry: () => {},
      tiles: [
        { id: 'a1', name: 'Sneha Iyer', status: 'in-progress', level: 'high', flags: 2, lastFlag: 'multiple faces', question: '5 of 20 answered', secondsLeft: 1800 },
        { id: 'a2', name: 'Meenakshi Sundaram', status: 'in-progress', level: 'review', flags: 1, lastFlag: 'tab switch', question: '12 of 20 answered', secondsLeft: 2100 },
        { id: 'a3', name: 'Arjun Nair', status: 'paused', level: 'clear', flags: 0, question: '9 of 20 answered', secondsLeft: 2400 },
      ],
      events: { a1: [{ id: 'e1', type: 'webcam_multiple_faces', severity: 'high', at: '2026-11-17T08:23:15.000Z' }] },
      onPause: fn,
      onResume: fn,
      onEnd: fn,
      onMessage: fn,
    },
  },
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScheduledChangesScreen } from './changes';
import { SCHEDULED, TODAY } from './people-data';
import { ChangeReview, ReasonDialog } from '../history';
import { CHANGES, IMPACT } from '../history/data';
import { date, fails, ok, play, press } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-05 · Scheduled changes', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Next30: S = { name: 'Next 30 days', render: () => <ScheduledChangesScreen rows={SCHEDULED} today={TODAY} /> };
export const Next90: S = { name: 'Next 90 days (two changes for one person)', render: () => <ScheduledChangesScreen rows={SCHEDULED} today={TODAY} defaultWindow={90} /> };
export const Cancel: S = { name: 'Cancel with reason', render: () => <ScheduledChangesScreen rows={SCHEDULED} today={TODAY} defaultCancelId="s2" /> };
export const Empty: S = { name: '· empty', render: () => <ScheduledChangesScreen rows={[]} today={TODAY} /> };

// The same review drawer opened from a scheduled change waiting for approval.
export const Review: S = { name: 'Review a waiting change', render: () => <ChangeReview row={{ ...CHANGES[2], status: 'pending' }} onPreview={async () => IMPACT} onApprove={ok} onReject={() => undefined} onClose={() => undefined} /> };

// Edit a scheduled change's date (live ReasonDialog "reschedule"): the new date goes back for approval.
const move = (act: () => Promise<void> = ok) => <ReasonDialog ask={{ kind: 'reschedule', row: CHANGES[2] }} act={act} onDone={() => undefined} onClose={() => undefined} />;
export const Move: S = { name: 'Move a change to another date', render: () => move() };
export const MoveMissing: S = { name: 'Move pressed with no new date', render: () => move(), play: play(press('Move and send for approval')) };
export const MoveFailed: S = { name: 'Move refused by the server', render: () => move(fails('A date before the retro limit needs a System Admin.')), play: play(date('New date', '01 Dec 2026'), press('Move and send for approval')) };

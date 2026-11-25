import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnnouncementScreen } from './engage-feed';
import { ACK_ROWS } from './engage-data';
import { liveAnnouncements } from './engage-live-samples';

const meta: Meta = { title: 'Screens/Engage/ENG-03 · Announcement composer and acknowledgement tracking', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Compose: S = { name: 'Composer (audience, channels, acknowledgement)', render: () => <AnnouncementScreen view="compose" /> };
export const SensitiveValue: S = { name: 'Blocked: amount in an external channel', render: () => <AnnouncementScreen view="compose" sensitive /> };
export const Tracking: S = { name: 'Acknowledgement tracking', render: () => <AnnouncementScreen view="tracking" rows={ACK_ROWS} /> };
export const AllAcknowledged: S = { name: 'Tracking · everyone acknowledged', render: () => <AnnouncementScreen view="tracking" rows={ACK_ROWS.map((r) => ({ ...r, read: r.read ?? new Date(2026, 8, 28), acked: r.acked ?? new Date(2026, 8, 28) }))} /> };
// Batch G2 item 12: the list, composer and tracking from the company's records (HR with engage.announce).
export const List: S = { name: 'Announcements list', render: () => <AnnouncementScreen live={liveAnnouncements()} /> };
export const ListEmpty: S = { name: 'Announcements list · none yet', render: () => <AnnouncementScreen live={liveAnnouncements({ list: [] })} /> };
export const ComposeCompany: S = { name: 'Composer · company locations and departments', render: () => <AnnouncementScreen live={liveAnnouncements({ view: 'compose' })} /> };
export const TrackingCompany: S = { name: 'Tracking · read and acknowledged per person', render: () => <AnnouncementScreen live={liveAnnouncements({ view: 'tracking' })} /> };
export const TrackingReminded: S = { name: 'Tracking · reminded today', render: () => <AnnouncementScreen live={liveAnnouncements({ view: 'tracking', detail: { ...liveAnnouncements().detail!, canRemind: false } })} /> };
export const NoAccess: S = { name: 'No access (without engage.announce)', render: () => <AnnouncementScreen live={liveAnnouncements({ state: 'no-access' })} /> };

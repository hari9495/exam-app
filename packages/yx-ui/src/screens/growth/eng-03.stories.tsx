import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnnouncementScreen } from './engage-feed';
import { ACK_ROWS } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-03 · Announcement composer and acknowledgement tracking', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Compose: S = { name: 'Composer (audience, channels, acknowledgement)', render: () => <AnnouncementScreen view="compose" /> };
export const SensitiveValue: S = { name: 'Blocked: amount in an external channel', render: () => <AnnouncementScreen view="compose" sensitive /> };
export const Tracking: S = { name: 'Acknowledgement tracking', render: () => <AnnouncementScreen view="tracking" rows={ACK_ROWS} /> };
export const AllAcknowledged: S = { name: 'Tracking · everyone acknowledged', render: () => <AnnouncementScreen view="tracking" rows={ACK_ROWS.map((r) => ({ ...r, read: r.read ?? new Date(2026, 8, 28), acked: r.acked ?? new Date(2026, 8, 28) }))} /> };

import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobBoardsScreen, type JobBoardsScreenProps } from './boards';

// Recruitment, wired (batch AT3; M10-BUILD-DESIGN §6). In the affordance guard set ('screens-hiring-live').
// boards is sample props shared with the tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/Live · Careers site and job boards', parameters: { layout: 'fullscreen' }, excludeStories: ['boards'] };
export default meta;
type S = StoryObj;

const ok = async () => ({});
export const boards: JobBoardsScreenProps = {
  state: 'ready',
  boards: [
    { id: 'b1', name: 'Naukri', provider: 'xml_feed', configured: true, publishedJobCount: 4, feedUrl: 'https://api.example.com/api/v1/public/job-boards/abc/feed.xml' },
    { id: 'b2', name: 'LinkedIn', provider: 'linkedin', configured: false, publishedJobCount: 0, feedUrl: '' },
  ],
  providers: [{ id: 'linkedin', configFields: [{ key: 'accessToken', label: 'Access token', required: true, secret: true }, { key: 'organizationUrn', label: 'Organisation URN', required: true, secret: false, placeholder: 'urn:li:organization:123' }] }],
  onCreate: ok,
  onSave: ok,
  onDelete: ok,
  onCopy: ok,
};

export const JobBoards: S = { render: () => <JobBoardsScreen {...boards} /> };
export const NoJobBoards: S = { render: () => <JobBoardsScreen {...boards} boards={[]} /> };

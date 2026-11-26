import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobBoardsScreen, type JobBoardsScreenProps } from './boards';

// HIR-32 Job boards (batch AT3; M10-BUILD-DESIGN §6; drawn here as the design, E2 part 6): where jobs are posted, the
// feed link and Easy Apply. In the affordance guard set ('screens-hiring-hir-32'). boards is sample props shared with the
// tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/HIR-32 · Job boards', parameters: { layout: 'fullscreen' }, excludeStories: ['boards'] };
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

export const JobBoards: S = { name: 'HIR-32 · Job boards', render: () => <JobBoardsScreen {...boards} /> };
export const NoJobBoards: S = { name: 'HIR-32 · No boards yet', render: () => <JobBoardsScreen {...boards} boards={[]} /> };
export const WithEasyApply: S = {
  name: 'HIR-32 · Easy Apply addresses',
  render: () => <JobBoardsScreen {...boards} easyApply={{ providers: [{ id: 'linkedin', label: 'LinkedIn', configured: true, ingestUrl: 'https://api.example.com/api/v1/public/easy-apply/linkedin' }, { id: 'indeed', label: 'Indeed', configured: false, ingestUrl: 'https://api.example.com/api/v1/public/easy-apply/indeed' }], onSet: ok, onTurnOff: ok }} />,
};
export const Loading: S = { name: 'HIR-32 · Loading', render: () => <JobBoardsScreen {...boards} state="loading" /> };
export const Failed: S = { name: 'HIR-32 · Could not load', render: () => <JobBoardsScreen {...boards} state="error" /> };

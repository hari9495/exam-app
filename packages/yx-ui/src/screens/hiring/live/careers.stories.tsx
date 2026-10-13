import type { Meta, StoryObj } from '@storybook/react-vite';
import { CareersSiteScreen, type CareersSiteScreenProps } from './careers';
import { JobBoardsScreen, type JobBoardsScreenProps } from './boards';

// Recruitment, wired (batch AT3; M10-BUILD-DESIGN §6). In the affordance guard set ('screens-hiring-live').
const meta: Meta = { title: 'Screens/Hiring/Live · Careers site and job boards', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
export const careers: CareersSiteScreenProps = {
  state: 'ready',
  settings: { enabled: true, assistantEnabled: false, headline: 'Grow with Kaveri', intro: 'We make food people trust.', bannerUrl: null },
  publicUrl: 'https://hr.example.com/careers/kaveri',
  onSave: ok,
  onUploadBanner: ok,
  entities: [
    { id: 'e1', name: 'Kaveri Foods Pvt Ltd', page: { slug: 'kaveri-foods', headline: 'Cook with us', intro: null, primaryColor: '#1f6feb' } },
    { id: 'e2', name: 'Kaveri Retail LLP', page: null },
  ],
  onSaveEntity: ok,
  onRemoveEntity: ok,
  notices: [
    { id: 'n2', purpose: 'application', version: 2, text: 'We use your details to consider you for this job and keep them for 12 months.', publishedAt: '2026-10-10T09:00:00.000Z' },
    { id: 'n1', purpose: 'application', version: 1, text: 'We use your details to consider you for this job.', publishedAt: '2026-09-01T09:00:00.000Z' },
  ],
  onPublishNotice: ok,
};
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
  costs: [{ id: 'c1', source: 'Naukri', jobTitle: 'Senior Accountant', amount: 4500, currency: 'INR', createdAt: '2026-10-11T09:00:00.000Z' }],
  jobs: [{ value: 'j1', label: 'Senior Accountant' }],
  onAddCost: ok,
};

export const CareersSite: S = { render: () => <CareersSiteScreen {...careers} /> };
export const CareersSiteNoNotices: S = { render: () => <CareersSiteScreen {...careers} notices={[]} entities={[]} /> };
export const JobBoards: S = { render: () => <JobBoardsScreen {...boards} /> };
export const NoJobBoards: S = { render: () => <JobBoardsScreen {...boards} boards={[]} costs={[]} /> };

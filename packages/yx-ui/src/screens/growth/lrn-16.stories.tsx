import type { Meta, StoryObj } from '@storybook/react-vite';
import { AiCourseDraftScreen } from './learn-admin';
import { DRAFT } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-16 · AI course draft review', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Draft: S = { name: 'Draft, no reviewer yet (publish blocked)', render: () => <AiCourseDraftScreen draft={DRAFT} /> };
export const ReadyToPublish: S = { name: 'Reviewer named', render: () => <AiCourseDraftScreen draft={{ ...DRAFT, reviewer: 'Deepa Rao' }} /> };
export const SourceChanged: S = { name: 'Source policy changed: review needed', render: () => <AiCourseDraftScreen draft={{ ...DRAFT, reviewer: 'Deepa Rao', sourceChanged: true, sources: [{ name: 'Leave policy', version: 'v3', updated: true }, DRAFT.sources[1]] }} /> };

import type { Meta, StoryObj } from '@storybook/react-vite';
import { IntegrityReportsScreen } from '../integrity';

const meta: Meta<typeof IntegrityReportsScreen> = { title: 'Screens/Proctoring/PRC-20 · Integrity reports', component: IntegrityReportsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IntegrityReportsScreen>;

export const Collusion: S = {};
export const Plagiarism: S = { name: 'Plagiarism and code similarity', args: { tab: 'plagiarism' } };
export const Agreement: S = { name: 'Inter-rater agreement', args: { tab: 'agreement' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };

// AS-5 part 3: a real test's clusters, similar code and marker agreement.
export const LiveReports: S = {
  name: 'Live · a real test',
  args: {
    live: {
      state: 'ready',
      onRetry: () => {},
      tests: [{ id: 't1', title: 'Campus aptitude 2026' }],
      onTest: () => {},
      onExport: async () => undefined,
      data: {
        test: { id: 't1', title: 'Campus aptitude 2026' },
        attempts: 412,
        minSame: 5,
        clusters: [{ id: 'CL-01', who: ['Rahul Deshpande', 'Harish Gowda', 'Tarun Joshi'], same: 9, timing: 'Started within 6 min', incident: '1 of 3 in review' }],
        sizes: [{ size: '2', clusters: 0 }, { size: '3', clusters: 1 }, { size: '4', clusters: 0 }, { size: '5+', clusters: 0 }],
        pairs: [{ pair: 'Manoj Kumar · Sanjay Chatterjee', question: 'Reverse a linked list in place', similarity: 91 }],
        agreement: { weeks: [{ week: 'W45', kappa: 0.66 }, { week: 'W46', kappa: 0.72 }, { week: 'W47', kappa: 0.74 }], target: 0.7, markers: [{ pair: 'Arvind Swamy · Farah Siddiqui', moderated: 3, of: 22 }], doubleMarked: 40 },
      },
    },
  },
};

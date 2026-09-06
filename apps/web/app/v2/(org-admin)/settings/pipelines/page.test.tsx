import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PipelinesPage from './page';
import type { Pipeline } from '../../../../../lib/types';

// Renders the pipelines settings page with usePipelines/useAuth/useExams mocked -- this is a
// pure component test, not a data-layer one. Note: page.tsx imports each ui-v2 component from
// its own file (not the components/ui-v2 barrel) specifically so this test doesn't drag in
// DataTable's ESM-only @tanstack/react-table dependency, which jest can't parse.
jest.mock('../../../../../lib/auth-context', () => ({
  useAuth: () => ({ role: 'org_admin', actingSuperAdmin: false, accessToken: 'tok' }),
}));

const updateStageMutate = jest.fn();

const pipeline: Pipeline = {
  id: 'p1',
  name: 'Default',
  isDefault: true,
  stages: [
    {
      id: 's1',
      name: 'Screening',
      category: 'active',
      position: 0,
      statuses: [],
      rules: [{ id: 'r1', type: 'checklist', items: [{ id: 'i1', label: 'Background check' }] }],
    },
  ],
};

jest.mock('../../../../../lib/hooks/usePipelines', () => ({
  usePipelines: () => ({ data: [pipeline], isLoading: false, isError: false }),
  useCreatePipeline: () => ({ mutate: jest.fn(), isPending: false }),
  useDeletePipeline: () => ({ mutate: jest.fn(), isPending: false }),
  useCreateStage: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateStage: () => ({ mutate: updateStageMutate, isPending: false }),
  useDeleteStage: () => ({ mutate: jest.fn(), isPending: false }),
  useCreateStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useOrgPipelineSettings: () => ({ data: { autoArchiveSiblingsOnHire: true } }),
  useUpdateOrgPipelineSettings: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../../../../lib/hooks/useExams', () => ({
  useExams: () => ({ data: { data: [{ id: 'e1', title: 'JS Basics' }] } }),
}));

describe('Pipelines settings — stage requirements editor', () => {
  beforeEach(() => updateStageMutate.mockClear());

  it("renders an existing stage's rules, and adding + saving a rule calls updateStage.mutate with the rules array", async () => {
    const user = userEvent.setup();
    render(<PipelinesPage />);

    await user.click(screen.getByRole('button', { name: /Requirements/ }));

    // Existing checklist rule (from stage.rules) renders with its item.
    expect(screen.getByDisplayValue('Background check')).toBeInTheDocument();

    // Add a feedback rule.
    await user.click(screen.getByRole('button', { name: /^Feedback$/ }));
    expect(screen.getByLabelText('Min feedback count')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save requirements/ }));

    expect(updateStageMutate).toHaveBeenCalledTimes(1);
    expect(updateStageMutate).toHaveBeenCalledWith(
      {
        stageId: 's1',
        rules: [
          expect.objectContaining({ id: 'r1', type: 'checklist' }),
          expect.objectContaining({ type: 'feedback' }),
        ],
      },
      expect.anything(),
    );
  });
});

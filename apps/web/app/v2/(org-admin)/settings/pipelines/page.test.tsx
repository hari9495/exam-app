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

  it('adding a checklist rule seeds one blank item (never an empty items array)', async () => {
    const user = userEvent.setup();
    render(<PipelinesPage />);

    await user.click(screen.getByRole('button', { name: /Requirements/ }));
    await user.click(screen.getByRole('button', { name: /^Checklist$/ }));

    // One "Item 1" for the existing rule (filled) and one for the newly-added rule (blank).
    const items = screen.getAllByLabelText('Item 1');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveValue('');
  });

  it('blocks saving a checklist rule that has only blank-label items', async () => {
    const user = userEvent.setup();
    render(<PipelinesPage />);

    await user.click(screen.getByRole('button', { name: /Requirements/ }));
    await user.click(screen.getByRole('button', { name: /^Checklist$/ }));
    await user.click(screen.getByRole('button', { name: /Save requirements/ }));

    expect(updateStageMutate).not.toHaveBeenCalled();
    expect(await screen.findByText('Checklist requirements need at least one item.')).toBeInTheDocument();
  });

  it('saves a checklist rule with a filled item and drops its blank sibling items', async () => {
    const user = userEvent.setup();
    render(<PipelinesPage />);

    await user.click(screen.getByRole('button', { name: /Requirements/ }));
    await user.click(screen.getByRole('button', { name: /^Checklist$/ }));

    // Give the newly-added rule a second (blank) item, then fill only the first.
    const addItemButtons = screen.getAllByRole('button', { name: /Add item/ });
    await user.click(addItemButtons[addItemButtons.length - 1]);
    const items = screen.getAllByLabelText('Item 1');
    await user.type(items[items.length - 1], 'Sign NDA');

    await user.click(screen.getByRole('button', { name: /Save requirements/ }));

    expect(updateStageMutate).toHaveBeenCalledTimes(1);
    expect(updateStageMutate).toHaveBeenCalledWith(
      {
        stageId: 's1',
        rules: [
          expect.objectContaining({ id: 'r1', type: 'checklist', items: [{ id: 'i1', label: 'Background check' }] }),
          expect.objectContaining({ type: 'checklist', items: [expect.objectContaining({ label: 'Sign NDA' })] }),
        ],
      },
      expect.anything(),
    );
  });
});

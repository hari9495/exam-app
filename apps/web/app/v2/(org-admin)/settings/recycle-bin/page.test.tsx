import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as useRecycleBinHooks from '../../../../../lib/hooks/useRecycleBin';
import V2RecycleBinSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useRecycleBin');

const mockedUseRecycleBin = useRecycleBinHooks.useRecycleBin as jest.Mock;
const mockedUseRestore = useRecycleBinHooks.useRestoreRecycleBinEntry as jest.Mock;
const mockedUsePurge = useRecycleBinHooks.usePurgeRecycleBinEntry as jest.Mock;

const ENTRIES = [
  { entityType: 'candidate', id: 'c1', label: 'Jane Doe', deletedAt: '2026-09-01T00:00:00.000Z', deletedByUserId: 'u1' },
  { entityType: 'job', id: 'j1', label: 'Backend Engineer', deletedAt: '2026-09-02T00:00:00.000Z', deletedByUserId: 'u1' },
  { entityType: 'pipeline', id: 'p1', label: 'Standard Pipeline', deletedAt: '2026-09-03T00:00:00.000Z', deletedByUserId: null },
  { entityType: 'walk-in-group', id: 'w1', label: 'Sept Walk-in', deletedAt: '2026-09-04T00:00:00.000Z', deletedByUserId: null },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2RecycleBinSettingsPage />
    </QueryClientProvider>,
  );
}

describe('V2RecycleBinSettingsPage', () => {
  let restoreMutate: jest.Mock;
  let purgeMutate: jest.Mock;

  beforeEach(() => {
    restoreMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    purgeMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseRecycleBin.mockReturnValue({ data: ENTRIES, isLoading: false, isError: false });
    mockedUseRestore.mockReturnValue({ mutate: restoreMutate, isPending: false });
    mockedUsePurge.mockReturnValue({ mutate: purgeMutate, isPending: false });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists soft-deleted items with their type and label', () => {
    renderPage();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Standard Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Sept Walk-in')).toBeInTheDocument();
  });

  it('shows the empty state when the bin is empty', () => {
    mockedUseRecycleBin.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/recycle bin is empty/i)).toBeInTheDocument();
  });

  it('Restore calls the restore mutation with {entityType,id}', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /restore jane doe/i }));
    await waitFor(() => expect(restoreMutate).toHaveBeenCalledWith(
      { entityType: 'candidate', id: 'c1' },
      expect.anything(),
    ));
  });

  it('Delete forever asks for confirmation then calls the purge mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete forever.*backend engineer/i }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(purgeMutate).toHaveBeenCalledWith(
      { entityType: 'job', id: 'j1' },
      expect.anything(),
    ));
  });

  it('Delete forever does nothing if the confirm is declined', () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete forever.*backend engineer/i }));
    expect(purgeMutate).not.toHaveBeenCalled();
  });
});

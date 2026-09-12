import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../../../../../lib/auth-context';
import * as useJobBoardsHooks from '../../../../../lib/hooks/useJobBoards';
import V2JobBoardsSettingsPage from './page';

jest.mock('../../../../../lib/auth-context');
jest.mock('../../../../../lib/hooks/useJobBoards');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedUseJobBoards = useJobBoardsHooks.useJobBoards as jest.Mock;
const mockedUseCreateJobBoard = useJobBoardsHooks.useCreateJobBoard as jest.Mock;
const mockedUseUpdateJobBoard = useJobBoardsHooks.useUpdateJobBoard as jest.Mock;
const mockedUseDeleteJobBoard = useJobBoardsHooks.useDeleteJobBoard as jest.Mock;
const mockedUseJobBoardProviders = useJobBoardsHooks.useJobBoardProviders as jest.Mock;
const mockedUseJobBoardConfig = useJobBoardsHooks.useJobBoardConfig as jest.Mock;
const mockedUseSaveJobBoardConfig = useJobBoardsHooks.useSaveJobBoardConfig as jest.Mock;

const BOARDS = [
  { id: 'b1', name: 'LinkedIn', feedUrl: 'https://app.example.com/public/job-boards/tok1/feed.xml', publishedJobCount: 3, provider: 'xml_feed', configured: true },
  { id: 'b2', name: 'Indeed', feedUrl: 'https://app.example.com/public/job-boards/tok2/feed.xml', publishedJobCount: 0, provider: 'xml_feed', configured: true },
];

const PROVIDERS = [
  { id: 'linkedin', label: 'LinkedIn', configFields: [{ key: 'accessToken', label: 'Access token', secret: true, required: true }, { key: 'authorUrn', label: 'Company URN', secret: false, required: true }] },
  { id: 'indeed', label: 'Indeed', configFields: [{ key: 'apiKey', label: 'API key', secret: true, required: true }] },
  { id: 'http', label: 'Generic HTTP', configFields: [{ key: 'postUrl', label: 'Post URL', secret: false, required: true }] },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2JobBoardsSettingsPage />
    </QueryClientProvider>,
  );
}

describe('V2JobBoardsSettingsPage', () => {
  let createMutate: jest.Mock;
  let updateMutate: jest.Mock;
  let deleteMutate: jest.Mock;
  let saveConfigMutate: jest.Mock;

  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ role: 'org_admin', actingSuperAdmin: false });
    mockedUseJobBoards.mockReturnValue({ data: BOARDS, isLoading: false, isError: false });

    createMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseCreateJobBoard.mockReturnValue({ mutate: createMutate, isPending: false });

    updateMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseUpdateJobBoard.mockReturnValue({ mutate: updateMutate, isPending: false });

    deleteMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseDeleteJobBoard.mockReturnValue({ mutate: deleteMutate, isPending: false });

    mockedUseJobBoardProviders.mockReturnValue({ data: PROVIDERS });
    mockedUseJobBoardConfig.mockReturnValue({ data: { provider: 'xml_feed', configured: true, config: {} } });
    saveConfigMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseSaveJobBoardConfig.mockReturnValue({ mutate: saveConfigMutate, isPending: false });
  });

  it('denies access to non org_admin roles', () => {
    mockedUseAuth.mockReturnValue({ role: 'recruiter', actingSuperAdmin: false });
    renderPage();
    expect(screen.getByText(/don.t have access/i)).toBeInTheDocument();
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument();
  });

  it('lists boards with name, published count and feed url', () => {
    renderPage();
    expect(screen.getByDisplayValue('LinkedIn')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Indeed')).toBeInTheDocument();
    expect(screen.getByText(/3 published/i)).toBeInTheDocument();
    expect(screen.getByText(/0 published/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://app.example.com/public/job-boards/tok1/feed.xml')).toBeInTheDocument();
  });

  it('shows the empty state when there are no boards', () => {
    mockedUseJobBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/no job boards yet/i)).toBeInTheDocument();
  });

  it('"Add board" opens the dialog and submitting calls the create mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add board/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Glassdoor' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledWith('Glassdoor', expect.anything()));
  });

  it('editing the name field calls the update mutation on blur', () => {
    renderPage();
    const indeedName = screen.getByDisplayValue('Indeed');
    fireEvent.change(indeedName, { target: { value: 'Indeed Jobs' } });
    fireEvent.blur(indeedName);

    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'b2', name: 'Indeed Jobs' },
      expect.anything(),
    );
  });

  it('deleting a row calls the delete mutation with its id', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete indeed/i }));
    expect(deleteMutate).toHaveBeenCalledWith('b2', expect.anything());
  });

  it('copy button copies the feed url to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /copy linkedin feed link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.example.com/public/job-boards/tok1/feed.xml'));
  });

  it('a free-feed board shows no "needs credentials" chip and exposes its feed link', () => {
    renderPage();
    expect(screen.queryByText('Needs credentials')).not.toBeInTheDocument();
    expect(screen.getAllByText('Free XML feed').length).toBe(2);
  });

  it('configuring a board as an HTTP push provider saves the provider + config', async () => {
    renderPage();
    // Open the config dialog for the first board.
    fireEvent.click(screen.getAllByRole('button', { name: /configure posting/i })[0]);
    // Switch it to Generic HTTP and fill the post URL.
    fireEvent.change(screen.getByLabelText('Post jobs via'), { target: { value: 'http' } });
    fireEvent.change(screen.getByLabelText(/Post URL/), { target: { value: 'https://boards.example.com/jobs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveConfigMutate).toHaveBeenCalled());
    expect(saveConfigMutate.mock.calls[0][0]).toEqual({ id: 'b1', provider: 'http', config: { postUrl: 'https://boards.example.com/jobs' } });
  });

  it('a paid board that needs credentials shows the warning chip', () => {
    mockedUseJobBoards.mockReturnValue({
      data: [{ id: 'b3', name: 'LinkedIn push', feedUrl: 'x', publishedJobCount: 0, provider: 'linkedin', configured: false }],
      isLoading: false, isError: false,
    });
    renderPage();
    expect(screen.getByText('Needs credentials')).toBeInTheDocument();
  });
});

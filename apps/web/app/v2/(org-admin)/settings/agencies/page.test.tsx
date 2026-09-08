import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../../../../../lib/auth-context';
import * as useAgenciesHooks from '../../../../../lib/hooks/useAgencies';
import * as usePipelineHooks from '../../../../../lib/hooks/usePipeline';
import V2AgenciesSettingsPage from './page';

jest.mock('../../../../../lib/auth-context');
jest.mock('../../../../../lib/hooks/useAgencies');
jest.mock('../../../../../lib/hooks/usePipeline');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedUseAgencies = useAgenciesHooks.useAgencies as jest.Mock;
const mockedUseCreateAgency = useAgenciesHooks.useCreateAgency as jest.Mock;
const mockedUseUpdateAgency = useAgenciesHooks.useUpdateAgency as jest.Mock;
const mockedUseDeleteAgency = useAgenciesHooks.useDeleteAgency as jest.Mock;
const mockedUseRegenerateAgencyToken = useAgenciesHooks.useRegenerateAgencyToken as jest.Mock;
const mockedUseJobs = usePipelineHooks.useJobs as jest.Mock;

// Real portalUrl the mocked hook returns -- the test asserts THIS exact string shows up
// verbatim in the rendered page, rather than reconstructing `${something}/agency/${token}`
// itself (that would just be re-testing the mock, not the component).
const AGENCIES = [
  { id: 'a1', name: 'Acme Staffing', contactEmail: 'ops@acme-staffing.com', active: true, portalUrl: 'https://app.example.com/agency/tok-a1-xyz', assignedJobCount: 1, pendingSubmissionCount: 2, jobIds: ['j1'] },
  { id: 'a2', name: 'Talent Bridge', contactEmail: null, active: false, portalUrl: 'https://app.example.com/agency/tok-a2-abc', assignedJobCount: 0, pendingSubmissionCount: 0, jobIds: [] },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2AgenciesSettingsPage />
    </QueryClientProvider>,
  );
}

describe('V2AgenciesSettingsPage', () => {
  let createMutate: jest.Mock;
  let updateMutate: jest.Mock;
  let deleteMutate: jest.Mock;
  let regenerateMutate: jest.Mock;

  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    mockedUseAuth.mockReturnValue({ role: 'org_admin', actingSuperAdmin: false });
    mockedUseAgencies.mockReturnValue({ data: AGENCIES, isLoading: false, isError: false });
    mockedUseJobs.mockReturnValue({ data: [{ id: 'j1', title: 'Backend Engineer' }, { id: 'j2', title: 'Recruiter' }], isLoading: false });

    createMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseCreateAgency.mockReturnValue({ mutate: createMutate, isPending: false });

    updateMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseUpdateAgency.mockReturnValue({ mutate: updateMutate, isPending: false });

    deleteMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseDeleteAgency.mockReturnValue({ mutate: deleteMutate, isPending: false });

    regenerateMutate = jest.fn((_input, opts) => opts?.onSuccess?.({ portalUrl: 'https://app.example.com/agency/tok-a1-NEW' }));
    mockedUseRegenerateAgencyToken.mockReturnValue({ mutate: regenerateMutate, isPending: false });

    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('denies access to non org_admin roles', () => {
    mockedUseAuth.mockReturnValue({ role: 'recruiter', actingSuperAdmin: false });
    renderPage();
    expect(screen.getByText(/don.t have access/i)).toBeInTheDocument();
    expect(screen.queryByText('Acme Staffing')).not.toBeInTheDocument();
  });

  it('lists agencies and shows the portalUrl from the hook verbatim next to the Copy button', () => {
    renderPage();
    expect(screen.getByDisplayValue('Acme Staffing')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Talent Bridge')).toBeInTheDocument();
    // Verbatim: the exact string the mocked hook returned, not a client-rebuilt URL.
    expect(screen.getByText('https://app.example.com/agency/tok-a1-xyz')).toBeInTheDocument();
    expect(screen.getByText('https://app.example.com/agency/tok-a2-abc')).toBeInTheDocument();
  });

  it('shows an active badge for active agencies and inactive for others', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /toggle acme staffing active/i })).toHaveTextContent('Active');
    expect(screen.getByRole('button', { name: /toggle talent bridge active/i })).toHaveTextContent('Inactive');
  });

  it('shows the empty state when there are no agencies', () => {
    mockedUseAgencies.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/no agencies yet/i)).toBeInTheDocument();
  });

  it('"Add agency" opens the dialog and submitting calls the create mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add agency/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'New Co' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledWith(
      { name: 'New Co', contactEmail: undefined, active: true, jobIds: [] },
      expect.anything(),
    ));
  });

  it('copying the portal link calls the clipboard API with the verbatim portalUrl', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /copy portal link for acme staffing/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.example.com/agency/tok-a1-xyz');
  });

  it('regenerate confirms with a message about the old link breaking, then updates the shown URL', async () => {
    renderPage();
    const regenerateButtons = screen.getAllByRole('button', { name: /regenerate link/i });
    fireEvent.click(regenerateButtons[0]);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/old link stops working/i));
    expect(regenerateMutate).toHaveBeenCalledWith('a1', expect.anything());
    await waitFor(() => expect(screen.getByText('https://app.example.com/agency/tok-a1-NEW')).toBeInTheDocument());
  });

  it('deleting a row confirms then calls the delete mutation with its id', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete talent bridge/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledWith('a2', expect.anything());
  });

  it('surfaces the 409 message when deleting an agency with submissions', () => {
    deleteMutate = jest.fn((_id, opts) => opts?.onError?.(new Error('Cannot delete an agency with submissions')));
    mockedUseDeleteAgency.mockReturnValue({ mutate: deleteMutate, isPending: false });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete acme staffing/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Cannot delete an agency with submissions');
  });

  it('opening "Assigned jobs" pre-checks the agency\'s current allowlist, so an unmodified Save keeps it intact', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /assigned jobs/i })[0]);

    const dialog = screen.getByRole('dialog');
    const backendCheckbox = within(dialog).getByRole('checkbox', { name: 'Backend Engineer' });
    const recruiterCheckbox = within(dialog).getByRole('checkbox', { name: 'Recruiter' });
    // a1's jobIds is ['j1'] (Backend Engineer) -- pre-checked, not opened empty.
    expect(backendCheckbox).toBeChecked();
    expect(recruiterCheckbox).not.toBeChecked();

    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(updateMutate).toHaveBeenCalledWith({ id: 'a1', jobIds: ['j1'] }, expect.anything()));
  });

  it('renaming a row calls the update mutation on blur', () => {
    renderPage();
    const talentBridgeName = screen.getByDisplayValue('Talent Bridge');
    fireEvent.change(talentBridgeName, { target: { value: 'Talent Bridge Inc' } });
    fireEvent.blur(talentBridgeName);
    expect(updateMutate).toHaveBeenCalledWith({ id: 'a2', name: 'Talent Bridge Inc' }, expect.anything());
  });
});

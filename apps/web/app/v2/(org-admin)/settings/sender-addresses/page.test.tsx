import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../../../../../lib/auth-context';
import * as useOrgSenderAddressesHooks from '../../../../../lib/hooks/useOrgSenderAddresses';
import V2SenderAddressesSettingsPage from './page';

jest.mock('../../../../../lib/auth-context');
jest.mock('../../../../../lib/hooks/useOrgSenderAddresses');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedUseOrgSenderAddresses = useOrgSenderAddressesHooks.useOrgSenderAddresses as jest.Mock;
const mockedUseCreateSenderAddress = useOrgSenderAddressesHooks.useCreateSenderAddress as jest.Mock;
const mockedUseUpdateSenderAddress = useOrgSenderAddressesHooks.useUpdateSenderAddress as jest.Mock;
const mockedUseDeleteSenderAddress = useOrgSenderAddressesHooks.useDeleteSenderAddress as jest.Mock;

const SENDERS = [
  { id: 's1', label: 'Recruiting', address: 'recruiting@acme.com', isDefault: true },
  { id: 's2', label: 'Support', address: 'support@acme.com', isDefault: false },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2SenderAddressesSettingsPage />
    </QueryClientProvider>,
  );
}

describe('V2SenderAddressesSettingsPage', () => {
  let createMutate: jest.Mock;
  let updateMutate: jest.Mock;
  let deleteMutate: jest.Mock;

  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ role: 'org_admin', actingSuperAdmin: false });
    mockedUseOrgSenderAddresses.mockReturnValue({ data: SENDERS, isLoading: false, isError: false });

    createMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseCreateSenderAddress.mockReturnValue({ mutate: createMutate, isPending: false });

    updateMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseUpdateSenderAddress.mockReturnValue({ mutate: updateMutate, isPending: false });

    deleteMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseDeleteSenderAddress.mockReturnValue({ mutate: deleteMutate, isPending: false });
  });

  it('denies access to non org_admin roles', () => {
    mockedUseAuth.mockReturnValue({ role: 'recruiter', actingSuperAdmin: false });
    renderPage();
    expect(screen.getByText(/don.t have access/i)).toBeInTheDocument();
    expect(screen.queryByText('Recruiting')).not.toBeInTheDocument();
  });

  it('lists senders with a default badge on the default one only', () => {
    renderPage();
    expect(screen.getByDisplayValue('Recruiting')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Support')).toBeInTheDocument();
    // Only one default badge should be present.
    expect(screen.getAllByText(/^default$/i)).toHaveLength(1);
  });

  it('shows the empty state when there are no senders', () => {
    mockedUseOrgSenderAddresses.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/no sender addresses yet/i)).toBeInTheDocument();
  });

  it('"Add sender" opens the dialog and submitting calls the create mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add sender/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Label'), { target: { value: 'Marketing' } });
    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: 'marketing@acme.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledWith(
      { label: 'Marketing', address: 'marketing@acme.com' },
      expect.anything(),
    ));
  });

  it('editing the label field calls the update mutation on blur', () => {
    renderPage();
    const supportLabel = screen.getByDisplayValue('Support');
    fireEvent.change(supportLabel, { target: { value: 'Customer Support' } });
    fireEvent.blur(supportLabel);

    expect(updateMutate).toHaveBeenCalledWith(
      { id: 's2', label: 'Customer Support' },
      expect.anything(),
    );
  });

  it('deleting a row calls the delete mutation with its id', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete support/i }));
    expect(deleteMutate).toHaveBeenCalledWith('s2', expect.anything());
  });

  it('"Mark default" fires an update with isDefault:true', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /mark support default/i }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 's2', isDefault: true },
      expect.anything(),
    );
  });
});

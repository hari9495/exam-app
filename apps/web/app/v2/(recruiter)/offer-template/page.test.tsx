import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../../../../lib/auth-context';
import * as useOffersHooks from '../../../../lib/hooks/useOffers';
import V2OfferTemplatePage from './page';

jest.mock('../../../../lib/auth-context');
jest.mock('../../../../lib/hooks/useOffers');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedUseOfferTemplates = useOffersHooks.useOfferTemplates as jest.Mock;
const mockedUseCreateOfferTemplate = useOffersHooks.useCreateOfferTemplate as jest.Mock;
const mockedUseUpdateOfferTemplate = useOffersHooks.useUpdateOfferTemplate as jest.Mock;
const mockedUseDeleteOfferTemplate = useOffersHooks.useDeleteOfferTemplate as jest.Mock;

const TEMPLATES = [
  { id: 't1', name: 'Standard', subject: 'Your offer from {{orgName}}', body: 'Standard body', isDefault: true },
  { id: 't2', name: 'Executive', subject: 'Executive offer', body: 'Executive body', isDefault: false },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2OfferTemplatePage />
    </QueryClientProvider>,
  );
}

describe('V2OfferTemplatePage', () => {
  let createMutate: jest.Mock;
  let updateMutate: jest.Mock;
  let deleteMutate: jest.Mock;

  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ role: 'org_admin' });
    mockedUseOfferTemplates.mockReturnValue({ data: TEMPLATES, isLoading: false, isError: false });

    createMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseCreateOfferTemplate.mockReturnValue({ mutate: createMutate, isPending: false });

    updateMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseUpdateOfferTemplate.mockReturnValue({ mutate: updateMutate, isPending: false });

    deleteMutate = jest.fn((_input, opts) => opts?.onSuccess?.());
    mockedUseDeleteOfferTemplate.mockReturnValue({ mutate: deleteMutate, isPending: false });
  });

  it('denies access to panel role', () => {
    mockedUseAuth.mockReturnValue({ role: 'panel' });
    renderPage();
    expect(screen.getByText(/don.t have access/i)).toBeInTheDocument();
    expect(screen.queryByText('Standard')).not.toBeInTheDocument();
  });

  it('lists templates with the default one badged', () => {
    renderPage();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Executive')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows an empty state with no templates', () => {
    mockedUseOfferTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText(/no templates yet/i)).toBeInTheDocument();
  });

  it('"Add template" opens the editor and submitting calls the create mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add template/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Contractor' } });
    fireEvent.change(within(dialog).getByLabelText('Subject'), { target: { value: 'Contract offer' } });
    fireEvent.change(within(dialog).getByLabelText('Body'), { target: { value: 'Contract body' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledWith(
      { name: 'Contractor', subject: 'Contract offer', body: 'Contract body' },
      expect.anything(),
    ));
  });

  it('"Edit" opens the editor prefilled and submitting calls the update mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /edit executive/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('Executive')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Subject'), { target: { value: 'Updated subject' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledWith(
      { id: 't2', name: 'Executive', subject: 'Updated subject', body: 'Executive body' },
      expect.anything(),
    ));
  });

  it('"Delete" fires the delete mutation for that template', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete executive/i }));
    expect(deleteMutate).toHaveBeenCalledWith('t2', expect.anything());
  });

  it('"Make default" fires the update mutation with isDefault: true', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /make default/i }));
    expect(updateMutate).toHaveBeenCalledWith({ id: 't2', isDefault: true }, expect.anything());
  });
});

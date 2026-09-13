import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as hooks from '../../../../../lib/hooks/useIntegrations';
import * as ui from '../../../../../components/ui';
import { EmbeddingConfigCard } from './EmbeddingConfigCard';

jest.mock('../../../../../lib/hooks/useIntegrations');
jest.mock('../../../../../components/ui', () => ({ useToast: jest.fn() }));

const mockedUseIntegrations = hooks.useIntegrations as jest.Mock;
const mockedUpdate = hooks.useUpdateEmbeddingConfig as jest.Mock;
const mockedBackfill = hooks.useBackfillEmbeddings as jest.Mock;

describe('EmbeddingConfigCard', () => {
  const mutate = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (ui.useToast as jest.Mock).mockReturnValue({ toast: jest.fn() });
    mockedUpdate.mockReturnValue({ mutate, isPending: false });
    mockedBackfill.mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it('shows the not-configured copy and a form that saves the entered config', async () => {
    mockedUseIntegrations.mockReturnValue({ data: { embeddingConfigured: false, embeddingBaseUrl: null, embeddingModel: null } });
    render(<EmbeddingConfigCard />);
    expect(screen.getByText(/semantic candidate search is off/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Embeddings endpoint/i), { target: { value: 'https://api.openai.com/v1' } });
    fireEvent.change(screen.getByLabelText(/Embedding model/i), { target: { value: 'text-embedding-3-small' } });
    fireEvent.change(screen.getByLabelText(/API key/i), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: /save & verify/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      { baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small', apiKey: 'sk-test' },
      expect.anything(),
    ));
  });

  it('shows the configured summary + a backfill button when configured', () => {
    mockedUseIntegrations.mockReturnValue({ data: { embeddingConfigured: true, embeddingBaseUrl: 'https://x', embeddingModel: 'text-embedding-3-small' } });
    render(<EmbeddingConfigCard />);
    expect(screen.getByText(/Configured — text-embedding-3-small/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Backfill existing candidates/i })).toBeInTheDocument();
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as hooks from '../../../../../lib/hooks/useIntegrations';
import * as ui from '../../../../../components/ui';
import { HrisConfigCard } from './HrisConfigCard';

jest.mock('../../../../../lib/hooks/useIntegrations');
jest.mock('../../../../../components/ui', () => ({ useToast: jest.fn() }));

const mockedUseIntegrations = hooks.useIntegrations as jest.Mock;
const mockedUpdate = hooks.useUpdateHrisConfig as jest.Mock;

describe('HrisConfigCard', () => {
  const mutate = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (ui.useToast as jest.Mock).mockReturnValue({ toast: jest.fn() });
    mockedUpdate.mockReturnValue({ mutate, isPending: false });
  });

  it('shows the not-configured copy and saves the entered endpoint + token, enabling export', async () => {
    mockedUseIntegrations.mockReturnValue({ data: { hrisExportConfigured: false, hrisExportEnabled: false, hrisProvider: 'generic', hrisTargetUrl: null } });
    render(<HrisConfigCard />);
    expect(screen.getByText(/hired candidates are not exported/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/HRIS endpoint/i), { target: { value: 'https://hris.example.com/in' } });
    fireEvent.change(screen.getByLabelText(/Authorization header/i), { target: { value: 'Bearer tok' } });
    fireEvent.click(screen.getByRole('button', { name: /save & enable/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      { enabled: true, targetUrl: 'https://hris.example.com/in', authHeader: 'Bearer tok' },
      expect.anything(),
    ));
  });

  it('rejects a non-https endpoint without calling the mutation', () => {
    mockedUseIntegrations.mockReturnValue({ data: { hrisExportConfigured: false, hrisExportEnabled: false, hrisProvider: 'generic', hrisTargetUrl: null } });
    render(<HrisConfigCard />);
    fireEvent.change(screen.getByLabelText(/HRIS endpoint/i), { target: { value: 'http://insecure.example.com/in' } });
    fireEvent.click(screen.getByRole('button', { name: /save & enable/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/https/i);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows the enabled summary and a disable toggle when configured + enabled', () => {
    mockedUseIntegrations.mockReturnValue({ data: { hrisExportConfigured: true, hrisExportEnabled: true, hrisProvider: 'generic', hrisTargetUrl: 'https://hris.example.com/in' } });
    render(<HrisConfigCard />);
    expect(screen.getByText(/Enabled — on hire/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /disable export/i }));
    expect(mutate).toHaveBeenCalledWith({ enabled: false }, expect.anything());
  });
});

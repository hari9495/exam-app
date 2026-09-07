import { render, screen, fireEvent } from '@testing-library/react';
import { useApplyConsent, useUpdateApplyConsent } from '../../../../../lib/hooks/useApplyConsent';
import V2ApplyConsentSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useApplyConsent', () => ({
  useApplyConsent: jest.fn(),
  useUpdateApplyConsent: jest.fn(),
}));

describe('V2ApplyConsentSettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpdateApplyConsent as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('renders the currently configured consent text from the GET', () => {
    (useApplyConsent as jest.Mock).mockReturnValue({ data: { text: 'I agree to X', version: 3 }, isLoading: false });

    render(<V2ApplyConsentSettingsPage />);

    expect(screen.getByLabelText('Consent statement')).toHaveValue('I agree to X');
  });

  it('seeds an empty textarea when no consent text is configured', () => {
    (useApplyConsent as jest.Mock).mockReturnValue({ data: { text: null, version: 1 }, isLoading: false });

    render(<V2ApplyConsentSettingsPage />);

    expect(screen.getByLabelText('Consent statement')).toHaveValue('');
  });

  it('Save fires the PUT mutation with the edited text', () => {
    (useApplyConsent as jest.Mock).mockReturnValue({ data: { text: 'I agree to X', version: 3 }, isLoading: false });

    render(<V2ApplyConsentSettingsPage />);
    fireEvent.change(screen.getByLabelText('Consent statement'), { target: { value: 'New consent text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith({ text: 'New consent text' }, expect.anything());
  });

  it('Save with a blank textarea sends text: null', () => {
    (useApplyConsent as jest.Mock).mockReturnValue({ data: { text: 'I agree to X', version: 3 }, isLoading: false });

    render(<V2ApplyConsentSettingsPage />);
    fireEvent.change(screen.getByLabelText('Consent statement'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith({ text: null }, expect.anything());
  });

  it('shows a success notice after a successful save', () => {
    (useApplyConsent as jest.Mock).mockReturnValue({ data: { text: 'I agree to X', version: 3 }, isLoading: false });
    mutate.mockImplementation((_input, { onSuccess }) => onSuccess());

    render(<V2ApplyConsentSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('status')).toHaveTextContent('Consent statement saved.');
  });
});

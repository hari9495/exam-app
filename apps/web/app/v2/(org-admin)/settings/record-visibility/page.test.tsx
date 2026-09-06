import { render, screen, fireEvent } from '@testing-library/react';
import { useRecordVisibility, useUpdateRecordVisibility } from '../../../../../lib/hooks/useRecordVisibility';
import V2RecordVisibilitySettingsPage from './page';

jest.mock('../../../../../lib/hooks/useRecordVisibility', () => ({
  useRecordVisibility: jest.fn(),
  useUpdateRecordVisibility: jest.fn(),
}));

describe('V2RecordVisibilitySettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpdateRecordVisibility as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('renders the current toggle state from the hook', () => {
    (useRecordVisibility as jest.Mock).mockReturnValue({ data: { enabled: false }, isLoading: false });

    render(<V2RecordVisibilitySettingsPage />);

    expect(screen.getByRole('checkbox', { name: /record visibility/i })).not.toBeChecked();
  });

  it('renders checked when the hook reports enabled', () => {
    (useRecordVisibility as jest.Mock).mockReturnValue({ data: { enabled: true }, isLoading: false });

    render(<V2RecordVisibilitySettingsPage />);

    expect(screen.getByRole('checkbox', { name: /record visibility/i })).toBeChecked();
  });

  it('toggling and Save calls the mutation with { enabled: true }', () => {
    (useRecordVisibility as jest.Mock).mockReturnValue({ data: { enabled: false }, isLoading: false });

    render(<V2RecordVisibilitySettingsPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: /record visibility/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(true, expect.anything());
  });

  it('shows the explanatory copy', () => {
    (useRecordVisibility as jest.Mock).mockReturnValue({ data: { enabled: false }, isLoading: false });

    render(<V2RecordVisibilitySettingsPage />);

    expect(
      screen.getByText(/recruiters see only candidates assigned to them or their groups, plus unassigned candidates/i),
    ).toBeInTheDocument();
  });
});

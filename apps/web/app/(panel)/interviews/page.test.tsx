import { render, screen } from '@testing-library/react';
import { useMyInterviews } from '../../../lib/hooks/useInterviews';
import PanelInterviewsPage from './page';

jest.mock('../../../lib/hooks/useInterviews', () => ({ useMyInterviews: jest.fn() }));

describe('PanelInterviewsPage', () => {
  it('renders rows from useMyInterviews with time, location, and status', () => {
    (useMyInterviews as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'interview-1',
          status: 'confirmed',
          location: 'Zoom',
          timeZone: 'UTC',
          confirmedSlotId: 'slot-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          slots: [{ id: 'slot-1', startsAt: '2099-01-15T15:00:00.000Z', endsAt: '2099-01-15T16:00:00.000Z' }],
          panelists: [],
        },
        {
          id: 'interview-2',
          status: 'proposed',
          location: 'On-site',
          timeZone: 'UTC',
          confirmedSlotId: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          slots: [{ id: 'slot-2', startsAt: '2099-02-01T10:00:00.000Z', endsAt: '2099-02-01T11:00:00.000Z' }],
          panelists: [],
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<PanelInterviewsPage />);

    expect(screen.getByText('Zoom')).toBeInTheDocument();
    expect(screen.getByText('On-site')).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText('proposed')).toBeInTheDocument();
  });

  it('shows an empty state when there are no assigned interviews', () => {
    (useMyInterviews as jest.Mock).mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PanelInterviewsPage />);
    expect(screen.getByText('No interviews assigned yet.')).toBeInTheDocument();
  });

  it('shows an error message when the interview list fails to load', () => {
    (useMyInterviews as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<PanelInterviewsPage />);
    expect(screen.getByText('Failed to load Interviews.')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { useExams } from '../../../lib/hooks/useExams';
import PanelReportsPage from './page';

jest.mock('../../../lib/hooks/useExams', () => ({ useExams: jest.fn() }));

describe('PanelReportsPage', () => {
  it('renders the exam list with a link into each exam', () => {
    (useExams as jest.Mock).mockReturnValue({
      data: {
        data: [
          { id: 'exam-1', title: 'Backend Screening', status: 'published' },
          { id: 'exam-2', title: 'Draft Exam', status: 'draft' },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<PanelReportsPage />);

    expect(screen.getByRole('link', { name: 'Backend Screening' })).toHaveAttribute('href', '/reports/exam-1');
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('shows an empty state when there are no exams', () => {
    (useExams as jest.Mock).mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 100, totalPages: 1 },
      isLoading: false,
      isError: false,
    });
    render(<PanelReportsPage />);
    expect(screen.getByText('No exams yet.')).toBeInTheDocument();
  });

  it('shows an error message when the exam list fails to load', () => {
    (useExams as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<PanelReportsPage />);
    expect(screen.getByText('Failed to load Results.')).toBeInTheDocument();
  });
});

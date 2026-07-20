import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders Prev/Next and numbered page buttons, disabling Prev on page 1', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });

  it('disables Next on the last page', () => {
    render(<Pagination page={3} totalPages={3} onPageChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('calls onPageChange with the clicked page number', () => {
    const onPageChange = jest.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with page - 1 / page + 1 for Prev/Next', () => {
    const onPageChange = jest.fn();
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /prev/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('renders nothing when there is only one page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

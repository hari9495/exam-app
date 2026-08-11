import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders its content when open and calls onClose when dismissed', () => {
    const onClose = jest.fn();
    render(
      <Modal open title="Add question" onClose={onClose}>
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByText('Modal body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Add question" onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.queryByText('Modal body')).not.toBeInTheDocument();
  });

  it('applies wider/taller classes for the xl and full sizes than the default', () => {
    const { rerender } = render(
      <Modal open title="Screen Capture" onClose={() => {}} size="xl">
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('max-w-5xl');

    rerender(
      <Modal open title="Screen Capture" onClose={() => {}} size="full">
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('max-w-[96vw]', 'max-h-[96vh]');
  });
});

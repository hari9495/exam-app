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
});

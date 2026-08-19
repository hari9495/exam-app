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

  it('applies a wider class for the xl size than the default', () => {
    render(
      <Modal open title="Screen Capture" onClose={() => {}} size="xl">
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('max-w-5xl');
  });

  it('uses the paper surface + rule hairline (not raw white), keeping its overlay shadow', () => {
    render(
      <Modal open title="Add question" onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('bg-paper');
    expect(panel.className).toContain('border-rule');
    expect(panel.className).toContain('shadow-xl');
    expect(panel.className).not.toContain('bg-white');
  });
});

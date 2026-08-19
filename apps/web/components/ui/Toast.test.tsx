import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const { toast } = useToast();
  return <button onClick={() => toast('Exam published', 'success')}>Fire</button>;
}

describe('Toast', () => {
  it('shows a toast message after it is triggered', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fire' }));
    expect(await screen.findByText('Exam published')).toBeInTheDocument();
  });

  it('tones a success toast with the status-success token, not raw green', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fire' }));
    const message = await screen.findByText('Exam published');
    // The Root carries the tone class; the Description text node is its child.
    const root = message.parentElement as HTMLElement;
    expect(root.className).toContain('bg-status-success');
    expect(root.className).not.toContain('bg-green-600');
  });
});

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
});

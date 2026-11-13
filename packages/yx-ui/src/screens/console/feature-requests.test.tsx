import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { FeatureRequestsConsoleScreen } from './feature-requests';
import { ASSISTANT_REVIEW, FEATURE_REQUESTS } from './data';

// Ask YukthiX (answer 2105): the staff list and the assistant review.
describe('FeatureRequestsConsoleScreen', () => {
  const show = (onDecide = vi.fn().mockResolvedValue(undefined), defaultTab?: 'review') =>
    render(<ToastProvider><FeatureRequestsConsoleScreen state="ready" requests={FEATURE_REQUESTS} review={ASSISTANT_REVIEW} onDecide={onDecide} defaultTab={defaultTab} /></ToastProvider>);

  it('lists requests with how many companies asked and their status', () => {
    show();
    const table = screen.getByRole('table', { name: 'Feature requests' });
    expect(within(table).getByText('Half days for shift workers')).toBeTruthy();
    expect(within(table).getByText('Planned')).toBeTruthy();
  });

  it('marking Done asks first, saying everyone who asked is told; it sends the version', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    show(onDecide);
    const ue = userEvent.setup();
    await ue.click(screen.getAllByRole('button', { name: /actions/i })[0]!);
    await ue.click(await screen.findByRole('menuitem', { name: 'Mark Done' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Everyone who asked \(3 companies\)/)).toBeTruthy();
    await ue.click(within(dialog).getByRole('button', { name: 'Mark Done' }));
    expect(onDecide).toHaveBeenCalledWith('fr1', { status: 'done', version: 3 });
  });

  it('the review shows outcomes and the questions help did not answer, with personal data hidden', () => {
    show(undefined, 'review');
    expect(screen.getByText('Answered from help')).toBeTruthy();
    expect(screen.getByText(/Call me on \[phone\]/)).toBeTruthy();
    expect(screen.getByText('YXS-118')).toBeTruthy();
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AssistantReviewConsoleScreen, FeatureRequestsConsoleScreen } from './feature-requests';
import { CONSOLE_LINKS } from './console-shell';
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

// Answer 2132: the review on its own console page, for the help centre writers.
describe('AssistantReviewConsoleScreen', () => {
  it('shows the same review on its own page, with its own console link', () => {
    render(<ToastProvider><AssistantReviewConsoleScreen state="ready" review={ASSISTANT_REVIEW} /></ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Ask YukthiX review' })).toBeTruthy();
    expect(screen.getByText('Answered from help')).toBeTruthy();
    expect(screen.getByText(/Call me on \[phone\]/)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Feature requests/ })).toBeNull();
    expect(CONSOLE_LINKS.find((l) => l.id === 'assistant-review')).toMatchObject({ href: '/staff/assistant-review', group: 'Catalogue' });
  });

  it('negative: without a key the page says so and shows no review', () => {
    render(<ToastProvider><AssistantReviewConsoleScreen state="no-access" review={null} /></ToastProvider>);
    expect(screen.queryByText('Answered from help')).toBeNull();
    expect(screen.getByText(/the Ask YukthiX review/)).toBeTruthy();
  });
});

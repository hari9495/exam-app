import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hasTabActivityContent, TabActivitySummaryCard, TabActivityBanner } from './TabActivity';

describe('hasTabActivityContent', () => {
  it('is false when there is no summary and no narrative', () => {
    expect(hasTabActivityContent([], null)).toBe(false);
  });

  it('is true when the summary has entries even without a narrative', () => {
    expect(hasTabActivityContent([{ eventType: 'tab_switch', count: 1 }], null)).toBe(true);
  });

  it('is true when there is a narrative even with an empty summary', () => {
    expect(hasTabActivityContent([], { status: 'completed', riskLevel: 'high', summary: 'Suspicious pattern.' })).toBe(true);
  });
});

describe('TabActivitySummaryCard', () => {
  it('renders grouped tool counts under a hedged label, and the AI narrative', () => {
    render(
      <TabActivitySummaryCard
        summary={[{ eventType: 'background_app_detected', count: 3, toolCounts: { WhatsApp: 2, Gmail: 1 } }]}
        proctoringAnalysis={{ status: 'completed', riskLevel: 'high', summary: 'Patterns consistent with outside help.' }}
      />,
    );

    expect(screen.getByText('Possible background app: WhatsApp × 2, Gmail × 1')).toBeInTheDocument();
    expect(screen.getByText('Patterns consistent with outside help.')).toBeInTheDocument();
  });

  it('renders a plain count for an event type with no toolCounts', () => {
    render(<TabActivitySummaryCard summary={[{ eventType: 'tab_switch', count: 4 }]} />);

    expect(screen.getByText('Tab switch × 4')).toBeInTheDocument();
  });

  // The AI names a specific app from a screenshot with no verification step (confirmed in
  // production: a bookmarks-bar shortcut was read as an open tab), so a name-bearing entry gets
  // an explicit caveat -- a deterministic browser event (tab_switch etc.) needs none.
  it('shows a best-guess caveat only when a toolCounts entry is present', () => {
    const { rerender } = render(<TabActivitySummaryCard summary={[{ eventType: 'tab_switch', count: 4 }]} />);
    expect(screen.queryByText(/best guess/)).not.toBeInTheDocument();

    rerender(<TabActivitySummaryCard summary={[{ eventType: 'background_app_detected', count: 1, toolCounts: { WhatsApp: 1 } }]} />);
    expect(screen.getByText(/best guess/)).toBeInTheDocument();
  });
});

describe('TabActivityBanner', () => {
  it('renders nothing when there are no entries', () => {
    const { container } = render(<TabActivityBanner entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the estimated-timing disclaimer, hedges the tool name, and expands reasoning/screenshot with an accuracy caveat on click', async () => {
    render(
      <TabActivityBanner
        entries={[
          { eventType: 'background_app_detected', occurredAt: '2026-01-01T00:07:00.000Z', toolName: 'WhatsApp', reasoning: 'Taskbar icon visible.', screenshot: 'https://example.com/shot.jpg' },
        ]}
      />,
    );

    expect(screen.getByText(/estimated timing/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /WhatsApp/ });
    // Not asserted as a bare fact -- the AI names a specific app from a screenshot with no
    // verification step, and has been confirmed wrong in production (a bookmarks-bar shortcut
    // read as an open tab), so the badge must read as a guess, not an assertion.
    expect(button).toHaveTextContent('Possible background app: WhatsApp');
    await userEvent.click(button);

    expect(screen.getByText(/AI-generated observation/)).toBeInTheDocument();
    expect(screen.getByText('Taskbar icon visible.')).toBeInTheDocument();
    expect(screen.getByAltText('Screen capture')).toHaveAttribute('src', 'https://example.com/shot.jpg');
  });

  it('is not clickable when there is nothing to expand', () => {
    render(<TabActivityBanner entries={[{ eventType: 'tab_switch', occurredAt: '2026-01-01T00:07:00.000Z' }]} />);

    expect(screen.getByRole('button', { name: /Tab switch/ })).toBeDisabled();
  });

  it('collapses repeated entries of the same event type and tool into one badge with a count', () => {
    render(
      <TabActivityBanner
        entries={[
          { eventType: 'background_app_detected', occurredAt: '2026-01-01T00:07:00.000Z', toolName: 'WhatsApp' },
          { eventType: 'background_app_detected', occurredAt: '2026-01-01T00:08:00.000Z', toolName: 'WhatsApp' },
        ]}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText(/× 2/)).toBeInTheDocument();
  });

  it('keeps the event-type label alongside the tool name instead of dropping it', () => {
    render(
      <TabActivityBanner
        entries={[{ eventType: 'remote_access_suspected', occurredAt: '2026-01-01T00:07:00.000Z', toolName: 'AnyDesk' }]}
      />,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Possible remote access');
    expect(button).toHaveTextContent('AnyDesk');
  });
});

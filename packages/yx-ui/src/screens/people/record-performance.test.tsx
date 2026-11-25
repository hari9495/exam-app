import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PerformanceTab } from './record';

// PPL-03 (founder, 22 Oct 2026): Next 1:1 always shows; feedback counts this quarter when known.
describe('Person record · Performance tab', () => {
  it('says when no 1:1 is planned and shows the feedback counts', () => {
    render(<PerformanceTab persona="hr" data={{ period: null, goals: [], lastReview: null, nextOneOnOne: null, feedback: '3 received · 1 given' }} />);
    expect(screen.getByText('None scheduled')).toBeInTheDocument();
    expect(screen.getByText('Feedback this quarter')).toBeInTheDocument();
    expect(screen.getByText('3 received · 1 given')).toBeInTheDocument();
  });
  it('leaves the feedback line out while the counts are unknown', () => {
    render(<PerformanceTab persona="hr" data={{ period: null, goals: [], lastReview: null, nextOneOnOne: 'Thu 1 Oct 2026' }} />);
    expect(screen.getByText('Thu 1 Oct 2026')).toBeInTheDocument();
    expect(screen.queryByText('Feedback this quarter')).toBeNull();
  });
  it('HR with review access see feedback shared with HR; without it the card is not there (answer 9)', () => {
    const base = { period: null, goals: [], lastReview: null, nextOneOnOne: null };
    const { unmount } = render(<PerformanceTab persona="hr" data={{ ...base, sharedFeedback: [{ id: 'f1', from: 'Sita Iyer', kind: 'Suggestion', text: 'Share the dealer plan a week ahead.', at: new Date(2026, 9, 1), goal: 'Dealer growth' }] }} />);
    expect(screen.getByText('Feedback shared with HR')).toBeInTheDocument();
    expect(screen.getByText('Share the dealer plan a week ahead.')).toBeInTheDocument();
    expect(screen.getByText('Reading this is recorded')).toBeInTheDocument();
    unmount();
    render(<PerformanceTab persona="mgr" data={base} />);
    expect(screen.queryByText('Feedback shared with HR')).toBeNull();
  });
  it('an empty list says no one shared feedback with HR', () => {
    render(<PerformanceTab persona="hr" data={{ period: null, goals: [], lastReview: null, nextOneOnOne: null, sharedFeedback: [] }} />);
    expect(screen.getByText('No colleague has shared feedback with HR.')).toBeInTheDocument();
  });
});

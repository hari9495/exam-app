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
});

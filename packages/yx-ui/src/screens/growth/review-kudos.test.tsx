import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewKudosPanel, type ReviewKudosGroup } from './review-kudos';

// T2-C 2661 (answer 2846): the period's kudos on a review, by value; context only, never scored; the person hides one
// until the manager submits.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const GROUPS: ReviewKudosGroup[] = [
  { value: 'Customer first', items: [{ id: 'k1', message: 'Re-ran the tests', from: 'Kiran Rao', on: '2026-08-14T10:00:00Z', badge: 'Above and beyond', hidden: false }] },
  { value: 'Own it', items: [{ id: 'k2', message: 'Built the mock', from: 'Sita Iyer', on: '2026-06-02T10:00:00Z', badge: null, hidden: true }] },
];

describe('Kudos on a review (2661)', () => {
  it('the person sees each kudos by value, with a hide switch; hiding saves with a toast', async () => {
    const onHide = vi.fn(async () => ({}));
    render(<ReviewKudosPanel groups={GROUPS} forPerson onHide={onHide} />);
    expect(screen.getByText('Customer first · 1')).toBeInTheDocument();
    expect(screen.getByText(/Kiran Rao · 14 Aug 2026 · Above and beyond/)).toBeInTheDocument();
    expect(screen.getByText(/Sita Iyer · 2 Jun 2026 · Hidden from reviewers/)).toBeInTheDocument();
    const switches = screen.getAllByRole('switch', { name: 'Hide from review' });
    expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    await ue.click(switches[0]);
    expect(onHide).toHaveBeenCalledWith('k1', true);
    expect((await screen.findAllByText('Hidden from this review.')).length).toBeGreaterThan(0);
    await ue.click(switches[1]);
    expect(onHide).toHaveBeenLastCalledWith('k2', false);
    expect(screen.getByText(/never scored/)).toBeInTheDocument();
  });

  it('negative: a refused change shows why; after the manager submits there is no switch', async () => {
    const onHide = vi.fn(async () => Promise.reject(new Error('Your manager has submitted the review, so the kudos on it can no longer change.')));
    const { unmount } = render(<ReviewKudosPanel groups={GROUPS} forPerson onHide={onHide} />);
    await ue.click(screen.getAllByRole('switch', { name: 'Hide from review' })[0]);
    expect((await screen.findAllByText(/can no longer change/)).length).toBeGreaterThan(0);
    unmount();
    render(<ReviewKudosPanel groups={GROUPS} forPerson />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(/can no longer be hidden/)).toBeInTheDocument();
  });

  it('negative: a reviewer has no switch and is told hidden ones are not shown; no kudos says so', () => {
    const { unmount } = render(<ReviewKudosPanel groups={[GROUPS[0]]} forPerson={false} onHide={vi.fn()} />);
    const card = screen.getByText('Kudos this period').closest('section, div')!;
    expect(within(card as HTMLElement).queryByRole('switch')).toBeNull();
    expect(screen.getByText(/Kudos the person hid are not shown/)).toBeInTheDocument();
    unmount();
    render(<ReviewKudosPanel groups={[]} forPerson={false} />);
    expect(screen.getByText('No kudos in this review period.')).toBeInTheDocument();
  });
});

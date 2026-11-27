import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { MOVES, showsStub } from './yx-moved';
import { MovedPage } from '../app/yx/(app)/moved-page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

// T2-F 82 (answer 2887): an in-app moved page shows the stub for 6 months, then opens the new page at once.
describe('moved pages', () => {
  const replace = jest.fn();
  beforeEach(() => {
    replace.mockReset();
    (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn() });
  });
  afterEach(() => jest.useRealTimers());

  it('the stub lasts 6 months from the move: the last day shows it, the next day does not', () => {
    const m = { to: '/yx/x', title: 'X', since: '2026-11-12' };
    expect(showsStub(m, '2026-11-12')).toBe(true);
    expect(showsStub(m, '2027-05-11')).toBe(true);
    expect(showsStub(m, '2027-05-12')).toBe(false);
    // Every move goes to a YukthiX page and none points at another moved address (no double hop).
    for (const [from, move] of Object.entries(MOVES)) {
      expect(from.startsWith('/yx/') && move.to.startsWith('/yx')).toBe(true);
      expect(MOVES[move.to.split(/[?#]/)[0]]).toBeUndefined();
    }
  });

  it('within 6 months: the stub with the link; it opens the new page after 5 seconds, not before', () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T06:00:00Z') });
    render(<MovedPage from="/yx/settings/payroll-rules" />);
    expect(screen.getByText('This page has moved')).toBeInTheDocument();
    expect(screen.getByText(/It is now Settings › Loans and advances \(\/yx\/settings\/payroll\/loans-and-advances\)/)).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(4900));
    expect(replace).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(100));
    expect(replace).toHaveBeenCalledWith('/yx/settings/payroll/loans-and-advances');
  });

  it('Open now goes at once', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T06:00:00Z'), advanceTimers: true });
    render(<MovedPage from="/yx/me/letters" />);
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Open Me › Documents and letters now' }));
    expect(replace).toHaveBeenCalledWith('/yx/me/documents');
  });

  it('after 6 months: no stub, straight to the new page', () => {
    jest.useFakeTimers({ now: new Date('2027-06-01T06:00:00Z') });
    const { container } = render(<MovedPage from="/yx/me/letters" />);
    expect(container).toBeEmptyDOMElement();
    expect(replace).toHaveBeenCalledWith('/yx/me/documents');
  });
});

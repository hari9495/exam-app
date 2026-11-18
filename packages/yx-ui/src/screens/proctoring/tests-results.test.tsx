import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TestBuilderScreen } from './bank-tests';
import { BUILDER_TEST, liveBuilder, liveResults } from './tests-live-samples';

const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const published = { ...BUILDER_TEST, status: 'published' as const, editable: false };

describe('Results tab on a test page (answer 2437)', () => {
  it('a published test opens on Results: summary, every candidate with status, score, result and integrity', () => {
    wrap(<TestBuilderScreen live={liveBuilder({ test: published, tab: 'results', results: liveResults() })} />);
    expect(screen.getByRole('tab', { name: /Results/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('4 (2 finished)')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Results' });
    for (const t of ['Ananya Iyer', '82.5 %', 'Passed', 'Clear', 'Rahul Menon', 'Not passed', 'Waiting for marking', 'High concern'])
      expect(within(table).getAllByText(t).length).toBeGreaterThan(0);
  });

  it('a draft test has no Results tab (nothing to show yet)', () => {
    wrap(<TestBuilderScreen live={liveBuilder({ results: liveResults() })} />);
    expect(screen.queryByRole('tab', { name: /Results/ })).toBeNull();
  });

  it('opens a candidate report from a row', async () => {
    const onOpen = vi.fn();
    wrap(<TestBuilderScreen live={liveBuilder({ test: published, tab: 'results', results: liveResults({ onOpen }) })} />);
    await userEvent.click(screen.getByText('Ananya Iyer'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ invitationId: 'inv-1' }));
  });

  it('compares 2 chosen people side by side; 1 is refused with a note and nothing is fetched', async () => {
    const onCompare = vi.fn(liveResults().onCompare);
    wrap(<TestBuilderScreen live={liveBuilder({ test: published, tab: 'results', results: liveResults({ onCompare }) })} />);
    const table = screen.getByRole('table', { name: 'Results' });
    await userEvent.click(within(table).getAllByRole('checkbox', { name: /Select Ananya Iyer/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Compare 1' }));
    expect(onCompare).not.toHaveBeenCalled();
    expect((await screen.findAllByText('Choose 2 to 4 people to compare.')).length).toBeGreaterThan(0);
    await userEvent.click(within(table).getAllByRole('checkbox', { name: /Select Rahul Menon/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Compare 2' }));
    expect(onCompare).toHaveBeenCalledWith(['inv-1', 'inv-2']);
    const dialog = await screen.findByRole('dialog', { name: 'Compare candidates' });
    expect(within(dialog).getByText('Java')).toBeTruthy();
    expect(within(dialog).getByText('77.5 %')).toBeTruthy();
  });

  it('releases with an email to each candidate when ticked, after confirming; a refusal stays in the dialog', async () => {
    const onRelease = vi.fn().mockRejectedValueOnce(new Error('Only test owners release results.')).mockResolvedValueOnce({ released: 2 });
    wrap(<TestBuilderScreen live={liveBuilder({ test: published, tab: 'results', results: liveResults({ onRelease }) })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Release results' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /email each candidate/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release' }));
    expect(await within(dialog).findByText('Only test owners release results.')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release' }));
    expect(onRelease).toHaveBeenLastCalledWith(true);
    expect((await screen.findAllByText('Released 2 results')).length).toBeGreaterThan(0);
  });

  it('no Release button for people who cannot release, or when results go out on their own', () => {
    const { unmount } = wrap(<TestBuilderScreen live={liveBuilder({ test: published, tab: 'results', results: liveResults({ onRelease: undefined }) })} />);
    expect(screen.queryByRole('button', { name: 'Release results' })).toBeNull();
    unmount();
    wrap(
      <TestBuilderScreen
        live={liveBuilder({
          test: published,
          tab: 'results',
          results: liveResults({ summary: { totalCandidates: 1, settledCount: 1, passRate: 100, averagePercentage: 90, resultsReleaseMode: 'immediate' } }),
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Release results' })).toBeNull();
  });
});

describe('Test results page for readers (answer 2437)', () => {
  it('asks for a test first; picking one shows its results without a Release button', async () => {
    const { TestResultsScreen } = await import('./tests-results');
    const onPickTest = vi.fn();
    const { rerender } = wrap(<TestResultsScreen live={{ tests: [{ id: 't2', title: 'Campus aptitude 2026' }], testId: null, onPickTest, results: null }} />);
    expect(screen.getByText('Choose a test.')).toBeTruthy();
    rerender(
      <ToastProvider>
        <TestResultsScreen
          live={{ tests: [{ id: 't2', title: 'Campus aptitude 2026' }], testId: 't2', onPickTest, results: liveResults({ onRelease: undefined }) }}
        />
      </ToastProvider>,
    );
    expect(within(screen.getByRole('table', { name: 'Results' })).getByText('Ananya Iyer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Release results' })).toBeNull();
  });
});

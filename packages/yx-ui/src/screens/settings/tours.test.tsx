import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TOURS, TourCard, ToursPanel, shouldShowTour, type LiveTours } from './help';

// Help H-5, founder answer 944: the four tours, live parts. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const tour = (id: string) => TOURS.find((t) => t.id === id)!;

describe('first-run tours (944)', () => {
  it('four tours, each at most 3 steps; the admin tour is version 2 on the set-up hub, at the anchors it marks', () => {
    expect(TOURS.map((t) => t.id)).toEqual(['employee', 'manager', 'payroll', 'admin']);
    for (const t of TOURS) expect(t.steps.length).toBeLessThanOrEqual(3);
    const admin = tour('admin');
    expect(admin.version).toBe(2);
    // The anchors the set-up hub screen marks (platform-a/setup-admin.tsx, data-tour).
    expect(admin.steps.map((s) => s.anchor)).toEqual(['setup-hub', 'setup-starter', 'setup-modules']);
    for (const t of TOURS.filter((x) => x.id !== 'admin')) expect(JSON.stringify(t)).not.toMatch(/set-up hub/i);
  });

  it('answer 1001: someone who finished version 1 is offered version 2 once', () => {
    const admin = tour('admin');
    expect(shouldShowTour(admin, true, [{ tourId: 'admin', version: 1, status: 'completed' }])).toBe(true);
    expect(shouldShowTour(admin, true, [{ tourId: 'admin', version: 1, status: 'completed' }, { tourId: 'admin', version: 2, status: 'completed' }])).toBe(false);
    expect(shouldShowTour(admin, true, [{ tourId: 'admin', version: 2, status: 'skipped' }])).toBe(false);
  });

  it("each step outlines the page part it points at; the outline goes when the tour closes", async () => {
    render(
      <>
        <div data-tour="setup-hub">Hub</div>
        <div data-tour="setup-starter">Starter</div>
        <TourCard tour={tour('admin')} floating />
      </>,
    );
    const hub = screen.getByText('Hub');
    const starter = screen.getByText('Starter');
    expect(hub).toHaveAttribute('data-tour-active');
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(hub).not.toHaveAttribute('data-tour-active');
    expect(starter).toHaveAttribute('data-tour-active');
    await ue.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(starter).not.toHaveAttribute('data-tour-active');
  });

  it('a step whose page part is missing still shows (nothing outlined)', () => {
    render(<TourCard tour={tour('admin')} floating />);
    expect(screen.getByRole('heading', { name: 'Start at the set-up hub' })).toBeInTheDocument();
    expect(document.querySelector('[data-tour-active]')).toBeNull();
  });

  it('floating: focus moves into the tour, steps are reported, Finish completes it', async () => {
    const onStep = vi.fn();
    const onDone = vi.fn();
    render(
      <>
        <button>Page button</button>
        <TourCard tour={tour('employee')} floating onStep={onStep} onDone={onDone} />
      </>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Clock in from Home' })));
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(onStep).toHaveBeenLastCalledWith(1);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Balances and requests' }));
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    await ue.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onDone).toHaveBeenCalledWith('completed', 2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc dismisses it as skipped at the step reached; it is not modal and Tab leaves it', async () => {
    const onDone = vi.fn();
    render(
      <>
        <TourCard tour={tour('manager')} defaultStep={1} floating onDone={onDone} />
        <button>After the tour</button>
      </>,
    );
    const card = screen.getByRole('dialog');
    expect(card).toHaveAttribute('aria-modal', 'false');
    await waitFor(() => expect(card.contains(document.activeElement)).toBe(true));
    await ue.tab();
    await ue.tab();
    await ue.tab();
    await ue.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After the tour' }));
    screen.getByRole('button', { name: 'Next' }).focus();
    await ue.keyboard('{Escape}');
    expect(onDone).toHaveBeenCalledWith('skipped', 1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('inline (the drawn card): Esc does nothing and focus stays where it was', async () => {
    const onDone = vi.fn();
    render(<TourCard tour={tour('payroll')} onDone={onDone} />);
    expect(document.activeElement).toBe(document.body);
    screen.getByRole('button', { name: 'Next' }).focus();
    await ue.keyboard('{Escape}');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('it moves only when reduced motion is not asked for', () => {
    const css = readFileSync(join(__dirname, 'settings.css'), 'utf8');
    const animated = css.split('\n').filter((l) => l.includes('animation:'));
    expect(animated.length).toBeGreaterThan(0);
    for (const l of animated.filter((x) => x.includes('yx-tour'))) expect(l).toMatch(/prefers-reduced-motion: no-preference/);
  });
});

describe('Help › Tours (the panel H-1 puts in the tab)', () => {
  const live = (o: Partial<LiveTours> = {}): LiveTours => ({
    state: 'ready',
    onRetry: vi.fn(),
    stopped: false,
    onStart: vi.fn(),
    onStopped: vi.fn().mockResolvedValue(undefined),
    tours: [
      { id: 'employee', status: 'completed', step: 2 },
      { id: 'manager', status: 'in_progress', step: 1 },
      { id: 'admin', status: null, step: 0 },
    ],
    ...o,
  });

  it('resume at the step reached, replay from the start, start one not seen', async () => {
    const l = live();
    render(<ToursPanel live={l} />);
    expect(screen.getByText('Stopped at step 2')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Resume tour' }));
    expect(l.onStart).toHaveBeenLastCalledWith('manager', 1);
    await ue.click(screen.getByRole('button', { name: 'Replay tour' }));
    expect(l.onStart).toHaveBeenLastCalledWith('employee', 0);
    await ue.click(screen.getByRole('button', { name: 'Start tour' }));
    expect(l.onStart).toHaveBeenLastCalledWith('admin', 0);
    expect(screen.queryByText('Your first payroll run')).toBeNull();
  });

  it('stop tours, and start them again', async () => {
    const l = live();
    const { unmount } = render(<ToursPanel live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Stop tours' }));
    expect(l.onStopped).toHaveBeenCalledWith(true);
    unmount();
    const s = live({ stopped: true });
    render(<ToursPanel live={s} />);
    expect(screen.getByText(/Tours do not start by themselves/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Start tours again' }));
    expect(s.onStopped).toHaveBeenCalledWith(false);
  });

  it('none yet, a failure to load, and a failed stop each say so', async () => {
    const { unmount } = render(<ToursPanel live={live({ tours: [] })} />);
    expect(screen.getByText('No tours for you yet.')).toBeInTheDocument();
    unmount();
    const e = live({ state: 'error' });
    const r = render(<ToursPanel live={e} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(e.onRetry).toHaveBeenCalled();
    r.unmount();
    render(<ToursPanel live={live({ onStopped: vi.fn().mockRejectedValue(new Error('No connection.')) })} />);
    await ue.click(screen.getByRole('button', { name: 'Stop tours' }));
    expect(await screen.findByText('No connection.')).toBeInTheDocument();
  });
});

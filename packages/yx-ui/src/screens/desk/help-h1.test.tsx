import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { HelpDrawer, type HelpDrawerProps } from './help';
import { DeskSetupScreen } from './setup';
import { DESK, DETAIL, MY_ROWS, RAISE_DESKS } from './data';
const ok = () => vi.fn().mockResolvedValue(undefined);
import { pagesOf, pagesProblem } from '../ops/helpdesk-kb-live';

// Help and onboarding H-1 (answers 941, 942): one Help drawer with This page, Ask, What's new and Tours. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ARTICLES = [
  { id: 'k1', number: 41, title: 'How leave is counted', summary: 'Half days and weekly offs.' },
  { id: 'k2', number: 44, title: 'Apply leave in 90 seconds', summary: null },
];
const drawer = (over: Partial<HelpDrawerProps> = {}) =>
  render(
    <ToastProvider>
      <HelpDrawer open onOpenChange={() => {}} desks={[RAISE_DESKS[0]!]} tickets={MY_ROWS} banners={[]} onMeToo={vi.fn()} onRaise={vi.fn().mockResolvedValue({ id: 'n', number: 'IT-1' })} ticketHref={(id) => `/yx/desk/help/${id}`} articleHref={(a) => `/yx/desk/help?article=${a.number}`} {...over} />
    </ToastProvider>,
  );

describe('H-1: one Help drawer', () => {
  it('opens on This page with the articles for the page; Ask has the ticket form and its button', async () => {
    drawer({ pageHelp: { state: 'ready', articles: ARTICLES } });
    expect(screen.getByRole('tab', { name: 'This page', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How leave is counted' })).toHaveAttribute('href', '/yx/desk/help?article=41');
    expect(screen.getByText('Half days and weekly offs.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raise ticket' })).toBeNull();
    await ue.click(screen.getByRole('tab', { name: 'Ask' }));
    expect(screen.getByRole('textbox', { name: /Subject/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raise ticket' })).toBeInTheDocument();
  });

  it('no help written for the page: it says so and "Ask a team" opens Ask', async () => {
    drawer({ pageHelp: { state: 'ready', articles: [] } });
    // Nothing to read: it opens on Ask; This page still says so.
    expect(screen.getByRole('tab', { name: 'Ask', selected: true })).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'This page' }));
    expect(screen.getByText('No help is written for this page yet.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Ask a team' }));
    expect(screen.getByRole('tab', { name: 'Ask', selected: true })).toBeInTheDocument();
  });

  it('negative: page help off (or not given) hides This page; What’s new and Tours hide until they have content', () => {
    drawer({ pageHelp: null });
    expect(screen.queryByRole('tab', { name: 'This page' })).toBeNull();
    expect(screen.queryByRole('tab', { name: "What's new" })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Tours' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Ask', selected: true })).toBeInTheDocument();
  });

  it('What’s new and Tours show their content when given (H-4, H-5)', async () => {
    drawer({ whatsNew: <p>Fix a missed punch</p>, tours: <p>Employee tour</p> });
    await ue.click(screen.getByRole('tab', { name: "What's new" }));
    expect(screen.getByText('Fix a missed punch')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Tours' }));
    expect(screen.getByText('Employee tour')).toBeInTheDocument();
  });

  it('negative: page help that failed to load says so', () => {
    drawer({ pageHelp: { state: 'error', articles: [] }, defaultTab: 'page' });
    expect(screen.getByText('Help for this page could not be loaded.')).toBeInTheDocument();
  });
});

describe('H-1: Show page help (Desk set-up)', () => {
  it('the switch saves at once', async () => {
    const onPageHelp = vi.fn().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <DeskSetupScreen state="ready" initialTab="settings" kbReviewMonths={12} onKbReviewMonths={ok()} pageHelp onPageHelp={onPageHelp} desks={[DESK]} canCreate={false} selectedId="d-it" onSelect={() => {}} detail={{ ...DETAIL, canSetUp: true }} canned={[]} calendars={[]} canCalendars={false} onCreateDesk={ok()} onUpdateDesk={ok()} onSearchUsers={async () => []} onSeatCost={vi.fn()} onAddMember={ok()} onEndMember={ok()} onSaveGroup={ok()} onSaveCategory={ok()} onSaveType={ok()} onSaveStatus={ok()} onSaveMatrix={ok()} onSaveCanned={ok()} onSaveScenario={ok()} onAddHoliday={ok()} onSetHours={ok()} />
      </ToastProvider>,
    );
    await ue.click(await screen.findByRole('switch', { name: /Show page help/ }));
    await waitFor(() => expect(onPageHelp).toHaveBeenCalledWith(false));
  });
});

describe('H-1: the pages an article explains', () => {
  it('app addresses, separated with commas; repeats and trailing slashes dropped', () => {
    expect(pagesOf('/yx/time/leave, /yx/me/pay/ ,/yx/time/leave')).toEqual(['/yx/time/leave', '/yx/me/pay']);
    expect(pagesProblem('/yx/time/leave, /yx/me/pay')).toBeNull();
    expect(pagesProblem('')).toBeNull();
  });
  it('negative: not an app address, or more than 20', () => {
    expect(pagesProblem('https://example.com/leave')).toMatch(/not an app address/);
    expect(pagesProblem('/yx/Time')).toMatch(/not an app address/);
    expect(pagesProblem(Array.from({ length: 21 }, (_, i) => `/yx/p${i}`).join(','))).toBe('At most 20 pages.');
  });
});

describe('Help button unread dot (answer 992)', () => {
  it('shows a dot and says so while What\'s new has something unread', async () => {
    const { TopBar } = await import('../../components/shell');
    const onHelp = vi.fn();
    const { container } = render(<TopBar onHelp={onHelp} helpUnread />);
    await ue.click(screen.getByRole('button', { name: "Help, new in What's new" }));
    expect(onHelp).toHaveBeenCalled();
    expect(container.querySelector('.yx-topbar__help-dot')).not.toBeNull();
  });
  it('negative: no dot and the plain name when nothing is unread', async () => {
    const { TopBar } = await import('../../components/shell');
    const { container } = render(<TopBar onHelp={() => {}} />);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
    expect(container.querySelector('.yx-topbar__help-dot')).toBeNull();
  });
});

describe('IrreversibleSheet in the shared kit (answer 962)', () => {
  it('is exported from the kit root and still asks for the typed phrase', async () => {
    const { IrreversibleSheet } = await import('../../index');
    const onConfirm = vi.fn();
    render(<IrreversibleSheet open onOpenChange={() => {}} title="Approve and lock September 2026" impact={[{ label: 'People', value: 42 }]} cannotUndo="Locked." correction="Use a correction run." phrase="KF SEP 2026" maker="Asha" checker="Ravi" confirmLabel="Approve and lock" onConfirm={onConfirm} />);
    await ue.click(screen.getByRole('button', { name: 'Approve and lock' }));
    expect(onConfirm).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Type KF SEP 2026/ }), 'KF SEP 2026');
    await ue.click(screen.getByRole('button', { name: 'Approve and lock' }));
    expect(onConfirm).toHaveBeenCalledWith('');
  });
});

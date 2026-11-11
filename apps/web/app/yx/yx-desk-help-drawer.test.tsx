import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { DeskHelp } from './(app)/desk-help';
import { TourHost } from '../../lib/yx-tours';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Help and onboarding H-1 (answers 941, 942): the one Help drawer asks for the help articles of the page it opens on.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const DESK = { id: 'd1', name: 'HR desk', key: 'HR', attachmentTypes: ['pdf'], attachmentMaxMb: 10, types: [], categories: [] };
const asked: string[] = [];
const NONE = { show: true, unread: 0, entries: [] };
const TOURS_OFF = { show: false, stopped: false, tours: [] };
const serve = (page: unknown, news: unknown = NONE, tours: unknown = TOURS_OFF) =>
  api.mockImplementation(async (path: string) => {
    asked.push(path);
    if (path === '/help/tours') return tours;
    if (path.startsWith('/desk/my/kb/page')) return page;
    if (path === '/help/whats-new') return news;
    if (path === '/desk/my/desks') return [DESK];
    if (path === '/desk/my/tickets' || path === '/desk/my/banners') return [];
    throw new Error(`unexpected ${path}`);
  });

const langs = (list: string[]) => Object.defineProperty(navigator, 'languages', { value: list, configurable: true });
beforeEach(() => {
  api.mockReset();
  langs(['en-IN', 'en']);
  asked.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
});

describe('Help drawer (live, H-1)', () => {
  it('asks for the page without its record id, and opens on This page with its articles', async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/time/leave/6f1c2a9e-0b7d-4d2a-9a77-3d1f0c1b2e44');
    serve({ on: true, articles: [{ id: 'k1', number: 41, title: 'How leave is counted', summary: null }] });
    wrap(<DeskHelp open onOpenChange={() => {}} />);
    expect(await screen.findByRole('link', { name: 'How leave is counted' })).toHaveAttribute('href', '/yx/desk/help?article=41');
    expect(asked).toContain('/desk/my/kb/page?route=%2Fyx%2Ftime%2Fleave');
    expect(screen.getByRole('tab', { name: 'This page', selected: true })).toBeInTheDocument();
  });

  it('negative: page help turned off by the company hides This page; the drawer opens on Ask', async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/time/leave');
    serve({ on: false, articles: [] });
    wrap(<DeskHelp open onOpenChange={() => {}} />);
    await waitFor(() => expect(asked.some((p) => p.startsWith('/desk/my/kb/page'))).toBe(true));
    await screen.findByRole('textbox', { name: /Subject/ });
    expect(await screen.findByRole('tab', { name: 'Ask', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'This page' })).toBeNull();
  });

  it("answer 964: asks for the articles in the person's language (the browser's first one offered)", async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/time/leave');
    langs(['ta-IN', 'en']);
    serve({ on: true, articles: [{ id: 'k9', number: 77, title: 'விடுப்பு எப்படி கணக்கிடப்படுகிறது', summary: null }] });
    wrap(<DeskHelp open onOpenChange={() => {}} />);
    expect(await screen.findByRole('link', { name: 'விடுப்பு எப்படி கணக்கிடப்படுகிறது' })).toHaveAttribute('href', '/yx/desk/help?article=77');
    expect(asked).toContain('/desk/my/kb/page?route=%2Fyx%2Ftime%2Fleave&lang=ta');
  });

  it("negative 964: English or a language the help centre does not offer asks without lang", async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/time/leave');
    langs(['fr-FR', 'de']);
    serve({ on: true, articles: [] });
    wrap(<DeskHelp open onOpenChange={() => {}} />);
    await waitFor(() => expect(asked).toContain('/desk/my/kb/page?route=%2Fyx%2Ftime%2Fleave'));
  });

  it("H-4 merge: What's new is a tab, shown when there are entries", async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/home');
    serve({ on: true, articles: [] }, { show: true, unread: 1, entries: [{ id: 'n1', date: '2026-11-10', product: 'YukthiX HR', title: 'Comp-off expiry on the balance card', body: 'Shown on web and mobile.', unread: true }] });
    wrap(<DeskHelp open onOpenChange={() => {}} />);
    expect(await screen.findByRole('tab', { name: "What's new" })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Tours' })).toBeNull();
  });

  it("negative: no What's new tab with no entries, or with What's new turned off", async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/home');
    serve({ on: true, articles: [] }, { show: false, unread: 0, entries: [] });
    wrap(<DeskHelp open onOpenChange={() => {}} />);
    await waitFor(() => expect(asked).toContain('/help/whats-new'));
    await screen.findByRole('tab', { name: 'Ask' });
    expect(screen.queryByRole('tab', { name: "What's new" })).toBeNull();
  });

  it('answer 944 (H-5): the Tours tab lists the person\'s tours; starting one closes Help and shows the tour', async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/time/leave');
    serve({ on: true, articles: [] }, NONE, { show: true, stopped: false, tours: [{ id: 'employee', version: 1, page: '/yx/home', status: 'completed', step: 2 }] });
    const onOpenChange = jest.fn();
    wrap(
      <TourHost pathname="/yx/time/leave">
        <DeskHelp open onOpenChange={onOpenChange} />
      </TourHost>,
    );
    // The drawer remounts once the desks load (it is keyed on them); click Tours after that.
    await waitFor(() => expect(asked).toContain('/desk/my/desks'));
    await screen.findByRole('textbox', { name: /Subject/ });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(await screen.findByRole('tab', { name: 'Tours' }));
    await userEvent.setup({ pointerEventsCheck: 0 }).click(await screen.findByRole('button', { name: 'Replay tour' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByRole('heading', { name: 'Clock in from Home' })).toBeInTheDocument();
  });

  it('negative 944: no Tours tab while the company has tours off', async () => {
    (usePathname as jest.Mock).mockReturnValue('/yx/time/leave');
    serve({ on: true, articles: [] });
    wrap(
      <TourHost pathname="/yx/time/leave">
        <DeskHelp open onOpenChange={() => {}} />
      </TourHost>,
    );
    await waitFor(() => expect(asked).toContain('/help/tours'));
    await screen.findByRole('tab', { name: 'Ask' });
    expect(screen.queryByRole('tab', { name: 'Tours' })).toBeNull();
  });
});

'use client';

import { usePathname } from 'next/navigation';
import { HelpDrawer, type KbSuggestion, type MyTicketRow, type PublicBanner, type RaiseDesk } from '@yukthix/ui/desk';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { useDesk, useDeskWrite } from '../../../lib/yx-desk';

// In-app Help (US-B-100, Help and onboarding H-1), opened from Help in the top bar on every page: known issues, This page
// (help articles tagged with the page), Ask (raise a ticket that remembers the page) and my open tickets. Loads only when
// opened. What's new and Tours come with H-4 and H-5.
export function DeskHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const desks = useDesk<RaiseDesk[]>(open ? '/my/desks' : null);
  const tickets = useDesk<MyTicketRow[]>(open ? '/my/tickets' : null);
  const banners = useDesk<PublicBanner[]>(open ? '/my/banners' : null);
  // Help H-1 (answer 942): help articles tagged with this page; the tab is hidden when the company turned it off.
  const route = (pathname ?? '').split('?')[0]!.toLowerCase().replace(/\/[0-9a-f-]{8,}(?=\/|$)/g, '').replace(/\/+$/, '');
  const page = useDesk<{ on: boolean; articles: KbSuggestion[] }>(open && /^\/yx(\/[a-z0-9][a-z0-9-]*){0,8}$/.test(route) ? `/my/kb/page?route=${encodeURIComponent(route)}` : null);
  const pageHelp = page.isError ? { state: 'error' as const, articles: [] } : !page.data ? (page.isLoading ? { state: 'loading' as const, articles: [] } : null) : page.data.on ? { state: 'ready' as const, articles: page.data.articles } : null;
  const write = useDeskWrite();
  const { accessToken } = useAuth();
  // The API takes letters, digits, - . / _ and spaces, up to 100.
  const screen = (pathname ?? '').replace(/[^A-Za-z0-9\-./_ ]/g, '').slice(0, 100);
  return (
    <>
      {open && (
        <HelpDrawer
          key={`${desks.data ? 'ready' : 'loading'}-${page.data ? 'page' : 'no-page'}`}
          open
          onOpenChange={onOpenChange}
          desks={desks.data ?? []}
          tickets={tickets.data ?? []}
          banners={banners.data ?? []}
          onMeToo={(id) => write(`/my/banners/${encodeURIComponent(id)}/me-too`, 'POST')}
          onRaise={(input) => write<{ id: string; number: string }>('/my/tickets', 'POST', { ...input, ...(screen ? { screen } : {}) })}
          ticketHref={(id) => `/yx/desk/help/${encodeURIComponent(id)}`}
          onSuggest={(q) => apiFetch(`/desk/my/kb/suggest?q=${encodeURIComponent(q)}&from=drawer`, {}, accessToken ?? undefined) as Promise<KbSuggestion[]>}
          articleHref={(a) => `/yx/desk/help?article=${a.number}`}
          pageHelp={pageHelp}
        />
      )}
    </>
  );
}

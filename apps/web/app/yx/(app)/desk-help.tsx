'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { CircleHelp } from 'lucide-react';
import { Button } from '@yukthix/ui';
import { HelpDrawer, type KbSuggestion, type MyTicketRow, type PublicBanner, type RaiseDesk } from '@yukthix/ui/desk';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { useDesk, useDeskWrite } from '../../../lib/yx-desk';

// The in-app Help button (US-B-100), on every page of the workspace: known issues, raise a ticket that remembers the
// page it came from, and my open tickets. Loads only when opened.
export function DeskHelpButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const desks = useDesk<RaiseDesk[]>(open ? '/my/desks' : null);
  const tickets = useDesk<MyTicketRow[]>(open ? '/my/tickets' : null);
  const banners = useDesk<PublicBanner[]>(open ? '/my/banners' : null);
  const write = useDeskWrite();
  const { accessToken } = useAuth();
  // The API takes letters, digits, - . / _ and spaces, up to 100.
  const screen = (pathname ?? '').replace(/[^A-Za-z0-9\-./_ ]/g, '').slice(0, 100);
  return (
    <>
      <Button className="yx-desk-help-fab" icon={CircleHelp} onClick={() => setOpen(true)}>
        Help
      </Button>
      {open && (
        <HelpDrawer
          key={desks.data ? 'ready' : 'loading'}
          open
          onOpenChange={setOpen}
          desks={desks.data ?? []}
          tickets={tickets.data ?? []}
          banners={banners.data ?? []}
          onMeToo={(id) => write(`/my/banners/${encodeURIComponent(id)}/me-too`, 'POST')}
          onRaise={(input) => write<{ id: string; number: string }>('/my/tickets', 'POST', { ...input, ...(screen ? { screen } : {}) })}
          ticketHref={(id) => `/yx/desk/help/${encodeURIComponent(id)}`}
          onSuggest={(q) => apiFetch(`/desk/my/kb/suggest?q=${encodeURIComponent(q)}&from=drawer`, {}, accessToken ?? undefined) as Promise<KbSuggestion[]>}
          articleHref={(a) => `/yx/desk/help?article=${a.number}`}
        />
      )}
    </>
  );
}

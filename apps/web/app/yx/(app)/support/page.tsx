'use client';

import { useEffect, useState } from 'react';
import { YukthixSupportScreen, type YxSupportRow, type YxSupportTicket } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../lib/yx-desk';

const BASE = '/support/yukthix/tickets';
// Same rule as the API (SupportRaiseDto.screen): a path, never personal data.
const SCREEN = /^\/[A-Za-z0-9/_\-?=&.]{0,199}$/;

// Security › Contact YukthiX (SD-1.31): the System Admin writes to YukthiX support and follows the answers.
export default function YxContactYukthixPage() {
  const tickets = useDesk<YxSupportRow[]>(BASE);
  const [openId, setOpenId] = useState<string | null>(null);
  const ticket = useDesk<YxSupportTicket>(openId ? `${BASE}/${encodeURIComponent(openId)}` : null);
  const write = useDeskWrite();
  // The page the admin came from (path only, same site); offered with "Include the page I was on".
  const [fromPage, setFromPage] = useState<string | undefined>();
  useEffect(() => {
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.origin === window.location.origin && r.pathname !== window.location.pathname && SCREEN.test(r.pathname)) setFromPage(r.pathname);
    } catch {
      /* no usable referrer */
    }
  }, []);
  return (
    <YukthixSupportScreen
      state={deskState(tickets)}
      onRetry={() => void tickets.refetch()}
      tickets={tickets.data ?? []}
      onRaise={(input) => write<{ number: string | null; sending: boolean }>(BASE, 'POST', input)}
      fromPage={fromPage}
      openId={openId}
      onOpen={setOpenId}
      ticket={ticket.data ?? null}
      ticketState={deskState(ticket)}
      onReply={(id, body) => write(`${BASE}/${encodeURIComponent(id)}/messages`, 'POST', { body })}
      supportAccessHref="/yx/settings/support-access"
    />
  );
}

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExpensesHomeScreen, EXP_LINKS, claimQuery, parseClaimQuery, type AdvanceSummary, type ClaimSummary, type ExpenseHome, type MyCardLines, type MyClaimsPage, type SavedExpense, type ToPayData, type TripSummary } from '@yukthix/ui/expenses';
import { loadState, todayIst, useYxPermissions } from '../../../../lib/yx-org';
import { useExp, useExpWrite } from '../../../../lib/yx-expenses';
import { useScopeParams, withParams } from '../../../../lib/yx-shell';

// Expenses home (EXP-01, the designed screen with `live`): my claims with what I will receive, what waits for me with
// my team's spend, and finance's figures. Each list is the API's own (it checks every key and scope).
function ExpensesHome() {
  const sp = useScopeParams();
  const router = useRouter();
  const perms = useYxPermissions();
  // ?new=1: the "New expense claim" action (Ctrl K, N E) opens the new-claim dialog at once.
  const startNew = useSearchParams()?.get('new') === '1';
  // ?save=1: the "Add an expense" action (Ctrl K) opens the saved-expense drawer.
  const startAdd = useSearchParams()?.get('save') === '1';
  // Batch E A7 (2553): the past-claim filters live in the address (?status=&sentFrom=&q=&page=), so a list can be shared.
  const search = useSearchParams();
  const filter = parseClaimQuery(new URLSearchParams(search?.toString() ?? ''));
  // Drop ?new=1 once read, so asking again (N E) changes the address and opens the dialog again.
  useEffect(() => {
    if (startNew) router.replace(EXP_LINKS.home, { scroll: false });
  }, [startNew, router]);
  const home = useExp<ExpenseHome>('/me/home');
  const h = home.data;
  const approver = Boolean(h && (h.team || h.waitingForMe));
  const claims = useExp<{ claims: ClaimSummary[] }>(withParams('/claims?view=approvals', sp.entity), Boolean(h?.waitingForMe));
  const trips = useExp<{ trips: TripSummary[] }>(withParams('/trips?view=approvals', sp.entity), Boolean(h));
  const advances = useExp<{ advances: AdvanceSummary[] }>(withParams('/advances?view=approvals', sp.entity), Boolean(h));
  const mine = useExp<{ advances: AdvanceSummary[] }>('/advances', Boolean(h));
  // EXP-08: my company card lines waiting for me to explain.
  const cardLines = useExp<MyCardLines>('/card-lines/mine', Boolean(h));
  const pays = perms.has('expense.payout.manage');
  const toPay = useExp<ToPayData>(withParams('/to-pay', sp.entity), pays);
  const payout = useExp<{ advances: AdvanceSummary[] }>(withParams('/advances?view=payout', sp.entity), pays);
  const review = useExp<{ claims: ClaimSummary[] }>(withParams('/claims?view=review', sp.entity), h?.toReview !== null && h?.toReview !== undefined);
  const finance = pays || (h?.toReview !== null && h?.toReview !== undefined);
  const write = useExpWrite();
  // Keka ideas (2026-11): expenses saved first, claimed later (my own only).
  const saved = useExp<{ items: SavedExpense[] }>('/me/items', Boolean(h));
  const myClaims = useExp<MyClaimsPage>(`/me/claims${claimQuery(filter)}`, Boolean(h));
  const someApprovals = (trips.data?.trips.length ?? 0) + (advances.data?.advances.length ?? 0) > 0;
  return (
    <ExpensesHomeScreen
      live={{
        state: loadState(home),
        onRetry: () => void home.refetch(),
        home: h ?? null,
        today: todayIst(),
        approvals: approver || someApprovals ? { claims: claims.data?.claims ?? [], trips: trips.data?.trips ?? [], advances: advances.data?.advances ?? [] } : null,
        openAdvance: (mine.data?.advances ?? []).find((a) => a.status === 'paid' && Number(a.balance) > 0) ?? null,
        finance: finance ? { toPay: pays ? (toPay.data ?? null) : null, flagged: review.data?.claims ?? (h?.toReview !== null && h?.toReview !== undefined ? [] : null), advancesOverdue: pays ? (payout.data?.advances ?? []).filter((a) => a.overdue).length : null } : null,
        onNew: async (title, then) => {
          const c = await write<{ id: string }>('POST', '/claims', { title });
          router.push(`${EXP_LINKS.claim(c.id)}${then ? `?add=${then}` : ''}`);
        },
        onOpen: (id) => router.push(EXP_LINKS.claim(id)),
        onOpenTrip: (id) => router.push(EXP_LINKS.trip(id)),
        onOpenAdvance: (id) => router.push(EXP_LINKS.advance(id)),
        onRequestTrip: () => router.push(`${EXP_LINKS.trips}?new=1`),
        onGo: (href) => router.push(href),
        cardLines: cardLines.data?.lines.length ?? null,
        myClaims: {
          ...filter,
          state: loadState(myClaims),
          data: myClaims.data ?? null,
          onChange: (next) => router.replace(`${EXP_LINKS.home}${claimQuery(next)}`, { scroll: false }),
        },
        startNew,
        saved: saved.data
          ? {
              items: saved.data.items,
              currency: h?.claims[0]?.currency ?? 'INR',
              today: todayIst(),
              startAdd,
              drafts: (h?.claims ?? []).filter((c) => c.status === 'draft').map((c) => ({ id: c.id, title: c.title })),
              onAdd: async (x) => {
                const body = new FormData();
                // Answer 2252: left out with a receipt, the date and amount are read from it.
                if (x.spentOn) body.append('spentOn', x.spentOn);
                if (x.amount) body.append('amount', x.amount);
                if (x.merchant) body.append('merchant', x.merchant);
                if (x.description) body.append('description', x.description);
                if (x.receipt) body.append('file', x.receipt);
                await write('POST', '/me/items', body);
              },
              onRemove: async (id) => {
                await write('POST', `/me/items/${encodeURIComponent(id)}/remove`);
              },
              onClaim: async (ids, into) => {
                const claimId = 'claimId' in into ? into.claimId : (await write<{ id: string }>('POST', '/claims', { title: into.title })).id;
                await write('POST', `/claims/${encodeURIComponent(claimId)}/items`, { itemIds: ids });
                router.push(EXP_LINKS.claim(claimId));
              },
            }
          : undefined,
      }}
    />
  );
}

export default function YxExpensesPage() {
  return (
    <Suspense>
      <ExpensesHome />
    </Suspense>
  );
}

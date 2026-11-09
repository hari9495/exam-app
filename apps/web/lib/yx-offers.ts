'use client';

import { useRouter } from 'next/navigation';
import type { LiveOfferBuilder, OfferDraftInput, OfferRecordView, OfferSetupView } from '@yukthix/ui/hiring';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { useApiWrite, useHiring } from './yx-hiring';

// HIR-09 offer builder and record: the API glue shared by the new-offer, revise and record pages. The screens are the
// designed HIR-09 / HIR-29 ones with `live`; the API checks every call (offer pay only with ats.offer.compensation.view,
// the sender never approves, no writes while acting for someone else).

/** The pay part of the builder's input, as the API takes it (rupees as text, never a float). */
export const payBody = (i: Pick<OfferDraftInput, 'templateVersionId' | 'annualCtc' | 'variablePay' | 'joiningBonus' | 'clawbackMonths' | 'locationId'>) => ({
  templateVersionId: i.templateVersionId,
  annualCtc: String(Math.round(i.annualCtc)),
  variablePay: String(Math.round(i.variablePay)),
  joiningBonus: String(Math.round(i.joiningBonus)),
  ...(i.joiningBonus > 0 && i.clawbackMonths ? { clawbackMonths: i.clawbackMonths } : {}),
  locationId: i.locationId,
});

const draftBody = (i: OfferDraftInput) => ({ ...payBody(i), startDate: i.startDate, expiresAt: i.expiresAt, letterKind: i.letterKind, ...(i.templateId ? { templateId: i.templateId } : {}) });

export const builderState = (q: { isError: boolean; error: unknown; data: unknown }, ok = true): LiveOfferBuilder['state'] => {
  if (!ok) return 'not-found';
  const status = (q.error as { status?: number } | null)?.status;
  return q.isError ? (status === 403 ? 'denied' : status === 404 || status === 400 ? 'not-found' : 'error') : q.data ? 'ready' : 'loading';
};

export function useOfferActions() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const write = useApiWrite();
  /** After saving a draft version: through its route; with none, it is approved at once and goes to the candidate. */
  const sendOn = async (id: string): Promise<string> => {
    const r = await write<{ status: string }>('POST', `/hiring/offers/${encodeURIComponent(id)}/submit`);
    if (r.status !== 'approved') return 'Sent for approval';
    await write('POST', `/offers/${encodeURIComponent(id)}/send`);
    return 'Offer sent to the candidate';
  };
  /** Saving worked; going on did not: the record opens with the draft and the reason. */
  const thenOpen = async (id: string, go: () => Promise<string>) => {
    try {
      return await go();
    } finally {
      router.push(`/yx/hiring/offers/${encodeURIComponent(id)}`);
    }
  };
  const preview = (entryId: string): LiveOfferBuilder['onPreview'] => (i) => apiFetch('/hiring/offers/preview', { method: 'POST', body: JSON.stringify({ entryId, ...payBody(i) }) }, accessToken ?? undefined);
  return {
    write,
    sendOn,
    preview,
    create: (entryId: string, i: OfferDraftInput, go: boolean) =>
      write<{ id: string }>('POST', '/hiring/offers', { entryId, ...draftBody(i), addConditions: i.addConditions }).then((o) => thenOpen(o.id, async () => (go ? sendOn(o.id) : 'Offer saved as a draft'))),
    revise: (id: string, fromVersion: number, i: OfferDraftInput, go: boolean) =>
      write<{ status: string }>('POST', `/hiring/offers/${encodeURIComponent(id)}/versions`, { ...draftBody(i), fromVersion }).then((r) =>
        thenOpen(id, async () => {
          if (!go) return 'New version saved';
          if (r.status === 'draft') return sendOn(id);
          await write('POST', `/offers/${encodeURIComponent(id)}/send`);
          return 'New letter sent to the candidate';
        }),
      ),
  };
}

/** The setup of an application's builder. */
export const useOfferSetup = (entryId: string | null) => useHiring<OfferSetupView>(entryId ? `/offers/setup?entryId=${encodeURIComponent(entryId)}` : null);
export const useOfferRecord = (id: string | null) => useHiring<OfferRecordView>(id ? `/offers/${encodeURIComponent(id)}` : null);

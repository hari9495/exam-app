import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { useAuth } from '../auth-context';
import { Offer, OfferTemplate } from '../types';

export function useCandidateOffers(candidateId: string) {
  const { accessToken } = useAuth();
  return useQuery<Offer[]>({
    queryKey: ['candidate-offers', candidateId],
    queryFn: () => apiFetch(`/candidates/${candidateId}/offers`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId),
  });
}

export interface CreateOfferInput {
  compensation: string;
  startDate: string;
  expiresAt: string;
  subject?: string;
  body?: string;
}

// candidateId is needed (beyond entryId) purely to invalidate the right ['candidate-offers', X]
// list -- the create endpoint is keyed by pipeline entry, same split as useSendMessage.
export function useCreateOffer(entryId: string, candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Offer, Error, CreateOfferInput>({
    mutationFn: (input) =>
      apiFetch(`/pipeline/entries/${entryId}/offers`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<Offer>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-offers', candidateId] }),
  });
}

export function useSendOffer(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Offer, Error, string>({
    mutationFn: (offerId) => apiFetch(`/offers/${offerId}/send`, { method: 'POST' }, accessToken ?? undefined) as Promise<Offer>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-offers', candidateId] }),
  });
}

export function useWithdrawOffer(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Offer, Error, string>({
    mutationFn: (offerId) => apiFetch(`/offers/${offerId}/withdraw`, { method: 'POST' }, accessToken ?? undefined) as Promise<Offer>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-offers', candidateId] }),
  });
}

export function useSubmitOffer() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => apiFetch(`/offers/${offerId}/submit`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-offers'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useCancelOffer() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => apiFetch(`/offers/${offerId}/approval/cancel`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-offers'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useOfferTemplate() {
  const { accessToken } = useAuth();
  return useQuery<OfferTemplate>({
    queryKey: ['offer-template'],
    queryFn: () => apiFetch('/offer-template', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateOfferTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<OfferTemplate, Error, { subject: string; body: string }>({
    mutationFn: (input) =>
      apiFetch('/offer-template', { method: 'PUT', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<OfferTemplate>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offer-template'] }),
  });
}

// Fetches the offer's PDF as a blob and opens it in a new tab. A mutation (not a plain function)
// so CreateOfferModal gets isPending/error handling for free, matching every other write in this
// hook file even though the PDF fetch is a GET.
export function usePreviewOfferPdf() {
  const { accessToken } = useAuth();
  return useMutation<void, Error, string>({
    mutationFn: async (offerId) => {
      const { blob } = await apiFetchBlob(`/offers/${offerId}/pdf`, {}, accessToken ?? undefined);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  });
}

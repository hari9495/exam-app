import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { BrandingResponse } from '../types';
import { useAuth } from '../auth-context';

export function useBranding(organizationSlug: string | null) {
  return useQuery<BrandingResponse>({
    queryKey: ['branding', organizationSlug],
    queryFn: () => apiFetch(`/organizations/by-slug/${organizationSlug}/branding`),
    enabled: Boolean(organizationSlug),
  });
}

interface UpdateBrandingInput {
  primaryColor?: string;
  accentColor?: string;
}

export function useUpdateBranding() {
  const { accessToken, organizationSlug } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBrandingInput): Promise<BrandingResponse> =>
      apiFetch('/organizations/branding', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding', organizationSlug] }),
  });
}

export function useUpdateBrandingLogo() {
  const { accessToken, organizationSlug } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<BrandingResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/organizations/branding/logo', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding', organizationSlug] }),
  });
}

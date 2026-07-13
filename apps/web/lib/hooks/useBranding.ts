import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { BrandingResponse } from '../types';

export function useBranding(organizationSlug: string | null) {
  return useQuery<BrandingResponse>({
    queryKey: ['branding', organizationSlug],
    queryFn: () => apiFetch(`/organizations/by-slug/${organizationSlug}/branding`),
    enabled: Boolean(organizationSlug),
  });
}

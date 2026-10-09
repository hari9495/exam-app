import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { BrandingResponse } from '../types';
import { useAuth } from '../auth-context';

/**
 * Branding for the org the CURRENT TOKEN belongs to.
 *
 * Addressed by the token, not a slug: `organizationSlug` is empty for anyone
 * who signed in with just an email, and for a super_admin who reached the org
 * through "switch into" (switchIntoOrg never sets it).
 *
 * Requires org:manage_settings, so this is for settings screens only -- the
 * recruiter and panel layouts have to keep using the public slug endpoint.
 */
export function useOrgBranding() {
  const { accessToken } = useAuth();
  return useQuery<BrandingResponse>({
    queryKey: ['branding', 'current-org'],
    queryFn: () => apiFetch('/organizations/branding', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateBrandingInput {
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  loginWatermarkEnabled?: boolean;
}

export function useUpdateBranding() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBrandingInput): Promise<BrandingResponse> =>
      apiFetch('/organizations/branding', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    // Prefix-invalidate: the settings page reads ['branding','current-org'] while the
    // layouts read ['branding', slug]. Keying on the slug alone left the page showing
    // the old logo after a successful upload.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding'] }),
  });
}

export function useUpdateBrandingLogo() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<BrandingResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/organizations/branding/logo', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    // Prefix-invalidate: the settings page reads ['branding','current-org'] while the
    // layouts read ['branding', slug]. Keying on the slug alone left the page showing
    // the old logo after a successful upload.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding'] }),
  });
}

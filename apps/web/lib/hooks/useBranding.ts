import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { BrandingResponse } from '../types';
import { useAuth } from '../auth-context';

/**
 * Public, slug-addressed branding. For pages that have no token yet (login,
 * forgot-password) or that only need theme colours.
 */
export function useBranding(organizationSlug: string | null) {
  return useQuery<BrandingResponse>({
    queryKey: ['branding', organizationSlug],
    queryFn: () => apiFetch(`/organizations/by-slug/${organizationSlug}/branding`),
    enabled: Boolean(organizationSlug),
  });
}

/**
 * Branding for the org the CURRENT TOKEN belongs to.
 *
 * The settings page must not use useBranding(): `organizationSlug` is only ever
 * populated from the login form's optional slug field, so it is empty for
 * anyone who signed in with just an email, and for a super_admin who reached
 * the org through "switch into" (switchIntoOrg never sets it). In those cases
 * the slug query stays `enabled: false` and never resolves, which read as a
 * permanent "Loading current branding..." and left every button disabled.
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { CareersSettingsResponse } from '../types';

// Web data layer for the Task 3 org careers config + banner-upload endpoints (Zoho #14).
// Mirrors useApplyConsent (GET/PUT) + useBranding's logo-upload mutation (multipart POST).
export function useCareersSettings() {
  const { accessToken } = useAuth();
  return useQuery<CareersSettingsResponse>({
    queryKey: ['careers-settings'],
    queryFn: () => apiFetch('/organizations/careers', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateCareersSettingsInput {
  enabled: boolean;
  headline?: string | null;
  intro?: string | null;
}

export function useUpdateCareersSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCareersSettingsInput): Promise<CareersSettingsResponse> =>
      apiFetch('/organizations/careers', { method: 'PUT', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['careers-settings'] }),
  });
}

export function useUploadCareersBanner() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<{ bannerUrl: string | null }> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/organizations/careers/banner', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['careers-settings'] }),
  });
}

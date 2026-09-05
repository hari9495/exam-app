import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessHours, Holiday } from '../types';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the Task 3 org business-hours endpoints. Mirrors
// useOrgPipelineSettings/useUpdateOrgPipelineSettings in usePipelines.ts.
export interface BusinessHoursResponse {
  businessHours: BusinessHours | null;
  holidays: Holiday[];
}

export function useBusinessHours() {
  const { accessToken } = useAuth();
  return useQuery<BusinessHoursResponse>({
    queryKey: ['business-hours'],
    queryFn: () => apiFetch('/organizations/business-hours', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateBusinessHours() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { businessHours: BusinessHours; holidays: Holiday[] }) =>
      apiFetch(
        '/organizations/business-hours',
        { method: 'PATCH', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<BusinessHoursResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business-hours'] }),
  });
}

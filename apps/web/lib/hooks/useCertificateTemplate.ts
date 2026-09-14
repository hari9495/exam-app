import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the per-org certificate template (one row per org). GET returns the saved copy
// or the built-in default as an editable starting point (isDefault=true).
export interface CertificateTemplateView {
  title: string;
  bodyText: string;
  signatoryName: string | null;
  enabled: boolean;
  isDefault: boolean;
}

// The {{tokens}} the certificate copy renders. Shown as inline help under the editor; mirrors
// CertificateVars in @exam-platform/shared.
export const CERTIFICATE_VARIABLES = ['{{candidateName}}', '{{examTitle}}', '{{scorePercent}}', '{{date}}', '{{orgName}}', '{{certificateId}}'];

export function useCertificateTemplate() {
  const { accessToken } = useAuth();
  return useQuery<CertificateTemplateView>({
    queryKey: ['certificate-template'],
    queryFn: () => apiFetch('/certificate-template', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpsertCertificateTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; bodyText: string; signatoryName?: string; enabled?: boolean }) =>
      apiFetch('/certificate-template', { method: 'PUT', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<CertificateTemplateView>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certificate-template'] }),
  });
}

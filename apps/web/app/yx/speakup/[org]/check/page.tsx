'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckReportScreen, type ReporterView } from '@yukthix/ui/desk';
import { apiFetchAnonymous } from '../../../../../lib/api-client';

// Check my report (HLP-06), outside the signed-in app: the reply code is the key. Calls carry no sign-in and no cookies;
// the server counts wrong codes per network address and never keeps who asked.
export default function YxCheckReportPage() {
  const { org } = useParams<{ org: string }>();
  const company = useQuery<{ company: string }>({ queryKey: ['speakup-company', org], queryFn: () => apiFetchAnonymous(`/desk/speakup/public/company/${encodeURIComponent(org)}`), retry: false });
  const post = (path: string, body: Record<string, string>) => apiFetchAnonymous(`/desk/speakup/public/${path}`, { method: 'POST', body: JSON.stringify({ org, ...body }) }) as Promise<ReporterView>;
  return (
    <CheckReportScreen
      live={{
        company: company.data?.company ?? '',
        onOpen: (code) => post('check', { code }),
        onReply: (code, text) => post('check/reply', { code, body: text }),
        onUpload: async (code, file) => {
          const body = new FormData();
          body.append('org', org);
          body.append('code', code);
          body.append('file', file);
          await apiFetchAnonymous('/desk/speakup/public/check/files', { method: 'POST', body });
        },
        followUpHref: '/yx/desk/speakup',
      }}
    />
  );
}

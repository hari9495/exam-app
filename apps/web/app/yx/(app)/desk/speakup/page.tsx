'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch, apiFetchAnonymous } from '../../../../../lib/api-client';
import { SpeakUpScreen, type FiledReport, type SpeakUpFormData } from '@yukthix/ui/desk';
import { deskState, useDesk } from '../../../../../lib/yx-desk';

const id = encodeURIComponent;

// Helpdesk › Speak up: the designed HLP-06 form with `live`. A named report is sent as the signed-in person; an anonymous
// one through the no-login route without the sign-in or cookies, so the server never learns who sent it. Files follow
// the report (an anonymous one with its reply code). The API checks every rule (docs/yukthix/helpdesk-design-map.md 4e).
export default function YxSpeakUpPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const form = useDesk<SpeakUpFormData>('/speakup/form');
  const org = form.data?.org ?? '';
  return (
    <SpeakUpScreen
      live={{
        state: deskState(form),
        onRetry: () => void form.refetch(),
        form: form.data ?? null,
        onFile: async (input, identity) =>
          (identity === 'anonymous'
            ? apiFetchAnonymous('/desk/speakup/public/reports', { method: 'POST', body: JSON.stringify({ org, ...input }) })
            : apiFetch('/desk/speakup/reports', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined)) as Promise<FiledReport>,
        onUpload: async (filed, file) => {
          const body = new FormData();
          if (filed.code) {
            body.append('org', org);
            body.append('code', filed.code);
            body.append('file', file);
            await apiFetchAnonymous('/desk/speakup/public/check/files', { method: 'POST', body });
          } else {
            body.append('file', file);
            await apiFetch(`/desk/speakup/reports/${id(filed.id)}/files`, { method: 'POST', body }, accessToken ?? undefined);
          }
        },
        onDone: () => router.push('/yx/desk/help'),
        checkHref: `/yx/speakup/${id(org)}/check`,
        accidentHref: '/yx/desk/accidents/report',
        today: new Date(),
      }}
    />
  );
}

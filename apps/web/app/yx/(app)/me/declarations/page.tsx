'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { DisabilityDeclaration, type DisabilityInput } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useLifeWrite } from '../../../../../lib/yx-lifecycle';

interface Mine {
  company: string;
  personId: string;
  declaration: { answer: 'yes' | 'no' | 'skip'; category?: string; percent?: number; adjustments?: string | null; consentAt: string; certificate: { status: string; validUntil: string | null; rejectReason: string | null } | null } | null;
}

// Me › Declarations (PPL-38): my voluntary disability declaration, with consent, withdrawable at any time.
export default function YxMyDeclarationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const mine = usePeople<Mine>('/me/disability');
  const write = usePeopleWrite();
  const upload = useLifeWrite();
  const d = mine.data?.declaration;
  return (
    <DisabilityDeclaration
      live={{
        state: mine.isError ? 'error' : mine.data ? 'ready' : 'loading',
        onRetry: () => void mine.refetch(),
        company: mine.data?.company ?? '',
        declaration: d ? { ...d, consentAt: new Date(d.consentAt), certificate: d.certificate ? { status: d.certificate.status, rejectReason: d.certificate.rejectReason, validUntil: d.certificate.validUntil ? new Date(`${d.certificate.validUntil}T00:00:00`) : null } : null } : null,
        onUpload: async (file, validUntil) => {
          const body = new FormData();
          body.append('file', file);
          if (validUntil) body.append('expiresOn', validUntil);
          return (await upload<{ id: string }>('POST', `/documents/people/${encodeURIComponent(mine.data!.personId)}/disability_certificate`, body)).id;
        },
        // A rejected certificate goes back to HR as a new version of the same document.
        onUploadAgain: async (file) => {
          const body = new FormData();
          body.append('file', file);
          await upload('POST', `/documents/people/${encodeURIComponent(mine.data!.personId)}/disability_certificate`, body);
          await mine.refetch();
          toast({ tone: 'success', title: 'Certificate uploaded again; HR checks it' });
        },
        onSave: async (input: DisabilityInput) => {
          await write('PUT', '/me/disability', input);
          toast({ tone: 'success', title: 'Declaration saved' });
        },
        onWithdraw: async () => {
          await write('POST', '/me/disability/withdraw');
          toast({ tone: 'success', title: 'Consent withdrawn' });
        },
        onSkip: () => router.push('/yx/people/profile'),
      }}
    />
  );
}

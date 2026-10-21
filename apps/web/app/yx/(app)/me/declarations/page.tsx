'use client';

import { useRouter } from 'next/navigation';
import { Button, Card, Text, useToast } from '@yukthix/ui';
import { DisabilityDeclaration, type DisabilityView } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { useOrgBranding } from '../../../../../lib/hooks/useBranding';

// Me › Declarations: the voluntary disability declaration (PPL-38, Special). For a designated person of a company that
// uses BFSI compliance, the annual declarations (PPL-43) and trading pre-clearance (PPL-44) are linked here too.
export default function YxMyDeclarationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const branding = useOrgBranding();
  const data = usePeople<{ declaration: DisabilityView | null; personId: string; categories: string[] }>('/me/disability');
  const bfsi = useLife<{ enabled: boolean; designated?: boolean }>('/compliance/me');
  const write = usePeopleWrite();
  const upload = useLifeWrite();
  return (
    <DisabilityDeclaration
      live={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        company: branding.data?.name || 'the company',
        onUpload: async (file) => {
          const form = new FormData();
          form.append('file', file);
          return (await upload<{ id: string }>('POST', `/documents/people/${encodeURIComponent(data.data!.personId)}/disability_certificate`, form)).id;
        },
        onDeclare: async (input) => {
          await write('POST', '/me/disability', input);
          toast({ tone: 'success', title: 'Your declaration is saved', description: 'The HR diversity role verifies the certificate.' });
        },
        onWithdraw: async () => {
          await write('POST', '/me/disability/withdraw');
          toast({ tone: 'success', title: 'Your declaration is withdrawn' });
        },
        onSkip: () => router.push('/yx/home'),
        more: bfsi.data?.designated ? (
          <Card title="Regulated declarations">
            <Text as="p">You are a designated person: declare your holdings each year and ask pre-clearance before you trade.</Text>
            <div className="yx-ppl__row">
              <Button onClick={() => router.push('/yx/me/declarations/annual')}>Annual declarations</Button>
              <Button onClick={() => router.push('/yx/me/trading')}>Trading pre-clearance</Button>
            </div>
          </Card>
        ) : null,
      }}
    />
  );
}

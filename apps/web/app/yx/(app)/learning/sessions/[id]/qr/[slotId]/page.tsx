'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useToast } from '@yukthix/ui';
import { LiveTrainerQrScreen, type LiveSessionPageData } from '@yukthix/ui/frame';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../../lib/auth-context';
import { useLearning, useLearningWrite } from '../../../../../../../../lib/yx-learning';

type Code = { closed: boolean; code: string | null; secondsLeft: number; expected: { enrolmentId: string; name: string }[]; present: string[] };

// LRN-05: the trainer's check-in screen: the code (QR and digits) refreshed as it changes, the live count.
export default function YxSessionQrPage() {
  const { id, slotId } = useParams<{ id: string; slotId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const page = useLearning<LiveSessionPageData>(`/sessions/${encodeURIComponent(id)}`);
  const code = useQuery<Code>({
    queryKey: ['learning-code', id, slotId],
    queryFn: () => apiFetch(`/learning/sessions/${encodeURIComponent(id)}/slots/${encodeURIComponent(slotId)}/code`, {}, accessToken ?? undefined) as Promise<Code>,
    enabled: Boolean(accessToken),
    refetchInterval: 5000,
  });
  const write = useLearningWrite();
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    const c = code.data?.code;
    if (!c) return setImage(null);
    const link = `${window.location.origin}/yx/learning/check-in?s=${encodeURIComponent(id)}&l=${encodeURIComponent(slotId)}&c=${c}`;
    void QRCode.toDataURL(link, { margin: 1, width: 440 }).then(setImage);
  }, [code.data?.code, id, slotId]);
  const slot = page.data?.session.slots.find((x) => x.id === slotId);
  return (
    <LiveTrainerQrScreen
      live={{
        session: page.data?.session.course ?? '',
        slot: slot?.label ?? '',
        qrImage: image,
        code: code.data?.code ?? null,
        secondsLeft: code.data?.secondsLeft ?? 30,
        expected: code.data?.expected ?? [],
        present: code.data?.present ?? [],
        closed: Boolean(code.data?.closed),
        onBack: () => router.push(`/yx/learning/sessions/${encodeURIComponent(id)}`),
        onCloseCheckin: async () => {
          await write('POST', `/sessions/${encodeURIComponent(id)}/slots/${encodeURIComponent(slotId)}/close`);
          await code.refetch();
          toast({ tone: 'success', title: 'Check-in closed', description: 'Mark anyone else by hand.' });
        },
        onSave: async (marks) => {
          try {
            await write('POST', `/sessions/${encodeURIComponent(id)}/slots/${encodeURIComponent(slotId)}/attendance`, { marks });
            await code.refetch();
            toast({ tone: 'success', title: 'Attendance saved' });
          } catch (e) {
            toast({ tone: 'error', title: e instanceof Error ? e.message : 'That did not save. Try again.' });
          }
        },
      }}
    />
  );
}

'use client';

import { useState } from 'react';
import { VisitorDeskScreen, type KioskNeeds, type VisitView } from '@yukthix/ui/visitors';
import { loadState } from '../../../../lib/yx-org';
import { useVisitorIdImage, useVisitors, useVisitorsGet, useVisitorsWrite, type VisitorOptions } from '../../../../lib/yx-visitors';

// Visitors › Today's visitors (VIS-01): reception's day at one of the locations its Reception role reaches. Scan or type
// the QR pass, check in (the notice at the desk if not accepted on the link) and out. The API checks the key, the
// location and acting for someone else.
export default function YxVisitorDeskPage() {
  const options = useVisitors<VisitorOptions>('/options');
  const [picked, setPicked] = useState<string | null>(null);
  const locationId = picked ?? options.data?.desk[0]?.value ?? null;
  const desk = useVisitors<{ location: { id: string; name: string }; today: string; canChange: boolean; idCapture: 'off' | 'on' | 'with_image'; visits: VisitView[] }>(locationId ? `/desk?locationId=${encodeURIComponent(locationId)}` : null);
  const write = useVisitorsWrite();
  const get = useVisitorsGet();
  const types = useVisitors<{ types: { id: string; name: string }[] }>('/types');
  const enc = encodeURIComponent;
  const idImage = useVisitorIdImage();
  const noDesk = options.isSuccess && !options.data.desk.length;
  const state = noDesk ? 'no-access' : loadState(options, desk);
  return (
    <VisitorDeskScreen
      visits={[]}
      today={new Date()}
      live={{
        state,
        onRetry: () => void Promise.all([options.refetch(), desk.refetch()]),
        locations: options.data?.desk ?? [],
        locationId,
        onLocation: setPicked,
        today: new Date(),
        visits: desk.data?.visits ?? [],
        canChange: Boolean(desk.data?.canChange),
        onFind: (code) => write<VisitView>('POST', '/desk/find', { code, locationId }),
        onCheckIn: (id, input) => write<VisitView>('POST', `/${encodeURIComponent(id)}/check-in`, input),
        onCheckOut: (id) => write('POST', `/${encodeURIComponent(id)}/check-out`),
        // Slice 3 (603): the location's ID rule and the photo of the ID where it keeps one.
        idCapture: desk.data?.idCapture ?? 'off',
        onIdImage: idImage,
        // Slice 2: walk-ins (604, 606, 610), deciding for the host after the timeout, the visit's type texts.
        walkIns: locationId
          ? {
              types: (types.data?.types ?? []).map((t) => ({ value: t.id, label: t.name })),
              hosts: (q) => get(`/desk/hosts?locationId=${enc(locationId)}&q=${enc(q)}`),
              needs: (q) => get(`/desk/needs?locationId=${enc(locationId)}${q.typeId ? `&typeId=${enc(q.typeId)}` : ''}&mobile=${enc(q.mobile)}${q.company ? `&company=${enc(q.company)}` : ''}`),
              onAdd: (input) => write<VisitView>('POST', '/walk-ins', { ...input, locationId }),
              onDecide: (id, approve, reason) => write('POST', `/walk-ins/${enc(id)}/decide`, { approve, ...(reason ? { reason } : {}) }),
              visitNeeds: (id) => get<KioskNeeds>(`/${enc(id)}/needs`),
            }
          : undefined,
      }}
    />
  );
}

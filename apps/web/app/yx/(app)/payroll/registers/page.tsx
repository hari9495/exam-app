'use client';

import { useEffect, useState } from 'react';
import { RegistersScreen, type RegisterRow, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayWrite } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Compliance › Registers: the designed CMP-03 screen with real data: made, frozen, signed and packed for an inspection.
export default function YxPayRegistersPage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const [month, setMonth] = useState(() => {
    const d = new Date(`${todayIndia().slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const registers = useApi<RegisterRow[]>(entityId ? `/statutory/registers?entityId=${encodeURIComponent(entityId)}&month=${month}` : null);
  const write = useApiWrite();
  const payWrite = usePayWrite();
  const download = usePayDownload();
  const id = encodeURIComponent;
  return (
    <RegistersScreen
      rows={[]}
      live={{
        state: payState(entities),
        onRetry: () => void entities.refetch(),
        entities: entities.data ?? [],
        entityId,
        onEntity: setEntityId,
        month,
        onMonth: setMonth,
        registers: registers.data ?? null,
        can: { generate: perms.has('statutory.filing.generate'), sign: perms.has('statutory.register.sign'), download: perms.has('statutory.filing.download') },
        onGenerate: (reason) => write('/statutory/registers', { entityId, month, ...(reason ? { reason } : {}) }),
        onDownload: (r) => download(`/statutory/registers/${id(r.id)}/file`, `${r.registerType}-${r.month}-v${r.version}.pdf`),
        onFreeze: (r) => write(`/statutory/registers/${id(r.id)}/freeze`),
        onSign: (r, file) => {
          const form = new FormData();
          form.append('file', file);
          return write(`/statutory/registers/${id(r.id)}/sign`, form);
        },
        onPack: async () => {
          const pack = await write<{ fileId: string }>('/statutory/inspection-packs', { entityId, month });
          const link = await payWrite<{ path: string }>(`/files/${id(pack.fileId)}/link`);
          await download(link.path, `inspection-pack-${month}.zip`);
        },
      }}
    />
  );
}

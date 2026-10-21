'use client';

import { useState } from 'react';
import { Segment, useToast } from '@yukthix/ui';
import { BfsiComplianceList, DisabilityDeclaration, PreclearanceQueue, type BfsiDeclarationView, type DisabilityRow, type QueueRow, type RegisterRow } from '@yukthix/ui/frame';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { saveBlob } from '../../../../../lib/yx-pay';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';

type View = 'disability' | 'register' | 'preclearance';
const enc = encodeURIComponent;
const dateText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : /^[=+\-@]/.test(s) ? `'${s}` : s);

// People › Declarations: the HR diversity role's disability declarations (PPL-38, Special) and, for companies that use
// BFSI compliance, the compliance officer's register (PPL-43) and pre-clearance requests (PPL-44). One page, a switch
// between them only for someone who holds both keys. The API checks each key and decision.
export default function YxDeclarationsPage() {
  const { toast } = useToast();
  const perms = useYxPermissions();
  const views: View[] = [...(perms.has('employee.disability.manage') ? ['disability' as const] : []), ...(perms.has('compliance.officer') ? ['register' as const, 'preclearance' as const] : [])];
  const [chosen, setView] = useState<View | null>(null);
  const view = chosen ?? views[0] ?? 'disability';
  const disability = usePeople<DisabilityRow[]>(view === 'disability' ? '/disability' : null);
  const register = useLife<{ year: string; rows: RegisterRow[]; windows: { id: string; from: string; to: string; reason: string }[] }>(view === 'register' ? '/compliance/register' : null);
  const queue = useLife<QueueRow[]>(view === 'preclearance' ? '/compliance/preclearance' : null);
  const places = useJoinerPlaces(view === 'register');
  const write = usePeopleWrite();
  const call = useLifeWrite();
  const { accessToken } = useAuth();
  const tabs =
    views.length > 1 ? (
      <Segment label="Show" value={view} onChange={setView} options={views.map((v) => ({ value: v, label: v === 'disability' ? 'Disability declarations' : v === 'register' ? 'Regulated declarations' : 'Pre-clearance requests' }))} />
    ) : undefined;
  if (view === 'register')
    return (
      <BfsiComplianceList
        tabs={tabs}
        live={{
          state: register.isError ? 'error' : register.data ? 'ready' : 'loading',
          onRetry: () => void register.refetch(),
          data: register.data ?? null,
          people: places.managers.map((m) => ({ id: m.value, name: m.label.split(',')[0], role: m.label.split(', ').slice(1).join(', ') || undefined })),
          onDesignate: async (employeeId) => {
            await call('POST', '/compliance/designated', { employeeId });
            toast({ tone: 'success', title: `${places.managers.find((m) => m.value === employeeId)?.label.split(',')[0] ?? 'The person'} is a designated person` });
          },
          onOpen: (r) => apiFetch(`/compliance/declarations/${enc(r.declarationId!)}`, {}, accessToken ?? undefined) as Promise<BfsiDeclarationView>,
          onReview: async (r) => {
            await call('POST', `/compliance/declarations/${enc(r.declarationId!)}/review`, { version: r.version });
            toast({ tone: 'success', title: `${r.name}'s declaration reviewed` });
          },
          onCloseWindow: async (input) => {
            await call('POST', '/compliance/trading-windows', input);
            toast({ tone: 'success', title: 'Trading window closed', description: `${dateText(input.from)} to ${dateText(input.to)}` });
          },
          onExport: (rows) => {
            const csv = [['Person', 'Declaration', 'Due', 'Status'], ...rows.map((r) => [r.name, r.type, r.due, r.status])].map((r) => r.map(cell).join(',')).join('\r\n');
            saveBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `regulated-declarations-${register.data?.year ?? ''}.csv`);
          },
        }}
      />
    );
  if (view === 'preclearance')
    return (
      <PreclearanceQueue
        tabs={tabs}
        live={{
          state: queue.isError ? 'error' : queue.data ? 'ready' : 'loading',
          onRetry: () => void queue.refetch(),
          rows: queue.data ?? null,
          onDecide: async (r, approve, note) => {
            try {
              await call('POST', `/compliance/preclearance/${enc(r.id)}/decide`, { approve, note, version: r.version });
              toast({ tone: 'success', title: approve ? `${r.name}'s pre-clearance ${r.ref} approved` : `${r.name}'s pre-clearance ${r.ref} rejected` });
            } catch (e) {
              toast({ tone: 'error', title: e instanceof Error ? e.message : 'That did not work. Try again.' });
            }
          },
        }}
      />
    );
  return (
    <DisabilityDeclaration
      tabs={tabs}
      liveList={{
        state: disability.isError ? 'error' : disability.data ? 'ready' : 'loading',
        onRetry: () => void disability.refetch(),
        rows: disability.data ?? null,
        onVerify: async (r) => {
          await write('POST', `/disability/${enc(r.id)}/verify`, { version: r.version });
          toast({ tone: 'success', title: `${r.name}'s declaration verified` });
        },
      }}
    />
  );
}

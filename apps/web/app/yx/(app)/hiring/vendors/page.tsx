'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ShareJobSheet, VendorSheet, VendorsScreen, type ShareOptions, type VendorRowView, type VendorSubmissionView } from '@yukthix/ui/hiring';
import { rupees, useStaffing, useStaffingGet, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';

type Job = { id: string; title: string; client: string | null };
type Options = { contacts: { id: string; name: string; role: string }[] };

// Hiring › Vendors (HIR-21): the existing recruitment agencies with their documents, shares and submissions; one vendor
// model (the older /v2 agencies and agency-submissions pages redirect here). Works without the staffing desk; a client
// job adds the rate cap, consent and duplicate checks, and Forward to client needs the desk. Recruiters review vendor
// submissions without quotes or caps.
export default function YxHiringVendorsPage() {
  const params = useSearchParams();
  const { accessToken, impersonating, actingSuperAdmin } = useAuth();
  const { has } = useYxPermissions();
  const queryClient = useQueryClient();
  const acting = impersonating || actingSuperAdmin;
  const manages = has('ats.agency.manage') || has('ats.staffing.manage') || has('org:manage_settings');
  const vendors = useStaffing<VendorRowView[]>('/vendors', manages);
  const subs = useStaffing<VendorSubmissionView[]>('/vendor-submissions');
  const jobs = useStaffing<Job[]>('/vendors/jobs', manages);
  const get = useStaffingGet();
  const write = useStaffingWrite();
  const [editing, setEditing] = useState<VendorRowView | 'new' | null>(null);
  const [sharing, setSharing] = useState(false);
  const loadShare = useCallback((jobId: string) => get<ShareOptions>(`/vendors/share-options?jobId=${encodeURIComponent(jobId)}`), [get]);
  const review = async (path: string) => {
    await apiFetch(path, { method: 'POST' }, accessToken ?? undefined);
    await queryClient.invalidateQueries({ queryKey: ['staffing'] });
  };
  const err = (q: { isError: boolean; error: unknown }) => (q.isError ? ((q.error as { status?: number }).status === 403 ? 'denied' : 'error') : null);
  const state = err(subs) ?? (manages ? err(vendors) : null) ?? (subs.isSuccess && (!manages || vendors.isSuccess) ? 'ready' : 'loading');
  const portal = (t: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/agency/${t}`;
  const row = editing && editing !== 'new' ? (vendors.data ?? []).find((v) => v.id === editing.id) ?? editing : null;
  return (
    <>
      <VendorsScreen
        live={{
          state: state as 'ready' | 'loading' | 'error' | 'denied',
          onRetry: () => void (vendors.refetch(), subs.refetch()),
          vendors: vendors.data ?? [],
          submissions: subs.data ?? null,
          canManage: manages && !acting,
          canForward: has('ats.staffing.manage') && !acting,
          canReview: has('pipeline:manage') && !acting,
          showRegister: manages,
          defaultTab: params.get('tab') === 'submissions' ? 'submissions' : 'register',
          onAdd: () => setEditing('new'),
          onEdit: (id) => setEditing((vendors.data ?? []).find((v) => v.id === id) ?? null),
          onShare: () => setSharing(true),
          onException: (id, reason) => write('POST', `/vendor-submissions/${encodeURIComponent(id)}/exception`, { reason }),
          loadContacts: async (jobId) => (await get<Options>(`/submissions/options?jobId=${encodeURIComponent(jobId)}`)).contacts.map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` })),
          onForward: (id, contactId) => write('POST', `/vendor-submissions/${encodeURIComponent(id)}/forward`, { contactId }),
          onAccept: (id) => review(`/agency-submissions/${encodeURIComponent(id)}/accept`),
          onReject: (id) => review(`/agency-submissions/${encodeURIComponent(id)}/reject`),
        }}
      />
      {editing && (
        <VendorSheet
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={row ? { name: row.name, contactEmail: row.contactEmail, pan: row.pan, gstin: row.gstin, tdsSection: row.tdsSection, tier: row.tier, agreementSignedOn: row.agreementSignedOn, bankVerified: row.bankVerified, active: row.active } : null}
          links={
            row
              ? {
                  link: portal(row.portalToken),
                  jobs: row.jobs,
                  onNewLink: () => write('POST', `/vendors/${encodeURIComponent(row.id)}/new-link`),
                  onUnshare: (jobId) => write('DELETE', `/vendors/${encodeURIComponent(row.id)}/jobs/${encodeURIComponent(jobId)}`),
                }
              : undefined
          }
          onSave={(input) => (row ? write('PUT', `/vendors/${encodeURIComponent(row.id)}`, input) : write('POST', '/vendors', input))}
        />
      )}
      {sharing && (
        <ShareJobSheet
          open
          onOpenChange={(o) => !o && setSharing(false)}
          today={new Date()}
          jobs={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.client ? `${j.title} · ${j.client}` : j.title }))}
          vendors={(vendors.data ?? []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.name, description: v.missing.length ? `Missing: ${v.missing.join(', ')}` : undefined, complete: v.missing.length === 0 }))}
          loadOptions={loadShare}
          onSave={(input) => write('POST', '/vendors/share', { ...input, rateCap: input.rateCap == null ? undefined : rupees(input.rateCap) })}
        />
      )}
    </>
  );
}

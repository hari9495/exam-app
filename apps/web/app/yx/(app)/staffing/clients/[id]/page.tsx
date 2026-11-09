'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClientSheet, ClientWorkspaceScreen, ContactSheet, type ClientView, type ContactView } from '@yukthix/ui/hiring';
import { ErrorState, NoAccessState, Skeleton } from '@yukthix/ui';
import { deskState, useStaffing, useStaffingWrite } from '../../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../../lib/auth-context';

type Choice = { value: string; label: string };
type One = { canManage: boolean; choices: { states: Choice[]; people: Choice[] } | null; client: ClientView & { state: string; accountManagerUserId: string | null; version: number }; contacts: ContactView[] };

// Staffing desk › Clients › one client (HIR-14 workspace): the designed ClientWorkspaceScreen with `live`: overview,
// contacts, contract and SLAs. Account managers change the client and its contacts; others read.
export default function YxStaffingClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const one = useStaffing<One>(`/clients/${encodeURIComponent(id)}`);
  const write = useStaffingWrite();
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<ContactView | 'new' | null>(null);
  const state = deskState(one);
  if (state !== 'ready' || !one.data) {
    if (state === 'loading') return <Skeleton height={320} />;
    if (state === 'error') return <ErrorState title="The client could not be loaded." onRetry={() => void one.refetch()} />;
    return <NoAccessState grantedBy="your admin (Staffing account manager)" what="this client" />;
  }
  const d = one.data;
  const c = d.client;
  const canManage = d.canManage && !(impersonating || actingSuperAdmin);
  const path = `/clients/${encodeURIComponent(id)}`;
  return (
    <>
      <ClientWorkspaceScreen
        live={{
          client: c,
          contacts: d.contacts,
          canManage,
          onEdit: () => setEditing(true),
          onRates: () => router.push(`/yx/staffing/rate-cards?client=${encodeURIComponent(id)}`),
          onAddContact: () => setContact('new'),
          onEditContact: (cid) => setContact(d.contacts.find((x) => x.id === cid) ?? null),
          onRemoveContact: (cid) => write('DELETE', `${path}/contacts/${encodeURIComponent(cid)}`),
        }}
      />
      {editing && d.choices && (
        <ClientSheet
          open
          onOpenChange={(o) => !o && setEditing(false)}
          initial={{ name: c.name, legalName: c.legalName, gstin: c.gstin, state: c.state, billingAddress: c.billingAddress, status: c.status, accountManagerUserId: c.accountManagerUserId, paymentTermsDays: c.paymentTermsDays, contractStart: c.contractStart, contractEnd: c.contractEnd, noticeDays: c.noticeDays, slaFirstSubmissionDays: c.slaFirstSubmissionDays, slaFeedbackDays: c.slaFeedbackDays }}
          states={d.choices.states}
          people={d.choices.people}
          defaultTermsDays={c.defaultPaymentTermsDays}
          onSave={(input) => write('PUT', path, { ...input, version: c.version })}
        />
      )}
      {contact && (
        <ContactSheet
          open
          onOpenChange={(o) => !o && setContact(null)}
          initial={contact === 'new' ? null : { name: contact.name, role: contact.role, email: contact.email, phone: contact.phone, billing: contact.billing }}
          onSave={(input) => (contact === 'new' ? write('POST', `${path}/contacts`, input) : write('PUT', `${path}/contacts/${encodeURIComponent(contact.id)}`, input))}
        />
      )}
    </>
  );
}

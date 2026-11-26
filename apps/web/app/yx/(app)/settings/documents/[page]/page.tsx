'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { EventEmailSheet, SETTINGS_GROUPS, SenderAddressSheet, hiringEmailsPage, type EventEmailView, type SenderAddressView } from '@yukthix/ui/hiring';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { useAuth } from '../../../../../../lib/auth-context';

// Settings › Documents & Communication: 5.7 Policies (S-7, answer 1321: the settings that were on Company rules, with
// "Different for" where a setting allows it) and 5.4 Notifications (S-8: the email switch and the digest time, with the
// link to the wording editor). HR's settings key changes them.
// Answer 2429 (retiring /v2): 5.4 also shows the hiring emails, each read and changed through its own API with its own
// key: sender addresses (read with the pipeline key, changed with the company settings key), interview emails (pipeline
// key) and hiring approval emails (approvals key); never changed while acting for someone else (the API refuses too).
const PAGES = ['5.4', '5.7'];
const LINKS: Record<string, string> = { 'ntf.templates': '/yx/settings/emails' };
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '5.4')!;
type Open = { list: 'sender'; i: number | 'new' } | { list: 'interview' | 'approval'; i: number } | null;

export default function YxSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const on = page === 'notifications';
  const pipeline = on && perms.has('pipeline:manage');
  const approvals = on && perms.has('approvals:configure');
  const senders = useApi<SenderAddressView[]>(pipeline ? '/org-sender-addresses' : null);
  const interview = useApi<EventEmailView[]>(pipeline ? '/interview-email-templates' : null);
  const approval = useApi<EventEmailView[]>(approvals ? '/approval-email-templates' : null);
  const write = useApiWrite();
  const [open, setOpen] = useState<Open>(null);
  const editSenders = pipeline && perms.has('org:manage_settings') && !acting;
  const editInterview = pipeline && !acting;
  const editApproval = approvals && !acting;
  const editors: Record<string, (i: number | 'new') => void> = {
    ...(senders.data && editSenders ? { 'ntf.sender_addresses': (i) => setOpen({ list: 'sender', i }) } : {}),
    ...(interview.data && editInterview ? { 'ntf.interview_emails': (i) => i !== 'new' && setOpen({ list: 'interview', i }) } : {}),
    ...(approval.data && editApproval ? { 'ntf.approval_emails': (i) => i !== 'new' && setOpen({ list: 'approval', i }) } : {}),
  };
  const close = () => setOpen(null);
  const sender = open?.list === 'sender' && typeof open.i === 'number' ? (senders.data?.[open.i] ?? null) : null;
  const email = open && open.list !== 'sender' ? (open.list === 'interview' ? interview.data : approval.data)?.[open.i] : undefined;
  return (
    <>
      <RegistrySettingsPage
        slug={page}
        pageIds={PAGES}
        links={LINKS}
        canEdit={canEdit}
        decorate={on ? (p) => hiringEmailsPage(p, design, { senders: senders.data, interview: interview.data, approval: approval.data }) : undefined}
        listEditors={on && Object.keys(editors).length ? editors : undefined}
      />
      {open?.list === 'sender' && (
        <SenderAddressSheet
          key={sender?.id ?? 'new'}
          sender={sender}
          canEdit={editSenders}
          onSave={(id, input) => (id ? write('PATCH', `/org-sender-addresses/${encodeURIComponent(id)}`, input) : write('POST', '/org-sender-addresses', input))}
          onDelete={(id) => write('DELETE', `/org-sender-addresses/${encodeURIComponent(id)}`)}
          onClose={close}
        />
      )}
      {open && open.list !== 'sender' && email && (
        <EventEmailSheet
          key={`${open.list}-${email.eventType}`}
          kind={open.list}
          email={email}
          canEdit={open.list === 'interview' ? editInterview : editApproval}
          onSave={(eventType, input) => write('PUT', `/${open.list === 'interview' ? 'interview' : 'approval'}-email-templates/${encodeURIComponent(eventType)}`, input)}
          onClose={close}
        />
      )}
    </>
  );
}

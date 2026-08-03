'use client';

import { FormEvent, useState } from 'react';
import { Modal, Tabs, TabsList, TabsTrigger, TabsContent, Input, Select, Checkbox, Button, useToast } from './ui';
import { useCreateUser, useBulkCreateUsers } from '../lib/hooks/useUsers';
import { useSsoSettings } from '../lib/hooks/useSso';

// Lifted from users/page.tsx -- this modal now owns it.
const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

interface NewUserModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewUserModal({ open, onClose }: NewUserModalProps) {
  const { toast } = useToast();
  const createUser = useCreateUser();
  const bulkCreateUsers = useBulkCreateUsers();
  // Staff sign in via the identity provider on an SSO-enabled org (email-matched, no
  // password ever checked) -- the password field and the set-password-link option both
  // become dead UI in that case, so hide them rather than offer a choice that does nothing.
  const { data: ssoSettings } = useSsoSettings();
  const ssoEnabled = ssoSettings?.samlEnabled === true;

  const [tab, setTab] = useState('single');
  const [error, setError] = useState<string | null>(null);

  // Single tab
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('recruiter');
  const [sendLink, setSendLink] = useState(false);

  // Multiple tab
  const [emailsText, setEmailsText] = useState('');
  const [bulkRole, setBulkRole] = useState('recruiter');

  function reset() {
    setTab('single');
    setError(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('recruiter');
    setSendLink(false);
    setEmailsText('');
    setBulkRole('recruiter');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function submitSingle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // native `required` blocks an empty value but not whitespace-only input.
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to add user');

    if (ssoEnabled) {
      createUser.mutate(
        { email, name: name.trim() || undefined, role },
        { onSuccess: () => { toast(`Added ${email} as ${role}.`); handleClose(); }, onError },
      );
      return;
    }
    if (sendLink) {
      // No password over the wire -- a single-email bulk call reuses the set-password-link path.
      bulkCreateUsers.mutate(
        { emails: [email], role },
        { onSuccess: () => { toast(`Sent a set-password link to ${email}.`); handleClose(); }, onError },
      );
      return;
    }
    createUser.mutate(
      { email, name: name.trim() || undefined, password, role },
      { onSuccess: () => { toast(`Added ${email} as ${role}.`); handleClose(); }, onError },
    );
  }

  function submitBulk(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const emails = emailsText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (emails.length === 0) {
      setError('Enter at least one email.');
      return;
    }
    bulkCreateUsers.mutate(
      { emails, role: bulkRole },
      {
        onSuccess: (result: { created: unknown[]; skipped: unknown[] }) => {
          // The toast (not a summary left sitting in the modal) is the source of truth for the
          // outcome, same as the single-user flow -- so this closes on success too instead of
          // leaving the modal open with no visible way forward (ADO #6845).
          toast(`Created ${result.created.length} user(s), skipped ${result.skipped.length}.`);
          handleClose();
        },
        onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to create users'),
      },
    );
  }

  return (
    <Modal open={open} title="New User" onClose={handleClose}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="single">Single</TabsTrigger>
          <TabsTrigger value="multiple">Multiple</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <form onSubmit={submitSingle} className="flex flex-col gap-3">
            <Input label="Name" value={name} onChange={setName} />
            <Input label="Email" type="email" value={email} onChange={setEmail} required />
            <Select label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
            {ssoEnabled ? (
              <p className="text-xs text-gray-500">
                Single sign-on is enabled for this organization. New users sign in with your identity provider — no
                password is needed.
              </p>
            ) : (
              <>
                {!sendLink && (
                  <Input label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
                )}
                <Checkbox label="Send Set-password Link Instead" checked={sendLink} onChange={setSendLink} />
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" loading={createUser.isPending || bulkCreateUsers.isPending}>
                Add user
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="multiple">
          <form onSubmit={submitBulk} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="bulk-emails" className="text-sm font-medium text-gray-700">
                Emails (one per line)
              </label>
              <textarea
                id="bulk-emails"
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                rows={6}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <Select label="Role" value={bulkRole} onChange={setBulkRole} options={ROLE_OPTIONS} />
            {ssoEnabled && (
              <p className="text-xs text-gray-500">
                Single sign-on is enabled — these users won&apos;t receive a set-password email; they sign in with your
                identity provider.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" loading={bulkCreateUsers.isPending}>
                Add users
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </Modal>
  );
}

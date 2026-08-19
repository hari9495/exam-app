'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import {
  useCurrentUser,
  useUpdateProfile,
  useChangePassword,
  useUploadAvatar,
  useRemoveAvatar,
} from '../lib/hooks/useCurrentUser';
import { useSsoStatus } from '../lib/hooks/useSso';
import { useAuth } from '../lib/auth-context';
import { Button, Input, CollapsibleSection, RequiredFieldsNote, useToast } from './ui';

// One shared showPassword state drives all three password fields, so every field
// gets its own toggle button rather than just the one a user happens to click --
// otherwise "Current Password" silently reveals with no visible affordance there.
function PasswordVisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide characters' : 'Show characters'}
      className="absolute bottom-2 right-3 text-muted hover:text-ink"
    >
      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}

// Matches the initials the staff shells build for the top bar, so the placeholder a user sees
// here is the same one their colleagues see beside their name.
function initialsFor(user: { name: string | null; email: string }): string {
  const source = user.name?.trim() || user.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function AvatarField() {
  const { data: user } = useCurrentUser();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Uploads straight from the file picker rather than parking the File in state behind a
  // separate "Upload" button -- that two-step shape is what left the branding logo button
  // looking disabled after a file was chosen (ADO #6846).
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the SAME file again still fires a change event.
    event.target.value = '';
    if (!file) return;
    setError(null);
    uploadAvatar.mutate(file, {
      onSuccess: () => toast('Profile picture updated.'),
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to upload profile picture'),
    });
  }

  function handleRemove() {
    setError(null);
    removeAvatar.mutate(undefined, {
      onSuccess: () => toast('Profile picture removed.'),
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to remove profile picture'),
    });
  }

  const busy = uploadAvatar.isPending || removeAvatar.isPending;

  return (
    <div className="flex items-center gap-4 sm:col-span-2">
      {user?.avatarUrl ? (
        // Plain <img>, not next/image: the URL is a time-limited SAS link on a storage host that
        // is not in next.config's remotePatterns, and the optimizer would reject it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt="Your profile picture"
          className="h-16 w-16 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-rule bg-primary text-lg font-semibold text-on-primary"
        >
          {user ? initialsFor(user) : ''}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Profile picture file"
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!user || busy}>
            {uploadAvatar.isPending ? 'Uploading…' : user?.avatarUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {user?.avatarUrl && (
            <Button variant="secondary" onClick={handleRemove} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">PNG or JPEG, up to 1MB.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProfileForm() {
  const { organizationSlug } = useAuth();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const { toast } = useToast();
  // SSO sign-in is email-matched and never checks passwordHash (for every role, not just
  // org_admin), so this form's "Current Password" is unusable once SSO is on -- hide it
  // rather than let someone fill it in and get a confusing failure.
  const { data: ssoStatus } = useSsoStatus();
  const ssoEnabled = ssoStatus?.enabled === true;

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    updateProfile.mutate(
      { name },
      {
        onSuccess: () => toast('Name updated.'),
        onError: (err) => setNameError(err instanceof Error ? err.message : 'Failed to update name'),
      },
    );
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast('Password changed. Other sessions have been signed out.');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
        onError: (err) => setPasswordError(err instanceof Error ? err.message : 'Failed to change password'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink">My Profile</h1>
      {!user && <p className="text-sm text-muted">Loading…</p>}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}
      >
        <CollapsibleSection title="Profile">
          <AvatarField />
          <div className="sm:col-span-2">
            <RequiredFieldsNote />
          </div>
          <form onSubmit={handleNameSubmit} className="contents">
            <Input label="Display Name" value={name} onChange={setName} disabled={!user} placeholder="e.g. Jane Doe" required />
            <Input label="Email" value={user?.email ?? ''} onChange={() => {}} disabled readOnly />
            <Input label="Role" value={user?.role ?? ''} onChange={() => {}} disabled readOnly />
            <Input label="Organization" value={organizationSlug ?? ''} onChange={() => {}} disabled readOnly />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!user || name.trim().length === 0}>
                Save name
              </Button>
            </div>
          </form>
          {nameError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {nameError}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
      >
        <CollapsibleSection title="Password">
          {ssoEnabled ? (
            <p className="text-sm text-muted sm:col-span-2">
              Single sign-on is enabled for this organization. You sign in with your identity provider — there is no
              password to change.
            </p>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="contents">
              <div className="sm:col-span-2">
                <RequiredFieldsNote />
              </div>
              <div className="relative sm:col-span-2">
                <Input
                  label="Current Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  required
                />
                <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((prev) => !prev)} />
              </div>
              <div className="relative sm:col-span-2">
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  required
                />
                <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((prev) => !prev)} />
              </div>
              <div className="relative sm:col-span-2">
                <Input
                  label="Confirm New Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  required
                />
                <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((prev) => !prev)} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!passwordsMatch || currentPassword.length === 0}>
                  Change password
                </Button>
              </div>
              {!passwordsMatch && confirmPassword.length > 0 && (
                <p className="text-xs text-muted sm:col-span-2">Passwords must match.</p>
              )}
            </form>
          )}
          {!ssoEnabled && passwordError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {passwordError}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>
    </div>
  );
}

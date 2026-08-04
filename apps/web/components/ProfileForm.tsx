'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { useCurrentUser, useUpdateProfile, useChangePassword } from '../lib/hooks/useCurrentUser';
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
      className="absolute bottom-2 right-3 text-recruiter-text-tertiary hover:text-recruiter-text"
    >
      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
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
      <h1 className="text-xl font-semibold text-recruiter-text">My Profile</h1>
      {!user && <p className="text-sm text-recruiter-text-secondary">Loading…</p>}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}
      >
        <CollapsibleSection title="Profile">
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
            <p className="text-sm text-recruiter-text-secondary sm:col-span-2">
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
                <p className="text-xs text-recruiter-text-tertiary sm:col-span-2">Passwords must match.</p>
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

'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useCurrentUser, useUpdateProfile, useChangePassword } from '../lib/hooks/useCurrentUser';
import { useAuth } from '../lib/auth-context';
import { Button, Input, Card, useToast } from './ui';

export function ProfileForm() {
  const { organizationSlug } = useAuth();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const { toast } = useToast();

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
      <Card className="max-w-md">
        <h1 className="mb-4 text-xl font-semibold text-recruiter-text">My Profile</h1>
        {!user && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading…</p>}
        <form onSubmit={handleNameSubmit} className="mb-4 flex flex-col gap-3">
          <Input label="Display name" value={name} onChange={setName} disabled={!user} />
          <Input label="Email" value={user?.email ?? ''} onChange={() => {}} disabled readOnly />
          <Input label="Role" value={user?.role ?? ''} onChange={() => {}} disabled readOnly />
          <Input label="Organization" value={organizationSlug ?? ''} onChange={() => {}} disabled readOnly />
          <Button type="submit" disabled={!user || name.trim().length === 0}>
            Save name
          </Button>
        </form>
        {nameError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {nameError}
          </p>
        )}
      </Card>

      <Card className="max-w-md">
        <h2 className="mb-4 text-lg font-semibold text-recruiter-text">Change password</h2>
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
          <Input
            label="Current password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
          <div className="relative">
            <Input
              label="New password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide characters' : 'Show characters'}
              className="absolute bottom-2 right-3 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <Input
            label="Confirm new password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
          />
          <Button type="submit" disabled={!passwordsMatch || currentPassword.length === 0}>
            Change password
          </Button>
          {!passwordsMatch && confirmPassword.length > 0 && (
            <p className="text-xs text-recruiter-text-tertiary">Passwords must match.</p>
          )}
        </form>
        {passwordError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {passwordError}
          </p>
        )}
      </Card>
    </div>
  );
}

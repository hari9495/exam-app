'use client';

import { useState } from 'react';
import { Modal, Input, Button, useToast } from './ui';
import { useUpdateCandidate } from '../lib/hooks/useCandidates';
import { Candidate } from '../lib/types';
import { composeName, EMAIL_PATTERN, PHONE_PATTERN, splitName } from '../lib/candidateValidation';

interface CandidateEditModalProps {
  candidate: Candidate;
  onClose: () => void;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export function CandidateEditModal({ candidate, onClose }: CandidateEditModalProps) {
  // The stored value is a single "name" string -- splitName gives first word /
  // middle words / last word, and a legacy single-word name lands in First Name
  // with the rest empty rather than losing data.
  const initial = splitName(candidate.name);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [middleName, setMiddleName] = useState(initial.middleName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(candidate.email);
  const [phone, setPhone] = useState(candidate.phone ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const updateCandidate = useUpdateCandidate();
  const { toast } = useToast();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!firstName.trim()) nextErrors.firstName = 'Complete this field.';
    if (!lastName.trim()) nextErrors.lastName = 'Complete this field.';
    if (!email.trim()) {
      nextErrors.email = 'Complete this field.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (phone.trim() && !PHONE_PATTERN.test(phone.trim())) {
      nextErrors.phone = 'Enter a valid 10-digit phone number.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    updateCandidate.mutate(
      { id: candidate.id, name: composeName(firstName, middleName, lastName), email: email.trim(), phone },
      {
        onSuccess: () => {
          toast('Candidate updated.');
          onClose();
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update candidate.', 'error'),
      },
    );
  }

  return (
    <Modal open title="Edit candidate" onClose={onClose}>
      {/* noValidate: styled inline validation (error prop below) instead of native
          browser tooltips -- the required attribute would otherwise block the submit
          event before this runs. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <Input
          label="First Name"
          value={firstName}
          onChange={(value) => {
            setFirstName(value);
            if (errors.firstName) setErrors((current) => ({ ...current, firstName: undefined }));
          }}
          error={errors.firstName}
          required
        />
        <Input label="Middle Name" value={middleName} onChange={setMiddleName} />
        <Input
          label="Last Name"
          value={lastName}
          onChange={(value) => {
            setLastName(value);
            if (errors.lastName) setErrors((current) => ({ ...current, lastName: undefined }));
          }}
          error={errors.lastName}
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
          }}
          error={errors.email}
          required
        />
        <Input
          label="Phone"
          value={phone}
          onChange={(value) => {
            setPhone(value);
            if (errors.phone) setErrors((current) => ({ ...current, phone: undefined }));
          }}
          error={errors.phone}
        />
        {(candidate.invitationCount ?? 0) > 0 && email !== candidate.email && (
          <p className="rounded-md bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
            This candidate has already been invited. Changing their email won&apos;t resend or update invitations already sent to the
            old address.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={updateCandidate.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

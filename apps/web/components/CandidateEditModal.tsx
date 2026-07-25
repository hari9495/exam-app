'use client';

import { useState } from 'react';
import { Modal, Input, Button, useToast } from './ui';
import { useUpdateCandidate } from '../lib/hooks/useCandidates';
import { Candidate } from '../lib/types';

interface CandidateEditModalProps {
  candidate: Candidate;
  onClose: () => void;
}

export function CandidateEditModal({ candidate, onClose }: CandidateEditModalProps) {
  const [name, setName] = useState(candidate.name);
  const [email, setEmail] = useState(candidate.email);
  const [phone, setPhone] = useState(candidate.phone ?? '');
  const updateCandidate = useUpdateCandidate();
  const { toast } = useToast();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateCandidate.mutate(
      { id: candidate.id, name, email, phone },
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={setName} required />
        <Input label="Email" type="email" value={email} onChange={setEmail} required />
        <Input label="Phone" value={phone} onChange={setPhone} />
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

'use client';

import { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { FormAlert } from './FormAlert';

// Purely presentational approve/reject prompt shared by requisition, offer, and inbox approval
// surfaces. Callers own the mutation — onDecide just reports the chosen decision + note.
export function ApprovalDecisionDialog({
  open, onClose, onDecide, pending = false, error,
}: {
  open: boolean;
  onClose: () => void;
  onDecide: (decision: 'approved' | 'rejected', note: string) => void;
  pending?: boolean;
  error?: string;
}) {
  const [note, setNote] = useState('');
  return (
    <Dialog open={open} onClose={onClose} title="Review approval">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label htmlFor="approval-note" className="v2-label">Note (optional)</label>
          <textarea
            id="approval-note"
            className="v2-field"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
        </div>
        {error && <FormAlert>{error}</FormAlert>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button className="v2-cta--danger" disabled={pending} onClick={() => onDecide('rejected', note)}>Reject</Button>
          <Button disabled={pending} onClick={() => onDecide('approved', note)}>Approve</Button>
        </div>
      </div>
    </Dialog>
  );
}

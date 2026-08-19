'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { Modal, Button, Input, Tabs, TabsList, TabsTrigger, TabsContent, useToast } from '../ui';
import { useAddEntry } from '../../lib/hooks/usePipeline';
import { useCandidates } from '../../lib/hooks/useCandidates';

export function AddCandidateModal({ jobId, open, onClose }: { jobId: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const addEntry = useAddEntry(jobId);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const { data: candidates } = useCandidates({ search: search.trim() || undefined, pageSize: 10 });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  function reset() {
    setMode('existing');
    setSearch('');
    setSelectedCandidateId(null);
    setName('');
    setEmail('');
    setPhone('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canSubmit = mode === 'existing' ? Boolean(selectedCandidateId) : Boolean(name.trim() && email.trim());

  function handleSubmit() {
    const input =
      mode === 'existing'
        ? selectedCandidateId
          ? { candidateId: selectedCandidateId }
          : null
        : name.trim() && email.trim()
          ? { newCandidate: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined } }
          : null;
    if (!input) return;
    addEntry.mutate(input, {
      onSuccess: () => {
        toast('Candidate added to the pipeline.');
        handleClose();
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add candidate.', 'error'),
    });
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      title="Add candidate"
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={addEntry.isPending} disabled={!canSubmit}>
            Add
          </Button>
        </>
      }
    >
      <Tabs value={mode} onValueChange={(value) => setMode(value as 'existing' | 'new')}>
        <TabsList>
          <TabsTrigger value="existing">Existing candidate</TabsTrigger>
          <TabsTrigger value="new">New candidate</TabsTrigger>
        </TabsList>
        <TabsContent value="existing">
          <div className="flex flex-col gap-2">
            <Input
              label="Search candidates"
              hideLabel
              value={search}
              onChange={setSearch}
              placeholder="Search by name or email…"
              icon={<Search size={16} />}
            />
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {(candidates?.data ?? []).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedCandidateId(candidate.id)}
                  className={clsx(
                    'rounded border px-3 py-2 text-left text-sm',
                    selectedCandidateId === candidate.id ? 'border-primary bg-ground' : 'border-rule',
                  )}
                >
                  <div className="font-medium text-ink">{candidate.name}</div>
                  <div className="text-xs text-muted">{candidate.email}</div>
                </button>
              ))}
              {(candidates?.data ?? []).length === 0 && <p className="text-xs text-muted">No candidates found.</p>}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="new">
          <div className="grid gap-3">
            <Input label="Name" value={name} onChange={setName} required />
            <Input label="Email" type="email" value={email} onChange={setEmail} required />
            <Input label="Phone (optional)" value={phone} onChange={setPhone} />
          </div>
        </TabsContent>
      </Tabs>
    </Modal>
  );
}

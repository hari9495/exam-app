'use client';

import { useMemo, useState } from 'react';
import { Modal, Input, Button, Checkbox, Select, useToast } from './ui';
import { WalkInShareCard } from './WalkInShareCard';
import {
  useEligibleWalkInExams,
  useWalkInGroups,
  useRenameWalkInGroup,
  useSetWalkInGroupExams,
  useSetGroupJob,
} from '../lib/hooks/useWalkInGroups';
import { useJobs } from '../lib/hooks/usePipeline';
import { WalkInGroup } from '../lib/types';

// Radix's Select treats value="" as its internal "nothing selected" sentinel -- see
// AdvanceToNextRoundModal for the same workaround.
const NO_JOB_SENTINEL = 'none';

interface ManageWalkInGroupModalProps {
  group: WalkInGroup;
  orgSlug: string;
  onClose: () => void;
}

// Rename, membership, and the share link/QR all live in one modal so a recruiter can set
// up a new group -- name it, pick its exams, grab the link -- without reopening anything.
export function ManageWalkInGroupModal({ group, orgSlug, onClose }: ManageWalkInGroupModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState(group.name);
  const { data: eligibleExams } = useEligibleWalkInExams();
  const { data: allGroups } = useWalkInGroups();
  const [selectedIds, setSelectedIds] = useState<string[]>(group.exams.map((exam) => exam.id));
  const renameGroup = useRenameWalkInGroup(group.id);
  const setExams = useSetWalkInGroupExams(group.id);
  const { data: openJobs } = useJobs('open');
  const setGroupJob = useSetGroupJob(group.id);
  const jobOptions = [
    { value: NO_JOB_SENTINEL, label: 'None' },
    // Guard the shape, not just null: while the query is loading/erroring, data may be
    // anything other than the Job[] we expect -- never let the picker crash the modal.
    ...(Array.isArray(openJobs) ? openJobs : []).map((job) => ({ value: job.id, label: job.title })),
  ];

  function handleJobChange(value: string) {
    setGroupJob.mutate(value === NO_JOB_SENTINEL ? null : value, {
      onSuccess: () => toast('Attached job updated.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update attached job.', 'error'),
    });
  }

  // So the picker can say which OTHER group an exam is currently in, not just that it's
  // "already grouped" -- makes the one-group-per-exam move-not-copy behavior visible before
  // the recruiter clicks Save, instead of them discovering it after the fact.
  const groupNameById = useMemo(() => new Map((allGroups ?? []).map((g) => [g.id, g.name])), [allGroups]);

  function toggle(examId: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, examId] : current.filter((id) => id !== examId)));
  }

  function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === group.name) return;
    renameGroup.mutate(trimmed, {
      onSuccess: () => toast('Group renamed.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to rename group.', 'error'),
    });
  }

  function handleSaveMembers() {
    setExams.mutate(selectedIds, {
      onSuccess: () => toast('Group members updated.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update group members.', 'error'),
    });
  }

  return (
    <Modal open title={`Manage "${group.name}"`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-6">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Group Name" value={name} onChange={setName} />
          </div>
          <Button type="button" variant="secondary" loading={renameGroup.isPending} onClick={handleSaveName}>
            Save name
          </Button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Shared link for this group</p>
          <WalkInShareCard groupId={group.id} orgSlug={orgSlug} />
        </div>

        <Select
          label="Attach job"
          value={group.jobId ?? NO_JOB_SENTINEL}
          onChange={handleJobChange}
          options={jobOptions}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Exams in this group ({selectedIds.length})</p>
            <Button type="button" size="sm" loading={setExams.isPending} onClick={handleSaveMembers}>
              Save members
            </Button>
          </div>
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-md border border-rule p-3">
            {(eligibleExams ?? []).map((exam) => {
              const otherGroupName =
                exam.walkInGroupId && exam.walkInGroupId !== group.id ? groupNameById.get(exam.walkInGroupId) : null;
              return (
                <li key={exam.id}>
                  <Checkbox
                    label={otherGroupName ? `${exam.title} (currently in "${otherGroupName}")` : exam.title}
                    checked={selectedIds.includes(exam.id)}
                    onChange={(checked) => toggle(exam.id, checked)}
                  />
                </li>
              );
            })}
            {(eligibleExams ?? []).length === 0 && (
              <p className="text-sm text-muted">
                No walk-in-enabled exams yet. Enable walk-in on an exam&apos;s Details tab first.
              </p>
            )}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

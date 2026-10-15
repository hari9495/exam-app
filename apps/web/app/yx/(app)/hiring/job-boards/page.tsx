'use client';

import { JobBoardsScreen, type BoardProvider } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { useJobs } from '../../../../../lib/hooks/usePipeline';
import { useCreateJobBoard, useDeleteJobBoard, useJobBoardProviders, useJobBoards, useSaveJobBoardConfig, useUpdateJobBoard } from '../../../../../lib/hooks/useJobBoards';

type Cost = { id: string; source: string; jobId: string | null; amount: string | number; currency: string; createdAt: string };

// Hiring › Job boards (M10 batch AT3, founder D12): the job-board seam on the existing providers, plus posting costs.
// Replaces /v2/settings/job-boards, which redirects here.
export default function YxHiringJobBoardsPage() {
  const boards = useJobBoards();
  const providers = useJobBoardProviders();
  const jobs = useJobs();
  const costs = useHiring<Cost[]>('/costs');
  const create = useCreateJobBoard();
  const rename = useUpdateJobBoard();
  const remove = useDeleteJobBoard();
  const saveConfig = useSaveJobBoardConfig();
  const write = useHiringWrite();
  const title = (id: string | null) => (jobs.data ?? []).find((j) => j.id === id)?.title ?? null;
  return (
    <JobBoardsScreen
      state={loadState(boards, costs)}
      onRetry={() => void Promise.all([boards.refetch(), costs.refetch()])}
      boards={boards.data ?? []}
      providers={(providers.data ?? []) as BoardProvider[]}
      onCreate={(name) => create.mutateAsync(name)}
      onSave={async (board, s) => {
        if (s.name !== board.name) await rename.mutateAsync({ id: board.id, name: s.name });
        await saveConfig.mutateAsync({ id: board.id, provider: s.provider, config: s.config });
      }}
      onDelete={(id) => remove.mutateAsync(id)}
      onCopy={(text) => navigator.clipboard.writeText(text)}
      costs={(costs.data ?? []).map((c) => ({ id: c.id, source: c.source, jobTitle: title(c.jobId), amount: Number(c.amount), currency: c.currency, createdAt: c.createdAt }))}
      jobs={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title }))}
      onAddCost={(c) => write('POST', '/costs', c)}
    />
  );
}

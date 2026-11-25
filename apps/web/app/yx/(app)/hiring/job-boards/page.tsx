'use client';

import { JobBoardsScreen, type BoardProvider } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useCreateJobBoard, useDeleteJobBoard, useJobBoardProviders, useJobBoards, useSaveJobBoardConfig, useUpdateJobBoard } from '../../../../../lib/hooks/useJobBoards';

// Hiring › Job boards (M10 batch AT3, founder D12): the job-board seam on the existing providers. Costs are on
// Hiring › Recruiting costs (HIR-11).
// Replaces /v2/settings/job-boards, which redirects here.
export default function YxHiringJobBoardsPage() {
  const boards = useJobBoards();
  const providers = useJobBoardProviders();
  const create = useCreateJobBoard();
  const rename = useUpdateJobBoard();
  const remove = useDeleteJobBoard();
  const saveConfig = useSaveJobBoardConfig();
  return (
    <JobBoardsScreen
      state={loadState(boards)}
      onRetry={() => void boards.refetch()}
      boards={boards.data ?? []}
      providers={(providers.data ?? []) as BoardProvider[]}
      onCreate={(name) => create.mutateAsync(name)}
      onSave={async (board, s) => {
        if (s.name !== board.name) await rename.mutateAsync({ id: board.id, name: s.name });
        await saveConfig.mutateAsync({ id: board.id, provider: s.provider, config: s.config });
      }}
      onDelete={(id) => remove.mutateAsync(id)}
      onCopy={(text) => navigator.clipboard.writeText(text)}
    />
  );
}

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { HelpEditorScreen, type HelpDetail, type HelpRow, type HelpSettingRow } from '@yukthix/ui/console';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { loadState, todayIst, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

interface Overview {
  articles: HelpRow[];
  gaps: { query: string; companies: number; times: number }[];
  settings: HelpSettingRow[];
}

// Console › Help centre (C-8, YX-11, answer 1057): the help articles every company sees in Help › This page. One staff
// member writes, a different one publishes.
export default function ConsoleHelpCentrePage() {
  const router = useRouter();
  const can = useConsoleKeys();
  const data = useConsole<Overview>('/help-centre');
  const write = useConsoleWrite();
  const { accessToken } = useAuth();
  const loadArticle = useCallback((id: string) => apiFetch(`/platform/help-centre/articles/${encodeURIComponent(id)}`, {}, accessToken ?? undefined) as Promise<HelpDetail>, [accessToken]);
  return (
    <HelpEditorScreen
      articles={[]}
      noResults={[]}
      today={new Date(`${todayIst()}T00:00:00`)}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        articles: data.data?.articles ?? [],
        gaps: data.data?.gaps ?? [],
        settings: data.data?.settings ?? [],
        loadArticle,
        onCreate: (input) => write<HelpDetail>('/help-centre/articles', 'POST', input),
        onSave: (id, input) => write<HelpDetail>(`/help-centre/articles/${encodeURIComponent(id)}`, 'PATCH', input),
        onSubmit: (id, version) => write<HelpDetail>(`/help-centre/articles/${encodeURIComponent(id)}/submit`, 'POST', { version }),
        onReview: (id, version, approve, note) => write<HelpDetail>(`/help-centre/articles/${encodeURIComponent(id)}/review`, 'POST', { version, approve, ...(note ? { note } : {}) }),
        // Answer 1261: the rules change only in Console › Platform settings.
        onOpenPlatformSettings: can('platform.settings.manage') ? () => router.push('/staff/platform-settings') : undefined,
        // Answer 1203: retire a published article; another staff member approves.
        onRetire: (id, reason) => write<HelpDetail>(`/help-centre/articles/${encodeURIComponent(id)}/retire`, 'POST', { reason }),
        onApproveRetire: (id) => write<HelpDetail>(`/help-centre/articles/${encodeURIComponent(id)}/retire/approve`, 'POST', {}),
        // Answer 1263: the person who asked withdraws while it waits.
        onWithdrawRetire: (id) => write<HelpDetail>(`/help-centre/articles/${encodeURIComponent(id)}/retire/withdraw`, 'POST', {}),
      }}
    />
  );
}

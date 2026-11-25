'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PipelineSheet, SETTINGS_GROUPS, ScorecardTemplateSheet, SettingsPageScreen, StageMessageSheet, StageTargetsSheet, hiringSettingsChanges, hiringSettingsPage, type EditablePipeline, type HiringSettingsData, type MessageChannel, type StageMessageView } from '@yukthix/ui/hiring';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../../../lib/api-client';
import { useExams } from '../../../../../lib/hooks/useExams';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useApi, useApiWrite, useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { useAuth } from '../../../../../lib/auth-context';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.1')!;

// Settings › Hiring & Assessments › Hiring (6.1): the designed settings page with `live`. Recruiting, hiring admins and
// HR read it; the hiring settings key (or HR's settings key) for the whole company changes it, never while acting for
// someone else (the API checks both). Each change is a company setting, audited with before and after. A pipeline's
// stage targets (answer 302) and the scorecard templates (answer 345, saved at once through their own API) are changed
// with the pipelines key. The stage message templates (answer 2434: email, SMS, WhatsApp) are read and changed with the
// pipeline key the recruiters' send screens use, through the three template APIs.
const MESSAGE_API: Record<MessageChannel, string> = { email: '/candidate-email-templates', sms: '/candidate-sms-templates', whatsapp: '/candidate-whatsapp-templates' };
type Raw = Omit<StageMessageView, 'channel'>;
export default function YxHiringSettingsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const configure = perms.has('pipelines:configure') && !acting;
  const data = useHiring<HiringSettingsData>('/settings');
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const [targets, setTargets] = useState<number | null>(null);
  const [scorecard, setScorecard] = useState<number | 'new' | null>(null);
  // Answer 2631: the pipeline editor (replaces /v2 Settings › Pipelines), for the pipelines key.
  const [editPipeline, setEditPipeline] = useState<number | 'new' | null>(null);
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const pipelines = useQuery<EditablePipeline[]>({ queryKey: ['api', 'pipelines'], queryFn: () => apiFetch('/pipelines', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && configure && editPipeline !== null });
  const tests = useExams('published', { pageSize: 100 }, configure && editPipeline !== null);
  const pipeWrite = async (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) => {
    await apiWrite(method, path, body);
    await Promise.all([data.refetch(), queryClient.invalidateQueries({ queryKey: ['api', 'pipelines'] })]);
  };
  const competencies = useHiring<{ id: string; name: string }[]>('/scorecard-competencies', configure && scorecard !== null);
  const [message, setMessage] = useState<number | 'new' | null>(null);
  const messagesKey = perms.has('pipeline:manage');
  const email = useApi<Raw[]>(messagesKey ? MESSAGE_API.email : null);
  const sms = useApi<Raw[]>(messagesKey ? MESSAGE_API.sms : null);
  const whatsapp = useApi<Raw[]>(messagesKey ? MESSAGE_API.whatsapp : null);
  const messages = useMemo<StageMessageView[] | undefined>(
    () => (email.data && sms.data && whatsapp.data ? [...email.data.map((t) => ({ ...t, channel: 'email' as const })), ...sms.data.map((t) => ({ ...t, channel: 'sms' as const })), ...whatsapp.data.map((t) => ({ ...t, channel: 'whatsapp' as const }))] : undefined),
    [email.data, sms.data, whatsapp.data],
  );
  const state = loadState(data);
  const page = useMemo(() => (data.data ? hiringSettingsPage(design, { ...data.data, messages }) : design), [data.data, messages]);
  const editMessages = messagesKey && !acting;
  const msg = typeof message === 'number' ? (messages?.[message] ?? null) : null;
  const stageChoices = (data.data?.pipelines ?? []).flatMap((p, _, all) => p.stages.map((st) => ({ value: st.id, label: all.length > 1 ? `${p.name} › ${st.name}` : st.name })));
  const pipeline = targets != null ? data.data?.pipelines[targets] : undefined;
  const template = typeof scorecard === 'number' ? (data.data?.scorecards[scorecard] ?? null) : null;
  return (
    <>
      <SettingsPageScreen
        groups={SETTINGS_GROUPS}
        pageId="6.1"
        live={{
          page,
          canEdit: Boolean(data.data?.canEdit) && !acting,
          lastChange: data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
          state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'no-access' ? 'no-access' : 'error',
          onRetry: () => void data.refetch(),
          savedTitle: 'Hiring settings saved',
          onSave: async (values, rows) => {
            const changes = hiringSettingsChanges(values, rows, data.data!);
            if (changes.length) await write('PUT', '/settings', { changes });
          },
          onRowAction: (key, i) => key === 'hire.pipelines' && setTargets(i),
          listEditors: configure || (messages && editMessages) ? { ...(configure ? { 'hire.scorecards': setScorecard, 'hire.pipelines': setEditPipeline } : {}), ...(messages && editMessages ? { 'hire.stage_messages': setMessage } : {}) } : undefined,
          onOpenScreen: (screenId) => screenId === 'HIR-05' && router.push('/yx/hiring/retention'),
        }}
      />
      {pipeline && (
        <StageTargetsSheet
          key={pipeline.id}
          open
          onOpenChange={(o) => !o && setTargets(null)}
          pipelineName={pipeline.name}
          stages={pipeline.stages}
          canEdit={configure}
          onSave={async (changes) => {
            for (const c of changes) await apiWrite('PATCH', `/pipelines/stages/${encodeURIComponent(c.stageId)}`, { daysTarget: c.daysTarget, limit: c.limit });
            await data.refetch();
          }}
        />
      )}
      {editPipeline !== null && (editPipeline === 'new' || pipelines.data) && (
        <PipelineSheet
          key={editPipeline === 'new' ? 'new' : String(editPipeline)}
          open
          onOpenChange={(o) => !o && setEditPipeline(null)}
          pipeline={editPipeline === 'new' ? null : (pipelines.data?.find((x) => x.id === data.data?.pipelines[editPipeline]?.id) ?? null)}
          tests={(tests.data?.data ?? []).map((e) => ({ value: e.id, label: e.title }))}
          canEdit={configure}
          onCreate={(name) => pipeWrite('POST', '/pipelines', { name })}
          onDeletePipeline={(id) => pipeWrite('DELETE', `/pipelines/${encodeURIComponent(id)}`)}
          onAddStage={(id, name, category, position) => pipeWrite('POST', `/pipelines/${encodeURIComponent(id)}/stages`, { name, category, position })}
          onMoveStage={(stageId, position) => pipeWrite('PATCH', `/pipelines/stages/${encodeURIComponent(stageId)}`, { position })}
          onRemoveStage={(stageId) => pipeWrite('DELETE', `/pipelines/stages/${encodeURIComponent(stageId)}`)}
          onSaveStage={async (stageId, st) => {
            await apiWrite('PATCH', `/pipelines/stages/${encodeURIComponent(stageId)}`, { name: st.name, category: st.category, rules: st.rules });
            for (const r of st.statuses.rename) await apiWrite('PATCH', `/pipelines/statuses/${encodeURIComponent(r.id)}`, { name: r.name });
            for (const id of st.statuses.remove) await apiWrite('DELETE', `/pipelines/statuses/${encodeURIComponent(id)}`);
            let pos = 1000;
            for (const name of st.statuses.add) await apiWrite('POST', `/pipelines/stages/${encodeURIComponent(stageId)}/statuses`, { name, position: pos++ });
            await Promise.all([data.refetch(), queryClient.invalidateQueries({ queryKey: ['api', 'pipelines'] })]);
          }}
        />
      )}
      {scorecard !== null && (
        <ScorecardTemplateSheet
          key={template?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && setScorecard(null)}
          template={template}
          competencies={(competencies.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          canEdit={configure}
          onSave={(id, input) => (id ? write('PUT', `/scorecard-templates/${encodeURIComponent(id)}`, input) : write('POST', '/scorecard-templates', input))}
          onArchive={(id) => write('DELETE', `/scorecard-templates/${encodeURIComponent(id)}`)}
        />
      )}
      {message !== null && (
        <StageMessageSheet
          key={msg ? `${msg.channel}-${msg.id ?? msg.name}` : 'new'}
          open
          onOpenChange={(o) => !o && setMessage(null)}
          template={msg}
          stages={stageChoices}
          canEdit={editMessages}
          onSave={(channel, id, input) => (id ? apiWrite('PATCH', `${MESSAGE_API[channel]}/${encodeURIComponent(id)}`, input) : apiWrite('POST', MESSAGE_API[channel], input))}
          onDelete={(channel, id) => apiWrite('DELETE', `${MESSAGE_API[channel]}/${encodeURIComponent(id)}`)}
        />
      )}
    </>
  );
}

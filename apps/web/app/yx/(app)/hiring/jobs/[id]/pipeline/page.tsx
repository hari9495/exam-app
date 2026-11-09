'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ApplicationPanel, JobWorkspaceScreen, type ApplicationView, type BoardRowView, type BoardStageView, type CandidateProfileView, type EmailTemplateChoice, type ScorecardSummary } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../../lib/yx-org';
import { apiFetch, apiFetchBlob } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useApi, useApiWrite, useHiring } from '../../../../../../lib/yx-hiring';
import { templateChoices } from '../../../../../../lib/yx-candidates';
import { saveBlob } from '../../../../../../lib/yx-pay';
import { collectChecklistItems } from '../../../../../../lib/blueprintChecklist';
import { useJob } from '../../../../../../lib/hooks/usePipeline';
import { useExams } from '../../../../../../lib/hooks/useExams';
import { useJobBoards } from '../../../../../../lib/hooks/useJobBoards';
import { useCandidates } from '../../../../../../lib/hooks/useCandidates';
import { useMessageTemplates } from '../../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../../lib/hooks/useOrgSenderAddresses';
import { useTeammates } from '../../../../../../lib/hooks/useUserDirectory';
import type { BoardEntryRow, CandidateEmail, CandidateSms, CandidateWhatsappMessage, FeedbackRow, Interview, Offer, OfferTemplate, PipelineStageConfig, SurveyDefinition } from '../../../../../../lib/types';

type Row = BoardEntryRow & { stageEnteredAt: string; scorecards: (ScorecardSummary & { interviewId: string }) | null; nextInterviewAt: string | null; rejectionPendingUntil: string | null };
type Board = { pipeline: { id: string; name: string; stages: PipelineStageConfig[] }; columns: Record<string, Row[]> };
type Choice = { value: string; label: string };

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
const test = (r: BoardEntryRow) => r.examResults.map((e) => `${e.examTitle}${e.score != null ? ` ${e.score}%` : ''}${e.passFail ? ` · ${e.passFail === 'pass' ? 'passed' : 'not passed'}` : ''}`).join(', ') || null;

// Hiring › Jobs › one job (M10 batch AT5): the YukthiX job workspace on the existing hiring API. Replaces /v2/jobs/:id,
// which now redirects here.
export default function YxHiringJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const canManage = perms.has('pipeline:manage');
  const job = useJob(id);
  const board = useHiring<Board>(`/jobs/${id}/board`);
  const settings = useHiring<{ scorecardTemplateId: string | null; exams: { examId: string; title: string; sendOnStageId: string | null }[] }>(`/jobs/${id}/interview-settings`);
  const scorecards = useHiring<{ id: string; name: string }[]>(canManage ? '/scorecard-templates' : null);
  const exams = useExams(undefined, { pageSize: 100 });
  const boards = useJobBoards();
  const [q, setQ] = useState('');
  const candidates = useCandidates({ search: q.trim() || undefined, pageSize: 20 });
  const templates = useMessageTemplates();
  const senders = useOrgSenderAddresses();
  const write = useApiWrite();
  // ?entry= opens one application straight away (links from the recruiter Home).
  const [open, setOpen] = useState<string | null>(useSearchParams().get('entry'));

  const stages: BoardStageView[] = (board.data?.pipeline.stages ?? []).map((s) => ({ id: s.id, name: s.name, category: s.category, statuses: s.statuses.map((x) => ({ id: x.id, name: x.name })) }));
  const statusName = (statusId: string) => stages.flatMap((s) => s.statuses.map((x) => ({ ...x, stage: s.name }))).find((x) => x.id === statusId);
  const raw = Object.values(board.data?.columns ?? {}).flat();
  const rows: BoardRowView[] = raw.map((r) => ({
    entryId: r.entryId, candidateId: r.candidateId, name: r.candidateName, email: r.candidateEmail, stageId: r.stageId, statusId: r.statusId,
    statusName: statusName(r.statusId)?.stage ?? '', category: r.category, daysInStage: days(r.stageEnteredAt), testSummary: test(r), scorecards: r.scorecards,
    nextInterviewAt: r.nextInterviewAt, rejectionPendingUntil: r.rejectionPendingUntil, assignee: r.assigneeName ?? r.assignedGroupName, fitScore: r.fitScore, internal: r.enteredVia === 'internal',
  }));
  const j = job.data;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const tpl = templateChoices(templates.data);
  const sendersChoices = (senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` }));
  const bulk = (body: unknown) => write<{ succeeded: number; skipped: unknown[] }>('POST', '/hiring/entries/bulk', body);
  const selectedRow = raw.find((r) => r.entryId === open) ?? null;

  return (
    <>
      <JobWorkspaceScreen
        state={loadState(job, board)}
        onRetry={() => void Promise.all([job.refetch(), board.refetch()])}
        job={j ? {
          id: j.id, title: j.title, status: j.status, description: j.description,
          summary: [j.department, j.headcount ? `${j.headcount} opening${j.headcount === 1 ? '' : 's'}` : null, j.salaryMin ? `${j.salaryCurrency ?? ''} ${j.salaryMin.toLocaleString('en-IN')}${j.salaryMax ? `–${j.salaryMax.toLocaleString('en-IN')}` : ''}` : null].filter(Boolean).join(' · '),
          publicApplyEnabled: j.publicApplyEnabled, listOnCareers: j.listOnCareers, applyUrl: j.applyToken ? `${origin}/apply/${j.applyToken}` : null,
          fitCriteria: j.fitCriteria ?? null, fitRubric: j.fitRubric ? (JSON.parse(j.fitRubric) as { label: string; weight: number }[]) : [],
          customFields: j.customFields.filter((f) => f.value != null).map((f) => ({ label: f.label, value: String(f.value) })), boardIds: j.jobBoardIds ?? [],
        } : null}
        canManage={canManage}
        stages={stages}
        rows={rows}
        settings={settings.data ?? null}
        exams={(exams.data?.data ?? []).map((e) => ({ value: e.id, label: e.title }))}
        scorecardTemplates={(scorecards.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
        jobBoards={(boards.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
        candidateChoices={(candidates.data?.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.email ?? ''}` }))}
        onCandidateSearch={setQ}
        templates={tpl}
        senders={sendersChoices}
        onBack={() => router.push('/yx/hiring/jobs')}
        onOpenEntry={setOpen}
        onMove={(entryId, statusId) => write('POST', `/hiring/entries/${entryId}/move`, { statusId })}
        onReject={async (ids, input) => {
          const body = { reason: input.reason, delayHours: input.delayHours, ...(input.message ? { message: input.message } : {}) };
          if (ids.length === 1) await write('POST', `/hiring/entries/${ids[0]}/reject`, body);
          else await bulk({ entryIds: ids, action: 'reject', ...body });
        }}
        onUndo={(entryId) => write('POST', `/hiring/entries/${entryId}/reject/undo`)}
        onBulkMove={(ids, statusId) => bulk({ entryIds: ids, action: 'move', statusId })}
        onBulkTest={(ids, examId) => bulk({ entryIds: ids, action: 'assessment', examId })}
        onBulkEmail={(ids, c) => write('POST', '/bulk-candidate-email/by-entries', { ...c, entryIds: ids })}
        onAdd={(input) => write('POST', `/jobs/${id}/entries`, input)}
        onExport={async () => {
          const { blob, filename } = await apiFetchBlob(`/jobs/${id}/candidates.csv`, {}, accessToken ?? undefined);
          saveBlob(blob, filename ?? 'candidates.csv');
        }}
        onLinkExam={(examId) => write('POST', `/jobs/${id}/exams`, { examId })}
        onUnlinkExam={(examId) => write('DELETE', `/jobs/${id}/exams/${examId}`)}
        onSendOn={(examId, stageId) => write('PUT', `/hiring/jobs/${id}/exams/${examId}/send-on`, { stageId })}
        onScorecard={(templateId) => write('PUT', `/hiring/jobs/${id}/scorecard`, { templateId })}
        onUpdateJob={(patch) => write('PATCH', `/jobs/${id}`, patch)}
        onScreenAll={canManage ? () => write<{ queued: number }>('POST', `/jobs/${id}/fit-assessments/score`) : undefined}
        onCopy={(text) => navigator.clipboard.writeText(text)}
      />
      {selectedRow && (
        <Application
          key={selectedRow.entryId}
          row={selectedRow}
          jobId={id}
          stages={board.data?.pipeline.stages ?? []}
          canManage={canManage}
          templates={tpl}
          senders={sendersChoices}
          scorecardTemplates={(scorecards.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          defaultScorecardId={settings.data?.scorecardTemplateId ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function Application(p: { row: Row; jobId: string; stages: PipelineStageConfig[]; canManage: boolean; templates: EmailTemplateChoice[]; senders: Choice[]; scorecardTemplates: Choice[]; defaultScorecardId: string | null; onClose: () => void }) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const write = useApiWrite();
  const r = p.row;
  const cid = r.candidateId;
  const profile = useHiring<CandidateProfileView>(`/candidates/${cid}`);
  const fit = useApi<{ status: string; overallScore: number | null; summary: string | null } | null>(`/pipeline/entries/${r.entryId}/fit-assessment`);
  const interviews = useApi<(Interview & { meetingUrl?: string | null; pipelineEntryId?: string })[]>(p.canManage ? `/candidates/${cid}/interviews` : null);
  const emails = useApi<(CandidateEmail & { pipelineEntryId?: string | null })[]>(`/candidates/${cid}/messages`);
  const sms = useApi<CandidateSms[]>(p.canManage ? `/candidate-sms/${cid}` : null);
  const wa = useApi<CandidateWhatsappMessage[]>(p.canManage ? `/candidate-whatsapp/${cid}` : null);
  const notes = useApi<FeedbackRow[]>(`/entries/${r.entryId}/feedback`);
  const offers = useApi<(Offer & { pipelineEntryId?: string })[]>(p.canManage ? `/candidates/${cid}/offers` : null);
  const offerTemplates = useApi<OfferTemplate[]>(p.canManage ? '/offer-template' : null);
  const smsTemplates = useApi<{ id: string | null; name: string; body: string; enabled: boolean }[]>(p.canManage ? '/candidate-sms-templates' : null);
  const waTemplates = useApi<{ id: string | null; name: string; body: string; enabled: boolean }[]>(p.canManage ? '/candidate-whatsapp-templates' : null);
  const surveys = useApi<SurveyDefinition[]>(p.canManage ? '/surveys' : null);
  const gate = useApi<{ requisition: boolean; offer: boolean }>('/approvals/gate-status');
  // Offers waiting for this person's approval: their approval inbox (the API decides who may approve).
  const inbox = useApi<{ id: string; gate: string; subjectId: string }[]>(p.canManage ? '/approvals/requests?scope=inbox' : null);
  const toDecide = (inbox.data ?? []).filter((x) => x.gate === 'offer');
  const people = useTeammates();
  const v = profile.data;
  const stage = p.stages.find((s) => s.id === r.stageId);
  const text = (list: { id: string | null; name: string; body: string; enabled?: boolean }[] | undefined): EmailTemplateChoice[] => (list ?? []).filter((t) => t.enabled !== false).map((t, i) => ({ value: t.id ?? `default-${i}`, label: t.name, subject: '', body: t.body }));
  const app: ApplicationView | null = v ? {
    entryId: r.entryId, candidateId: cid, name: r.candidateName, email: r.candidateEmail, phone: v.candidate.phone, statusId: r.statusId, stageName: stage?.name ?? '', category: r.category,
    rejectedReason: r.rejectedReason, rejectionPendingUntil: r.rejectionPendingUntil,
    resume: v.resume ? { title: v.resume.title, summary: v.resume.summary, skills: (v.resume.skills ?? '').split(',').map((s) => s.trim()).filter(Boolean), hasFile: v.resume.hasFile && v.resume.scan === 'clean', status: v.resume.parseStatus } : null,
    fit: fit.data ? { status: fit.data.status, score: fit.data.overallScore, summary: fit.data.summary, stale: r.fitStale } : null,
    tests: r.examResults.map((e) => ({ examId: e.examId, title: e.examTitle, score: e.score, passFail: e.passFail, status: e.score == null ? 'not taken yet' : 'taken' })),
    customFields: (r.customFields ?? []).filter((f) => f.value != null).map((f) => ({ label: f.label, value: String(f.value) })),
    checklist: collectChecklistItems(p.stages).map((c) => ({ id: c.id, label: c.label, done: Boolean(r.blueprintChecklist?.[c.id]) })),
    assignee: r.assignedUserId,
    interviews: (interviews.data ?? []).filter((i) => !i.pipelineEntryId || i.pipelineEntryId === r.entryId).map((i) => {
      const slot = i.slots.find((s) => s.id === i.confirmedSlotId) ?? i.slots[0];
      return { id: i.id, status: i.status, when: slot?.startsAt ?? null, panel: i.panelists.map((x) => (people.data ?? []).find((t) => t.id === x.userId)?.name ?? 'Panellist'), location: i.location, meetingUrl: i.meetingUrl ?? null, scorecards: r.scorecards?.interviewId === i.id ? r.scorecards : null };
    }),
    emails: (emails.data ?? []).map((m) => ({ id: m.id, subject: m.subject, status: m.status, at: m.createdAt })),
    sms: (sms.data ?? []).map((m) => ({ id: m.id, body: m.renderedBody, status: m.status, at: m.createdAt })),
    whatsapp: (wa.data ?? []).map((m) => ({ id: m.id, body: m.renderedBody, status: m.status, at: m.createdAt })),
    smsOptedOut: Boolean(v.candidate.smsOptedOut), whatsappOptedOut: Boolean(v.candidate.whatsappOptedOut),
    notes: (notes.data ?? []).map((n) => ({ id: n.id, author: n.authorName ?? 'Someone', note: n.note, rating: n.rating, at: n.createdAt })),
    offers: (offers.data ?? []).filter((o) => !o.pipelineEntryId || o.pipelineEntryId === r.entryId).map((o) => ({ id: o.id, status: o.status, compensation: o.compensation, startDate: o.startDate, expiresAt: o.expiresAt })),
  } : null;
  const call = (path: string, method: string, body?: unknown) => apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
  return (
    <ApplicationPanel
      open
      onClose={p.onClose}
      app={app}
      loading={profile.isLoading}
      canManage={p.canManage}
      statuses={p.stages.filter((s) => s.category !== 'rejected').flatMap((s) => s.statuses.map((x) => ({ value: x.id, label: s.statuses.length > 1 ? `${s.name} · ${x.name}` : s.name })))}
      people={(people.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email }))}
      scorecardTemplates={p.scorecardTemplates}
      defaultScorecardId={p.defaultScorecardId}
      templates={p.templates}
      senders={p.senders}
      smsTemplates={text(smsTemplates.data)}
      whatsappTemplates={text(waTemplates.data)}
      offerTemplates={(offerTemplates.data ?? []).map((t, i) => ({ value: t.id ?? `default-${i}`, label: t.name, subject: t.subject, body: t.body }))}
      surveys={(surveys.data ?? []).filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name }))}
      offerApproval={Boolean(gate.data?.offer)}
      onOpenProfile={() => router.push(`/yx/hiring/candidates/${encodeURIComponent(cid)}`)}
      onStatus={(statusId) => write('POST', `/hiring/entries/${r.entryId}/move`, { statusId })}
      onReject={(input) => write('POST', `/hiring/entries/${r.entryId}/reject`, { reason: input.reason, delayHours: input.delayHours, ...(input.message ? { message: input.message } : {}) })}
      onUndo={() => write('POST', `/hiring/entries/${r.entryId}/reject/undo`)}
      onAssign={(userId) => write('PATCH', `/entries/${r.entryId}/assignment`, { assigneeUserId: userId })}
      onChecklist={(itemId, done) => write('PATCH', `/entries/${r.entryId}/checklist`, { itemId, done })}
      onScoreFit={() => write('POST', `/pipeline/entries/${r.entryId}/fit-assessment/score`)}
      onResume={async () => {
        const { url } = (await call(`/candidates/${cid}/resume`, 'GET')) as { url: string };
        window.open(url, '_blank', 'noopener');
      }}
      onSchedule={(i) => write('POST', `/pipeline/entries/${r.entryId}/interviews`, {
        panelistUserIds: i.panelistUserIds, location: i.location, timeZone: i.timeZone, ...(i.note ? { recruiterNote: i.note } : {}), ...(i.scorecardTemplateId ? { scorecardTemplateId: i.scorecardTemplateId } : {}),
        ...(i.mode === 'proposed' ? { bookingMode: 'proposed', slots: i.slots } : { bookingMode: 'self_book', bookingWindowStart: i.windowStart, bookingWindowEnd: i.windowEnd, slotDurationMinutes: i.slotMinutes }),
      })}
      onOpenInterview={(ivId) => router.push(`/yx/hiring/interviews/${encodeURIComponent(ivId)}`)}
      onCancelInterview={(ivId) => write('POST', `/interviews/${ivId}/cancel`)}
      onResendInterview={(ivId) => write('POST', `/interviews/${ivId}/send`)}
      onEmail={(c) => write('POST', `/pipeline/entries/${r.entryId}/messages`, c)}
      onSms={(body, templateId) => write('POST', `/candidate-sms/${r.entryId}`, { body, ...(templateId ? { templateId } : {}) })}
      onWhatsapp={(body, templateId) => write('POST', `/candidate-whatsapp/${r.entryId}`, { body, ...(templateId ? { templateId } : {}) })}
      onResend={(channel, mid) => write('POST', channel === 'email' ? `/candidate-emails/${mid}/resend` : channel === 'sms' ? `/candidate-sms/${mid}/resend` : `/candidate-whatsapp/${mid}/resend`)}
      onNote={(note, rating) => write('POST', `/entries/${r.entryId}/feedback`, { ...(note ? { note } : {}), ...(rating != null ? { rating } : {}) })}
      onSurvey={(surveyId) => write('POST', `/surveys/${surveyId}/send`, { entryId: r.entryId })}
      onOffer={async (o) => {
        const created = await write<{ id: string }>('POST', `/pipeline/entries/${r.entryId}/offers`, { compensation: o.compensation, startDate: o.startDate, expiresAt: o.expiresAt, ...(o.subject ? { subject: o.subject } : {}), ...(o.body ? { body: o.body } : {}), ...(o.templateId && !o.templateId.startsWith('default-') ? { templateId: o.templateId } : {}) });
        if (o.then === 'send') await write('POST', `/offers/${created.id}/send`);
        if (o.then === 'approval') await write('POST', `/offers/${created.id}/submit`);
      }}
      onOfferAction={async (offerId, action) => {
        if (action === 'pdf') {
          const { blob } = await apiFetchBlob(`/offers/${offerId}/pdf`, {}, accessToken ?? undefined);
          window.open(URL.createObjectURL(blob), '_blank', 'noopener');
          return;
        }
        await write('POST', action === 'send' ? `/offers/${offerId}/send` : action === 'approval' ? `/offers/${offerId}/submit` : action === 'withdraw' ? `/offers/${offerId}/withdraw` : `/offers/${offerId}/approval/cancel`);
      }}
      offersToDecide={toDecide.map((x) => x.subjectId)}
      onOfferDecide={async (offerId, decision, note) => {
        const req = toDecide.find((x) => x.subjectId === offerId);
        if (req) await write('POST', `/approvals/requests/${encodeURIComponent(req.id)}/decide`, { decision, ...(note ? { note } : {}) });
      }}
    />
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useYxPermissions } from './yx-org';
import { templateChoices } from './yx-candidates';
import { useMessageTemplates } from './hooks/useCandidateMessages';
import { useOrgSenderAddresses } from './hooks/useOrgSenderAddresses';
import type { ApplicationDrawerProps, ApplicationView, CandidateProfileView, EmailTemplateChoice, ScorecardSummary } from '@yukthix/ui/hiring';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { useApi, useApiWrite, useHiring } from './yx-hiring';
import { collectChecklistItems } from './blueprintChecklist';
import { useTeammates } from './hooks/useUserDirectory';
import type { BoardEntryRow, CandidateEmail, CandidateSms, CandidateWhatsappMessage, FeedbackRow, Interview, Offer, PipelineStageConfig, SurveyDefinition } from './types';

// One application, for the designed HIR-05 ApplicationDrawer on the candidate record (founder answer 261: a card on the
// HIR-04 board opens the record with ?entry=). Interviews, offers (listed; HIR-09 pages make and work them), messages, notes, the checklist and the
// owner, on the same API the old panel used. Returns null until the application's board row is loaded.

export type Row = BoardEntryRow & { stageEnteredAt: string; scorecards: (ScorecardSummary & { interviewId: string }) | null; nextInterviewAt: string | null; rejectionPendingUntil: string | null };
export type Board = { pipeline: { id: string; name: string; stages: PipelineStageConfig[] }; columns: Record<string, Row[]> };

export function useApplicationDrawer(entryId: string | null, jobId: string | null, onClose: () => void): Omit<ApplicationDrawerProps, 'open'> | null {
  const router = useRouter();
  const { accessToken } = useAuth();
  const perms = useYxPermissions();
  const write = useApiWrite();
  const on = Boolean(entryId && jobId);
  const board = useHiring<Board>(on ? `/jobs/${encodeURIComponent(jobId!)}/board` : null);
  const settings = useHiring<{ scorecardTemplateId: string | null }>(on ? `/jobs/${encodeURIComponent(jobId!)}/interview-settings` : null);
  const canManage = perms.has('pipeline:manage');
  const scorecards = useHiring<{ id: string; name: string }[]>(on && canManage ? '/scorecard-templates' : null);
  const messageTemplates = useMessageTemplates();
  const senderAddresses = useOrgSenderAddresses();
  const found = Object.values(board.data?.columns ?? {}).flat().find((x) => x.entryId === entryId);
  // Hooks below always run (rules of hooks); with no row they ask for nothing useful and the result is null.
  const r = found ?? ({ entryId: entryId ?? '', candidateId: '', stageId: '', statusId: '', category: 'active', candidateName: '', candidateEmail: '', examResults: [], scorecards: null } as unknown as Row);
  const p = {
    stages: board.data?.pipeline.stages ?? [],
    canManage: on && canManage,
    templates: templateChoices(messageTemplates.data),
    senders: (senderAddresses.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` })),
    scorecardTemplates: (scorecards.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    defaultScorecardId: settings.data?.scorecardTemplateId ?? null,
    onClose,
  };
  const cid = found ? r.candidateId : '';
  const profile = useHiring<CandidateProfileView>(cid ? `/candidates/${cid}` : null);
  const fit = useApi<{ status: string; overallScore: number | null; summary: string | null } | null>(cid ? `/pipeline/entries/${r.entryId}/fit-assessment` : null);
  const interviews = useApi<(Interview & { meetingUrl?: string | null; pipelineEntryId?: string })[]>(cid && p.canManage ? `/candidates/${cid}/interviews` : null);
  const emails = useApi<(CandidateEmail & { pipelineEntryId?: string | null })[]>(cid ? `/candidates/${cid}/messages` : null);
  const sms = useApi<CandidateSms[]>(cid && p.canManage ? `/candidate-sms/${cid}` : null);
  const wa = useApi<CandidateWhatsappMessage[]>(cid && p.canManage ? `/candidate-whatsapp/${cid}` : null);
  const notes = useApi<FeedbackRow[]>(cid ? `/entries/${r.entryId}/feedback` : null);
  const offers = useApi<(Offer & { pipelineEntryId?: string })[]>(cid && p.canManage ? `/candidates/${cid}/offers` : null);
  const smsTemplates = useApi<{ id: string | null; name: string; body: string; enabled: boolean }[]>(cid && p.canManage ? '/candidate-sms-templates' : null);
  const waTemplates = useApi<{ id: string | null; name: string; body: string; enabled: boolean }[]>(cid && p.canManage ? '/candidate-whatsapp-templates' : null);
  const surveys = useApi<SurveyDefinition[]>(cid && p.canManage ? '/surveys' : null);
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
    offers: (offers.data ?? []).filter((o) => !o.pipelineEntryId || o.pipelineEntryId === r.entryId).map((o) => ({ id: o.id, status: o.status, compensation: (o.compensation as string | null) ?? null, startDate: o.startDate, expiresAt: o.expiresAt })),
  } : null;
  const call = (path: string, method: string, body?: unknown) => apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
  if (!found) return null;
  return {
    onClose: p.onClose,
    app: app,
    loading: profile.isLoading,
    canManage: p.canManage,
    statuses: p.stages.filter((s) => s.category !== 'rejected').flatMap((s) => s.statuses.map((x) => ({ value: x.id, label: s.statuses.length > 1 ? `${s.name} · ${x.name}` : s.name }))),
    people: (people.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email })),
    scorecardTemplates: p.scorecardTemplates,
    defaultScorecardId: p.defaultScorecardId,
    templates: p.templates,
    senders: p.senders,
    smsTemplates: text(smsTemplates.data),
    whatsappTemplates: text(waTemplates.data),
    surveys: (surveys.data ?? []).filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name })),
    onStatus: (statusId) => write('POST', `/hiring/entries/${r.entryId}/move`, { statusId }),
    onReject: (input) => write('POST', `/hiring/entries/${r.entryId}/reject`, { reason: input.reason, delayHours: input.delayHours, ...(input.message ? { message: input.message } : {}) }),
    onUndo: () => write('POST', `/hiring/entries/${r.entryId}/reject/undo`),
    onAssign: (userId) => write('PATCH', `/entries/${r.entryId}/assignment`, { assigneeUserId: userId }),
    onChecklist: (itemId, done) => write('PATCH', `/entries/${r.entryId}/checklist`, { itemId, done }),
    onScoreFit: () => write('POST', `/pipeline/entries/${r.entryId}/fit-assessment/score`),
    onResume: async () => {
        const { url } = (await call(`/candidates/${cid}/resume`, 'GET')) as { url: string };
        window.open(url, '_blank', 'noopener');
      },
    onSchedule: (i) => write('POST', `/pipeline/entries/${r.entryId}/interviews`, {
        panelistUserIds: i.panelistUserIds, location: i.location, timeZone: i.timeZone, ...(i.note ? { recruiterNote: i.note } : {}), ...(i.scorecardTemplateId ? { scorecardTemplateId: i.scorecardTemplateId } : {}),
        ...(i.mode === 'proposed' ? { bookingMode: 'proposed', slots: i.slots } : { bookingMode: 'self_book', bookingWindowStart: i.windowStart, bookingWindowEnd: i.windowEnd, slotDurationMinutes: i.slotMinutes }),
      }),
    onOpenInterview: (ivId) => router.push(`/yx/hiring/interviews/${encodeURIComponent(ivId)}`),
    onCancelInterview: (ivId) => write('POST', `/interviews/${ivId}/cancel`),
    onResendInterview: (ivId) => write('POST', `/interviews/${ivId}/send`),
    onEmail: (c) => write('POST', `/pipeline/entries/${r.entryId}/messages`, c),
    onSms: (body, templateId) => write('POST', `/candidate-sms/${r.entryId}`, { body, ...(templateId ? { templateId } : {}) }),
    onWhatsapp: (body, templateId) => write('POST', `/candidate-whatsapp/${r.entryId}`, { body, ...(templateId ? { templateId } : {}) }),
    onResend: (channel, mid) => write('POST', channel === 'email' ? `/candidate-emails/${mid}/resend` : channel === 'sms' ? `/candidate-sms/${mid}/resend` : `/candidate-whatsapp/${mid}/resend`),
    onNote: (note, rating) => write('POST', `/entries/${r.entryId}/feedback`, { ...(note ? { note } : {}), ...(rating != null ? { rating } : {}) }),
    onSurvey: (surveyId) => write('POST', `/surveys/${surveyId}/send`, { entryId: r.entryId }),
    // HIR-09: offers are made and worked on the offer builder and record pages.
    onNewOffer: () => router.push(`/yx/hiring/offers/new?entry=${encodeURIComponent(r.entryId)}`),
    onOpenOffer: (offerId) => router.push(`/yx/hiring/offers/${encodeURIComponent(offerId)}`),
  };
}

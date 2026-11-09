'use client';

import { useYxPermissions } from './yx-org';
import { templateChoices } from './yx-candidates';
import { useMessageTemplates } from './hooks/useCandidateMessages';
import { useOrgSenderAddresses } from './hooks/useOrgSenderAddresses';
import type { ApplicationDrawerProps, ApplicationView, CandidateProfileView, EmailTemplateChoice, LiveCandidateRecord, ScorecardSummary } from '@yukthix/ui/hiring';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { useApi, useApiWrite, useHiring } from './yx-hiring';
import { collectChecklistItems } from './blueprintChecklist';
import { useTeammates } from './hooks/useUserDirectory';
import type { BoardEntryRow, CandidateEmail, CandidateSms, CandidateWhatsappMessage, FeedbackRow, Offer, OfferTemplate, PipelineStageConfig, SurveyDefinition } from './types';

// One application, for the designed HIR-05 ApplicationDrawer on the candidate record (founder answer 261: a card on the
// HIR-04 board opens the record with ?entry=). Offers (until HIR-09), messages, notes, the checklist and the owner, on
// the same API the old panel used. Returns null until the application's board row is loaded. Interviews moved to the
// record's Schedule interview (useRecordPipeline below, answer 274) and the HIR-06 / HIR-07 pages (answer 301).

export type Row = BoardEntryRow & { stageEnteredAt: string; scorecards: (ScorecardSummary & { interviewId: string }) | null; nextInterviewAt: string | null; rejectionPendingUntil: string | null };
export type Board = { pipeline: { id: string; name: string; stages: PipelineStageConfig[] }; columns: Record<string, Row[]> };

export function useApplicationDrawer(entryId: string | null, jobId: string | null, onClose: () => void): Omit<ApplicationDrawerProps, 'open'> | null {
  const { accessToken } = useAuth();
  const perms = useYxPermissions();
  const write = useApiWrite();
  const on = Boolean(entryId && jobId);
  const board = useHiring<Board>(on ? `/jobs/${encodeURIComponent(jobId!)}/board` : null);
  const canManage = perms.has('pipeline:manage');
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
    onClose,
  };
  const cid = found ? r.candidateId : '';
  const profile = useHiring<CandidateProfileView>(cid ? `/candidates/${cid}` : null);
  const fit = useApi<{ status: string; overallScore: number | null; summary: string | null } | null>(cid ? `/pipeline/entries/${r.entryId}/fit-assessment` : null);
  const emails = useApi<(CandidateEmail & { pipelineEntryId?: string | null })[]>(cid ? `/candidates/${cid}/messages` : null);
  const sms = useApi<CandidateSms[]>(cid && p.canManage ? `/candidate-sms/${cid}` : null);
  const wa = useApi<CandidateWhatsappMessage[]>(cid && p.canManage ? `/candidate-whatsapp/${cid}` : null);
  const notes = useApi<FeedbackRow[]>(cid ? `/entries/${r.entryId}/feedback` : null);
  const offers = useApi<(Offer & { pipelineEntryId?: string })[]>(cid && p.canManage ? `/candidates/${cid}/offers` : null);
  const offerTemplates = useApi<OfferTemplate[]>(cid && p.canManage ? '/offer-template' : null);
  const smsTemplates = useApi<{ id: string | null; name: string; body: string; enabled: boolean }[]>(cid && p.canManage ? '/candidate-sms-templates' : null);
  const waTemplates = useApi<{ id: string | null; name: string; body: string; enabled: boolean }[]>(cid && p.canManage ? '/candidate-whatsapp-templates' : null);
  const surveys = useApi<SurveyDefinition[]>(cid && p.canManage ? '/surveys' : null);
  const gate = useApi<{ requisition: boolean; offer: boolean }>(cid ? '/approvals/gate-status' : null);
  // Offers waiting for this person's approval: their approval inbox (the API decides who may approve).
  const inbox = useApi<{ id: string; gate: string; subjectId: string }[]>(cid && p.canManage ? '/approvals/requests?scope=inbox' : null);
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
    emails: (emails.data ?? []).map((m) => ({ id: m.id, subject: m.subject, status: m.status, at: m.createdAt })),
    sms: (sms.data ?? []).map((m) => ({ id: m.id, body: m.renderedBody, status: m.status, at: m.createdAt })),
    whatsapp: (wa.data ?? []).map((m) => ({ id: m.id, body: m.renderedBody, status: m.status, at: m.createdAt })),
    smsOptedOut: Boolean(v.candidate.smsOptedOut), whatsappOptedOut: Boolean(v.candidate.whatsappOptedOut),
    notes: (notes.data ?? []).map((n) => ({ id: n.id, author: n.authorName ?? 'Someone', note: n.note, rating: n.rating, at: n.createdAt })),
    offers: (offers.data ?? []).filter((o) => !o.pipelineEntryId || o.pipelineEntryId === r.entryId).map((o) => ({ id: o.id, status: o.status, compensation: o.compensation, startDate: o.startDate, expiresAt: o.expiresAt })),
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
    templates: p.templates,
    senders: p.senders,
    smsTemplates: text(smsTemplates.data),
    whatsappTemplates: text(waTemplates.data),
    offerTemplates: (offerTemplates.data ?? []).map((t, i) => ({ value: t.id ?? `default-${i}`, label: t.name, subject: t.subject, body: t.body })),
    surveys: (surveys.data ?? []).filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name })),
    offerApproval: Boolean(gate.data?.offer),
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
    onEmail: (c) => write('POST', `/pipeline/entries/${r.entryId}/messages`, c),
    onSms: (body, templateId) => write('POST', `/candidate-sms/${r.entryId}`, { body, ...(templateId ? { templateId } : {}) }),
    onWhatsapp: (body, templateId) => write('POST', `/candidate-whatsapp/${r.entryId}`, { body, ...(templateId ? { templateId } : {}) }),
    onResend: (channel, mid) => write('POST', channel === 'email' ? `/candidate-emails/${mid}/resend` : channel === 'sms' ? `/candidate-sms/${mid}/resend` : `/candidate-whatsapp/${mid}/resend`),
    onNote: (note, rating) => write('POST', `/entries/${r.entryId}/feedback`, { ...(note ? { note } : {}), ...(rating != null ? { rating } : {}) }),
    onSurvey: (surveyId) => write('POST', `/surveys/${surveyId}/send`, { entryId: r.entryId }),
    onOffer: async (o) => {
        const created = await write<{ id: string }>('POST', `/pipeline/entries/${r.entryId}/offers`, { compensation: o.compensation, startDate: o.startDate, expiresAt: o.expiresAt, ...(o.subject ? { subject: o.subject } : {}), ...(o.body ? { body: o.body } : {}), ...(o.templateId && !o.templateId.startsWith('default-') ? { templateId: o.templateId } : {}) });
        if (o.then === 'send') await write('POST', `/offers/${created.id}/send`);
        if (o.then === 'approval') await write('POST', `/offers/${created.id}/submit`);
      },
    onOfferAction: async (offerId, action) => {
        if (action === 'pdf') {
          const { blob } = await apiFetchBlob(`/offers/${offerId}/pdf`, {}, accessToken ?? undefined);
          window.open(URL.createObjectURL(blob), '_blank', 'noopener');
          return;
        }
        await write('POST', action === 'send' ? `/offers/${offerId}/send` : action === 'approval' ? `/offers/${offerId}/submit` : action === 'withdraw' ? `/offers/${offerId}/withdraw` : `/offers/${offerId}/approval/cancel`);
      },
    offersToDecide: toDecide.map((x) => x.subjectId),
    onOfferDecide: async (offerId, decision, note) => {
        const req = toDecide.find((x) => x.subjectId === offerId);
        if (req) await write('POST', `/approvals/requests/${encodeURIComponent(req.id)}/decide`, { decision, ...(note ? { note } : {}) });
      },
  };
}

/**
 * HIR-05 record › Schedule interview and Move to next stage (founder answer 274), for the application open on the record
 * (?entry=) or else the first open one. Null without the pipeline key, while acting for someone else (the API refuses
 * too), with no open application, or until its board row is loaded.
 */
export function useRecordPipeline(view: CandidateProfileView | null, entryId: string | null): LiveCandidateRecord['pipeline'] {
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const write = useApiWrite();
  const people = useTeammates();
  const allowed = perms.has('pipeline:manage') && !impersonating && !actingSuperAdmin;
  const app = view?.applications.find((a) => a.id === entryId && !a.closed) ?? view?.applications.find((a) => !a.closed) ?? null;
  const jobId = allowed && app ? encodeURIComponent(app.jobId) : null;
  const board = useHiring<Board>(jobId ? `/jobs/${jobId}/board` : null);
  const settings = useHiring<{ scorecardTemplateId: string | null }>(jobId ? `/jobs/${jobId}/interview-settings` : null);
  const templates = useHiring<{ id: string; name: string }[]>(jobId ? '/scorecard-templates' : null);
  const row = app ? Object.values(board.data?.columns ?? {}).flat().find((x) => x.entryId === app.id) : undefined;
  if (!jobId || !app || !board.data || !row) return null;
  const stages = board.data.pipeline.stages.filter((s) => s.category !== 'rejected').sort((a, b) => a.position - b.position);
  const at = stages.findIndex((s) => s.id === row.stageId);
  const next = row.category !== 'rejected' && at >= 0 ? stages[at + 1] : undefined;
  return {
    jobTitle: app.jobTitle,
    next: next?.statuses[0] ? { name: next.name } : null,
    onMove: async () => void (await write('POST', `/hiring/entries/${app.id}/move`, { statusId: next!.statuses[0].id, fromStatusId: row.statusId })),
    schedule: {
      people: (people.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email })),
      scorecardTemplates: (templates.data ?? []).map((t) => ({ value: t.id, label: t.name })),
      defaultScorecardId: settings.data?.scorecardTemplateId ?? null,
      onSchedule: (i) =>
        write('POST', `/pipeline/entries/${app.id}/interviews`, {
          panelistUserIds: i.panelistUserIds, location: i.location, timeZone: i.timeZone, ...(i.note ? { recruiterNote: i.note } : {}), ...(i.scorecardTemplateId ? { scorecardTemplateId: i.scorecardTemplateId } : {}),
          ...(i.mode === 'proposed' ? { bookingMode: 'proposed', slots: i.slots } : { bookingMode: 'self_book', bookingWindowStart: i.windowStart, bookingWindowEnd: i.windowEnd, slotDurationMinutes: i.slotMinutes }),
        }),
    },
  };
}

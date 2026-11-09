'use client';

import { useRouter } from 'next/navigation';
import { ApplicationPanel, type ApplicationView, type CandidateProfileView, type EmailTemplateChoice, type ScorecardSummary } from '@yukthix/ui/hiring';
import { apiFetch, apiFetchBlob } from '../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../lib/auth-context';
import { useApi, useApiWrite, useHiring } from '../../../../../../../lib/yx-hiring';
import { collectChecklistItems } from '../../../../../../../lib/blueprintChecklist';
import { useTeammates } from '../../../../../../../lib/hooks/useUserDirectory';
import type { BoardEntryRow, CandidateEmail, CandidateSms, CandidateWhatsappMessage, FeedbackRow, Interview, Offer, OfferTemplate, PipelineStageConfig, SurveyDefinition } from '../../../../../../../lib/types';

// One application of a job (M10 batch AT5 stand-in): opened from a card on the HIR-04 board and from the candidates list.
// Interviews, offers, messages, notes and the checklist live here until HIR-05 / HIR-09 are wired.

export type Row = BoardEntryRow & { stageEnteredAt: string; scorecards: (ScorecardSummary & { interviewId: string }) | null; nextInterviewAt: string | null; rejectionPendingUntil: string | null };
export type Board = { pipeline: { id: string; name: string; stages: PipelineStageConfig[] }; columns: Record<string, Row[]> };
type Choice = { value: string; label: string };

export function Application(p: { row: Row; jobId: string; stages: PipelineStageConfig[]; canManage: boolean; templates: EmailTemplateChoice[]; senders: Choice[]; scorecardTemplates: Choice[]; defaultScorecardId: string | null; onClose: () => void }) {
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

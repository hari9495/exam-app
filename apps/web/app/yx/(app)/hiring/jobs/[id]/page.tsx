'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { formatDate, useToast } from '@yukthix/ui';
import { JobWorkspaceScreen, type LivePosting, type PayRangeInput } from '@yukthix/ui/frame';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../../lib/yx-org';
import { useAuth } from '../../../../../../lib/auth-context';
import { useApi, useApiWrite, useHiring } from '../../../../../../lib/yx-hiring';
import { usePipelines } from '../../../../../../lib/hooks/usePipelines';
import { useTeammates } from '../../../../../../lib/hooks/useUserDirectory';
import { stageSummary } from '../../../../../../lib/job-stage-summary';
import { careersUrl, jobRow, type ApiJob } from '../../../../../../lib/yx-jobs';

type PayLawView = { rangeRequired: boolean; historyBanned: boolean; name: string | null; place: string | null; showByDefault: boolean };
type JobView = ApiJob & { jobBoardIds: string[]; payLaw?: PayLawView; postings?: (LivePosting & { postedAt: string | null; error: string | null })[] };

const REASON: Record<string, string> = { new: 'New position', replacement: 'Replacement' };
const APPROVAL: Record<string, string> = { pending: 'waiting for approval', approved: 'approved', rejected: 'sent back', cancelled: 'withdrawn' };

// Hiring › Jobs › one job (HIR-03, HIR-24): the designed job workspace with `live` on the jobs API: overview, job-board
// postings (PATCH jobs/:id jobBoardIds), the pay range by the location's law (GET jobs/:id payLaw) and close / reopen.
// The board, applications and job settings stay on /pipeline ("Open pipeline") until HIR-04 is wired.
export default function YxHiringJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const entry = useSearchParams().get('entry');
  const { toast } = useToast();
  const { organizationSlug } = useAuth();
  const perms = useYxPermissions();
  const canManage = perms.has('pipeline:manage');
  const enc = encodeURIComponent;
  // Older links open one application: that lives on the pipeline page.
  useEffect(() => {
    if (entry) router.replace(`/yx/hiring/jobs/${enc(id)}/pipeline?entry=${enc(entry)}`);
  }, [entry, id, router, enc]);
  const job = useApi<JobView>(`/jobs/${enc(id)}`);
  const list = useApi<ApiJob[]>('/jobs');
  const pipelines = usePipelines();
  const teammates = useTeammates();
  const settings = useHiring<{ scorecardTemplateId: string | null }>(`/jobs/${enc(id)}/interview-settings`);
  const scorecards = useHiring<{ id: string; name: string }[]>(canManage ? '/scorecard-templates' : null);
  const masters = perms.has('org.structure.view') || perms.has('org.settings.manage');
  const designations = useOrg<MasterRecord[]>('/masters/designations', masters);
  const grades = useOrg<MasterRecord[]>('/masters/grades', masters);
  const write = useApiWrite();
  const j = job.data;
  const counted = (list.data ?? []).find((x) => x.id === id);
  const names = (uid: string | null) => (uid ? ((teammates.data ?? []).find((t) => t.id === uid)?.name ?? '') : '');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const url = j ? careersUrl(j, origin, organizationSlug ?? null) : null;
  const row = j ? jobRow({ ...j, stageCounts: counted?.stageCounts }, names, origin, organizationSlug ?? null) : null;
  const master = (rows: MasterRecord[] | undefined, mid: string | null | undefined) => (mid ? (rows ?? []).find((r) => r.id === mid)?.name : undefined);
  const law = j?.payLaw;
  const done = (title: string) => toast({ tone: 'success', title });
  const posted = new Set(j?.jobBoardIds ?? []);
  const boards = (next: Set<string>) => write('PATCH', `/jobs/${enc(id)}`, { jobBoardIds: [...next] });
  const pipeline = (pipelines.data ?? []).find((p) => p.id === j?.pipelineId);
  const overview = j
    ? [
        { label: 'Department', value: j.department ?? 'Not set' },
        { label: 'Designation · grade', value: [master(designations.data, j.designationId), master(grades.data, j.gradeId)].filter(Boolean).join(' · ') || 'Not set' },
        { label: 'Location', value: j.location ?? 'Not set' },
        { label: 'Employment type', value: row!.type },
        { label: 'Openings', value: String(j.headcount ?? 1) },
        { label: 'Requisition', value: [j.requisitionReason ? REASON[j.requisitionReason] : null, j.outsidePlan ? 'outside the plan' : j.headcountPlanLineId ? 'in plan' : null, j.approval ? APPROVAL[j.approval.status] ?? j.approval.status : null].filter(Boolean).join(' · ') || 'No requisition' },
        { label: 'Pipeline template', value: pipeline ? `${pipeline.name}, ${pipeline.stages.length} stages` : 'Default' },
        { label: 'Scorecard', value: (scorecards.data ?? []).find((t) => t.id === settings.data?.scorecardTemplateId)?.name ?? (settings.data?.scorecardTemplateId ? 'Set' : 'Not set') },
        { label: 'Candidates by stage', value: counted?.stageCounts ? stageSummary({ ...counted, pipelineId: counted.pipelineId ?? null, stageCounts: counted.stageCounts }, pipelines.data) : 'No candidates yet' },
        { label: 'Opened', value: `${formatDate(new Date(j.createdAt))}${names(j.createdById) ? ` by ${names(j.createdById)}` : ''}` },
      ]
    : [];
  const activity = j
    ? [
        { id: 'created', actor: { name: names(j.createdById) || 'Someone' }, action: 'opened the job', at: new Date(j.createdAt) },
        ...(j.publishedAt ? [{ id: 'published', actor: { name: j.title }, action: 'went on the careers page', at: new Date(j.publishedAt) }] : []),
        ...(j.postings ?? []).filter((p) => p.postedAt).map((p) => ({ id: `post-${p.boardId}`, actor: { name: p.board }, action: 'posting went live', at: new Date(p.postedAt!) })),
        ...(j.closedAt ? [{ id: 'closed', actor: { name: j.title }, action: 'was closed', at: new Date(j.closedAt) }] : []),
      ].sort((a, b) => b.at.getTime() - a.at.getTime())
    : [];
  return (
    <JobWorkspaceScreen
      key={j ? `${j.id}-${j.salaryMin}-${j.salaryMax}-${j.showSalary}-${j.askPayHistory}-${j.salaryPeriod}-${j.salaryCurrency}` : 'loading'}
      job={row ?? { id, code: '', title: '', department: '', location: '', type: '', recruiter: '', hiringManager: '', status: 'Draft', applicants: 0, inPipeline: 0, posted: null, slug: '', internal: false }}
      postings={[]}
      law={{ rangeRequired: Boolean(law?.rangeRequired), historyBanned: Boolean(law?.historyBanned), source: law?.name ?? undefined }}
      range={{ min: j?.salaryMin ?? null, max: j?.salaryMax ?? null }}
      activity={activity}
      now={new Date()}
      live={{
        state: loadState(job) === 'no-access' ? 'error' : (loadState(job) as 'ready' | 'loading' | 'error'),
        onRetry: () => void job.refetch(),
        canManage,
        careersUrl: url,
        overview,
        postings: (j?.postings ?? []).map((p) => ({ boardId: p.boardId, board: p.board, status: p.status as LivePosting['status'], error: p.error ?? undefined })),
        onPosting: async (p, action) => {
          const next = new Set(posted);
          if (action === 'close') next.delete(p.boardId);
          else next.add(p.boardId);
          try {
            await boards(next);
            done(action === 'close' ? `${p.board} posting closed` : action === 'refresh' ? `${p.board} posting refreshed` : `Posted to ${p.board}`);
          } catch (e) {
            toast({ tone: 'error', title: `${p.board}: that did not work`, description: (e as Error).message });
            throw e;
          }
        },
        pay: {
          currency: j?.salaryCurrency ?? 'INR',
          period: j?.salaryPeriod ?? 'year',
          show: Boolean(j?.showSalary),
          askHistory: Boolean(j?.askPayHistory),
          companyShows: Boolean(law?.showByDefault),
          published: Boolean(j?.publicApplyEnabled && j?.listOnCareers),
          canManage,
          onSave: async (x: PayRangeInput) => {
            await write('PATCH', `/jobs/${enc(id)}`, {
              salaryMin: x.min,
              salaryMax: x.max,
              salaryCurrency: x.currency,
              salaryPeriod: x.period,
              showSalary: x.show,
              askPayHistory: x.askHistory,
              ...(x.publish ? { publicApplyEnabled: true, listOnCareers: true } : {}),
            });
            done(x.publish ? `${j?.title ?? 'The job'} is published on the careers page` : 'Pay range saved');
          },
        },
        onOpenPipeline: () => router.push(`/yx/hiring/jobs/${enc(id)}/pipeline`),
        onViewCareers: () => {
          if (url) window.open(url, '_blank', 'noopener');
        },
        onStatus: async (to) => {
          try {
            await write('PATCH', `/jobs/${enc(id)}`, { status: to });
            done(to === 'closed' ? `${j?.title ?? 'The job'} closed. Its board postings close too.` : `${j?.title ?? 'The job'} reopened`);
          } catch (e) {
            toast({ tone: 'error', title: 'The job was not changed', description: (e as Error).message });
            throw e;
          }
        },
      }}
    />
  );
}

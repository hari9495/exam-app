# Requisitions & Approvals — Web/UI Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v2 web UI for the ATS approvals feature on top of the Phase-1 API: a settings page to configure approval chains, a staff manager field, requisition fields + submit/status on jobs, offer approval, an approver inbox, and approval notifications.

**Architecture:** React (Next.js 16 App Router) on the existing `components/ui-v2` kit + react-query hooks calling the Phase-1 endpoints. Two shared presentational components (`ApprovalTimeline`, `ApprovalDecisionDialog`) reused across requisition/offer/inbox. No backend changes — Phase 1 is complete.

**Tech Stack:** Next.js 16, React, TanStack Query, ui-v2 primitives (`Button`, `Dialog`, `DataTable`, `Timeline`, `IconStatCard`, `Combobox`, `Cb`, `Pill`, inline `notice`), `apiFetch`.

**Spec:** `docs/superpowers/specs/2026-09-03-requisitions-and-approvals-design.md` (§7 is this plan's scope)
**Phase-1 API plan (dependency, DONE):** `docs/superpowers/plans/2026-09-03-requisitions-and-approvals-api.md`

## Global Constraints

- **API surface is fixed (Phase 1, live on this branch)** — call it exactly:
  - `GET /organizations/approvals/chains` → `{ requisition: Chain, offer: Chain }`; `Chain = { gate, enabled, steps: { position; name; approverType: 'users'|'reporting_manager'|'hiring_manager'; approverUserIds: string[]; managerLevel: number|null }[] }`
  - `PUT /organizations/approvals/chains/:gate` body `{ enabled, steps: { name; approverType; approverUserIds?; managerLevel? }[] }`
  - `GET /approvals/requests?scope=inbox|submitted[&status=]` → `RequestSummary[]` = `{ id; gate; subjectType; subjectId; status; currentStepPosition; submittedByUserId; submittedAt; stepCount }`
  - `GET /approvals/requests/:id` → `{ …request; decisions: { stepPosition; approverUserId; decision; note?; decidedAt }[]; steps: { name; approverType; approverUserIds }[]; subject: {…} }`
  - `POST /approvals/requests/:id/decide` body `{ decision: 'approved'|'rejected'; note? }`
  - `POST /pipeline/jobs/:id/submit` · `POST /pipeline/jobs/:id/approval/cancel`
  - `POST /offers/:id/submit` · `POST /offers/:id/approval/cancel`
  - `PATCH /users/:id` accepts `managerId`
  - Job + offer read payloads now carry `approval: { status; currentStep; steps: { name; state: 'pending'|'approved'|'rejected' }[] } | null`
  - Job status values: `draft | pending_approval | open | closed`. Offer status gains `pending_approval | approved`.
- **ui-v2 only** — never import from the old `components/ui`. Use inline `notice` banners (not `useToast`), `Combobox` for selects, `Dialog` for modals. Match the established v2 settings-page / DataTable conventions.
- **Hooks pattern** — react-query: `useQuery`/`useMutation` + `apiFetch(path, { method, body }, accessToken)` from `useAuth()`; `queryClient.invalidateQueries` on success. Mirror `lib/hooks/useUsers.ts` / `useBilling.ts`.
- **Testing approach (match the v2 codebase):** unit-test logic-bearing pieces only — hooks' data shaping, the step-editor reducer, the timeline state→tone mapping, the decision dialog. Presentational page wiring is verified IN-BROWSER (the pattern every other v2 surface used), not via jest. Do NOT force jest suites onto presentational pages.
- **Next 16:** any page using `useSearchParams` needs a `<Suspense>` wrapper. New routes must be verified against a production build if routing is in doubt (Turbopack dev can miss new routes) — but these are nested pages under existing route groups, so dev is fine.
- No `npm install` in a worktree; build shared with `npm run build -w @exam-platform/shared` if types are needed. Run any jest ISOLATED.
- **Gates default disabled** — every surface must render sensibly when there's no chain / `approval: null` (show nothing approval-related, behave as today).

---

### Task 1: Approval hooks + shared types

**Files:**
- Create: `apps/web/lib/hooks/useApprovals.ts`
- Modify: `apps/web/lib/types.ts` (add approval view types), `apps/web/lib/hooks/usePipeline.ts` (requisition submit/cancel), `apps/web/lib/hooks/useOffers.ts` (offer submit/cancel), `apps/web/lib/hooks/useUsers.ts` (pass `managerId` through the existing update mutation)
- Test: `apps/web/lib/hooks/useApprovals.test.tsx`

**Interfaces:**
- Produces: types `ApprovalGate`, `ApproverType`, `ApprovalChain`, `ApprovalChainStep`, `ApprovalRequestSummary`, `ApprovalRequestDetail`, `ApprovalSummary` (the `{status,currentStep,steps[]}` on reads); hooks `useApprovalChains()`, `useUpsertApprovalChain()`, `useApprovalRequests(scope, status?)`, `useApprovalRequest(id)`, `useDecideApproval()`, `useSubmitRequisition()`, `useCancelRequisition()`, `useSubmitOffer()`, `useCancelOffer()`. `useUpdateUser` gains optional `managerId`.

- [ ] **Step 1: Write the failing test** — `useApprovals.test.tsx`

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Mock apiFetch + useAuth the same way lib/hooks/useUsers.test.tsx does (copy its wrapper/mocks).
import * as api from '../api-client';
import { useApprovalChains } from './useApprovals';

it('fetches both gate chains from /organizations/approvals/chains', async () => {
  jest.spyOn(api, 'apiFetch').mockResolvedValue({ requisition: { gate:'requisition', enabled:false, steps:[] }, offer:{ gate:'offer', enabled:false, steps:[] } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useApprovalChains(), { wrapper });
  await waitFor(() => expect(result.current.data?.requisition.gate).toBe('requisition'));
  expect(api.apiFetch).toHaveBeenCalledWith('/organizations/approvals/chains', {}, expect.anything());
});
```
(Open `lib/hooks/useUsers.test.tsx` first and reuse its exact QueryClient wrapper + `apiFetch`/`useAuth` mocking setup.)

- [ ] **Step 2: Run to verify it fails** — `npx jest lib/hooks/useApprovals.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement the hooks + types**

Add to `lib/types.ts`:
```ts
export type ApprovalGate = 'requisition' | 'offer';
export type ApproverType = 'users' | 'reporting_manager' | 'hiring_manager';
export interface ApprovalChainStep { position: number; name: string; approverType: ApproverType; approverUserIds: string[]; managerLevel: number | null; }
export interface ApprovalChain { gate: ApprovalGate; enabled: boolean; steps: ApprovalChainStep[]; }
export interface ApprovalStepView { name: string; state: 'pending' | 'approved' | 'rejected'; }
export interface ApprovalSummary { status: string; currentStep: number; steps: ApprovalStepView[]; }
export interface ApprovalRequestSummary { id: string; gate: ApprovalGate; subjectType: 'job'|'offer'; subjectId: string; status: string; currentStepPosition: number; submittedByUserId: string; submittedAt: string; stepCount: number; }
export interface ApprovalDecisionView { stepPosition: number; approverUserId: string; decision: 'approved'|'rejected'; note?: string; decidedAt: string; }
export interface ApprovalRequestDetail extends ApprovalRequestSummary { decisions: ApprovalDecisionView[]; steps: { name: string; approverType: ApproverType; approverUserIds: string[] }[]; subject: Record<string, unknown>; }
```

`lib/hooks/useApprovals.ts` (mirror `useUsers.ts` structure):
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { ApprovalChain, ApprovalGate, ApprovalRequestSummary, ApprovalRequestDetail } from '../types';

export function useApprovalChains() {
  const { accessToken } = useAuth();
  return useQuery<{ requisition: ApprovalChain; offer: ApprovalChain }>({
    queryKey: ['approvals', 'chains'],
    queryFn: () => apiFetch('/organizations/approvals/chains', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpsertApprovalChain() {
  const { accessToken } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { gate: ApprovalGate; enabled: boolean; steps: { name: string; approverType: string; approverUserIds?: string[]; managerLevel?: number }[] }) =>
      apiFetch(`/organizations/approvals/chains/${input.gate}`, { method: 'PUT', body: JSON.stringify({ enabled: input.enabled, steps: input.steps }) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals', 'chains'] }),
  });
}

export function useApprovalRequests(scope: 'inbox' | 'submitted', status?: string) {
  const { accessToken } = useAuth();
  return useQuery<ApprovalRequestSummary[]>({
    queryKey: ['approvals', 'requests', scope, status ?? ''],
    queryFn: () => apiFetch(`/approvals/requests?scope=${scope}${status ? `&status=${status}` : ''}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useApprovalRequest(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<ApprovalRequestDetail>({
    queryKey: ['approvals', 'request', id],
    queryFn: () => apiFetch(`/approvals/requests/${id}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && id),
  });
}

export function useDecideApproval() {
  const { accessToken } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      apiFetch(`/approvals/requests/${input.id}/decide`, { method: 'POST', body: JSON.stringify({ decision: input.decision, note: input.note }) }, accessToken ?? undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approvals'] }); qc.invalidateQueries({ queryKey: ['pipeline'] }); qc.invalidateQueries({ queryKey: ['offers'] }); },
  });
}
```
Add to `usePipeline.ts`: `useSubmitRequisition()` (`POST /pipeline/jobs/:id/submit`) + `useCancelRequisition()` (`POST /pipeline/jobs/:id/approval/cancel`), both invalidating `['pipeline']` + `['approvals']`. Add to `useOffers.ts`: `useSubmitOffer()` (`POST /offers/:id/submit`) + `useCancelOffer()` (`POST /offers/:id/approval/cancel`), invalidating `['offers']` + `['approvals']`. In `useUsers.ts`, extend the update mutation's input + body to include optional `managerId`.

- [ ] **Step 4: Run test** — `npx jest lib/hooks/useApprovals.test.tsx` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(approvals-web): react-query hooks + view types"`

---

### Task 2: `ApprovalTimeline` + `ApprovalDecisionDialog` shared components

**Files:**
- Create: `apps/web/components/ui-v2/ApprovalTimeline.tsx`, `apps/web/components/ui-v2/ApprovalDecisionDialog.tsx`
- Modify: `apps/web/components/ui-v2/index.ts` (export both)
- Test: `apps/web/components/ui-v2/ApprovalTimeline.test.tsx`

**Interfaces:**
- Consumes: `ApprovalStepView` / `ApprovalSummary` (Task 1); `Timeline`/`TimelineRow`, `Dialog`, `Button`, `viz` STATUS from ui-v2.
- Produces: `<ApprovalTimeline steps={ApprovalStepView[]} currentStep={number} />` (renders one row per step, tone dot from state) and `<ApprovalDecisionDialog open onClose onDecide={(decision,note)=>void} pending />`.

- [ ] **Step 1: Write the failing test** — render `ApprovalTimeline` with steps `[{name:'HM',state:'approved'},{name:'Finance',state:'pending'}]`, assert both names render and the state→tone mapping is applied (assert the approved row carries the ok tone color and pending the muted tone — query by the style/testid you set).

```tsx
import { render, screen } from '@testing-library/react';
import { ApprovalTimeline } from './ApprovalTimeline';
it('renders a row per step with state tones', () => {
  render(<ApprovalTimeline steps={[{name:'HM',state:'approved'},{name:'Finance',state:'pending'}]} currentStep={1} />);
  expect(screen.getByText('HM')).toBeInTheDocument();
  expect(screen.getByText('Finance')).toBeInTheDocument();
  expect(screen.getByTestId('approval-step-0')).toHaveAttribute('data-state', 'approved');
  expect(screen.getByTestId('approval-step-1')).toHaveAttribute('data-state', 'pending');
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest components/ui-v2/ApprovalTimeline.test.tsx` → FAIL.

- [ ] **Step 3: Implement both components**

`ApprovalTimeline.tsx`: map each step to a `TimelineRow`; tone from a local `stateTone = { approved: STATUS.ok, rejected: STATUS.bad, pending: 'var(--muted)' }`; mark the `currentStep` row (e.g. bold name / "Current" pill). Put `data-testid={`approval-step-${i}`}` and `data-state={step.state}` on each row. Keep it purely presentational.
`ApprovalDecisionDialog.tsx`: a `Dialog` with a note `textarea` + two buttons — "Approve" (primary) and "Reject" (danger); calls `onDecide('approved'|'rejected', note)`; disables buttons while `pending`. Inline `notice` for an error prop if supplied.
Export both from `components/ui-v2/index.ts`.

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(approvals-web): ApprovalTimeline + ApprovalDecisionDialog primitives"`

---

### Task 3: Settings → Approvals page + chain step editor

**Files:**
- Create: `apps/web/app/v2/(org-admin)/settings/approvals/page.tsx`, `apps/web/app/v2/(org-admin)/settings/approvals/ChainEditor.tsx`
- Modify: `apps/web/app/v2/(org-admin)/layout.tsx` (add nav item, gated to `approvals:configure`)
- Test: `apps/web/app/v2/(org-admin)/settings/approvals/chain-reducer.test.ts` (the step-editor reducer)

**Interfaces:**
- Consumes: `useApprovalChains`, `useUpsertApprovalChain` (Task 1); `useTeammates` (`lib/hooks/useUserDirectory` — existing) for the approver picker; ui-v2 `Combobox`, `Button`, `Cb`, `TextField`, inline `notice`.
- Produces: the page + a `ChainEditor` component and a pure `chainReducer` (add/remove/reorder/edit step) exported for the test.

- [ ] **Step 1: Write the failing test** — the pure reducer:

```ts
import { chainReducer, type EditorStep } from './ChainEditor';
const s0: EditorStep[] = [{ name:'A', approverType:'users', approverUserIds:['u1'], managerLevel:null }];
it('adds, reorders, and normalizes positions', () => {
  const added = chainReducer(s0, { type:'add' });
  expect(added).toHaveLength(2);
  const moved = chainReducer([{...s0[0],name:'A'},{...s0[0],name:'B'}], { type:'move', from:1, to:0 });
  expect(moved.map(s=>s.name)).toEqual(['B','A']);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest settings/approvals/chain-reducer.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`ChainEditor.tsx`: export `type EditorStep = { name; approverType; approverUserIds; managerLevel }` and a pure `chainReducer(steps, action)` handling `{type:'add'}`, `{type:'remove',index}`, `{type:'move',from,to}`, `{type:'edit',index,patch}`. The component renders the step list: each row has a name `TextField`, an approver-type `Combobox` (Users / Reporting manager / Hiring manager), and conditionally a Users multi-select (`Combobox` off `useTeammates`) or a manager-level `Combobox` (Direct / Skip-level / a number). Up/down buttons dispatch `move`; a remove button; an "Add step" button.
`page.tsx`: eyebrow + title + description header (match the billing/sso settings pages), one card per gate with an enable `Cb` toggle + the `ChainEditor`, and a Save button → `useUpsertApprovalChain`. Inline `notice` for save success/error. Seed editor state from `useApprovalChains`.
`layout.tsx`: add `{ href: '/v2/settings/approvals', label: 'Approvals', icon: <pick a lucide icon e.g. GitPullRequestArrow or CheckSquare> }` to the settings nav; only render it when the current user holds `approvals:configure` (check via the existing role/permission the layout already uses to gate admin items).

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Verify in browser** — as an org-admin at `/v2/settings/approvals`: toggle a gate on, add two steps (one Users, one Reporting manager), Save, reload → persists. Screenshot.

- [ ] **Step 6: Commit** — `git commit -m "feat(approvals-web): settings approvals page + chain editor"`

---

### Task 4: Staff Users manager field

**Files:**
- Modify: `apps/web/app/v2/(org-admin)/users/page.tsx` (the edit-user dialog)
- Test: in-browser (presentational).

**Interfaces:**
- Consumes: `useTeammates` (approver/manager options), `useUpdateUser` extended with `managerId` (Task 1).

- [ ] **Step 1: Add a Manager `Combobox`** to the edit-user dialog (the `editing` form in `users/page.tsx`) — options from `useTeammates` (exclude the user being edited), value `editManagerId`, seeded from the user's `managerId`. Include it in the `updateUser.mutate({ id, role, name, managerId })` call. Allow clearing (a "— None —" option → `managerId: null`/undefined).

- [ ] **Step 2: Verify in browser** — edit a user, set a manager, save, reopen → manager persists. Screenshot.

- [ ] **Step 3: Commit** — `git commit -m "feat(approvals-web): staff user reporting-manager field"`

---

### Task 5: Requisition fields + status + submit/cancel on jobs

**Files:**
- Modify: the job create/edit form and the job detail under `apps/web/app/v2/(recruiter)/jobs/` (locate the exact create/edit surface — likely `jobs/page.tsx` create modal and/or `jobs/[jobId]/page.tsx`), and `PipelineBoard.tsx`/`AddCandidateModal.tsx` where add-candidate + public-apply live.
- Test: in-browser (presentational); the `approval`-summary mapping is already covered server-side.

**Interfaces:**
- Consumes: `useSubmitRequisition`, `useCancelRequisition` (Task 1); job reads' `approval` field; `ApprovalTimeline`, `Pill`, `Button`, inline `notice`.

- [ ] **Step 1: Add requisition fields** to the job create/edit form: Department (`TextField`), Hiring manager (`Combobox` off `useTeammates`), Headcount (number `TextField`), Salary min/max (number) + currency (`TextField` or small `Combobox`). Wire into the existing create/update job mutation (the API already accepts them).

- [ ] **Step 2: Add status + submit/cancel** on the job detail (and/or the jobs list row): a status `Pill` (Draft / Pending approval / Open / Closed from `job.status`). When `job.status === 'draft'` and a requisition chain is enabled → a **"Submit for approval"** `Button` (`useSubmitRequisition`). When `pending_approval` → render `<ApprovalTimeline>` from `job.approval` + a **Cancel** button (`useCancelRequisition`). When rejected/returned to draft → show the state and allow re-submit.

- [ ] **Step 3: Gate the go-live controls** — in the add-candidate control and the enable-public-apply toggle, when `job.status !== 'open'` disable the control with a one-line hint ("Requires approval to go live"); surface the API 409 as an inline `notice` if hit anyway.

- [ ] **Step 4: Verify in browser** — with the requisition gate ON (configured in Task 3): create a job → Draft; Submit → Pending with a timeline; add-candidate disabled. Screenshot. Then (as the approver, or after auto-pass) confirm it opens.

- [ ] **Step 5: Commit** — `git commit -m "feat(approvals-web): requisition fields, status pill, submit/cancel on jobs"`

---

### Task 6: Offer approval in the candidate drawer

**Files:**
- Modify: `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (offer section) and/or `CreateOfferModal.tsx`
- Test: in-browser.

**Interfaces:**
- Consumes: `useSubmitOffer`, `useCancelOffer` (Task 1); offer reads' `approval` field; `ApprovalTimeline`, `Pill`, `Button`.

- [ ] **Step 1: Status + submit/send gating** — show an offer status `Pill` (add Pending approval / Approved). When the offer gate is ON and status is `draft` → replace **Send** with **"Submit for approval"** (`useSubmitOffer`); when `pending_approval` → `<ApprovalTimeline>` + Cancel (`useCancelOffer`); when `approved` → the **Send** button returns. When the gate is OFF, the offer flow is unchanged (Send from draft, as today).

- [ ] **Step 2: Verify in browser** — with the offer gate ON: create an offer → Draft; Submit → Pending; after approval → Send available. With the gate OFF: Send works from draft (unchanged). Screenshot both.

- [ ] **Step 3: Commit** — `git commit -m "feat(approvals-web): offer submit + approval-gated send in candidate drawer"`

---

### Task 7: Approvals inbox

**Files:**
- Create: `apps/web/app/v2/(recruiter)/approvals/page.tsx`
- Modify: `apps/web/app/v2/(recruiter)/layout.tsx` (add "Approvals" nav item, visible to all recruiter-console users)
- Test: in-browser; if any list-shaping logic is non-trivial, a small unit test.

**Interfaces:**
- Consumes: `useApprovalRequests('inbox'|'submitted')`, `useApprovalRequest(id)`, `useDecideApproval` (Task 1); `DataTable`, `IconStatCard`, `ApprovalTimeline`, `ApprovalDecisionDialog`.

- [ ] **Step 1: Build the page** — header + an `IconStatCard` strip (Awaiting you / Submitted by you / Approved recently) + a `DataTable` of `scope=inbox` rows (subject title, gate, submitter, current step `x/stepCount`, waiting-since) with a `toolbarExtra` tab toggle between **Inbox** and **Submitted** (`scope` state). A row opens a `Dialog` detail (`useApprovalRequest`) rendering `<ApprovalTimeline>` + `<ApprovalDecisionDialog>` (decide → `useDecideApproval`, then close + the list refetches via invalidation). Resolve subject titles from the request `subject` summary.

- [ ] **Step 2: Add the nav item** — `{ href: '/v2/approvals', label: 'Approvals', icon: <lucide, e.g. CheckSquare> }` in the recruiter layout nav (visible to everyone; the list is just empty when nothing is assigned).

- [ ] **Step 3: Verify in browser** — as a user who is a current-step approver (configure a chain in Task 3 with yourself as an approver, submit a requisition in Task 5): the request appears in Inbox; open it, Approve with a note → the job flips to Open and the row clears. Screenshot.

- [ ] **Step 4: Commit** — `git commit -m "feat(approvals-web): approver inbox (inbox/submitted + decide)"`

---

### Task 8: Approval notifications in the bell

**Files:**
- Modify: `apps/web/components/ui-v2/NotificationBell.tsx` (`label()` + link routing)
- Test: extend/confirm any existing NotificationBell test, else in-browser.

**Interfaces:**
- Consumes: the notification `type` values `approval.requested` / `approval.approved` / `approval.rejected` / `approval.cancelled` (+ `approval.step_skipped`) emitted by Phase 1.

- [ ] **Step 1: Add labels + links** — in `NotificationBell.tsx`'s `label(n)`, add cases:
  - `approval.requested` → "{who} needs your approval{on}"
  - `approval.approved` → "Your submission was approved{on}"
  - `approval.rejected` → "Your submission was rejected{on}"
  - `approval.cancelled` → "An approval you were on was withdrawn{on}"
  - `approval.step_skipped` → "An approval step was skipped{on}"
  Ensure the row's `linkPath` (already carried by the notification, e.g. `/v2/approvals/:id` or the item) is used as the click target — deep-link to the inbox detail / item approval panel.

- [ ] **Step 2: Verify in browser** — trigger a submit that notifies an approver; the bell shows "needs your approval" and clicking it lands on the inbox detail. Screenshot.

- [ ] **Step 3: Commit** — `git commit -m "feat(approvals-web): approval notification labels + deep links"`

---

## Self-Review

**Spec §7 coverage:**
- §7.1 Settings→Approvals + step editor → Task 3. ✓
- §7.2 Staff Users manager field → Task 4. ✓
- §7.3 Job requisition fields → Task 5 (Step 1). ✓
- §7.4 Requisition status + submit + gated controls → Task 5. ✓
- §7.5 Offer approval → Task 6. ✓
- §7.6 Approvals inbox → Task 7. ✓
- §7.7 NotificationBell types → Task 8. ✓
- Shared `ApprovalTimeline`/`ApprovalDecisionDialog` → Task 2. ✓
- Hooks/types (implicit prerequisite) → Task 1. ✓

**Placeholder scan:** the presentational tasks (4, 5, 6) intentionally use in-browser verification instead of jest per the stated v2 convention, with concrete browser steps — not "add tests later." Logic-bearing pieces (hooks Task 1, timeline Task 2, reducer Task 3) carry real unit tests. One deliberately open locate-step: Task 5 says "locate the exact job create/edit surface" because the jobs create/edit UI wasn't pinned in this plan's research — the implementer confirms it from `jobs/` before editing.

**Type consistency:** `ApprovalSummary.steps[].state` ('pending'|'approved'|'rejected') is produced by the API (Phase-1 Task 13) and consumed by `ApprovalTimeline` (Task 2) — matches. `ApprovalStepView` (Task 1 types) is the same shape `ApprovalTimeline` accepts (Task 2). Hook names used by Tasks 3–8 are all defined in Task 1. `useTeammates` is the existing hook (`lib/hooks/useUserDirectory`), not a new one.

**Dependency order:** Task 1 (hooks/types) and Task 2 (shared components) first; 3–8 depend on them and are otherwise independent (different files), so 3–8 can run in any order after 1–2.

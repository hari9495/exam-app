# Performance design map: PRF-13 … PRF-17 (builder 3 rows)

Builder 1 owns `performance-design-map.md`; these rows are for the lead to copy in. Branch `feat/yukthix-perf-3`.

| Story | Status | Live page | API | Note |
|---|---|---|---|---|
| PRF-13 New manager · handed over to you | live | /yx/performance/handovers (manager) | GET /performance/handover-list | Rows from perf_owner_transfers (review, goal parent, PIP, 1:1 actions). |
| PRF-13 HR · needs decision | live (gap) | /yx/performance/handovers (perf.cycle.manage) | GET /performance/handover-list/all | Saved views switch the filter. Gap: "Reassign to HR" bulk action and "View audit entry" are not built (hidden on the live page). A moved PIP shows only to HR with perf.pip.manage company-wide. |
| PRF-13 Re-parent a moved goal (new state) | live | same | GET …/:id/parent-options, POST …/:id/decide | Align to one of the new manager's goals in the same period, or leave unaligned; once; audited. |
| PRF-13 Empty / Loading | live | same | | |
| PRF-14 Competency with levels and roles | live (gap) | /yx/performance/competencies (perf.setup.manage) | GET/POST/PUT /performance/competencies | "Rated in" = active templates with a competencies section. Gap: Import (file) is hidden; Skills test link shows "None" (no question-bank link yet). |
| PRF-14 Starter template item | live | same | POST /performance/setup/from-starter | |
| PRF-14 Retire (in use) | live | same | POST /performance/competencies/:id/retire | |
| PRF-14 Add competency / Map a role / Merge into (new states) | live | same | POST /performance/competencies/:id/merge (new) | Merge retires the merged one; its job titles move over. |
| PRF-14 Empty | live | same | | Load starter library. |
| PRF-15 Employee · escalate / escalation raised | live (gap) | /yx/performance/reviews/[id]/dispute | GET/POST /performance/reviews/:id/dispute, POST /performance/disputes/:id/files | Needs a link from the PRF-06 review page (builder 1) when the disagreement is answered. Window: perf.dispute.escalate_days (default 15). |
| PRF-15 Employee · phone | live (desktop page) | same | | The page renders the desktop layout; the phone story is the same component with device="phone". |
| PRF-15 HR · open disputes (new design) | live | /yx/performance/disputes (perf.dispute.manage) | GET /performance/disputes | Listing audited. |
| PRF-15 HR · record with legal hold / record decision | live | /yx/performance/disputes/[id] | GET /performance/disputes/:id (view audited), POST …/legal-hold, POST …/decision | Decision never changes the rating. Legal hold is a flag: no retention purge exists for reviews yet, so it blocks nothing today. |
| PRF-15 HR · evidence export / exported | live | same | POST …/export, GET …/exports/:id/file | PDF (pdf-lib) stored through FilesService (SHA-256, virus scan); hashes in the audit log; certificate format still "to be confirmed by counsel". |
| PRF-16 Coach card on manager home / No nudges / Opted out | live | /yx/performance/coach (managers) | GET /performance/coach, POST /coach/dismiss, POST /coach/opt-out | Signals built: feedback 6 weeks, 1:1 overdue / >35 days, goals off track or at risk. Gap: unused leave, overtime and onboarding-task signals not built. Wording is fixed rule text (no AI call). |
| PRF-16 Company off / No team yet (new states) | live | same | | perf.coach.frequency (weekly / fortnightly / off, default weekly). |
| PRF-16 Coach card · phone | live (desktop page) | same | | |
| PRF-16 Suggested 1:1 agenda panel (+ phone) | live (gap) | not on a page yet | GET /performance/one-on-ones/:id/suggested-agenda | `SuggestedAgendaPanel` + `useSuggestedAgenda(id)` ready; the PRF-11 1:1 page (builder 2) must render it. |
| PRF-17 Help me draft / Draft suggested | live (gap) | not on a page yet | GET /performance/reviews/:id/assistant, POST …/assistant/draft | Through AiInvocationService (quota, spend record); names stripped; perf.ai.review_assistant default off. `ReviewAssistantPanel` + `useReviewAssistant(id)` ready; the PRF-05 page (builder 1) passes `assistant={{ enabled: true, live }}`. |
| PRF-17 Bias flags / Nothing to flag / spread (new) | live (gap) | same | POST …/assistant/check, POST …/assistant/flags | Rules: loaded/gendered, personality, age, vague, rating vs text, rating spread vs company (≥5 each side, gap ≥0.75; or all ≥3 the same). Never changes the review; Accept/Ignore audited. |
| PRF-17 Assistant off / AI not set up (new) | live (gap) | same | | |

Settings (company rules, each with a default): `perf.dispute.escalate_days` 15, `perf.coach.frequency` weekly, `perf.ai.review_assistant` off.
Permission: `perf.dispute.manage` (new; MFA-sensitive; role template "Rating disputes").
Migration: `20261460000000_performance_b3`.

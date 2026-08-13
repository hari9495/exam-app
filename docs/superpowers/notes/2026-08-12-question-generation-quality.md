# Stage 0 — AI question generation quality probe

**Date:** 2026-08-12
**Verdict: USABLE AS-IS. No prompt work needed. The gate passes — proceed with Stage 1.**

## How it was run

The plan's Task 1 assumed a local stack. That was not possible: nothing was listening on `:3001`, no
Docker containers were running, `apps/api/.env` points at `sqlserver://localhost:1433`, and a locally
seeded organization would have no AI key regardless.

Checked which production organizations have a provider configured (read-only, no key material
printed): of 5 organizations, two have one — `ptc-ea` and `demo-org`, both `openai-compatible` on
`gpt-5`. The user chose `demo-org` (the demo organization, not the one holding real hiring data).

Rather than the plan's HTTP route — which needs a recruiter login and writes draft rows that then
need cleaning up — the probe called the real `QuestionGenerationClient` directly with the real
resolved provider, on the VM. **Nothing was written to the database:** no questions, no `ai_jobs`
row, no `ai_credit_usage` row. Only the provider API call was billed. The probe script read the
organization's encrypted key through the normal `OrgSecretsCryptoService` path and never printed it.

Each returned question was then run through the same `validateQuestionPayload` the processor uses,
so the drop rate is measured rather than guessed.

## Results

| Topic | Difficulty | Asked | Returned | Passed validation |
|---|---|---|---|---|
| SQL joins | medium | 5 | 5 | **5/5** |
| React useEffect cleanup and dependency arrays | hard | 4 | 4 | **4/4** |

**9/9 across two topics. Zero drops.** Elapsed for the 4-question run: **17.5s**.

## Judgement on the questions themselves

Judged against the bar in the plan: factually correct, exactly one correct option for `single_mcq`,
plausible distractors, and would I put it in front of a candidate.

**SQL joins (medium) — all five good.** The strongest was the anti-join question: the correct answer
is `LEFT JOIN ... WHERE p.id IS NULL`, with distractors using `INNER JOIN` and `RIGHT JOIN` in the
same shape — wrong for a reason a candidate has to actually know, not wrong on sight. Another asked
which join multiplies rows (CROSS JOIN), and another tested FULL OUTER JOIN semantics precisely.

Best of the set: filtering the right table of an outer join — the correct answer puts the predicate
in `ON`, and the top distractor puts it in `WHERE`, which silently degrades the outer join to an
inner join. That is a genuine, well-known interview discriminator, and the model both got it right
and built the distractor that catches people out.

**React (hard) — all four good, and genuinely hard.** Stale closures (`setCount(c => c + 1)` with
`[]` versus `setCount(count + 1)` with `[count]`); cleanup ordering relative to DOM updates; the
ref-latest pattern for avoiding re-subscription; and `AbortController` created *inside* the effect
versus outside, where reusing an aborted controller is the classic bug. The distractors are the
mistakes people actually make.

## What this means for the rest of Stage 1

- **The prompt does not need rewriting.** Build the UI on it as planned.
- **Zero drops in this sample does not mean the dropped-reasons UI is unnecessary.** It means the
  common case is clean, so when a drop does happen it will be unexplained and surprising — which is
  exactly when a reason matters. Keep it.
- **~17.5s for 4 questions** implies roughly 60–90s for a full batch of 20. This confirms the async
  job design and the "safe to close this modal" message, and the 2-second polling interval is
  comfortable.
- Sample size is two topics and nine questions, both in well-trodden technical domains. It says the
  prompt is sound; it does not say anything about obscure or company-specific topics.

## Cleanup

The probe scripts were removed from the VM. No database rows were created, so there was nothing to
archive — the draft-question count was 0 before the probe and the probe never writes.

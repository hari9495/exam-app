# YukthiX backend roadmap

Agreed with the founder on 6–7 Oct 2026. Backend is built inside the exam-app monorepo (spec D11), flow by flow (not screen by screen), each step to the design doc it cites, with the YukthiX screens from `packages/yx-ui` wired to real APIs. Every step ends with an independent security review and a full green test run before its pull request.

| Step | What | Design docs | Status |
|---|---|---|---|
| 0 | PostgreSQL 17 with forced row-level security on every tenant table | spec D10, P01 | Done — PR #128 |
| 1 | Login: sessions, lockout (company-configurable within the YukthiX floor), password floor, MFA (passkeys, TOTP, recovery codes, step-up), OTP sign-in, Google / Microsoft / SAML SSO, login and security screens | P12 | Done — PR #129 |
| 1+ | Generic SMS channel (any gateway by configuration; shared YukthiX account, e.g. Zoho CPaaS, plus company-owned accounts) | P04 §4.4–4.5a | In PR #129 |
| — | Design docs and full UI prototype in the repo | — | PR #130 |
| 2 | Organisation and employee core: legal entities, locations, departments, positions, the employee record with effective-dated history, reporting lines, roles and field-level visibility | P01, P02, P06, M01 | Done — PR #131 |
| 3 | Platform console (YukthiX staff only, same codebase, separate locked-down area): companies and lifecycle, plans and prices, shared channel accounts (move the shared SMS account here), support sessions, audit; later billing, incidents, customer success | P14, P02 support sessions, P12 Q7 | After step 2 |
| 3b | YukthiX Service Desk: full ITSM + ESM (incident, request catalogue, problem, change / CAB, release, assets + CMDB, knowledge, SLA / OLA, portal, email / chat / WhatsApp / Teams, automation + AI, monitoring events, on-call, status page, vendors). One engine for company helpdesks (HR / IT / Admin), YukthiX's own customer support, and a standalone product | M14, M08 | After step 3 |
| 4 | Time and leave: attendance, regularisation, shifts and rosters, leave and balances, overtime | M02, P03, P07 | |
| 5 | Payroll and statutory: inputs, calculation (PF, ESI, PT, TDS), approve and lock, bank file, payslips | M03, P07, P08 | |
| 6+ | Lifecycle (onboarding, exit, F&F), expenses, performance, learning, engage, benefits, projects and timesheets, contract labour, ATS, mobile | M04–M13, P-series | |

Cross-cutting pieces (notification engine P04, workflow engine P03, documents P05, period locks and audit P08) are built the first time a step needs them, then reused.

Go-live items are tracked separately in [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md).

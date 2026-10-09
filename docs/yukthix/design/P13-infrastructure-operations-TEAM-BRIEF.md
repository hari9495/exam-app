# P13 · Infrastructure & Operations — brief for the engineering team

> **Status:** ⏸ Parked for the engineering team (26 Sep 2026). The founder asked for this doc to be decided by the team, not in the product design sessions.
> **Why it matters:** spec §3 is empty, and production today is a single VM with pm2. Other decided docs already depend on answers here:
> - P02 Q7 (data residency per region);
> - P12 (KMS / BYOK, CERT-In 6-hour reporting, logs kept at least 1 year under the DPDP Rules 2025 (covers CERT-In's 180 days), staff just-in-time access);
> - T03 Q2 (5,000 candidates per drive, 20,000 across the platform);
> - P08 (audit anchor outside the database);
> - P05 (LibreOffice worker);
> - M03 (payroll-day reliability).
>
> **Deadline:** decisions needed before wave 1 build starts. HA, backups / DR and monitoring must be live before the wave-3 payroll pilot.
>
> **Added 28 Sep 2026 (validation pass 3 Must S13, founder decision):** synthetic probes of critical journeys feeding the status page (#6). Must for public launch.

## What exists today (exam app)
- `Dockerfile`, `docker-compose.yml`, one VM + pm2, workers running inside the API process.
- CI (GitHub Actions) runs on each push:
  - builds and unit tests for each app;
  - a dependency audit that fails on High / Critical;
  - a secret scan.

  End-to-end tests are not in CI.
- Sentry for errors, Azure Blob for files, and k6 spike tests in `load/`.
- Earlier decision (D4): keep it portable with containers, Postgres, Redis, S3-compatible storage and Terraform. Apply for Azure / AWS startup credits.

## Decisions the team must make

| # | Question | Suggested starting point (team to confirm) |
|---|---|---|
| 1 | **Cloud provider** | Azure as primary. The exam app already uses Azure Blob, India has several Azure regions, and credits are available. Stay portable (containers, Terraform, S3-compatible storage layer). |
| 2 | **Compute platform** | Managed containers (Azure Container Apps or AWS ECS Fargate) rather than Kubernetes for a 4–5 person team. Split workers from the API: payroll, PDF / LibreOffice, notifications, analytics, proctoring runtime. |
| 3 | **Availability target** | Published SLA 99.9 % monthly; internal SLO 99.95 %; extra protection on payroll days and statutory due dates (no risky deploys, tighter alerting). |
| 4 | **Backups & disaster recovery** | Postgres point-in-time recovery. RPO ≤ 15 min, RTO ≤ 4 h. DR in a second region **inside the same country** (data residency). Restore drills every quarter, including restoring a single tenant. |
| 5 | **Regions** | India (primary + DR) at launch. Add EU / UAE / US regions when the first customer there signs (P02 Q7). |
| 6 | **Monitoring & on-call** | OpenTelemetry instrumentation; central logs with PII redaction (P02 classes); metrics, traces and alerts; keep Sentry for errors. Keep logs at least 1 year (DPDP Rules 2025, which also covers CERT-In's 180 days; P12 YX-SECOPS-07). An on-call rota with a paging tool. Public status page. Runbooks for payroll day, statutory deadline, drive day, DR and key rotation. **Synthetic probes (S13, decided 28 Sep 2026):** scripted probes every few minutes (suggest 5) from each region against dedicated probe tenants: **login with OTP**, **payslip view**, **bank-file generation** (sandbox bank format, never a real bank), **test link open and proctoring start**, **careers-page apply**. A failure confirmed from two locations alerts on-call through the paging tool and updates the matching component on the status page (P14 YX-CONSOLE-07); probe results are kept as availability evidence for the SLA. Probe tenants hold demo data only and are excluded from billing and product analytics. |
| 7 | **Release process** | Trunk-based development with feature flags (waves, tenant beta groups, kill switches). Blue-green / rolling deploys with zero downtime. Expand-then-contract database migrations. Deploy freeze around each tenant's payroll cut-off. Release notes to tenants. A minimum-version rule for the mobile app. |
| 8 | **Testing strategy** | Unit + integration tests, with e2e on Postgres in CI. A **payroll regression pack** (golden payslips per statutory rule-pack version) as a release gate. Load tests before each release and before large drives. P12 security gates. Contract tests for the SDKs (P11). UAT with pilot customers per wave. |

## Also needed from the team
- Environments: dev / staging / production per region, a tenant-sandbox capability (P15), and infrastructure as code with drift detection.
- Capacity targets for HRMS: tenants, employees, punches per minute, payroll run size and duration, month-end peaks.
- Cost estimate per month at pilot and at launch (earlier estimate ₹5k–50k per month).
- Owner for each runbook, and the on-call rota.

When decided, the team writes these into a full `P13-infrastructure-operations.md` using the usual template (§1–11), with rules in area `YX-OPS`.

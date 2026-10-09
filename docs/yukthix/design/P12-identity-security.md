# P12 · Identity, Authentication & Security Programme

> **Status:** ✅ Decided (8/8), 26 Sep 2026. **Corrected 28 Sep 2026** (validation pass 3, C3): log retention at least 1 year (DPDP Rules 2025) and DPDP breach clocks; Q6 amended, YX-SECOPS-07 updated. Validation pass 3 Shoulds added 28 Sep 2026 (§8b).
> **Covers:**
> - spec §2.1.2 (Authentication & Security): email / password, Google, Microsoft Entra SSO, SAML, MFA, session management, IP restrictions, login history, encryption at rest and in transit;
> - GAP-REGISTER **A1** (identity baseline) and **A2** (security programme);
> - NFR review items 1–12.
>
> **Builds on:**
> - P01 (tenancy, RLS, support sessions);
> - P02 (roles, field classes, external logins YX-SEC-21, API keys YX-SEC-22, proctor grants YX-SEC-23, legal acceptances YX-SEC-28);
> - P04 (OTP message class YX-NTF-13);
> - P08 (audit hash chain, "who accessed my data");
> - P10 (AI tiers);
> - P11 (OAuth, API keys);
> - M04 (mobile sign-in, passkeys, device binding);
> - APX-G (legal artefacts: DPA, trust page, responsible disclosure).
>
> **D17 note:** security has a **YukthiX floor** that no company can go below. Above the floor, companies choose stricter settings.
> **Build wave:** identity core in **wave 1**. Security programme milestones are tied to the pilot (wave 3) and public launch.

---

## 1. Purpose & scope
YukthiX holds salary, bank, PAN / Aadhaar, health, POSH and biometric data for many companies. This doc defines:
- how people and systems **prove who they are** (identity and authentication);
- how sessions are **kept safe**;
- the **security programme** behind the product: keys, secure development, testing, incident response and certification.

Buyers and auditors check all of these before signing.

## 2. What exists today (exam app, `origin/main`)

| Capability | Today | P12 |
|---|---|---|
| Passwords | argon2 hashing; reset link valid 15 min | **Keep**; add breached-password check and policy floor (Q8) |
| Refresh tokens | SHA-256 hashed, rotation, reuse detection with 10 s race grace | **Keep** |
| Access tokens | JWT, short-lived (15 min) | **Keep**; bind to session record for revocation |
| SSO | SAML, one IdP per organisation | **Extend**: Google / Entra OIDC, several IdPs, JIT, SCIM (Q2) |
| MFA | None | **Add** (Q1) |
| Login history | `lastLoginAt` only | **Add** sessions + login events, user- and admin-visible |
| IP restriction | Per exam only (`allowedIpRange`) | **Add** tenant allow-lists for desk / admin |
| Dependency hygiene | Dependabot, gitleaks, `npm audit` in CI | **Extend** into the secure-SDLC pipeline (Q5) |
| Mobile sign-in | Designed in M04 (OTP, passkeys, PIN, re-auth) | **Reuse**; one identity service for web and mobile |

## 3. Concepts
- **Identity:** a user account (P01), plus the external / limited logins from P02 §4.7. A person has one identity per tenant.
- **Authenticators:**
  - password;
  - **passkey** (WebAuthn: fingerprint or face on the device, or a security key);
  - **TOTP** authenticator app;
  - **OTP** by SMS / WhatsApp / email, as a fallback;
  - **SSO assertion** (SAML / OIDC).
- **Assurance levels:**
  - **AAL1:** password or OTP.
  - **AAL2:** MFA: two factors, or a user-verifying passkey on its own (passwordless sign-in), or SSO where the IdP enforces MFA.
  - **Step-up:** re-verify with AAL2 at the moment of a sensitive action.
- **Sensitive roles** (MFA mandatory under the YukthiX floor, Q1):
  - System Admin, HR Admin, Payroll Admin, Finance approver;
  - IC member, ethics officer;
  - proctor, evaluator;
  - API-key creator;
  - YukthiX staff.
- **Step-up actions:**
  - approve a payroll run; release a bank file or payout;
  - change a bank account or role / permission;
  - export Confidential / Special data;
  - create an API key;
  - change security settings;
  - view a POSH case.
- **Session:** a server-side record holding device, IP, geo, created, last seen, idle expiry, absolute expiry and assurance level. Access tokens reference it, so revoking the session kills its tokens at once.
- **Tenant security policy:** the company's settings (MFA scope, SSO-only, IP ranges, session lengths, password rules). Each is bounded by the YukthiX floor (Q8).
- **Security programme:**
  - key management;
  - secure SDLC;
  - vulnerability management;
  - penetration testing;
  - incident response;
  - certifications;
  - vendor (sub-processor) security.

## 4. Data model (main tables)

| Table | Purpose |
|---|---|
| `authenticators` | user, type (password / passkey / totp / otp-channel), credential ref (public key / secret encrypted), label, created, last used, revoked |
| `recovery_codes` | user, hashed codes, used_at |
| `sessions` | user, tenant, device, user agent, IP, geo, assurance level, created, last seen, idle expiry, absolute expiry, revoked_at / reason |
| `login_events` | user / attempted identifier, tenant, result (success / failed / locked / mfa-failed / sso), method, IP, geo, device, risk flags, time (append-only) |
| `identity_providers` | tenant, type (SAML / OIDC-Google / OIDC-Entra / OIDC-generic), metadata, domains, JIT rules (default role, attribute mapping), status |
| `scim_clients` | tenant, IdP, token hash, scopes, last sync, status |
| `tenant_security_policies` | MFA scope, allowed factors, SSO-only + break-glass accounts, IP allow-lists (desk / admin / API), session idle / absolute limits, concurrent-session limit, password rules — each validated against the floor |
| `security_keys` (KMS metadata) | tenant data keys (wrapped), purpose, created, rotated, destroyed (crypto-shredding record) |
| `customer_managed_keys` | tenant, provider (Azure Key Vault / AWS KMS / Google Cloud KMS), key URI, access principal, status (connected / healthy / degraded / revoked), last health check, rotated_at |
| `security_incidents` | internal register: severity, detection, affected tenants / data classes, timeline, notifications sent (regulator / tenants / individuals), root cause, actions |
| `vulnerabilities` | source (scan / pen test / VDP / bounty), severity, component, SLA due, status |

`login_events` and `security_incidents` are append-only (P08 pattern). All tenant tables carry `organization_id` + RLS. `security_incidents` and `vulnerabilities` are platform tables, never visible to tenants except through notifications and reports.

## 5. Rules

### Identity & sessions (YX-IAM)

| ID | Rule |
|---|---|
| YX-IAM-01 | Users in sensitive roles must reach AAL2 before using any sensitive-role permission. The tenant may extend MFA to everyone, but may not waive it for sensitive roles (Q1). |
| YX-IAM-02 | Step-up actions require AAL2 re-verification within the last N minutes (floor: 15). The re-verification is recorded on the audit entry. |
| YX-IAM-03 | Passkeys are the preferred factor. TOTP is supported. SMS / WhatsApp / email OTP is a fallback factor only; it can't be the sole second factor for System Admin or Payroll Admin. **Passkey as a sign-in method (founder, 7 Oct 2026):** a user-verifying passkey signs in on its own, with no password and no second step, at AAL2 ("Sign in with a passkey" and browser passkey autofill). New passkeys are registered as discoverable and user-verifying; older ones work as a second step only. The setup screen is "Secure your account" with option cards: Passkey (recommended) and Authenticator app. YukthiX staff keep hardware security keys, at /staff/sign-in only. |
| YX-IAM-04 | SSO: a tenant may configure several IdPs, mapped by email domain. With **SSO-only** enabled, password login is disabled except for ≥ 2 named break-glass admin accounts with MFA; every break-glass login alerts all admins. SSO-only also turns off passkey sign-in. |
| YX-IAM-05 | JIT provisioning creates a user only from an allowed domain and never grants a sensitive role automatically. SCIM deprovisioning (or IdP disable) revokes all sessions within 5 minutes and triggers the M01 exit deprovisioning where an employee is linked (Q2). |
| YX-IAM-06 | Sessions are server-side. Idle and absolute limits follow the tenant policy within the floor (Q8). Users see and revoke their active sessions; admins can revoke any session in scope. |
| YX-IAM-07 | Login protection: progressive delays and temporary lock after repeated failures per account and per IP; bot challenge on public login / OTP / apply pages under attack; new-device and new-country login notifications to the user. Passkey sign-in failures count toward the same account and IP lockout as passwords. Request throttling is per IP + identifier (so an office behind one IP is not throttled together), with a separate higher per-IP ceiling; the account and IP lockouts stay the brute-force control. |
| YX-IAM-08 | Passwords follow the floor (Q8): minimum length, breached-password check, no forced periodic rotation; argon2 hashing. |
| YX-IAM-09 | Tenant IP allow-lists may be set separately for desk, admin console and API keys. Mobile app and candidate / external portals are exempt unless the tenant explicitly includes them. |
| YX-IAM-10 | Every login attempt, MFA change, recovery-code use, session revocation, IdP change and security-policy change is logged (`login_events` / P08). Users see their own login history; admins see their tenant's. |
| YX-IAM-11 | Account recovery for sensitive roles needs a second admin's approval, or identity re-verification. Recovery codes are single-use and shown once. |

### Security programme (YX-SECOPS)

| ID | Rule |
|---|---|
| YX-SECOPS-01 | All data is encrypted in transit (TLS 1.2+, HSTS) and at rest. Confidential and Special fields use envelope encryption with **per-tenant data keys** from a cloud KMS / HSM; keys rotate at least yearly (Q3). |
| YX-SECOPS-02 | Deleting a tenant destroys its data keys (crypto-shredding) after the P14 grace period. Backups that still hold its data become unreadable. |
| YX-SECOPS-03 | Secrets (DB, API, partner credentials) live only in a secrets manager, rotated per schedule. Never in code or images (gitleaks gate). |
| YX-SECOPS-04 | Secure SDLC gates in CI: dependency scan, SAST, secret scan, container / IaC scan, SBOM per release; DAST on staging before each release. A release is blocked on open Critical / High findings unless formally risk-accepted. |
| YX-SECOPS-05 | Vulnerability SLAs (Q5): Critical 72 h, High 14 days, Medium 45 days, Low 90 days, from triage. |
| YX-SECOPS-06 | An independent penetration test happens before the payroll pilot, before public launch, then yearly and after major architecture changes (Q5). Findings are tracked in `vulnerabilities`. |
| YX-SECOPS-07 | Incident response follows a written plan with severities and roles. Regulatory and customer notifications follow Q6 timelines (incl. **CERT-In 6-hour reporting**, and DPDP breach intimation to the Data Protection Board and affected Data Principals without delay with a **detailed Board report within 72 hours**, P02 YX-SEC-32). Security, processing and traffic logs are kept **at least 1 year** (DPDP Rules 2025 security safeguards; longer where another law requires), which also satisfies CERT-In's 180 days (amended C3). Every incident gets a post-mortem. |
| YX-SECOPS-08 | YukthiX staff access follows Q7: individual accounts only, hardware-key MFA, least privilege, just-in-time elevation with approval, and tenant data only via P02 support sessions / proctor grants. All staff actions are audited. |
| YX-SECOPS-09 | Sub-processors are security-assessed before onboarding and yearly (the partners from D15 / P10). The list is published (APX-G), and changes are notified to tenants 30 days ahead. |
| YX-SECOPS-10 | Security certifications follow the Q4 roadmap. Controls are mapped once and evidence is collected continuously (tooling), not per audit. |
| YX-SECOPS-11 | **Bring your own key (BYOK)** is available from day one: a tenant may connect a customer-managed key in Azure Key Vault, AWS KMS or Google Cloud KMS, granting YukthiX wrap / unwrap only. The tenant's data keys are wrapped by that key, key health is checked continuously, and admins are alerted on access failures. If the tenant disables or revokes the key, its encrypted data becomes unreadable; the product shows this consequence and requires typed confirmation before connecting or rotating, and logs every key operation (P08). BYOK is included in the plan (D15). |

## 6. Flows
1. **First login (web):**
   1. Password / OTP / SSO.
   2. If the role is sensitive or the tenant requires it, MFA enrolment (passkey suggested first, TOTP alternative).
   3. Recovery codes shown once.
   4. Session created at AAL2.
2. **Step-up:** the user clicks "Approve payroll" → passkey / TOTP prompt (skipped if AAL2 was reached within the step-up window) → action → audit records the step-up.
3. **SSO setup (admin):**
   1. Add IdP (metadata / OIDC client).
   2. Map domains.
   3. Test login.
   4. JIT rules.
   5. Optional SCIM token.
   6. Optional SSO-only, with ≥ 2 break-glass accounts named.
4. **Deprovisioning:** IdP disables the user → SCIM `active=false` → sessions revoked → linked employee's M01 exit deprovisioning checklist is flagged for HR (not auto-exit).
5. **Incident:**
   1. Detect (alerting, P13).
   2. Triage and severity.
   3. Contain.
   4. Notify per Q6.
   5. Eradicate / recover.
   6. Post-mortem.
   7. Customer report.

## 7. UI
- **Me › Security:**
  - passkeys / TOTP / recovery codes;
  - active sessions with "sign out";
  - login history;
  - new-device alerts.
- **Settings › People & Access › Security** (APX-D Settings map):
  - MFA scope, allowed factors;
  - SSO providers, SCIM;
  - SSO-only and break-glass;
  - IP allow-lists;
  - session limits, password rules.

  Each setting shows the YukthiX floor ("minimum allowed") next to it.
- **Admin › Login activity:** filterable tenant login events, failed-login spikes, sessions.
- **Platform console (P14)**, staff only: incident register, vulnerability tracker, KMS status, staff access requests.

## 8. Migration & rollout
- **Wave 1:**
  - sessions table;
  - MFA (passkey + TOTP) and step-up;
  - login events & history;
  - tenant security policy page;
  - Google / Entra OIDC;
  - multi-IdP SAML.
- **SCIM:** per Q2.
- **Existing exam-app users:** keep passwords. Sensitive roles are prompted to enrol MFA at next login, with a 14-day grace period, then enforced.
- **Programme:**
  - KMS + per-tenant keys before the payroll pilot;
  - secure-SDLC gates from wave 1;
  - pen test before the pilot;
  - incident plan and CERT-In process before the pilot;
  - log retention of at least 1 year (DPDP Rules 2025) configured from wave 1, well before the 13 May 2027 start of the main DPDP duties (C3);
  - certification per Q4.

## 8b. Validation pass 3 additions (founder decisions 28 Sep 2026)

Validation pass 3 Should J22 (group "Growth and operations", before pilot).

| ID | What it does | Rule | When |
|---|---|---|---|
| J22 | One-click breach containment for a tenant: revoke sessions, API keys, OAuth and partner grants; force re-auth; freeze bank-detail changes, bulk exports and payout release; incident banner | YX-SECOPS-12 | Before pilot |

**Rules**

| Rule | Statement |
|---|---|
| YX-SECOPS-12 | **Tenant breach containment.** A single "contain" action (YukthiX security on-call, or a tenant owner for their own tenant, with a reason and step-up auth) at once: revokes all sessions, API keys, OAuth and partner grants; forces re-auth with MFA for every user; freezes bank-detail changes, bulk exports and payout release; shows an incident banner to the tenant's users. Lifting containment is a separate audited action needing two people; frozen items resume only after the lift. The action opens the DPDP / CERT-In breach clock record (YX-SECOPS-07). |

**Acceptance tests**

- After "contain", an existing session and an API key both fail, and the next sign-in asks for MFA.
- During containment, a bank-detail change, a bulk export and a payout release are all blocked with a clear message, and the incident banner is shown.
- Lifting containment needs a second person; the audit log holds both actions with reasons.


## 9. Acceptance tests (samples)
- A Payroll Admin without MFA can't open the payroll run; after enrolling a passkey they can (YX-IAM-01).
- Approving a payroll run 40 minutes after login prompts re-verification; within 15 minutes of a step-up it doesn't (YX-IAM-02).
- With SSO-only on, password login fails for normal users. Break-glass login works and alerts all admins (YX-IAM-04).
- Disabling a user in Entra revokes their sessions within 5 minutes via SCIM (YX-IAM-05).
- 10 failed logins in a row lock the account temporarily and notify the user (YX-IAM-07).
- A password found in a breach corpus is rejected at set / change (YX-IAM-08).
- Deleting a test tenant destroys its data keys; restoring a pre-deletion backup can't decrypt its Special fields (YX-SECOPS-02).
- CI blocks a release with an open Critical dependency vulnerability (YX-SECOPS-04).
- A login event from 11 months ago can still be retrieved for an investigation; the retention job purges only logs older than the 1-year minimum (YX-SECOPS-07, C3).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | MFA baseline | **MFA mandatory for sensitive roles** (YukthiX floor, can't be waived); optional for other staff and employees, **company can require it for everyone**; factors: passkey (preferred) + TOTP, OTP as fallback only; step-up for sensitive actions. |
| Q2 | SSO & SCIM scope | **Wave 1:** Google + Microsoft Entra (OIDC) + any SAML IdP, several per tenant, JIT provisioning, SSO-only with break-glass; **SCIM 2.0 in wave 3** (before the pilot's IT-heavy customers), tested with Entra, Okta, Google. |
| Q3 | Encryption keys | **Per-tenant data keys in a cloud KMS** for Confidential / Special data, yearly rotation, crypto-shredding on tenant deletion; **customer-managed keys (BYOK) later** for enterprise buyers. |
| Q4 | Certifications | **ISO 27001 first** (India buyers ask for it), readiness from the pilot, certified by public launch; **SOC 2 Type II** next (global buyers) with its observation period starting at launch; ISO 27701 (privacy) after. |
| Q5 | Pen testing & vulnerabilities | **Independent pen test before the payroll pilot**, before public launch, yearly and after major changes; **vulnerability disclosure policy (security.txt) at launch**, paid **bug bounty after launch**; patch SLAs Critical 72 h / High 14 d / Medium 45 d / Low 90 d. |
| Q6 | Incident & breach notification | Written IR plan; **CERT-In report within 6 hours** of noticing a reportable incident and **180-day log retention** (India law); DPDP breach notice to the Data Protection Board and affected people as the rules require; **affected tenants told within 24 hours** of confirmation with updates until closed. |
| Q7 | YukthiX staff access | Individual accounts, **hardware security keys** mandatory, least-privilege staff roles, **just-in-time elevation** with a second-person approval for production, tenant data only via P02 support sessions / proctor grants, all actions audited and reviewed monthly. |
| Q8 | Password & session floor | YukthiX floor: **min 12 characters + breached-password check**, no forced rotation; desk idle timeout max **8 h** (default 30 min), absolute session max **12 h** for desk (mobile per M04 Q8); companies may set stricter values only. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **MFA mandatory for sensitive roles** (YukthiX floor, not waivable: System / HR / Payroll Admin, finance approvers, IC members, ethics officer, proctors / evaluators, API-key creators, YukthiX staff); optional for others, **company may require it for everyone**; factors passkey (preferred) + TOTP, OTP fallback only; step-up for sensitive actions (YX-IAM-01–03). | 26 Sep 2026 |
| Q2 | **Wave 1:** Google + Microsoft Entra (OIDC) + any SAML IdP, several per tenant (by email domain), JIT provisioning for allowed domains (never sensitive roles), SSO-only switch with ≥ 2 break-glass admins. **Wave 3 (before the pilot):** SCIM 2.0, tested with Entra, Okta, Google; deprovisioning revokes sessions within 5 min (YX-IAM-04/05). | 26 Sep 2026 |
| Q3 | **Both from day one:** per-tenant data keys in a cloud KMS for Confidential / Special data (yearly rotation, crypto-shredding on deletion) **and BYOK** — customer-managed keys in Azure Key Vault / AWS KMS / Google Cloud KMS, health-monitored, revocation makes data unreadable with explicit warning; included in the plan (YX-SECOPS-01/02/11). | 26 Sep 2026 |
| Q4 | **ISO 27001** readiness from the pilot, **certified by public launch**; **SOC 2 Type II** observation period starts at launch; **ISO 27701** after; continuous evidence collection with a compliance tool (YX-SECOPS-10). Team action: pick the compliance tool and the certification body. | 26 Sep 2026 |
| Q5 | **Independent pen test before the payroll pilot**, before public launch, yearly and after major changes; **vulnerability disclosure policy (security.txt) at launch**, paid **bug bounty after launch**; fix SLAs Critical 72 h / High 14 d / Medium 45 d / Low 90 d; CI blocks releases with open Critical / High (YX-SECOPS-04–06). Team action: select the pen-test firm. | 26 Sep 2026 |
| Q6 | Written **incident response plan** (severities, roles, drills twice a year); **CERT-In report within 6 hours** of noticing a reportable incident and **180-day log retention** (Indian law); **DPDP breach notice** to the Data Protection Board and affected people per the rules; **affected tenants told within 24 hours** of confirmation, updates until closed, final report; post-mortem for every incident (YX-SECOPS-07). **Amended 28 Sep 2026 (C3, validation pass 3):** log retention is **at least 1 year** (DPDP Rules 2025, security-safeguards rule; longer where another law requires), which also satisfies CERT-In's 180 days; the DPDP breach notice is an intimation to the Board and affected Data Principals without delay plus a **detailed report to the Board within 72 hours**; the main DPDP duties apply from **13 May 2027** (P02 YX-SEC-32 / 34 / 35). The original text is kept above for the record. | 26 Sep 2026 |
| Q7 | **Individual staff accounts with hardware security keys** (mandatory), least-privilege staff roles, **just-in-time production elevation** approved by a second person and auto-expiring, tenant data only via P02 support sessions / proctor grants, all staff actions audited and **reviewed monthly** (YX-SECOPS-08). Team action: buy hardware keys (2 per staff member). | 26 Sep 2026 |
| Q8 | **YukthiX floor:** passwords ≥ 12 characters + breached-password check, no forced periodic rotation; desk idle timeout max **8 h** (default 30 min), absolute desk session max **12 h**; mobile per M04 Q8; companies may only set stricter values (YX-IAM-06/08). | 26 Sep 2026 |
| Correction C3 (validation pass 3) | **Log retention and DPDP breach clocks pinned to the DPDP Rules 2025.** Logs (security, processing, traffic) kept **at least 1 year**, which also satisfies CERT-In's 180 days; DPDP breach: Board and affected Data Principals told without delay, detailed Board report within 72 hours; main DPDP duties from 13 May 2027. Q6 amended (history kept), YX-SECOPS-07 updated; related rules P02 YX-SEC-32 / 34 / 35. No new P12 rule IDs. Hosting cost note: not held in P12 (see HOSTING-RUN-COST, P13). | 28 Sep 2026 |
| J22 | **Validation pass 3 Should (J22), founder decision 28 Sep 2026: one-click tenant breach containment.** Rule YX-SECOPS-12. | 28 Sep 2026 |
| W-016 | **One lock answer on every company sign-in path (security review W-016).** Every company sign-in that checks a password or a one-time code counts its failures against the typed email or mobile number itself (the identifier lock: YukthiX's 10 failures lock it for 15 min, each later lock twice as long, up to 24 h), whether or not any account has it. While it is locked, every path, with or without the company named, gives the same answer: "Too many sign-in attempts" (HTTP 429 with the wait in seconds). A company's own lockout counter (its stricter numbers) is counted only by sign-ins that name the company, so it too depends only on what was typed. Sign-in without the company named no longer counts the company counters of the accounts it finds: that made the lock reveal which emails have accounts. Trade-off: a company stricter than YukthiX's default gets its numbers on its own sign-in page; without the company named, YukthiX's numbers apply. A complete sign-in clears the identifier lock and that device keeps its own counter (a stranger cannot lock the owner out there); an admin unlock clears it too; a break-glass account is never held by it on its company's page (YX-IAM-04). | 8 Oct 2026 |

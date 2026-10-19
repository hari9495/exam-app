# YukthiX go-live checklist

Things deliberately left for launch. Development runs locally until then (test keys, `localhost`, in-memory SMS sink). Tick each item before the first real customer.

| # | Item | What to do | Notes |
|---|---|---|---|
| 1 | Domain | Buy the app domain (e.g. `app.yukthix.com`) and point it at Cloudflare | Needed by Turnstile, SSO redirect URLs, passkeys (WebAuthn RP ID), email sender, cookies |
| 2 | Cloudflare Turnstile | Dashboard › Turnstile › Add widget (name "YukthiX sign-in", hostname = the domain, mode Managed). Put the **secret** in the API host's secret settings as `TURNSTILE_SECRET_KEY` and the **site key** as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Never paste the secret into chat or commit it. Local dev uses Cloudflare's always-pass test keys |
| 3 | New-country sign-in alerts | Run the app behind Cloudflare's proxy, then set `GEO_COUNTRY_HEADER=cf-ipcountry` | Only set it when traffic really goes through Cloudflare, or the header can be forged |
| 4 | SMS provider + DLT | Sign up with one SMS gateway (any; the generic HTTP adapter fits MSG91, Gupshup, Kaleyra, Exotel, Textlocal; Twilio for other countries). Register YukthiX on a DLT portal: entity (company PAN/GST), sender header (6 letters), OTP template text | DLT approval takes 2–7 days. Until done, codes go by email only |
| 4a | Shared SMS account = Zoho CPaaS | Zoho CPaaS account in the **India DC**; DLT registration through Zoho (sender + OTP template). A YukthiX platform admin adds it as the shared `http` account (example config in `docs/sms-gateways/examples.json`), types the API token as the `token` secret, sends a test, and points Zoho's delivery-report webhook at the account's callback URL | Confirm Zoho's reply format (success value and message-id path) against their API reference once access is granted |
| 5 | WhatsApp (optional) | Each company connects its own WhatsApp Business number (P04 Q2) | Meta bills the company directly |
| 6 | Continue with Google / Microsoft | Create YukthiX's own OAuth apps in Google Cloud and Microsoft Entra (multi-tenant `common`, optional claims `email` + `xms_edov`) with redirect URIs `<API_ORIGIN>/api/v1/auth/social/google/callback` and `.../microsoft/callback`; set `YX_GOOGLE_CLIENT_ID/SECRET` and `YX_MICROSOFT_CLIENT_ID/SECRET` (details below). Never set `YX_MOCK_IDP_URL` | Buttons stay hidden until configured; each company turns them on in Settings › Security. Per-company IdPs are still configured by each company's admin |
| 7 | Database roles | Create the owner, app login and `app_runtime` roles before the first `prisma migrate deploy` (see README › Database) | The app role must not be superuser or BYPASSRLS |
| 8 | Secrets | JWT secrets, TOTP encryption key, OTP HMAC key, org-secrets key, DB/Redis passwords in a secrets manager | Rotate per schedule (P12 YX-SECOPS-03) |
| 9 | After first deploy | Everyone signs in once more (old tokens had no session); admins review email domains on existing SSO providers | From the login PR (#129) |
| 10 | Security programme | Pen test before the payroll pilot; incident plan and CERT-In 6-hour process; log retention ≥ 1 year | P12 §8 |
| 11 | Company sign-in addresses | Set YX_BASE_DOMAIN, wildcard DNS + wildcard TLS certificate, and have SSO companies verify their email domains (details below) | Needed once the domain (item 1) exists; until then sign-in is email-first |
| 12 | Real visitor IP behind the proxy | Set `TRUST_PROXY=true` only when the API sits behind exactly ONE trusted proxy hop (e.g. nginx); with Cloudflare + a load balancer, change the trust setting to the real hop count or Cloudflare's published IP ranges, then check Login activity shows real addresses, not the proxy's | Wrong setting = every visitor shares the proxy's IP (lockouts and rate limits hit everyone) or IPs can be forged |
| 13 | Payroll rules marked "verify" (M03 §19.3, 5c-D3) | The compliance owner and the partner CA check the subsistence allowance (IESO Act s.10A: half for the first 90 days, three-fourths after), maternity benefit (Maternity Benefit Act s.5: the average daily wage, up to 26 weeks; ESI pays where it covers her) and injury pay (Employees' Compensation Act s.4(1)(d): half-monthly 25% of monthly wages after the waiting period; ESI pays where it covers) in `apps/api/src/statutory/packs/in-run.json`, then publish a version without the verify mark through the console (two staff) | Until then every payslip line from them shows "verify". Injury days are entered after the legal waiting period (nothing deducts it automatically) |
| 14 | Minimum-wage data still open (M03 §19.3, 5c-D1) | Load Uttar Pradesh minimum wages and the Tamil Nadu dearness allowance for the year from the official orders (`scripts/load-min-wages.ts`, two staff) | Until then UP falls back to the national floor and Tamil Nadu is checked on its basic rate, with a warning |
| 15 | The pilot customer's bank file format (M03 §19.5, 5d-D1) | Get a real sample bulk-payment file from the pilot customer's bank, check it, and load its layout as a bank-format rule set (two staff); set it on the pilot's pay groups | Until then bank files use the generic NEFT / RTGS XLSX format |
| 16 | TDS File Validation Utility (M03 §19.8, 5f-D1) — **files obtained 10 Oct 2026** | Source: https://tinpan.proteantech.in/downloads/e-tds/eTDS-download-regular.html. `TDS_STANDALONE_FVU_9.5.zip` (returns up to FY 2025-26) SHA-256 `7b549a29e9682d89acf88ecc0b53732c794a8700a474ee8e52d7c8bd2912ed0c`; `TDS_STANDALONE_FVU_1.2.zip` (from TY 2026-27) SHA-256 `21f7a5a45b42cdd2c952aa633a0049d6c81612e87d43d1d02720bd781943c06d`. Kept outside git; the API checks the hash before each use (`FVU_RELEASES` in `apps/api/src/statutory/fvu.ts`). Worker: `FVU_DIR` (the ZIPs), `FVU_JRE_IMAGE` pinned by digest (tested with `eclipse-temurin@sha256:207ecae0b2b104dfc6dfa763d1e9cd2041cb344800a180e24cb1a28ed533ff90`, 17-jre), `FVU_ARGS`. Open: the FVU's unattended command-line contract is undocumented (see the DECISION NEEDED in `fvu.ts`); get it from Protean or have filers run the FVU themselves. Then validate one real return and compare with the published file format. A later FVU release means a new download, a new hash, a code change to `FVU_RELEASES` and a review | Until then the fake validator is used in development and CI, and production refuses to validate a return |
| 17 | Statutory data for the compliance owner (M03 §19.8, 5f-D3) | Confirm against the portals: each state's PT and LWF return layout, the PF (para 32A) and ESI (reg. 31C) damages rates, the register formats per state (Code on Wages forms), and the PF ELI fields in the ECR (ELI is built later) | The files and rule sets stay marked verify |
| 18 | FVU command-line specification (M03 §19.9, 5g-D1) | Ask Protean (NSDL) for the FVU's unattended command-line contract (arguments, result files, exit codes); then set `FVU_DIR`, `FVU_JRE_IMAGE` and `FVU_ARGS` and validate one real return in the sandbox | Until then the filer runs the FVU on their own computer and uploads the .fvu, which YukthiX checks against the return it made |
| 19 | Exit tax exemptions and heirs (M03 §19.9, 5g-D2, 5g-D3) | The partner CA confirms the `IN.EXIT-EXEMPT` limits for both Acts and that no TDS applies to heirs' shares of a death-in-service settlement | The rule set and the settlement stay marked verify |
| 20 | Receipt OCR worker (M05-BUILD-DESIGN §14.6, §22.2) — **built 12 Oct 2026 from approved downloads** | Image from `apps/ocr-worker` (base `python:3.12-slim-bookworm@sha256:2ed6491b93cd49272ee6de2b5a38440c3448360322c089fc23e370722d74179d`; Python packages by SHA-256 from PyPI in `requirements.lock` and `models.lock`; 43 Debian packages at exact versions from snapshot.debian.org `20261012T000000Z` in `debian.lock`; models from huggingface.co/PaddlePaddle at commits `0d63e78e2b680928f6b1747d76a08db6e645efb7` (PP-OCRv5_mobile_det), `267c36e24c331595590fe7bd72bde2436fd286f2` (en_PP-OCRv5_mobile_rec), `cd237a44b0e359d4fe38310a416203cf7403faa5` (PP-LCNet_x1_0_textline_ori), file SHA-256s in §22.2). Before go-live: build in CI from the same pins, run it isolated (network none, non-root, read-only, limits) with a spool directory shared with the API, set `EXPENSE_OCR_ADAPTER=paddle-worker` and `EXPENSE_OCR_SPOOL`, run the contract test (`apps/api/test/ocr-worker.e2e-spec.ts`) against it, and check the THIRD-PARTY-LICENSES file ships. Also set `EINVOICE_QR_PUBLIC_KEYS` from the e-invoice portal's published keys | Until then claims use manual entry (`EXPENSE_OCR_ADAPTER=none`); tests and CI use the fake reader |
| 21 | Expense exchange-rate feeds (M05-BUILD-DESIGN §14.2, §22 D2) — **built 12 Oct 2026 with the company rate table only** | FBIL and ECB imports are not built or switched on until their reuse terms are confirmed in writing. ECB's site says its euro reference rates are "for information purposes only" and discourages using them for transactions, and allows reuse with the ECB cited as source; FBIL's reuse terms could not be confirmed from its site. **Founder decision 12 Oct 2026:** the pilot uses the company rate table; before the global launch choose a paid, licensed FX feed whose terms allow use for payments, add it as a feed and record its source and terms here; ECB and FBIL stay off | Finance keeps the company rate table (Settings › Expenses › Exchange rates); employees can enter their card or bank rate with the statement, flagged when more than 3 % off |


## Sign-in without a company code (founder decision 7 Oct 2026)

- [ ] **Platform email sender.** Set `SMTP_FROM_ADDRESS` on the API to a YukthiX address on a domain with SPF and DKIM
  (e.g. `YukthiX <no-reply@yukthix.app>`). Without it the sender falls back to `no-reply@exam-platform.test`, which
  real mailboxes reject or mark as spam. Sign-in codes, password resets and account emails all use it (SI-09, 19 Oct 2026).

- [ ] **Base domain.** Set `YX_BASE_DOMAIN` (e.g. `yukthix.app`) on the API. Each company then signs in at
      `https://<company slug>.yukthix.app`; the API takes the company from the Host / Origin only when it is
      exactly `<label>.yukthix.app` (never from `X-Forwarded-Host`) and allows those origins for CORS.
- [ ] **Wildcard DNS and TLS.** `*.yukthix.app` (and the apex) point at the web app, with a wildcard certificate.
      Reserved names (`www`, `api`, `app`, `admin`, `auth`, `login`, `mail`, `status`, `static`, `cdn`, `docs`,
      `help`) are never a company; do not issue company slugs with those names.
- [ ] **Company email domains.** Before a company's staff are sent straight to its identity provider by email
      domain, an admin verifies the domain: Settings › People & Access › Security › Single sign-on lists each
      provider domain with the TXT record (`yukthix-domain-verification=…`) to publish on the domain itself,
      then **Check record** (a step-up action; API `POST /security/identity-providers/domains/verify`). Public mail domains
      (Gmail, Outlook, Yahoo… and throwaway domains) can never be mapped or verified. A domain verified by two
      companies does not auto-route (those people use the company address or the password step).
      Verified domains are re-checked daily (`DOMAIN_RECHECK_CRON`, default `30 5 * * *` UTC): after
      `DOMAIN_RECHECK_MAX_FAILURES` (default 3) misses in a row the domain **lapses** -- it stops routing, the
      company's admins are emailed, the lapse is audited (`identity_provider.domain_lapsed`) and Settings ›
      Security shows it as Lapsed until an admin checks the record again. Transient DNS errors never count.
- [ ] **YukthiX platform staff** sign in only at `POST /auth/platform/login` (the classic sign-in page with the
      Organization box left empty). The company sign-in -- password, one-time code, company picker,
      forgot-password, SSO -- never reaches a staff account, even one sharing an email and password with a
      company account. Staff use a hardware security key as their second factor (P12 Q7).
- [ ] **SSO-only companies** must verify their domain (or their staff use the company address), otherwise
      email-first sign-in stops at the password step, which SSO-only refuses.
- [ ] **Continue with Google / Microsoft (checklist item 6).** YukthiX's own OAuth apps, one each:
      - Google Cloud › APIs & Services › Credentials › OAuth client (Web application), consent screen in
        production (scopes `openid email profile`), redirect URI `<API_ORIGIN>/api/v1/auth/social/google/callback`.
      - Microsoft Entra admin center › App registrations: multi-tenant + personal accounts (`common`), platform
        Web, redirect URI `<API_ORIGIN>/api/v1/auth/social/microsoft/callback`; add the optional ID-token claims
        `email` and `xms_edov` (without `xms_edov` only Microsoft work accounts on a domain the company verified,
        or already-linked accounts, can sign in -- the plain `email` claim is never trusted).
      - Set `YX_GOOGLE_CLIENT_ID` / `YX_GOOGLE_CLIENT_SECRET` and `YX_MICROSOFT_CLIENT_ID` /
        `YX_MICROSOFT_CLIENT_SECRET` in the API host's secret settings. A button is hidden until both of its values
        are set. **Never** set `YX_MOCK_IDP_URL` (the local mock) in production: the API refuses to start with it.
      - Each company turns them on in Settings › Security (off by default; SSO-only turns both off).
- [ ] **Remembered company.** After a sign-in the device keeps an HttpOnly, signed `yx_company` cookie (180 days)
      so the screen says "Signing in to <company> · Not your company?". It is signed with
      `ORG_SECRETS_ENCRYPTION_KEY` (HKDF, purpose `remembered-company`): rotating that key forgets every device.

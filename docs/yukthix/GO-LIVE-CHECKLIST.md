# YukthiX go-live checklist

## Sign-in without a company code (founder decision 7 Oct 2026)

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

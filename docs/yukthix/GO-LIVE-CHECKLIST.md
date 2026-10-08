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
| 12 | Attachment virus scanning (Service Desk) | Run ClamAV `clamd` as a side container with `freshclam` updating signatures hourly; set `SD_CLAMD_HOST` / `SD_CLAMD_PORT` on the API. Never set `SD_SCANNER=dev-fake` (the laptop stand-in that only knows the EICAR test file; the API refuses it in production). Configure blob storage (`AZURE_STORAGE_*`) so desk files never use the laptop folder `.desk-files` | Without a scanner every desk file stays "being checked" and cannot be opened (fail closed). M14 §14.2 |
| 13 | Inbound desk mail provider (Service Desk, D5) | Pick the mail provider with hosting (P13): it receives mail for the desk addresses and posts the raw MIME to `POST <API_ORIGIN>/api/v1/desk/inbound/email/<company id>/<mailbox token>` with the headers `X-YukthiX-Timestamp`, `X-YukthiX-Signature` (`sha256=` HMAC of timestamp, envelope and raw bytes with the mailbox secret shown once in Desk set-up › Email) and `X-Envelope-Ip / -Helo / -From / -To`. Put the provider's sending IPs in `SD_INBOUND_ALLOWED_IPS` (comma list, CIDR allowed). Point MX records of the hosted desk domain at it | The API checks SPF / DKIM / DMARC / ARC itself; the provider's own verdict is never used. M14 §9.1, §14.3 |
| 14 | Desk sending domains and DKIM (Service Desk) | Publish YukthiX's SPF include (set `SD_SPF_INCLUDE`, default `_spf.yukthix.com`) from the outbound mail service. Each company adds its domain in Desk set-up › Email and publishes the three TXT records shown (SPF include, DKIM `yukthix._domainkey`, DMARC). Move the DKIM private keys from the database (encrypted with the org-secrets key) to the secrets manager | Until a domain passes, desk mail goes from the YukthiX address with the desk name. No read receipts or tracking pixels (D9). Bounces and complaints come back to the desk address as delivery reports |
| 15 | Company mailboxes: Microsoft 365, Gmail, IMAP (Service Desk) | Each company that connects its own mailbox registers its own app: Microsoft Entra app registration with application permission `Mail.Read` limited to the mailbox by an application access policy (`New-ApplicationAccessPolicy`); Google Cloud OAuth client with `gmail.readonly` and a refresh token for the mailbox; or an IMAP app password. The OAuth start / callback screens (§12.1) are still to build: today the admin pastes the values (step-up, stored encrypted) | Polled every minute (`sd-mail-poll`). IMAP hosts must resolve to public addresses (SSRF guard) |
| 16 | Customer portal bot check (Service Desk) | The portal sign-in and open-request forms use the same Cloudflare Turnstile keys as item 2 (`TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); add each company's portal host name to the widget when custom domains arrive | Without the secret the check is off (laptops). Codes and open requests are also limited per email and per IP (P12 limits) |


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

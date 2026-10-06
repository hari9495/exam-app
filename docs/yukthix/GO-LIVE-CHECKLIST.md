# YukthiX go-live checklist

## Sign-in without a company code (founder decision 7 Oct 2026)

- [ ] **Base domain.** Set `YX_BASE_DOMAIN` (e.g. `yukthix.app`) on the API. Each company then signs in at
      `https://<company slug>.yukthix.app`; the API takes the company from the Host / Origin only when it is
      exactly `<label>.yukthix.app` (never from `X-Forwarded-Host`) and allows those origins for CORS.
- [ ] **Wildcard DNS and TLS.** `*.yukthix.app` (and the apex) point at the web app, with a wildcard certificate.
      Reserved names (`www`, `api`, `app`, `admin`, `auth`, `login`, `mail`, `status`, `static`, `cdn`, `docs`,
      `help`) are never a company; do not issue company slugs with those names.
- [ ] **Company email domains.** Before a company's staff are sent straight to its identity provider by email
      domain, an admin verifies the domain: Settings › Security › SSO providers lists the TXT record
      (`yukthix-domain-verification=…`) to publish on the domain itself, then **Verify**. Public mail domains
      (Gmail, Outlook, Yahoo… and throwaway domains) can never be mapped or verified. A domain verified by two
      companies does not auto-route (those people use the company address or the password step).
- [ ] **SSO-only companies** must verify their domain (or their staff use the company address), otherwise
      email-first sign-in stops at the password step, which SSO-only refuses.
- [ ] **Remembered company.** After a sign-in the device keeps an HttpOnly, signed `yx_company` cookie (180 days)
      so the screen says "Signing in to <company> · Not your company?". It is signed with
      `ORG_SECRETS_ENCRYPTION_KEY` (HKDF, purpose `remembered-company`): rotating that key forgets every device.

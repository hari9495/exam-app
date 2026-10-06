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
| 6 | Google / Microsoft SSO | Create OAuth apps in Google Cloud and Microsoft Entra with the real redirect URL | Per-company IdPs are configured by each company's admin in Settings › Security |
| 7 | Database roles | Create the owner, app login and `app_runtime` roles before the first `prisma migrate deploy` (see README › Database) | The app role must not be superuser or BYPASSRLS |
| 8 | Secrets | JWT secrets, TOTP encryption key, OTP HMAC key, org-secrets key, DB/Redis passwords in a secrets manager | Rotate per schedule (P12 YX-SECOPS-03) |
| 9 | After first deploy | Everyone signs in once more (old tokens had no session); admins review email domains on existing SSO providers | From the login PR (#129) |
| 10 | Security programme | Pen test before the payroll pilot; incident plan and CERT-In 6-hour process; log retention ≥ 1 year | P12 §8 |

-- P12 Part 1d: one-time-code (OTP) sign-in by email or mobile number, and OTP as a fallback
-- second factor (P12 §3 authenticators, YX-IAM-03; M04 Q2 mobile-number OTP; P04 YX-NTF-13).
-- The codes themselves never reach the database: they live hashed (HMAC) in Redis for 5 minutes.

-- A user's own mobile number, usable for OTP only once verified by a code sent to it.
ALTER TABLE "users"
  ADD COLUMN "mobile_number" VARCHAR(16),
  ADD COLUMN "mobile_verified_at" TIMESTAMPTZ(3);
ALTER TABLE "users"
  -- E.164 only (normalised by libphonenumber-js before it is stored).
  ADD CONSTRAINT "users_mobile_number_e164_check" CHECK ("mobile_number" IS NULL OR "mobile_number" ~ '^\+[1-9][0-9]{6,14}$'),
  ADD CONSTRAINT "users_mobile_verified_check" CHECK ("mobile_verified_at" IS NULL OR "mobile_number" IS NOT NULL);
-- A verified number signs in exactly one account per company.
CREATE UNIQUE INDEX "users_organization_id_verified_mobile_key" ON "users"("organization_id", "mobile_number")
  WHERE "mobile_verified_at" IS NOT NULL;

-- Which OTP sign-in channels the company allows (AAL1, P12 §3). Empty = OTP sign-in off, the default.
ALTER TABLE "tenant_security_policies"
  ADD COLUMN "otp_sign_in_channels" VARCHAR(16)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(16)[];
ALTER TABLE "tenant_security_policies"
  ADD CONSTRAINT "tsp_otp_sign_in_channels_check" CHECK ("otp_sign_in_channels" <@ ARRAY['email', 'sms', 'whatsapp']::VARCHAR(16)[]);

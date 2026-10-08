-- W-005: YukthiX platform staff (super_admin) never belong to a company. Every company sign-in path
-- (a company named by orgSlug, web address or remembered company; SAML / OIDC; forgot-password)
-- looks accounts up within one company, so with this rule no such path can reach a staff account,
-- whatever the code does. Staff sign in only at POST /auth/platform/login (/staff/sign-in).
ALTER TABLE "users" ADD CONSTRAINT "users_staff_never_in_a_company_check"
  CHECK ("role" <> 'super_admin' OR "organization_id" IS NULL);

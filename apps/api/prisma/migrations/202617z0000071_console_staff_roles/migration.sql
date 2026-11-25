-- YukthiX console: staff roles (founder answers 1058 and 1086, 12 Nov 2026).
-- Five staff roles, each a fixed set of the console's platform.* keys: Support agent, Customer success, Rules editor,
-- Finance and Security lead. Nobody holds every key by default any more: the staff role (super_admin) no longer grants
-- the platform.* keys; a member of staff holds the keys of the roles they were given. Only a Security lead changes
-- roles (API: the security key again; audited), never their own, and the last active Security lead keeps the role.
-- Company roles can never hold a platform key (checked here as well as in the API).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.staff.manage', 'Security lead: give and take the YukthiX staff roles (YukthiX staff)')
ON CONFLICT DO NOTHING;

-- The fixed keys of each role (changed only by a migration).
CREATE TABLE "platform_role_keys" (
    "role" VARCHAR(20) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    CONSTRAINT "platform_role_keys_pkey" PRIMARY KEY ("role", "key"),
    CONSTRAINT "platform_role_keys_role_check" CHECK ("role" IN ('support_agent', 'customer_success', 'rules_editor', 'finance', 'security_lead')),
    CONSTRAINT "platform_role_keys_key_check" CHECK ("key" LIKE 'platform.%')
);
INSERT INTO "platform_role_keys" ("role", "key") VALUES
  ('support_agent', 'platform.companies.view'),
  ('support_agent', 'platform.support_desk.work'),
  ('support_agent', 'platform.support.request'),
  ('customer_success', 'platform.companies.view'),
  ('customer_success', 'platform.companies.manage'),
  ('customer_success', 'platform.customers.success'),
  ('customer_success', 'platform.news.manage'),
  ('rules_editor', 'platform.statutory.manage'),
  ('finance', 'platform.companies.view'),
  ('finance', 'platform.plans.manage'),
  ('security_lead', 'platform.companies.view'),
  ('security_lead', 'platform.companies.manage'),
  ('security_lead', 'platform.channels.manage'),
  ('security_lead', 'platform.audit.view'),
  ('security_lead', 'platform.staff.manage');

-- Who holds which role. Only YukthiX staff accounts (no company, the staff role).
CREATE TABLE "platform_staff_roles" (
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_staff_roles_pkey" PRIMARY KEY ("user_id", "role"),
    CONSTRAINT "platform_staff_roles_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "platform_staff_roles_role_check" CHECK ("role" IN ('support_agent', 'customer_success', 'rules_editor', 'finance', 'security_lead'))
);

CREATE FUNCTION platform_staff_roles_staff_only() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND organization_id IS NULL AND role = 'super_admin') THEN
    RAISE EXCEPTION 'YX_STAFF_ONLY: staff roles are for YukthiX staff accounts only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_staff_roles_staff_only BEFORE INSERT OR UPDATE ON "platform_staff_roles" FOR EACH ROW EXECUTE FUNCTION platform_staff_roles_staff_only();

-- Read only outside any company (staff on their platform session); written only by the function below.
ALTER TABLE "platform_role_keys" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "platform_staff_roles" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_read ON "platform_role_keys" FOR SELECT USING ((SELECT app_current_org()) IS NULL);
CREATE POLICY platform_read ON "platform_staff_roles" FOR SELECT USING ((SELECT app_current_org()) IS NULL);
CREATE POLICY owner_write ON "platform_role_keys" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY owner_write ON "platform_staff_roles" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "platform_role_keys" FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "platform_staff_roles" FROM app_runtime;

/** A Security lead sets another member of staff's roles: never their own; the last active Security lead keeps it. */
CREATE FUNCTION platform_set_staff_roles(p_user UUID, p_roles TEXT[], p_actor UUID) RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  before TEXT[];
BEGIN
  IF NOT app_is_super_admin() OR p_actor IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff change staff roles'; END IF;
  -- One change at a time, so two leads cannot remove each other at once.
  LOCK TABLE platform_staff_roles IN SHARE ROW EXCLUSIVE MODE;
  IF p_actor = p_user THEN RAISE EXCEPTION 'YX_STAFF_SELF: nobody changes their own roles'; END IF;
  IF NOT EXISTS (SELECT 1 FROM platform_staff_roles r JOIN users u ON u.id = r.user_id WHERE r.user_id = p_actor AND r.role = 'security_lead' AND u.status = 'active') THEN
    RAISE EXCEPTION 'YX_STAFF_NOT_LEAD: only a Security lead changes staff roles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND organization_id IS NULL AND role = 'super_admin') THEN
    RAISE EXCEPTION 'YX_STAFF_NOT_FOUND: no such member of staff';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_roles, '{}')) x WHERE x NOT IN ('support_agent', 'customer_success', 'rules_editor', 'finance', 'security_lead')) THEN
    RAISE EXCEPTION 'YX_STAFF_ROLE: unknown role';
  END IF;
  SELECT coalesce(array_agg(role ORDER BY role), '{}') INTO before FROM platform_staff_roles WHERE user_id = p_user;
  IF 'security_lead' = ANY(before) AND NOT ('security_lead' = ANY(coalesce(p_roles, '{}')))
     AND NOT EXISTS (SELECT 1 FROM platform_staff_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'security_lead' AND r.user_id <> p_user AND u.status = 'active') THEN
    RAISE EXCEPTION 'YX_STAFF_LAST_LEAD: the last Security lead keeps the role';
  END IF;
  DELETE FROM platform_staff_roles WHERE user_id = p_user AND role <> ALL(coalesce(p_roles, '{}'));
  INSERT INTO platform_staff_roles (user_id, role, granted_by) SELECT p_user, x, p_actor FROM unnest(coalesce(p_roles, '{}')) x ON CONFLICT DO NOTHING;
  RETURN before;
END $$;
REVOKE ALL ON FUNCTION platform_set_staff_roles(UUID, TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_set_staff_roles(UUID, TEXT[], UUID) TO app_runtime;

-- Moving existing staff (nobody is locked out): every staff account is a Security lead, plus the roles matching what its
-- audit trail shows it did. Rules editor: drafted, reviewed or published statutory rules. Support agent: support sessions,
-- going into a company, or Support desk tickets. Customer success: messages to company admins, customer-success
-- settings, What's new entries or trial extensions. Finance: prices.
INSERT INTO "platform_staff_roles" ("user_id", "role")
SELECT u.id, 'security_lead' FROM users u WHERE u.organization_id IS NULL AND u.role = 'super_admin'
ON CONFLICT DO NOTHING;
INSERT INTO "platform_staff_roles" ("user_id", "role")
SELECT DISTINCT u.id, m.role
FROM users u
JOIN audit_logs a ON a.actor_user_id = u.id
JOIN (VALUES
  ('rules_editor', 'platform.statutory.%'),
  ('support_agent', 'support_session.%'),
  ('support_agent', 'super_admin.org_switch_in'),
  ('support_agent', 'desk.%'),
  ('customer_success', 'platform.message.%'),
  ('customer_success', 'platform.cs.%'),
  ('customer_success', 'platform.whats_new.%'),
  ('customer_success', 'platform.company.trial_extended'),
  ('finance', 'platform.price.%')
) AS m(role, pattern) ON a.action LIKE m.pattern
WHERE u.organization_id IS NULL AND u.role = 'super_admin'
ON CONFLICT DO NOTHING;

-- No one gets every key by default: the staff role keeps only its non-console keys.
DELETE FROM "role_permissions" WHERE "role" = 'super_admin' AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" LIKE 'platform.%');

-- A company role never holds a platform key (the API refuses them too).
ALTER TABLE "permission_profiles" ADD CONSTRAINT "permission_profiles_no_platform_keys" CHECK ("permissions_json" !~ '"platform[.:]');
ALTER TABLE "org_role_permissions" ADD CONSTRAINT "org_role_permissions_no_platform_keys" CHECK ("permissions_json" !~ '"platform[.:]');

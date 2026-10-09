-- Access, visibility and privacy (step 2d, P02 §4.1–4.6): scoped role grants (§4.2–4.3, YX-SEC-02/03/15),
-- the record scope function every people read goes through (§4.3, YX-SEC-05/06), department heads (P01 §4.3,
-- YX-SEC-04), and the employee's Personal, Confidential and Special data (§4.4, YX-SEC-07/08/13; P01 §4.4
-- employee_identifiers; M01 §3.1, Q4) with its self-service change requests (§4.5).
--
-- Every table: organization_id NOT NULL + forced RLS (YX-ORG-14) and composite (organization_id, …) keys,
-- so no row can point at another company's row, even with the platform's RLS bypass.

-- ---------------------------------------------------------------------------------------------
-- Composite keys the grants point at.
CREATE UNIQUE INDEX "permission_profiles_organization_id_id_key" ON "permission_profiles"("organization_id", "id");

-- P02 §3 / §4.2: a role grant = user + role (a permission profile, cloned from a template or built from
-- scratch, Q5) + scope + optional dates. A user may hold several (YX-SEC-03); rights are their union. A grant
-- of a role holding Confidential access waits for a second admin's approval (§4.6, YX-SEC-11). Grants are
-- never deleted: revoking keeps the row (who held what, when).
CREATE TABLE "role_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_profile_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "legal_entity_id" UUID,
    "location_id" UUID,
    "department_id" UUID,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "granted_by" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "revoked_by" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_grants_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "role_grants_profile_fkey" FOREIGN KEY ("organization_id", "permission_profile_id") REFERENCES "permission_profiles"("organization_id", "id"),
    CONSTRAINT "role_grants_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "role_grants_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "role_grants_department_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "role_grants_scope_check" CHECK ("scope_type" IN ('tenant', 'legal_entity', 'location', 'department_subtree', 'all_reports', 'direct_reports')),
    -- Exactly the target the scope needs, nothing else.
    CONSTRAINT "role_grants_target_check" CHECK (
        ("legal_entity_id" IS NOT NULL) = ("scope_type" = 'legal_entity')
        AND ("location_id" IS NOT NULL) = ("scope_type" = 'location')
        AND ("department_id" IS NOT NULL) = ("scope_type" = 'department_subtree')),
    CONSTRAINT "role_grants_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "role_grants_status_check" CHECK ("status" IN ('pending', 'active', 'rejected', 'revoked')),
    CONSTRAINT "role_grants_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
    -- YX-SEC-11: nobody approves a grant they asked for or that is for themselves.
    CONSTRAINT "role_grants_four_eyes_check" CHECK ("decided_by" IS NULL OR ("decided_by" <> "user_id" AND "decided_by" IS DISTINCT FROM "granted_by"))
);
CREATE INDEX "role_grants_user_idx" ON "role_grants"("organization_id", "user_id") WHERE "status" = 'active';
CREATE INDEX "role_grants_profile_idx" ON "role_grants"("organization_id", "permission_profile_id");
REVOKE DELETE, TRUNCATE ON TABLE "role_grants" FROM app_runtime;

-- P01 §4.3: a department's head (implicit "Dept head @ department subtree" grant, P02 §3, YX-SEC-04).
ALTER TABLE "departments" ADD COLUMN "head_employee_id" UUID;
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_fkey" FOREIGN KEY ("organization_id", "head_employee_id") REFERENCES "employees"("organization_id", "id");
CREATE INDEX "departments_head_idx" ON "departments"("organization_id", "head_employee_id") WHERE "head_employee_id" IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- P02 §4.3 record scope: the date ranges in which `employee` falls inside one grant scope, as a multirange.
-- One definition used both for single records (time-aware, YX-SEC-06: only the periods in scope) and for
-- lists ("in scope on date D" is `@> D`). SECURITY INVOKER: it reads under the caller's RLS.
--   tenant              everything
--   legal_entity        the employee's employments with that entity
--   location            assignment slices at that location
--   department_subtree  assignment slices in that department or below it (materialised path)
--   direct_reports      assignment slices whose manager is the viewer
--   all_reports         the periods the viewer sat anywhere above the employee (chain walked over ranges)
--   dotted_line         assignment slices with the viewer as a dotted-line manager (view only, M01 Q5)
CREATE FUNCTION yx_scope_periods(p_org UUID, p_employee UUID, p_type TEXT, p_target UUID, p_viewer UUID)
RETURNS datemultirange LANGUAGE plpgsql STABLE AS $$
DECLARE r datemultirange;
BEGIN
  IF p_type = 'tenant' THEN
    RETURN datemultirange(daterange(NULL, NULL));
  ELSIF p_type = 'legal_entity' THEN
    SELECT range_agg(daterange(m.joined_on, m.exited_on, '[]')) INTO r FROM employments m
    WHERE m.organization_id = p_org AND m.employee_id = p_employee AND m.legal_entity_id = p_target;
  ELSIF p_type = 'location' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r FROM employee_assignments a
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND a.location_id = p_target;
  ELSIF p_type = 'department_subtree' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r
    FROM employee_assignments a
    JOIN departments d ON d.organization_id = a.organization_id AND d.id = a.department_id
    JOIN departments root ON root.organization_id = a.organization_id AND root.id = p_target
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND starts_with(d.path, root.path);
  ELSIF p_type = 'direct_reports' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r FROM employee_assignments a
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND a.manager_employee_id = p_viewer;
  ELSIF p_type = 'dotted_line' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r
    FROM employee_assignments a
    JOIN assignment_dotted_line_managers x ON x.organization_id = a.organization_id AND x.assignment_id = a.id
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND x.manager_employee_id = p_viewer;
  ELSIF p_type = 'all_reports' THEN
    WITH RECURSIVE up(manager_id, period, depth) AS (
      SELECT a.manager_employee_id, daterange(a.valid_from, a.valid_to, '[]'), 1
      FROM employee_assignments a
      WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
      UNION ALL
      SELECT a.manager_employee_id, up.period * daterange(a.valid_from, a.valid_to, '[]'), up.depth + 1
      FROM up JOIN employee_assignments a
        ON a.organization_id = p_org AND a.employee_id = up.manager_id AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
       AND daterange(a.valid_from, a.valid_to, '[]') && up.period
      WHERE up.depth < 50 AND up.manager_id <> p_viewer AND up.manager_id <> p_employee
    )
    SELECT range_agg(period) INTO r FROM up WHERE manager_id = p_viewer;
  ELSE
    RAISE EXCEPTION 'unknown scope type %', p_type USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN COALESCE(r, '{}'::datemultirange);
END $$;
-- ponytail: computed per request from current rows (a reporting chain is a few levels deep); a closure
-- table refreshed on assignment changes (P02 §4.3) when lists of thousands are scoped by subtree.

-- ---------------------------------------------------------------------------------------------
-- P01 §4.4 / P02 §4.4 Personal class: kept apart from the employee row so it is only ever read on purpose.
CREATE TABLE "employee_personal_details" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date_of_birth" DATE,
    "gender" VARCHAR(20),
    "personal_email" CITEXT,
    -- E.164 (YX-ORG-28).
    "personal_phone" VARCHAR(16),
    "address_line1" VARCHAR(200),
    "address_line2" VARCHAR(200),
    "city" VARCHAR(100),
    -- ISO 3166-2 subdivision and ISO 3166-1 alpha-2 country (P01 §4.4, G3).
    "state_code" VARCHAR(6),
    "postal_code" VARCHAR(12),
    "country" CHAR(2),
    -- P02 Q4 / YX-SEC-17: the employee hides their birthday from the directory.
    "hide_birthday" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_personal_details_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "employee_personal_details_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_personal_details_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    -- YX-ORG-29: the starter gender list.
    CONSTRAINT "employee_personal_details_gender_check" CHECK ("gender" IS NULL OR "gender" IN ('female', 'male', 'transgender', 'non_binary', 'prefer_not_to_say')),
    CONSTRAINT "employee_personal_details_email_check" CHECK ("personal_email" IS NULL OR "personal_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT "employee_personal_details_phone_check" CHECK ("personal_phone" IS NULL OR "personal_phone" ~ '^\+[1-9][0-9]{6,14}$'),
    CONSTRAINT "employee_personal_details_state_check" CHECK ("state_code" IS NULL OR ("country" IS NOT NULL AND "state_code" ~ ('^' || "country" || '-[A-Z0-9]{1,3}$'))),
    CONSTRAINT "employee_personal_details_country_check" CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "employee_personal_details_dob_check" CHECK ("date_of_birth" IS NULL OR "date_of_birth" >= DATE '1900-01-01')
);

-- P01 §4.4 employee_identifiers (P02 §4.4 Confidential / Special): every value encrypted (AES-256-GCM,
-- bound to the company and employee), a keyed hash for duplicate checks (YX-EMP-02) and the last four for
-- masked display. Aadhaar is Special (YX-SEC-08). Changed only through approved requests (YX-SEC-13).
CREATE TABLE "employee_identifiers" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "legal_name" VARCHAR(200),
    "pan_enc" TEXT,
    "pan_hash" CHAR(64),
    "pan_last4" CHAR(4),
    "aadhaar_enc" TEXT,
    "aadhaar_hash" CHAR(64),
    "aadhaar_last4" CHAR(4),
    "uan_enc" TEXT,
    "uan_hash" CHAR(64),
    "uan_last4" CHAR(4),
    "esic_enc" TEXT,
    "esic_hash" CHAR(64),
    "esic_last4" CHAR(4),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_identifiers_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "employee_identifiers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_identifiers_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_identifiers_pan_check" CHECK (("pan_enc" IS NULL) = ("pan_hash" IS NULL) AND ("pan_enc" IS NULL) = ("pan_last4" IS NULL)),
    CONSTRAINT "employee_identifiers_aadhaar_check" CHECK (("aadhaar_enc" IS NULL) = ("aadhaar_hash" IS NULL) AND ("aadhaar_enc" IS NULL) = ("aadhaar_last4" IS NULL)),
    CONSTRAINT "employee_identifiers_uan_check" CHECK (("uan_enc" IS NULL) = ("uan_hash" IS NULL) AND ("uan_enc" IS NULL) = ("uan_last4" IS NULL)),
    CONSTRAINT "employee_identifiers_esic_check" CHECK (("esic_enc" IS NULL) = ("esic_hash" IS NULL) AND ("esic_enc" IS NULL) = ("esic_last4" IS NULL))
);
CREATE INDEX "employee_identifiers_pan_idx" ON "employee_identifiers"("organization_id", "pan_hash") WHERE "pan_hash" IS NOT NULL;
CREATE INDEX "employee_identifiers_aadhaar_idx" ON "employee_identifiers"("organization_id", "aadhaar_hash") WHERE "aadhaar_hash" IS NOT NULL;
REVOKE DELETE, TRUNCATE ON TABLE "employee_identifiers" FROM app_runtime;

-- M01 §3.1 / Q4: one salary account and an optional reimbursement account, each a dated fact: a change
-- closes the old row and opens a new one (history kept), usable for payouts only after the cooling period
-- (P02 §4.5, YX-SEC-13).
CREATE TABLE "employee_bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "holder_name" VARCHAR(200) NOT NULL,
    "account_enc" TEXT NOT NULL,
    "account_hash" CHAR(64) NOT NULL,
    "account_last4" CHAR(4) NOT NULL,
    "ifsc" CHAR(11) NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(3),
    "usable_from" TIMESTAMPTZ(3) NOT NULL,
    "request_id" UUID,

    CONSTRAINT "employee_bank_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_bank_accounts_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_bank_accounts_purpose_check" CHECK ("purpose" IN ('salary', 'reimbursement')),
    -- RBI IFSC: four letters, a zero, six letters or digits.
    CONSTRAINT "employee_bank_accounts_ifsc_check" CHECK ("ifsc" ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    CONSTRAINT "employee_bank_accounts_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);
CREATE UNIQUE INDEX "employee_bank_accounts_current_key" ON "employee_bank_accounts"("organization_id", "employee_id", "purpose") WHERE "valid_to" IS NULL;
CREATE INDEX "employee_bank_accounts_hash_idx" ON "employee_bank_accounts"("organization_id", "account_hash") WHERE "valid_to" IS NULL;
-- History is kept: a row is only ever closed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "employee_bank_accounts" FROM app_runtime;
GRANT UPDATE ("valid_to") ON TABLE "employee_bank_accounts" TO app_runtime;

-- P02 §4.5: bank account, PAN, Aadhaar, UAN, ESIC and legal name change through a request with old → new
-- and a second person's approval (YX-SEC-11/13). The proposed value is stored encrypted; the masked
-- before / after is what lists show.
CREATE TABLE "employee_profile_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "proposed_enc" TEXT NOT NULL,
    "proposed_display" JSONB NOT NULL,
    "current_display" JSONB,
    "reason" VARCHAR(500) NOT NULL,
    "override_reason" VARCHAR(500),
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_profile_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_profile_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_profile_requests_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_profile_requests_kind_check" CHECK ("kind" IN ('bank_salary', 'bank_reimbursement', 'pan', 'aadhaar', 'uan', 'esic', 'legal_name')),
    CONSTRAINT "employee_profile_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT "employee_profile_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
    -- YX-SEC-11: the requester never decides their own request.
    CONSTRAINT "employee_profile_requests_four_eyes_check" CHECK ("decided_by" IS NULL OR "status" = 'cancelled' OR "decided_by" <> "requested_by")
);
CREATE UNIQUE INDEX "employee_profile_requests_pending_key" ON "employee_profile_requests"("organization_id", "employee_id", "kind") WHERE "status" = 'pending';
CREATE INDEX "employee_profile_requests_status_idx" ON "employee_profile_requests"("organization_id", "status", "created_at");
REVOKE DELETE, TRUNCATE ON TABLE "employee_profile_requests" FROM app_runtime;

-- Tenant isolation (YX-ORG-14): the standard forced RLS + tenant_isolation policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_grants', 'employee_personal_details', 'employee_identifiers', 'employee_bank_accounts', 'employee_profile_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- Staffing desk, slice 2 (HIR-16 submissions to clients, HIR-17 placements and bench, HIR-21 vendors). Vendors are the
-- recruitment agencies that already exist (agencies, agency_jobs, agency_submissions, the /agency/[token] portal): this
-- adds their documents and tier, the share's rate cap, limits and masked client, and the vendor's quote with right to
-- represent, consent, the duplicate owner and an approved cap exception. A client job is an ordinary job pointing at a
-- staffing client and its rate-card line. Placements point at the client and the rate-card line (line_id plus the day);
-- the bench is the people between placements. Columns and new tables only; no data is written.
ALTER TABLE "agencies"
  ADD COLUMN "pan" VARCHAR(10),
  ADD COLUMN "gstin" VARCHAR(15),
  ADD COLUMN "tds_section" VARCHAR(8),
  ADD COLUMN "tier" VARCHAR(10),
  ADD COLUMN "agreement_signed_on" DATE,
  ADD COLUMN "bank_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "bank_verified_by" UUID;
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_tier_check" CHECK ("tier" IS NULL OR "tier" IN ('preferred', 'standard', 'probation'));

ALTER TABLE "agency_jobs"
  ADD COLUMN "rate_cap_paise" BIGINT,
  ADD COLUMN "max_submissions" INTEGER,
  ADD COLUMN "expires_on" DATE,
  ADD COLUMN "mask_client" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agency_jobs" ADD CONSTRAINT "agency_jobs_limits_check" CHECK (("rate_cap_paise" IS NULL OR "rate_cap_paise" > 0) AND ("max_submissions" IS NULL OR "max_submissions" BETWEEN 1 AND 100));

ALTER TABLE "agency_submissions"
  ADD COLUMN "quoted_rate_paise" BIGINT,
  ADD COLUMN "right_to_represent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consent" BOOLEAN NOT NULL DEFAULT false,
  -- Another vendor (or the company's own pipeline when null with owner_until set) holds the candidate for this job.
  ADD COLUMN "duplicate_of_agency_id" UUID,
  ADD COLUMN "owner_until" DATE,
  ADD COLUMN "cap_exception_reason" VARCHAR(500),
  ADD COLUMN "cap_exception_by" UUID,
  ADD COLUMN "cap_exception_at" TIMESTAMPTZ(3);

ALTER TABLE "jobs"
  ADD COLUMN "staffing_client_id" UUID,
  ADD COLUMN "staffing_line_id" UUID;
CREATE INDEX "jobs_staffing_client_idx" ON "jobs" ("organization_id", "staffing_client_id") WHERE "staffing_client_id" IS NOT NULL;

-- HIR-16: a person sent to a client contact for a client job. Never a pay rate here.
CREATE TABLE "staffing_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    -- Exactly one person: an employee (bench), a candidate (pipeline), or a vendor's candidate.
    "employee_id" UUID,
    "candidate_id" UUID,
    "agency_submission_id" UUID,
    "contact_id" UUID NOT NULL,
    "bill_rate_paise" BIGINT NOT NULL,
    "masked" BOOLEAN NOT NULL DEFAULT true,
    "stage" VARCHAR(14) NOT NULL DEFAULT 'submitted',
    "stage_entered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" VARCHAR(500),
    "rejected_reason" VARCHAR(500),
    "email_sent_at" TIMESTAMPTZ(3),
    "submitted_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_submissions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_submissions_person_check" CHECK ((("employee_id" IS NOT NULL)::int + ("candidate_id" IS NOT NULL)::int) = 1),
    CONSTRAINT "staffing_submissions_stage_check" CHECK ("stage" IN ('submitted', 'client_review', 'interview', 'selected', 'rejected')),
    CONSTRAINT "staffing_submissions_bill_check" CHECK ("bill_rate_paise" > 0),
    CONSTRAINT "staffing_submissions_reason_check" CHECK ("stage" <> 'rejected' OR "rejected_reason" IS NOT NULL)
);
-- One live submission per person per job (a rejected one may be sent again).
CREATE UNIQUE INDEX "staffing_submissions_person_key" ON "staffing_submissions" ("job_id", COALESCE("employee_id", "candidate_id")) WHERE "stage" <> 'rejected';
CREATE INDEX "staffing_submissions_org_idx" ON "staffing_submissions" ("organization_id", "stage");

-- HIR-17: a placement points at the client and the rate-card line; the bill (and own-payroll pay) rate is the line's on
-- the day. A vendor-supplied placement keeps the vendor's agreed rate instead of a pay rate.
CREATE TABLE "staffing_placements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "submission_id" UUID,
    "supply" VARCHAR(10) NOT NULL,
    "employee_id" UUID,
    "agency_id" UUID,
    "worker_name" VARCHAR(200) NOT NULL,
    "vendor_rate_paise" BIGINT,
    "start_on" DATE NOT NULL,
    "end_on" DATE NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "ended_reason" VARCHAR(20),
    "end_note" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_placements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_placements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_placements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_placements_supply_check" CHECK (("supply" = 'own' AND "employee_id" IS NOT NULL AND "agency_id" IS NULL AND "vendor_rate_paise" IS NULL) OR ("supply" = 'vendor' AND "agency_id" IS NOT NULL AND "employee_id" IS NULL AND "vendor_rate_paise" > 0)),
    CONSTRAINT "staffing_placements_dates_check" CHECK ("end_on" >= "start_on"),
    CONSTRAINT "staffing_placements_status_check" CHECK ("status" IN ('active', 'ended')),
    CONSTRAINT "staffing_placements_reason_check" CHECK ("ended_reason" IS NULL OR "ended_reason" IN ('client', 'performance', 'resigned', 'completed'))
);
-- One active placement per employee at a time.
CREATE UNIQUE INDEX "staffing_placements_employee_key" ON "staffing_placements" ("employee_id") WHERE "status" = 'active' AND "employee_id" IS NOT NULL;
CREATE INDEX "staffing_placements_org_idx" ON "staffing_placements" ("organization_id", "status", "end_on");

-- HIR-17 bench: an employee or contractor between placements.
CREATE TABLE "staffing_bench" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "since_on" DATE NOT NULL,
    "until_on" DATE,
    "last_client_id" UUID,
    "note" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_bench_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_bench_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_bench_dates_check" CHECK ("until_on" IS NULL OR "until_on" >= "since_on")
);
-- One open bench spell per person.
CREATE UNIQUE INDEX "staffing_bench_open_key" ON "staffing_bench" ("employee_id") WHERE "until_on" IS NULL;
CREATE INDEX "staffing_bench_org_idx" ON "staffing_bench" ("organization_id", "until_on");

ALTER TABLE "staffing_submissions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_submissions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "staffing_placements" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_placements"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "staffing_bench" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_bench"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- Projects P-6, billing workbench and corrections (PRJ-05, PRJ-06; founder answers 1414 to 1416, 1621, 1622).
-- One invoice engine (1414): project invoices are the staffing desk's invoices (series, GST split, issue, credit notes,
-- PDF, portal, export); a line may name its project. project_billings records which unbilled item went on which invoice,
-- once (a unique source), so nothing is billed twice; a deleted draft frees its items. 1415: an account manager's
-- approval before finance issues (a setting, off by default). 1416: corrections of invoiced time (credit note,
-- supplementary invoice, adjustment line in a locked month; pay recovery a setting, default none).
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "staffing_invoices" ADD CONSTRAINT "staffing_invoices_org_id_key" UNIQUE ("organization_id", "id");
ALTER TABLE "staffing_invoices" ADD COLUMN "am_approved_by" UUID, ADD COLUMN "am_approved_at" TIMESTAMPTZ(3);
ALTER TABLE "staffing_invoice_lines" ADD COLUMN "project_id" UUID,
  ADD CONSTRAINT "staffing_invoice_lines_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id");
CREATE INDEX "staffing_invoice_lines_project_idx" ON "staffing_invoice_lines" ("organization_id", "project_id") WHERE "project_id" IS NOT NULL;

-- Time and material: the project's bill rate per hour (Projects finance sets it).
ALTER TABLE "timesheet_projects" ADD COLUMN "bill_rate_paise" BIGINT,
  ADD CONSTRAINT "timesheet_projects_bill_rate_check" CHECK ("bill_rate_paise" IS NULL OR "bill_rate_paise" > 0);

-- A corrected line (1416) keeps its reason like a reduced one.
ALTER TABLE "timesheet_lines" DROP CONSTRAINT "timesheet_lines_status_check",
  ADD CONSTRAINT "timesheet_lines_status_check" CHECK ("status" IS NULL OR "status" IN ('pending', 'approved', 'reduced', 'rejected', 'corrected'));
ALTER TABLE "timesheet_lines" DROP CONSTRAINT "timesheet_lines_reason_check",
  ADD CONSTRAINT "timesheet_lines_reason_check" CHECK ("status" NOT IN ('reduced', 'rejected', 'corrected') OR char_length(btrim(coalesce("reason", ''))) >= 3);

CREATE TABLE "project_corrections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "before_minutes" INTEGER NOT NULL,
    "after_minutes" INTEGER NOT NULL,
    "adjustment" BOOLEAN NOT NULL DEFAULT false,
    "effective_month" DATE NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "document_id" UUID,
    "document_kind" VARCHAR(14),
    "recovery_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_corrections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_corrections_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_corrections_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_corrections_changed_check" CHECK ("after_minutes" <> "before_minutes" AND "after_minutes" >= 0),
    CONSTRAINT "project_corrections_doc_check" CHECK ("document_kind" IS NULL OR "document_kind" IN ('credit_note', 'supplementary')),
    CONSTRAINT "project_corrections_reason_check" CHECK (char_length(btrim("reason")) >= 3)
);
CREATE INDEX "project_corrections_line_idx" ON "project_corrections" ("organization_id", "line_id");

CREATE TABLE "project_billings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_type" VARCHAR(10) NOT NULL,
    "source_id" VARCHAR(80) NOT NULL,
    "invoice_id" UUID NOT NULL,
    "minutes" INTEGER,
    "rate_paise" BIGINT,
    "amount_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_billings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_billings_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_billings_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_billings_invoice_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "staffing_invoices"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_billings_type_check" CHECK ("source_type" IN ('hours', 'milestone', 'retainer', 'expense', 'correction')),
    CONSTRAINT "project_billings_amount_check" CHECK ("amount_paise" >= 0)
);
-- Never billed twice: one row per source item.
CREATE UNIQUE INDEX "project_billings_source_key" ON "project_billings" ("organization_id", "source_type", "source_id");
CREATE INDEX "project_billings_invoice_idx" ON "project_billings" ("organization_id", "invoice_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_corrections', 'project_billings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
    EXECUTE format('CREATE POLICY portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;

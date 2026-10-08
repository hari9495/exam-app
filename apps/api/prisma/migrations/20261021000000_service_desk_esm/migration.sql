-- Service Desk phase 3b-2 (ESM), batch 1 (M14-BUILD-DESIGN §5.3; slices SD-2.01 … SD-2.05, SD-2.12):
--   the company question library (P18 field sets used by every desk);
--   catalogue items with a draft and immutable published versions (form, rich page, approvals, fulfilment plan),
--   an audience rule (P19), cost and delivery time;
--   order guides (a few questions → the right items);
--   request items: a cart is one request ticket per desk with one row per item, each with its own approval (P03),
--   stage and tasks;
--   tasks know the request item they fulfil;
--   permission keys for the catalogue, rules and integrations.
--
-- Every new table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, composite keys.

-- US-G-039: question sets defined once for the company, used by any desk's items (copied in at publish).
CREATE TABLE "sd_questionnaires" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "fields" JSONB NOT NULL DEFAULT '[]',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_questionnaires_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_questionnaires_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_questionnaires_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "sd_questionnaires_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_questionnaires_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_questionnaires" FROM app_runtime;

-- US-B-124 / US-G-042: an item a desk offers. The admin edits the draft; publishing makes a new immutable version
-- that new orders use (orders pin the version they were made from).
CREATE TABLE "sd_catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "short_text" VARCHAR(300),
    "state" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "current_version" INTEGER,
    -- P19 condition over the requester's profile; NULL = everyone who can raise to the desk.
    "audience" JSONB,
    "cost" DECIMAL(12, 2),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "delivery_days" SMALLINT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    -- The draft of the next version: { bodyHtml, media, form, approval, fulfilment }.
    "draft" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_catalog_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_catalog_items_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_catalog_items_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_catalog_items_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_catalog_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_catalog_items_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_catalog_items_category_fkey" FOREIGN KEY ("organization_id", "desk_id", "category_id") REFERENCES "sd_categories"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_catalog_items_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_catalog_items_state_check" CHECK ("state" IN ('draft', 'published', 'retired')),
    CONSTRAINT "sd_catalog_items_published_check" CHECK ("state" <> 'published' OR "current_version" IS NOT NULL),
    CONSTRAINT "sd_catalog_items_cost_check" CHECK ("cost" IS NULL OR "cost" >= 0),
    CONSTRAINT "sd_catalog_items_days_check" CHECK ("delivery_days" IS NULL OR "delivery_days" BETWEEN 0 AND 365)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_catalog_items" FROM app_runtime;

CREATE TABLE "sd_catalog_item_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    -- Cleaned rich text (allow-list) and links to pictures, video and documents (https only).
    "body_html" TEXT NOT NULL DEFAULT '',
    "media" JSONB NOT NULL DEFAULT '[]',
    -- P18 form with question-library sets already copied in.
    "form" JSONB NOT NULL,
    -- P03 steps (approvers, quorum, reminders, timeouts); [] = no approval.
    "approval" JSONB NOT NULL DEFAULT '[]',
    -- US-B-126: the fulfilment plan: tasks for several teams, each with its OLA.
    "fulfilment" JSONB NOT NULL DEFAULT '[]',
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_catalog_item_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_catalog_item_versions_key" UNIQUE ("organization_id", "item_id", "version"),
    CONSTRAINT "sd_catalog_item_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_catalog_item_versions_item_fkey" FOREIGN KEY ("organization_id", "desk_id", "item_id") REFERENCES "sd_catalog_items"("organization_id", "desk_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_catalog_item_versions" FROM app_runtime;

-- US-G-041: a few questions (role, location, …) and rules that add the right items to the cart.
CREATE TABLE "sd_order_guides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "form" JSONB NOT NULL,
    -- [{ id, when: P19 group over the answers, itemIds: [...] }]
    "rules" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_order_guides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_order_guides_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "sd_order_guides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_order_guides_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_order_guides" FROM app_runtime;

-- One ordered item inside a request ticket. stage: submitted → approval → fulfilment → delivered; or cancelled /
-- rejected. answers are the checked form answers (formulas included) of the pinned item version.
CREATE TABLE "sd_request_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "item_version" INTEGER NOT NULL,
    "quantity" SMALLINT NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "for_person_id" UUID NOT NULL,
    "stage" VARCHAR(10) NOT NULL DEFAULT 'submitted',
    "approval_request_id" UUID,
    "stage_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancel_reason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_request_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_request_items_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_request_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_request_items_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_request_items_version_fkey" FOREIGN KEY ("organization_id", "item_id", "item_version") REFERENCES "sd_catalog_item_versions"("organization_id", "item_id", "version"),
    CONSTRAINT "sd_request_items_person_fkey" FOREIGN KEY ("organization_id", "for_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_request_items_approval_fkey" FOREIGN KEY ("organization_id", "approval_request_id") REFERENCES "wf_requests"("organization_id", "id"),
    CONSTRAINT "sd_request_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20),
    CONSTRAINT "sd_request_items_stage_check" CHECK ("stage" IN ('submitted', 'approval', 'fulfilment', 'delivered', 'cancelled', 'rejected'))
);
CREATE INDEX "sd_request_items_ticket_idx" ON "sd_request_items"("organization_id", "ticket_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_request_items" FROM app_runtime;

-- US-B-126: a fulfilment task knows the request item it delivers (all done → the item is delivered).
ALTER TABLE "sd_tasks" ADD COLUMN "request_item_id" UUID,
  ADD CONSTRAINT "sd_tasks_request_item_fkey" FOREIGN KEY ("organization_id", "desk_id", "request_item_id") REFERENCES "sd_request_items"("organization_id", "desk_id", "id");

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14, §5.1); nothing of this is read through an outside portal session.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_questionnaires', 'sd_catalog_items', 'sd_catalog_item_versions', 'sd_order_guides', 'sd_request_items']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format('CREATE POLICY sd_portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;

-- §5.7: an ordered item (its answers) is visible exactly when its request ticket is (the ticket's own policy decides).
CREATE POLICY sd_visibility ON "sd_request_items" AS RESTRICTIVE
  USING (sd_system() OR EXISTS (SELECT 1 FROM sd_tickets t WHERE t.organization_id = sd_request_items.organization_id AND t.id = sd_request_items.ticket_id));

-- ---------------------------------------------------------------------------------------------
-- Permission keys (§6.2, 3b-2). Approvers need no key (P03: anyone a policy names); requesters order through their
-- implicit role.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'desk.catalog.manage', 'Set up the service catalogue, order guides and the question library'),
  (gen_random_uuid(), 'desk.rule.manage', 'Set up automation rules for a desk'),
  (gen_random_uuid(), 'desk.integration.manage', 'Set up webhooks that desk rules call (needs a fresh security check)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('desk.catalog.manage', 'desk.rule.manage', 'desk.integration.manage')
ON CONFLICT DO NOTHING;

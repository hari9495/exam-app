-- Batch C item 4 (answers 2500 to 2502): HR sees everyone's pending approvals and moves them to another approver.
-- One key, in the HR Admin template (granted with a legal-entity scope; template sync adds it to following roles).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'workflow.approvals.oversee', 'See everyone''s pending approvals in scope and move them to another approver (with a reason)')
ON CONFLICT DO NOTHING;

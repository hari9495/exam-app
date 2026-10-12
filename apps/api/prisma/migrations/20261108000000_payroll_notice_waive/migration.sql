-- Founder decision 5j-D2 (12 Oct 2026, M03 §19.10): waiving an unserved notice has its own key (HR Admin and Payroll Admin).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.notice.waive', 'Waive the recovery of an unserved notice period for one leaver, with a reason')
ON CONFLICT DO NOTHING;

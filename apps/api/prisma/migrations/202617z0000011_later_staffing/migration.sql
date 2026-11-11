-- The founder's "later" list, staffing and contract labour (11 Nov 2026): answers 497, 574 and 842.
-- 497: a week of hours can come from an own-payroll worker's approved Time timesheet (source 'time', once per timesheet).
-- 574: receipt vouchers in the accounting export; the mapping (Tally voucher type, Zoho payment columns) is rule data,
--      marked verify, in a new version of the export rule sets.
-- 842: an optional bank challan receipt PDF on a statutory filing.
-- (495 is a setting scope and 753 deletes a confirmation row with an audit entry: no table change.)
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "staffing_hours"
  ADD COLUMN "source" VARCHAR(6) NOT NULL DEFAULT 'manual',
  ADD COLUMN "timesheet_id" UUID,
  ADD COLUMN "time_hours_centi" INTEGER,
  ADD CONSTRAINT "staffing_hours_source_check" CHECK ("source" IN ('manual', 'time')),
  ADD CONSTRAINT "staffing_hours_time_check" CHECK (("source" = 'time') = ("timesheet_id" IS NOT NULL));
CREATE UNIQUE INDEX "staffing_hours_timesheet_key" ON "staffing_hours" ("timesheet_id") WHERE "timesheet_id" IS NOT NULL;

ALTER TABLE "statutory_filings" ADD COLUMN "receipt_file_id" UUID;

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify")
SELECT 'EXPORT.TALLY_XML', 'IN', '2026-v2', '2026-11-01',
  "values" || '{"receiptVoucherType":"Receipt"}'::jsonb,
  "source" || ' Receipts (answer 574): a Receipt voucher per receipt, the bank ledger debited and the client credited. Verify with a real import before use.', true
FROM "statutory_rule_sets" WHERE "statute" = 'EXPORT.TALLY_XML' AND "jurisdiction" = 'IN' AND "version" = '2026-v1';

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify")
SELECT 'EXPORT.ZOHO_CSV', 'IN', '2026-v2', '2026-11-01',
  "values" || '{"paymentColumns":[{"header":"Date","field":"date"},{"header":"Payment Number","field":"number"},{"header":"Customer Name","field":"customer"},{"header":"Payment Mode","field":"mode"},{"header":"Deposit To","field":"depositTo"},{"header":"Reference Number","field":"reference"},{"header":"Amount","field":"amount"},{"header":"Invoice Number","field":"invoice"},{"header":"Amount Applied to Invoice","field":"applied"},{"header":"Withholding Tax Amount","field":"tds"}]}'::jsonb,
  "source" || ' Receipts (answer 574): Zoho Books customer payments import, one row per invoice a receipt pays. Verify with a real import before use.', true
FROM "statutory_rule_sets" WHERE "statute" = 'EXPORT.ZOHO_CSV' AND "jurisdiction" = 'IN' AND "version" = '2026-v1';

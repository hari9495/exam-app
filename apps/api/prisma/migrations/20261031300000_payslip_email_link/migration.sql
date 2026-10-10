-- Founder decision 5e-D1 (9 Oct 2026), follow-up to 5d-D3: payslips are never emailed as PDFs. The email carries a link to
-- the in-app payslip (sign-in required, expiring, for that payslip only, no pay figures in the email), so the payslip
-- password and its lookup are no longer needed and are removed. Payslip links gain their purpose: a 60-second PDF
-- download, or the emailed link that opens one payslip in the app.
DROP FUNCTION payslip_password_users(UUID, UUID[]);
DROP TABLE "payslip_passwords";

ALTER TABLE "payslip_links"
  ADD COLUMN "purpose" VARCHAR(4) NOT NULL DEFAULT 'pdf',
  ADD CONSTRAINT "payslip_links_purpose_check" CHECK ("purpose" IN ('pdf', 'view'));

-- T2-B 65 (Pay B4, answer 2863): "Download the year" on Me › Payslips. A payslip link may now be a 'year' link: used
-- once within 60 seconds, it downloads one zip of the person's published payslips for the tax year of the payslip it
-- points at (each PDF drawn and watermarked as a single download is).
ALTER TABLE "payslip_links"
  DROP CONSTRAINT "payslip_links_purpose_check",
  ADD CONSTRAINT "payslip_links_purpose_check" CHECK ("purpose" IN ('pdf', 'view', 'year'));

-- PPL-03 person record parity (founder 20 Oct 2026, additive): marital status (Personal), the passport number and its
-- expiry (Confidential, sealed like PAN, changed through an approved request), and a work phone (Internal).
ALTER TABLE "employee_personal_details" ADD COLUMN "marital_status" VARCHAR(20);
ALTER TABLE "employee_personal_details" ADD CONSTRAINT "employee_personal_details_marital_check" CHECK ("marital_status" IS NULL OR "marital_status" IN ('single', 'married', 'separated', 'divorced', 'widowed', 'prefer_not_to_say'));
ALTER TABLE "employee_identifiers" ADD COLUMN "passport_enc" TEXT, ADD COLUMN "passport_hash" CHAR(64), ADD COLUMN "passport_last4" CHAR(4), ADD COLUMN "passport_expires_on" DATE;
ALTER TABLE "employee_profile_requests" DROP CONSTRAINT "employee_profile_requests_kind_check";
ALTER TABLE "employee_profile_requests" ADD CONSTRAINT "employee_profile_requests_kind_check" CHECK ("kind" IN ('bank_salary', 'bank_reimbursement', 'pan', 'aadhaar', 'uan', 'esic', 'legal_name', 'passport'));
ALTER TABLE "employees" ADD COLUMN "work_phone" VARCHAR(16);

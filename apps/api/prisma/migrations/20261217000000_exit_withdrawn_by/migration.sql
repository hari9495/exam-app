-- HR can withdraw an exit HR started (founder 28 Oct 2026). Who withdrew an exit and why stay on the case (a resignation
-- withdrawn by the employee or through its approval records them too).
ALTER TABLE "exit_cases" ADD COLUMN "withdrawn_by" UUID;
ALTER TABLE "exit_cases" ADD COLUMN "withdrawal_reason" VARCHAR(500);

-- Expense claims use the approvals engine's own "Send back for changes" decision (founder, 30 Oct 2026). The old
-- workaround (a flag set before an engine "reject", read back in the decision) is gone, so its column is dropped.
ALTER TABLE "expense_claims" DROP COLUMN "send_back_pending";

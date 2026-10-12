-- Expenses batch E2 (M05-BUILD-DESIGN §5.1): nothing about a claim is ever hard-deleted. Draft lines are removed
-- with removed_at; old flags are superseded, never erased; the approver's changes are the trail.
REVOKE DELETE, TRUNCATE ON TABLE "expense_claims" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "expense_lines" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "expense_line_changes" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "expense_flags" FROM app_runtime;

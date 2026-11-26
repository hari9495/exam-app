-- Batch C item 4 (answers 2501, 2502): a move to another approver is kept in the request's append-only history.
ALTER TABLE "wf_actions" DROP CONSTRAINT "wf_actions_action_check";
ALTER TABLE "wf_actions" ADD CONSTRAINT "wf_actions_action_check" CHECK ("action" IN ('submitted', 'approved', 'self_approved', 'rejected', 'auto_approved', 'auto_rejected', 'skipped', 'reminded', 'escalated', 'delegated', 'withdrawn', 'cancelled', 'closed', 'sent_back', 'reassigned'));

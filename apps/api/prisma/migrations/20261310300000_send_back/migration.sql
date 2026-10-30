-- P03 "Send back for changes" (founder, 30 Oct 2026): an approver returns a request to the person who asked, with what
-- to change. The request (and its task) end as "sent_back"; the module decides what that means. Leave: the request is
-- "sent_back" until the employee changes it and sends it again, which raises a new request and marks this one "resent".
ALTER TABLE "wf_requests" DROP CONSTRAINT "wf_requests_status_check";
ALTER TABLE "wf_requests" ADD CONSTRAINT "wf_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'cancelled', 'sent_back'));
ALTER TABLE "wf_tasks" DROP CONSTRAINT "wf_tasks_status_check";
ALTER TABLE "wf_tasks" ADD CONSTRAINT "wf_tasks_status_check" CHECK ("status" IN ('open', 'approved', 'rejected', 'closed', 'skipped', 'sent_back'));
ALTER TABLE "wf_actions" DROP CONSTRAINT "wf_actions_action_check";
ALTER TABLE "wf_actions" ADD CONSTRAINT "wf_actions_action_check" CHECK ("action" IN ('submitted', 'approved', 'self_approved', 'rejected', 'auto_approved', 'auto_rejected', 'skipped', 'reminded', 'escalated', 'delegated', 'withdrawn', 'cancelled', 'closed', 'sent_back'));
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_status_check";
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'cancel_pending', 'cancelled', 'sent_back', 'resent'));

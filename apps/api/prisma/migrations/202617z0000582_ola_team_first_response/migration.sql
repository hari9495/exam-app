-- Batch F GLPI 8 (answer 2572): a team's first response (internal TTO) as an OLA measure, next to the hand-off time.
ALTER TABLE "sd_sla_timers" DROP CONSTRAINT "sd_sla_timers_metric_check";
ALTER TABLE "sd_sla_timers" ADD CONSTRAINT "sd_sla_timers_metric_check" CHECK ("metric" IN ('assign', 'first_response', 'next_response', 'resolution', 'group', 'group_response', 'task'));
ALTER TABLE "sd_sla_compliance_targets" DROP CONSTRAINT "sd_sla_compliance_targets_metric_check";
ALTER TABLE "sd_sla_compliance_targets" ADD CONSTRAINT "sd_sla_compliance_targets_metric_check" CHECK ("metric" IN ('assign', 'first_response', 'next_response', 'resolution', 'group', 'group_response', 'task'));

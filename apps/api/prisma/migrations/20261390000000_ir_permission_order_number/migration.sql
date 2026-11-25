-- Founder 2 Nov 2026 (pay gaps, item 1): the government's order number on a retrenchment / lay-off / closure permission,
-- optional, recorded with a grant and shown on the PAY-11 run ("authority, order no., granted on date").
ALTER TABLE "ir_permission_requests" ADD COLUMN "order_number" VARCHAR(60);
ALTER TABLE "ir_permission_requests" ADD CONSTRAINT "ir_permission_requests_order_number_check"
  CHECK ("order_number" IS NULL OR ("status" = 'granted' AND length(btrim("order_number")) BETWEEN 1 AND 60));

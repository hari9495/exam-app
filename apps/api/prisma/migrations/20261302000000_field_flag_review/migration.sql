-- Field force (TIM-32 / TIM-33), additive: a manager marks a person's integrity flags reviewed (flags are shown,
-- never a penalty by themselves), and a visit check-in keeps its own flags (mock location, poor accuracy).
ALTER TABLE "location_pings" ADD COLUMN "reviewed_at" TIMESTAMPTZ(3), ADD COLUMN "reviewed_by" UUID;
ALTER TABLE "field_visits" ADD COLUMN "flags" VARCHAR(20)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(20)[];

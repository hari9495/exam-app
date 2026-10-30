-- TIM-14 Training tab (30 Oct 2026): HR adds, changes and cancels training sessions. "Who": empty = everyone at the
-- session's location; otherwise only these employees see it at the kiosk and may mark themselves present.
-- "version" guards two HR people changing one session at once.
ALTER TABLE "training_sessions" ADD COLUMN "invitees" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "training_sessions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "training_sessions" ADD COLUMN "updated_at" TIMESTAMPTZ(3);
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_invitees_check" CHECK (cardinality("invitees") <= 200);

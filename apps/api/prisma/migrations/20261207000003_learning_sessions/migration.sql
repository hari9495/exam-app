-- Learning stage 4: classroom and virtual sessions (LRN-04), trainer QR attendance (LRN-05), nominations and waitlists
-- (LRN-06). A session of a course has dated slots, seats and a trainer; people hold a seat or a waitlist place through
-- their enrolment; attendance is marked per slot (QR check-in, manual, or the meeting report) and, once confirmed,
-- decides the result against the course's attendance share.

CREATE TABLE "learning_trainers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "org_name" VARCHAR(200),
    "external" BOOLEAN NOT NULL,
    "employee_id" UUID,
    "email" VARCHAR(254),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_trainers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_trainers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_trainers_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL,
    CONSTRAINT "learning_trainers_kind_check" CHECK (("external" AND "employee_id" IS NULL) OR (NOT "external" AND "employee_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "learning_trainers_employee_key" ON "learning_trainers"("organization_id", "employee_id") WHERE "employee_id" IS NOT NULL;

CREATE TABLE "learning_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "venue" VARCHAR(300) NOT NULL,
    "trainer_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'scheduled',
    "cost_lines" JSONB NOT NULL DEFAULT '[]',
    "attendance_confirmed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_sessions_course_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_sessions_trainer_fkey" FOREIGN KEY ("trainer_id") REFERENCES "learning_trainers"("id"),
    CONSTRAINT "learning_sessions_mode_check" CHECK ("mode" IN ('classroom', 'virtual')),
    CONSTRAINT "learning_sessions_status_check" CHECK ("status" IN ('scheduled', 'completed', 'cancelled')),
    CONSTRAINT "learning_sessions_seats_check" CHECK ("seats" BETWEEN 1 AND 500)
);
CREATE INDEX "learning_sessions_course_idx" ON "learning_sessions"("organization_id", "course_id");

CREATE TABLE "learning_session_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "checkin_closed_at" TIMESTAMPTZ(3),
    CONSTRAINT "learning_session_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_session_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_session_slots_session_fkey" FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_session_slots_time_check" CHECK ("ends_at" > "starts_at")
);
CREATE UNIQUE INDEX "learning_session_slots_position_key" ON "learning_session_slots"("session_id", "position");

-- A seat (enrolled) or a waitlist place (waitlisted, first come first served) is the person's enrolment in the session.
ALTER TABLE "learning_enrolments"
    ADD COLUMN "session_id" UUID,
    ADD COLUMN "waitlisted_at" TIMESTAMPTZ(3),
    ADD COLUMN "decline_reason" VARCHAR(500),
    ADD COLUMN "result_reason" VARCHAR(200),
    ADD CONSTRAINT "learning_enrolments_session_fkey" FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE SET NULL,
    DROP CONSTRAINT "learning_enrolments_status_check",
    ADD CONSTRAINT "learning_enrolments_status_check" CHECK ("status" IN ('requested', 'waitlisted', 'enrolled', 'in_progress', 'completed', 'no_show', 'failed', 'cancelled', 'declined'));
DROP INDEX "learning_enrolments_open_key";
CREATE UNIQUE INDEX "learning_enrolments_open_key" ON "learning_enrolments"("organization_id", "employee_id", "course_id") WHERE "status" IN ('requested', 'waitlisted', 'enrolled', 'in_progress');
CREATE INDEX "learning_enrolments_session_idx" ON "learning_enrolments"("session_id") WHERE "session_id" IS NOT NULL;

-- The share of slots attended that completes a session course (LRN-03 Settings "Attendance to complete").
ALTER TABLE "learning_courses" ADD COLUMN "attendance_pct" INTEGER NOT NULL DEFAULT 75,
    ADD CONSTRAINT "learning_courses_attendance_check" CHECK ("attendance_pct" BETWEEN 1 AND 100);

CREATE TABLE "learning_attendance" (
    "organization_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "status" VARCHAR(8) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_attendance_pkey" PRIMARY KEY ("slot_id", "enrolment_id"),
    CONSTRAINT "learning_attendance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_attendance_slot_fkey" FOREIGN KEY ("slot_id") REFERENCES "learning_session_slots"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_attendance_enrolment_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "learning_enrolments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_attendance_status_check" CHECK ("status" IN ('present', 'late', 'absent')),
    CONSTRAINT "learning_attendance_method_check" CHECK ("method" IN ('qr', 'code', 'manual'))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_trainers', 'learning_sessions', 'learning_session_slots', 'learning_attendance']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

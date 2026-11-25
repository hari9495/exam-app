-- Batch G3b (M07 Q6-Q8; answer 2606): sessions of classroom and virtual courses: slots (days and times), seats and a
-- first-come waitlist, attendance per slot (a rotating check-in code shown by the trainer, or marked by hand), closing
-- the session (completion when attendance meets the company's share, default 75%), a reaction survey from attendees and
-- the manager's check after the company's number of days (default 60). The trainer is an employee login.
CREATE TABLE "lrn_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "slots" JSONB NOT NULL,
    "venue" VARCHAR(200),
    "link" VARCHAR(1000),
    "trainer_user_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "costs" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(10) NOT NULL DEFAULT 'scheduled',
    "code_secret" VARCHAR(64) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "check_sent_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lrn_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lrn_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_sessions_status_check" CHECK ("status" IN ('scheduled', 'cancelled', 'closed')),
    CONSTRAINT "lrn_sessions_seats_check" CHECK ("seats" BETWEEN 1 AND 1000),
    CONSTRAINT "lrn_sessions_link_check" CHECK ("link" IS NULL OR "link" LIKE 'https://%')
);
CREATE INDEX "lrn_sessions_course_idx" ON "lrn_sessions"("organization_id", "course_id");

CREATE TABLE "lrn_session_seats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lrn_session_seats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_session_seats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lrn_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_session_seats_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "lrn_enrolments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_session_seats_status_check" CHECK ("status" IN ('seated', 'waiting', 'withdrawn'))
);
CREATE UNIQUE INDEX "lrn_session_seats_open_key" ON "lrn_session_seats"("session_id", "user_id") WHERE "status" IN ('seated', 'waiting');

CREATE TABLE "lrn_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "slot_id" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "mark" VARCHAR(8) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lrn_attendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lrn_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_attendance_mark_check" CHECK ("mark" IN ('present', 'late', 'absent')),
    CONSTRAINT "lrn_attendance_method_check" CHECK ("method" IN ('code', 'manual'))
);
CREATE UNIQUE INDEX "lrn_attendance_key" ON "lrn_attendance"("session_id", "slot_id", "user_id");

CREATE TABLE "lrn_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "about_user_id" UUID NOT NULL,
    "by_user_id" UUID NOT NULL,
    "overall" INTEGER,
    "trainer" INTEGER,
    "applying" VARCHAR(8),
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lrn_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lrn_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_feedback_kind_check" CHECK ("kind" IN ('reaction', 'check')),
    CONSTRAINT "lrn_feedback_values_check" CHECK (("kind" = 'reaction' AND "overall" BETWEEN 1 AND 5 AND "trainer" BETWEEN 1 AND 5 AND "applying" IS NULL) OR ("kind" = 'check' AND "overall" IS NULL AND "trainer" IS NULL AND "applying" IN ('yes', 'partly', 'no', 'early')))
);
CREATE UNIQUE INDEX "lrn_feedback_key" ON "lrn_feedback"("session_id", "kind", "about_user_id");

ALTER TABLE "lrn_enrolments" DROP CONSTRAINT "lrn_enrolments_status_check";
ALTER TABLE "lrn_enrolments" ADD CONSTRAINT "lrn_enrolments_status_check" CHECK ("status" IN ('requested', 'enrolled', 'completed', 'declined', 'refused', 'no_show'));

ALTER TABLE "lrn_sessions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_sessions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_sessions" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_sessions" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "lrn_session_seats" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_session_seats"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_session_seats" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_session_seats" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "lrn_attendance" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_attendance"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_attendance" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_attendance" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "lrn_feedback" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_feedback"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_feedback" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_feedback" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

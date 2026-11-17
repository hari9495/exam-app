-- Assessments follow-ups (answer 2202): what an approved accommodation changes on one invitation.
--   extra_breaks       breaks on top of the test's own (0 to 5);
--   break_minutes      a longer break than the test's (5 to 60 minutes; empty = the test's own);
--   proctoring_profile 'no_gaze': looking away, looking down and head turns are not watched for this candidate.
ALTER TABLE invitations
  ADD COLUMN extra_breaks SMALLINT NOT NULL DEFAULT 0 CHECK (extra_breaks BETWEEN 0 AND 5),
  ADD COLUMN break_minutes SMALLINT CHECK (break_minutes BETWEEN 5 AND 60),
  ADD COLUMN proctoring_profile VARCHAR(20) CHECK (proctoring_profile IN ('no_gaze'));

-- The decision keeps what was granted for breaks and proctoring, as it keeps the extra time.
ALTER TABLE accommodation_requests
  ADD COLUMN granted_extra_breaks SMALLINT CHECK (granted_extra_breaks BETWEEN 1 AND 5),
  ADD COLUMN granted_break_minutes SMALLINT CHECK (granted_break_minutes BETWEEN 5 AND 60);

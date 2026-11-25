-- PRF-12 PIP record (builder 2): the manager rates each check-in (on track, some progress, no progress). Earlier check-ins
-- keep no rating. pip_checkins already has row-level security. Schema only; no data moves.
ALTER TABLE pip_checkins ADD COLUMN rating varchar(14);
ALTER TABLE pip_checkins ADD CONSTRAINT pip_checkins_rating_ck CHECK (rating IN ('on_track', 'some_progress', 'no_progress'));

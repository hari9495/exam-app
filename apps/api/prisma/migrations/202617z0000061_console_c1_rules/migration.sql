-- YukthiX console C-1, the rules engine (founder answers 1041 to 1044 and 1058, 11 Nov 2026).
-- 1041: the drafter never publishes; publishing needs the security key again (API).
-- 1042: review states. The drafter sends a draft for review ("in review"); a second member of staff publishes it or
--       asks for changes with a note the drafter reads. Asking for changes returns it to "draft" with the note (shown
--       as "Changes requested"); the drafter changes it and sends it again. Only an "in review" version is published.
-- 1043: a golden-case dry run on a draft saves nothing (API only).
-- 1044: the impact count reads across companies through platformRead (API only).
-- 1058: the existing statutory key is the console's "Rules editor" key.
-- Every write still goes through SECURITY DEFINER functions inside a platform-staff context; the app reads only.

ALTER TABLE "statutory_rule_sets"
  ADD COLUMN "change_note" VARCHAR(500),
  ADD COLUMN "sent_for_review_at" TIMESTAMPTZ(3),
  ADD COLUMN "review_note" VARCHAR(500),
  ADD COLUMN "review_note_by" UUID,
  ADD COLUMN "review_note_at" TIMESTAMPTZ(3);

/** The drafter changes their own draft (not one in review, never a published one); golden cases are replaced. */
CREATE FUNCTION statutory_update_draft(p_id UUID, p_valid_from DATE, p_valid_to DATE, p_values JSONB, p_source TEXT, p_law_version TEXT, p_verify BOOLEAN, p_golden JSONB, p_change_note TEXT, p_user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r statutory_rule_sets%ROWTYPE;
  g JSONB;
BEGIN
  IF NOT app_is_super_admin() OR p_user IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff change statutory rules'; END IF;
  SELECT * INTO r FROM statutory_rule_sets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YX_RULE_NOT_FOUND: no such rule set'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'YX_RULE_STATE: only a draft is changed'; END IF;
  IF r.drafted_by IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'YX_RULE_DRAFTER: only the person who drafted it changes it'; END IF;
  UPDATE statutory_rule_sets SET valid_from = p_valid_from, valid_to = p_valid_to, "values" = p_values, source = p_source, law_version = p_law_version, verify = p_verify, change_note = p_change_note WHERE id = p_id;
  DELETE FROM statutory_golden_cases WHERE rule_set_id = p_id;
  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(p_golden, '[]'::jsonb)) LOOP
    INSERT INTO statutory_golden_cases (rule_set_id, name, fn, input, expected) VALUES (p_id, g ->> 'name', g ->> 'fn', g -> 'input', g -> 'expected');
  END LOOP;
END $$;

/** The drafter sends their draft for review (the API ran its checks first). */
CREATE FUNCTION statutory_send_for_review(p_id UUID, p_user UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r statutory_rule_sets%ROWTYPE;
BEGIN
  IF NOT app_is_super_admin() OR p_user IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff send statutory rules for review'; END IF;
  SELECT * INTO r FROM statutory_rule_sets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YX_RULE_NOT_FOUND: no such rule set'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'YX_RULE_STATE: only a draft is sent for review'; END IF;
  IF r.drafted_by IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'YX_RULE_DRAFTER: only the person who drafted it sends it for review'; END IF;
  IF NOT EXISTS (SELECT 1 FROM statutory_golden_cases WHERE rule_set_id = p_id) THEN RAISE EXCEPTION 'YX_RULE_STATE: a rule set goes for review with at least one golden case'; END IF;
  UPDATE statutory_rule_sets SET status = 'in_review', sent_for_review_at = CURRENT_TIMESTAMP WHERE id = p_id;
END $$;

/** A second member of staff asks for changes with a note: back to draft, the note stays for the drafter. */
CREATE FUNCTION statutory_request_changes(p_id UUID, p_user UUID, p_note TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r statutory_rule_sets%ROWTYPE;
BEGIN
  IF NOT app_is_super_admin() OR p_user IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff review statutory rules'; END IF;
  IF p_note IS NULL OR char_length(btrim(p_note)) < 10 THEN RAISE EXCEPTION 'YX_RULE_NOTE: say what to change'; END IF;
  SELECT * INTO r FROM statutory_rule_sets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'YX_RULE_NOT_FOUND: no such rule set'; END IF;
  IF r.status <> 'in_review' THEN RAISE EXCEPTION 'YX_RULE_STATE: only a version in review gets a review'; END IF;
  IF r.drafted_by = p_user THEN RAISE EXCEPTION 'YX_MAKER_CHECKER: someone other than the person who drafted it must review it'; END IF;
  UPDATE statutory_rule_sets SET status = 'draft', review_note = btrim(p_note), review_note_by = p_user, review_note_at = CURRENT_TIMESTAMP WHERE id = p_id;
END $$;

/** 1042: publishing is the reviewer's approval, so only a version in review is published (maker ≠ checker as before). */
CREATE OR REPLACE FUNCTION statutory_publish(p_id UUID, p_user UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r statutory_rule_sets%ROWTYPE;
BEGIN
  IF NOT app_is_super_admin() OR p_user IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff publish statutory rules'; END IF;
  SELECT * INTO r FROM statutory_rule_sets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'in_review' THEN RAISE EXCEPTION 'Only a version in review can be published'; END IF;
  IF r.drafted_by = p_user THEN RAISE EXCEPTION 'YX_MAKER_CHECKER: someone other than the person who drafted it must publish it'; END IF;
  IF NOT EXISTS (SELECT 1 FROM statutory_golden_cases WHERE rule_set_id = p_id) THEN RAISE EXCEPTION 'A rule set is published with at least one golden case'; END IF;
  UPDATE statutory_rule_sets SET status = 'published', reviewed_by = p_user, published_at = CURRENT_TIMESTAMP WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION statutory_update_draft(UUID, DATE, DATE, JSONB, TEXT, TEXT, BOOLEAN, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION statutory_send_for_review(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION statutory_request_changes(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION statutory_update_draft(UUID, DATE, DATE, JSONB, TEXT, TEXT, BOOLEAN, JSONB, TEXT, UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION statutory_send_for_review(UUID, UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION statutory_request_changes(UUID, UUID, TEXT) TO app_runtime;

-- 1058: the console calls this key "Rules editor".
UPDATE "permissions" SET "description" = 'Rules editor: draft, review and publish statutory rule sets (YukthiX staff; the publisher is never the drafter)' WHERE "key" = 'platform.statutory.manage';

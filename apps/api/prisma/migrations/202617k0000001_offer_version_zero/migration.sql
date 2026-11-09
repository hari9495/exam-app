-- HIR-09 founder decision 5: an older free-text offer stays readable as version 0. When such an offer gets its first CTC
-- version, the text it had is kept on that version (the offer's own text then describes the new version for the letter).
-- Schema only: no data is written.
ALTER TABLE "offer_versions" ADD COLUMN "replaced_text" TEXT;

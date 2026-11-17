-- Batch H item H14 (17 Nov 2026), from docs/yukthix/reference/statutory/india-state-rules-2026-27.md section 5:
-- the Income-tax Act 2025 section for each declaration subject (the batch 5e rows said "verify number"), with the old
-- section in brackets, and the form line. Official (Income-tax Rules 2026 r.205, r.73; Form No. 130 wording):
-- 80C -> s.123 / Schedule XV, 80D -> s.126, HRA -> s.11 / Schedule III Sl. 11, 89(1) -> s.157(1), Form 10E -> Form No. 39,
-- Form 12BB -> Form No. 124. Inferred from Form No. 130 wording, CA to check: 80CCD(1B) -> s.124(3), 80CCD(2) ->
-- s.124(1)(a) (CA checklist items 50, 51). 80E, 24(b) and perquisites stay "verify number" (not found); 87A -> s.156
-- stays unconfirmed (item 52). Every row stays verify.
UPDATE "statutory_law_crosswalk" SET "section" = 's.11, Sch III Sl. 11 (old 10(13A))', "form" = 'Form No. 130 Part B 2(b)' WHERE "subject_key" = 'hra' AND "law_version" = 'IT-2025';
UPDATE "statutory_law_crosswalk" SET "section" = 's.123, Sch XV (old 80C)', "form" = 'Form No. 130 Part B 10(a)' WHERE "subject_key" = 'sec80c' AND "law_version" = 'IT-2025';
UPDATE "statutory_law_crosswalk" SET "section" = 's.124(3) (old 80CCD(1B))', "form" = 'Form No. 130 Part B 10(b)' WHERE "subject_key" = 'sec80ccd1b' AND "law_version" = 'IT-2025';
UPDATE "statutory_law_crosswalk" SET "section" = 's.124(1)(a) (old 80CCD(2))', "form" = 'Form No. 130 Part B 10(c)' WHERE "subject_key" = 'sec80ccd2' AND "law_version" = 'IT-2025';
UPDATE "statutory_law_crosswalk" SET "section" = 's.126 (old 80D)', "form" = 'Form No. 130 Part B 10(d)' WHERE "subject_key" IN ('sec80d_self', 'sec80d_self_senior', 'sec80d_parents', 'sec80d_parents_senior') AND "law_version" = 'IT-2025';
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('relief_89', 'IT-1961', 's.89(1)', 'Form 10E');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('relief_89', 'IT-2025', 's.157(1) (old 89(1))', 'Form No. 39');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('salary_declaration', 'IT-1961', 's.192', 'Form 12BB');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('salary_declaration', 'IT-2025', 's.392(5)(b)', 'Form No. 124');

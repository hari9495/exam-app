-- Contract labour, answer 731: the office that issued a contractor licence (optional, as written on the licence).
SELECT set_config('app.is_super_admin', 'on', true);
ALTER TABLE "contractor_licences" ADD COLUMN "issued_by" VARCHAR(200);

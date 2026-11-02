-- TIM-06 flexi and split shifts (founder answers 2 Nov 2026). A shift's type never changes once saved; every existing shift
-- stays 'fixed', so nothing judged today changes. Flexi: core hours inside the shift and overtime after hours worked.
-- Split: the first part ends and the second starts (the gap between them is unpaid and not worked). Both are off by
-- default (company settings attendance.shift_types.flexi / .split); the API checks the rest (core inside the shift,
-- parts in order, the gap at least the company's minimum). shift_versions already has row-level security.
ALTER TABLE shifts ADD COLUMN kind varchar(6) NOT NULL DEFAULT 'fixed';
ALTER TABLE shifts ADD CONSTRAINT shifts_kind_ck CHECK (kind IN ('fixed', 'flexi', 'split'));

ALTER TABLE shift_versions
  ADD COLUMN core_start_minute smallint,
  ADD COLUMN core_end_minute smallint,
  ADD COLUMN first_end_minute smallint,
  ADD COLUMN second_start_minute smallint,
  ADD COLUMN ot_after_minutes smallint;

ALTER TABLE shift_versions
  ADD CONSTRAINT shift_versions_core_ck CHECK ((core_start_minute IS NULL) = (core_end_minute IS NULL) AND core_start_minute BETWEEN 0 AND 1439 AND core_end_minute BETWEEN 0 AND 1439 AND core_start_minute <> core_end_minute),
  ADD CONSTRAINT shift_versions_parts_ck CHECK ((first_end_minute IS NULL) = (second_start_minute IS NULL) AND first_end_minute BETWEEN 0 AND 1439 AND second_start_minute BETWEEN 0 AND 1439 AND first_end_minute <> second_start_minute),
  ADD CONSTRAINT shift_versions_ot_after_ck CHECK (ot_after_minutes BETWEEN 30 AND 960),
  ADD CONSTRAINT shift_versions_one_kind_ck CHECK (core_start_minute IS NULL OR first_end_minute IS NULL);

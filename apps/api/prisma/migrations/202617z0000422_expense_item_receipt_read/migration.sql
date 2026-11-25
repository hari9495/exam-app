-- Answer 2252: a saved expense's receipt is read when it is saved (amount, date, where), as a claim's receipt is. What
-- was read is kept with it and moves to the claim line, where it is checked like any read receipt. No data written.
ALTER TABLE "expense_items" ADD COLUMN "ocr" JSONB;

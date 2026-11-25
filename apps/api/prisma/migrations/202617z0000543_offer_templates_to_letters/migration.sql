-- Answer 2515 (founder, 18 Nov 2026): each older offer template becomes a P05 'offer' letter template. The move is a
-- one-off command (npm run offers:to-letters in apps/api), not a start-up job; this link is its claim, so running it
-- again never makes a second letter template for the same offer template.
ALTER TABLE "offer_templates" ADD COLUMN "letter_template_id" UUID;
CREATE UNIQUE INDEX "offer_templates_letter_template_key" ON "offer_templates" ("letter_template_id");

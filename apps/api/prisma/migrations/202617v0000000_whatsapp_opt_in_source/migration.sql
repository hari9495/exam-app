-- Answer 561 (10 Nov 2026): where the candidate's WhatsApp opt-in (or its withdrawal) came from: apply, status_page,
-- unsubscribe. The time is whatsapp_opted_in_at (HIR-20); every change is also audited.
ALTER TABLE "candidates" ADD COLUMN "whatsapp_opt_in_source" VARCHAR(20);

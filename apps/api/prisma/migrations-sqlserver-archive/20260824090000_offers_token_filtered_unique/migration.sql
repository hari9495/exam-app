-- Fix a latent SQL Server bug: offers.offer_token is nullable and was created with a plain
-- UNIQUE constraint (20260822090000_offers). On SQL Server a UNIQUE constraint treats NULLs
-- as equal, so only ONE NULL row is permitted table-wide. OffersService.createOffer inserts a
-- draft with offer_token = NULL (the token is minted later in sendOffer), so a SECOND draft
-- offer anywhere in the table would violate the constraint (unique-key error -> 500).
--
-- Fix: replace the plain constraint with a FILTERED unique index that only enforces uniqueness
-- where offer_token IS NOT NULL, letting any number of draft (NULL-token) offers coexist while
-- still keeping minted tokens unique. Same pattern as pipeline_entries.application_token
-- (20260819090000_candidate_experience) and interview_token (20260823090000_interviews).
-- offers.offer_token already exists, so DROP + CREATE INDEX reference an existing column (no
-- same-batch "Invalid column name" concern -> no EXEC() wrapping needed).

ALTER TABLE [dbo].[offers] DROP CONSTRAINT [offers_offer_token_key];

CREATE UNIQUE NONCLUSTERED INDEX [offers_offer_token_key] ON [dbo].[offers]([offer_token]) WHERE [offer_token] IS NOT NULL;

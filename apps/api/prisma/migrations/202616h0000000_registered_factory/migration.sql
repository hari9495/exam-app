-- HLP-14 founder answers 131 and 132 (4 Nov 2026). A location can be marked a registered factory (HR edits it with the
-- location; audited). Time then applies the factory carry-forward minimum (IN.FACTORIES.LEAVE, the row valid on the
-- date) at those locations only, on the same path as the state minimums (IN.SE); office locations are unchanged.
-- The company's industry is a setting (company.industry, default none), checked against policy_industries by the API.
ALTER TABLE "locations" ADD COLUMN "registered_factory" BOOLEAN NOT NULL DEFAULT false;

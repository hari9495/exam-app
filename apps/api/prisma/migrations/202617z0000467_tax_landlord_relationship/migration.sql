-- Batch H item H15 (17 Nov 2026): Form No. 124 (Income-tax Rules 2026 r.205, replacing Form 12BB) asks how the employee
-- is related to the landlord. Required by the API with the landlord's PAN (rent above the yearly limit) for 2025 Act
-- workspaces. The table's row security is unchanged.
ALTER TABLE "tax_declaration_lines" ADD COLUMN "landlord_relationship" VARCHAR(20);

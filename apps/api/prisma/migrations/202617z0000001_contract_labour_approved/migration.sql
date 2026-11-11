-- Contract labour, founder answer 821: the client pack also carries the month's PF and ESI remittances (a third register
-- made through the payroll registers service) and names the statutes not filed yet for the month.
ALTER TABLE "client_packs" ADD COLUMN "challans_register_id" UUID;
ALTER TABLE "client_packs" ADD COLUMN "missing" TEXT[] NOT NULL DEFAULT '{}';

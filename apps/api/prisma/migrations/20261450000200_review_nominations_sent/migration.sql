-- PRF-07 360° nominations (builder 2): the employee builds the list, then sends it to their manager once; the manager is
-- told then, not for every name. Empty until the list is sent; reviews already has row-level security. Schema only.
ALTER TABLE reviews ADD COLUMN nominations_sent_at timestamptz(3);

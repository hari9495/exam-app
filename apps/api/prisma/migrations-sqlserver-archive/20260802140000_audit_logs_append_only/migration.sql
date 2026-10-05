-- Enforce append-only on the audit trail: block row deletion at the database
-- level so the log cannot be tampered with by removing entries.
--
-- Safe against the existing foreign-key behaviour: AuditLog's organization and
-- actor relations are ON DELETE SET NULL, i.e. deleting an organization or user
-- issues an UPDATE of the FK columns on audit_logs, never a DELETE -- so this
-- INSTEAD OF DELETE trigger never interferes with those cascades. The
-- application has no code path that deletes audit rows, so nothing legitimate
-- is blocked. UPDATE is intentionally left allowed: the SET NULL cascade needs
-- it, and no code updates audit content.
CREATE TRIGGER [dbo].[trg_audit_logs_append_only]
ON [dbo].[audit_logs]
INSTEAD OF DELETE
AS
BEGIN
  SET NOCOUNT ON;
  RAISERROR('audit_logs is append-only: audit rows cannot be deleted.', 16, 1);
END;

-- Enterprise E3. -- Drafts a trigger made ('salary': a back-dated salary change; 'joining': a joining date) beside hand-made ones ('change',
-- 'manual') and accepted proposals ('rule'). A trigger's draft is replaced by a newer draft over the same months; a
-- hand-made draft never is.
ALTER TABLE "arrears_worksheets" DROP CONSTRAINT "arrears_worksheets_source_check";
ALTER TABLE "arrears_worksheets" ADD CONSTRAINT "arrears_worksheets_source_check" CHECK ("source" IN ('change', 'rule', 'settlement', 'manual', 'salary', 'joining'));

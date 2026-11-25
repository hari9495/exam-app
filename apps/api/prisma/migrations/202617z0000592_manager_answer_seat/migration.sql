-- Batch F item 33 (answer 2573): the manager a ticket asks (sd_tickets.answer_user_id) may reply on it without a desk
-- seat. Everyone else replying from the agent side still needs an agent or lead seat on the desk today (YX-SD-06).
CREATE OR REPLACE FUNCTION sd_ticket_messages_seat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'reply' AND NEW.side = 'agent' AND NOT sd_agent_seat_held(NEW.organization_id, NEW.desk_id, NEW.author_user_id)
     AND NOT EXISTS (SELECT 1 FROM sd_tickets t WHERE t.organization_id = NEW.organization_id AND t.id = NEW.ticket_id AND t.answer_user_id IS NOT NULL AND t.answer_user_id = NEW.author_user_id) THEN
    RAISE EXCEPTION 'DESK_AGENT_SEAT_REQUIRED: only an agent of this desk can reply' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

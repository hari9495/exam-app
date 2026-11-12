-- Helpdesk (founder answer 1682): the preset rating reason (1643) also with a chat's rating; the one-click email rating
-- keeps it on sd_ratings.reason like the app and the portal.
ALTER TABLE "sd_chat_sessions" ADD COLUMN "rating_reason" VARCHAR(40);

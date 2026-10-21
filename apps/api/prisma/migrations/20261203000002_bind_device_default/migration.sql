-- TIM-31: binding check-in to one phone is on by default for a new location (restricted check-in is the default).
-- Existing locations keep what they have: turning it on for them would refuse people's second device overnight.
ALTER TABLE "locations" ALTER COLUMN "bind_device" SET DEFAULT true;

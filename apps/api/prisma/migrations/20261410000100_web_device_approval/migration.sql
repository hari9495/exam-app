-- Extra · My attendance today · DeviceNotApproved: a person's computer (browser) for web clock-in, approved by HR when
-- the company setting attendance.web_device_approval is on. install_hash holds only the SHA-256 of the sign-in device
-- cookie (yx_device); the raw value is never stored. time_devices already has RLS.
ALTER TABLE "time_devices" DROP CONSTRAINT "time_devices_kind_check";
ALTER TABLE "time_devices" ADD CONSTRAINT "time_devices_kind_check" CHECK (
  ("kind" = 'kiosk' AND "location_id" IS NOT NULL AND "code" IS NOT NULL AND "employee_id" IS NULL)
  OR ("kind" IN ('phone', 'web') AND "employee_id" IS NOT NULL)
);
CREATE INDEX "time_devices_person_hash_idx" ON "time_devices" ("organization_id", "employee_id", "kind", "install_hash");

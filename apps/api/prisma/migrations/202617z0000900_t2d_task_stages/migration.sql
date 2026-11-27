-- Batch T2-D item 56 (answers 2865, 2866): a project task's stage on the board (to do, in progress, done, or one of the
-- company's own stages, kept by name) and who it is assigned to (people on the project; the project manager assigns).
ALTER TABLE "project_tasks" ADD COLUMN "stage" VARCHAR(20) NOT NULL DEFAULT 'todo';
ALTER TABLE "project_tasks" ADD COLUMN "assignee_employee_ids" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "project_tasks" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

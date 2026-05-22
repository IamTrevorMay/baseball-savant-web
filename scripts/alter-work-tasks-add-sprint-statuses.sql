-- Add sprint-column statuses (ready, in_progress, holding) to work_tasks.
-- Existing statuses (inbox, today, this_week, done, backlog) are preserved.

ALTER TABLE work_tasks
  DROP CONSTRAINT IF EXISTS work_tasks_status_check;

ALTER TABLE work_tasks
  ADD CONSTRAINT work_tasks_status_check
  CHECK (status IN ('inbox','today','this_week','done','backlog','ready','in_progress','holding'));

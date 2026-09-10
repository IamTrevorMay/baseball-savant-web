-- =========================================================================
-- Movement Screening assessments (/work/assessments)
--
-- One row per completed screen, attached to a Compete athlete
-- (athlete_profiles). `responses` is JSONB keyed by the canonical field keys
-- in lib/work/movementScreen.ts — an exact copy of NBP's Strength &
-- Conditioning assessment template, which is the facility's movement screen.
--
-- Rows imported from NBP carry source='nbp' and the originating
-- assessment_submissions.id (unique, so re-imports are idempotent).
-- =========================================================================

CREATE TABLE IF NOT EXISTS work_movement_screens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_profile_id  uuid NOT NULL REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  assessed_at         date NOT NULL DEFAULT CURRENT_DATE,
  responses           jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes               text,
  source              text NOT NULL DEFAULT 'triton' CHECK (source IN ('triton', 'nbp')),
  nbp_submission_id   uuid UNIQUE,           -- provenance when imported from NBP
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_movement_screens_athlete_idx
  ON work_movement_screens (athlete_profile_id, assessed_at DESC);

ALTER TABLE work_movement_screens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Work users read movement screens" ON work_movement_screens
  FOR SELECT USING (has_work_access());
CREATE POLICY "Work staff write movement screens" ON work_movement_screens
  FOR ALL USING (is_work_staff()) WITH CHECK (is_work_staff());

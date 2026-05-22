-- =========================================================================
-- /work app schema
-- Internal ops platform for the baseball-development business, modeled after
-- Mayday Studio (sprints, personal-task board, weekly cadence, athlete
-- pipeline). All tables prefixed `work_`. RLS keyed on `work_roles`.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Roles: admin / assistant / member, separate from Triton owner/admin
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin', 'assistant', 'member')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE work_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own work_role"
  ON work_roles FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM work_roles wr WHERE wr.user_id = auth.uid() AND wr.role = 'admin'
  ));

CREATE POLICY "Admins manage work_roles"
  ON work_roles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM work_roles wr WHERE wr.user_id = auth.uid() AND wr.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_roles wr WHERE wr.user_id = auth.uid() AND wr.role = 'admin'
  ));

-- Helper: is the current user a work admin or assistant?
CREATE OR REPLACE FUNCTION is_work_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM work_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'assistant')
  );
$$;

CREATE OR REPLACE FUNCTION is_work_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM work_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION has_work_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM work_roles WHERE user_id = auth.uid()
  );
$$;

-- -------------------------------------------------------------------------
-- Athletes (pipeline): the "projects" of this business
-- Stages: Lead → Intake → Assessment → Active Programming → Re-eval → Offboarded
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_athletes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     text NOT NULL,
  position      text,         -- e.g. RHP, LHP, C, INF, OF
  age           int,
  level         text,         -- HS, JuCo, NCAA, Pro, etc.
  stage         text NOT NULL DEFAULT 'lead'
                CHECK (stage IN ('lead','intake','assessment','active','reeval','offboarded')),
  primary_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes         text,
  contact_email text,
  contact_phone text,
  start_date    date,         -- when programming began
  next_touch    date,         -- date of next planned check-in
  archived_at   timestamptz,
  position_idx  int DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_athletes_stage_idx ON work_athletes (stage);
CREATE INDEX IF NOT EXISTS work_athletes_owner_idx ON work_athletes (primary_owner);

ALTER TABLE work_athletes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Work users read athletes" ON work_athletes
  FOR SELECT USING (has_work_access());
CREATE POLICY "Work staff write athletes" ON work_athletes
  FOR ALL USING (is_work_staff()) WITH CHECK (is_work_staff());

-- -------------------------------------------------------------------------
-- Sprints: weekly (Mon–Sun), per-user
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_sprints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','planning')),
  velocity   int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS work_sprints_one_active_per_user
  ON work_sprints (user_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS work_sprints_unique_week
  ON work_sprints (user_id, start_date);

ALTER TABLE work_sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own work_sprints" ON work_sprints
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Sprint goals (1–3 per sprint, the "vital few")
CREATE TABLE IF NOT EXISTS work_sprint_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id   uuid NOT NULL REFERENCES work_sprints(id) ON DELETE CASCADE,
  text        text NOT NULL,
  is_complete boolean DEFAULT false,
  position    int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE work_sprint_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sprint goals" ON work_sprint_goals
  FOR ALL USING (EXISTS (
    SELECT 1 FROM work_sprints s WHERE s.id = work_sprint_goals.sprint_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_sprints s WHERE s.id = work_sprint_goals.sprint_id AND s.user_id = auth.uid()
  ));

-- Sprint retros (single row per sprint)
CREATE TABLE IF NOT EXISTS work_sprint_retros (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id   uuid NOT NULL UNIQUE REFERENCES work_sprints(id) ON DELETE CASCADE,
  went_well   text DEFAULT '',
  to_improve  text DEFAULT '',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE work_sprint_retros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sprint retros" ON work_sprint_retros
  FOR ALL USING (EXISTS (
    SELECT 1 FROM work_sprints s WHERE s.id = work_sprint_retros.sprint_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_sprints s WHERE s.id = work_sprint_retros.sprint_id AND s.user_id = auth.uid()
  ));

-- -------------------------------------------------------------------------
-- Personal tasks (MyBoard): the daily work surface
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id   uuid REFERENCES work_athletes(id) ON DELETE SET NULL,
  sprint_id    uuid REFERENCES work_sprints(id) ON DELETE SET NULL,
  title        text NOT NULL,
  notes        text,
  status       text NOT NULL DEFAULT 'inbox'
                CHECK (status IN ('inbox','today','this_week','done','backlog')),
  category     text CHECK (category IN ('programming','assessment','admin','communication','marketing','business_development')),
  priority     text NOT NULL DEFAULT '3' CHECK (priority IN ('1','3','6','10','15')),
  due_date     date,
  completed_at timestamptz,
  position     int DEFAULT 0,
  recurrence_interval text CHECK (recurrence_interval IN ('daily','weekly','monthly')),
  recurrence_count    int,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_tasks_user_idx     ON work_tasks (user_id);
CREATE INDEX IF NOT EXISTS work_tasks_sprint_idx   ON work_tasks (sprint_id);
CREATE INDEX IF NOT EXISTS work_tasks_athlete_idx  ON work_tasks (athlete_id);
CREATE INDEX IF NOT EXISTS work_tasks_status_idx   ON work_tasks (status);

ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own work_tasks" ON work_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Work admins read all tasks" ON work_tasks
  FOR SELECT USING (is_work_admin());

-- -------------------------------------------------------------------------
-- Calendar events (manual + linked to athletes/tasks)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  uuid REFERENCES work_athletes(id) ON DELETE SET NULL,
  title       text NOT NULL,
  description text,
  event_type  text DEFAULT 'session'
                CHECK (event_type IN ('session','meeting','assessment','admin','other')),
  start_at    timestamptz NOT NULL,
  end_at      timestamptz,
  all_day     boolean DEFAULT false,
  location    text,
  recurrence_rule text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_events_user_idx  ON work_calendar_events (user_id);
CREATE INDEX IF NOT EXISTS work_events_start_idx ON work_calendar_events (start_at);

ALTER TABLE work_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own events" ON work_calendar_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Work staff read all events" ON work_calendar_events
  FOR SELECT USING (is_work_staff());

-- -------------------------------------------------------------------------
-- Goals (personal + team)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_goals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope        text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','team')),
  title        text NOT NULL,
  description  text,
  target_value numeric,
  current_value numeric DEFAULT 0,
  unit         text,
  target_date  date,
  completed_at timestamptz,
  position     int DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE work_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own personal goals" ON work_goals
  FOR ALL USING (
    (scope = 'personal' AND auth.uid() = owner_id)
    OR (scope = 'team' AND is_work_staff())
  )
  WITH CHECK (
    (scope = 'personal' AND auth.uid() = owner_id)
    OR (scope = 'team' AND is_work_admin())
  );
CREATE POLICY "Work users read team goals" ON work_goals
  FOR SELECT USING (
    (scope = 'team' AND has_work_access())
    OR auth.uid() = owner_id
  );

-- Admin daily-target goals (e.g. "5 outreach emails / day")
CREATE TABLE IF NOT EXISTS work_admin_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  label         text NOT NULL,
  daily_target  int NOT NULL DEFAULT 1,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE work_admin_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Work staff read admin goals" ON work_admin_goals
  FOR SELECT USING (is_work_staff());
CREATE POLICY "Work admins manage admin goals" ON work_admin_goals
  FOR ALL USING (is_work_admin()) WITH CHECK (is_work_admin());

-- -------------------------------------------------------------------------
-- updated_at triggers
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION work_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'work_roles','work_athletes','work_sprints','work_sprint_retros',
    'work_tasks','work_calendar_events','work_goals','work_admin_goals'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_set_updated_at ON %1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_set_updated_at BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION work_set_updated_at();', t
    );
  END LOOP;
END $$;

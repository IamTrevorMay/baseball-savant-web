-- ============================================================================
-- Enable RLS on all tables + create explicit policies
-- Idempotent: uses DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- Key safety factor: ~95% of API routes use supabaseAdmin (service role key),
-- which bypasses RLS entirely.  run_query is SECURITY DEFINER and also bypasses.
-- So this is primarily defense-in-depth against direct anon-key access.
--
-- Run via: psql or Supabase SQL Editor
-- Rollback per-table: ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- is_admin(): true if current user has role 'admin' or 'owner' in profiles.
-- Generalizes the existing is_compete_admin() pattern.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','owner')
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- my_athlete_id(): returns the athlete_profiles.id for the current user.
-- Needed for Whoop/athlete tables where ownership goes through athlete_profiles.profile_id.
create or replace function public.my_athlete_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.athlete_profiles
  where profile_id = auth.uid()
  limit 1;
$$;

grant execute on function public.my_athlete_id() to authenticated, anon;


-- ============================================================================
-- PHASE 1 — HIGHLY SENSITIVE (PII, health data, tokens)
-- ============================================================================

-- ── profiles ──
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- ── whoop_tokens — deny all (service role only) ──
alter table public.whoop_tokens enable row level security;
-- No policies = deny all for anon/authenticated. Service role bypasses.

-- ── whoop_cycles ──
alter table public.whoop_cycles enable row level security;

drop policy if exists whoop_cycles_select_own_or_admin on public.whoop_cycles;

create policy whoop_cycles_select_own_or_admin on public.whoop_cycles
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());

-- ── whoop_sleep ──
alter table public.whoop_sleep enable row level security;

drop policy if exists whoop_sleep_select_own_or_admin on public.whoop_sleep;

create policy whoop_sleep_select_own_or_admin on public.whoop_sleep
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());

-- ── whoop_workouts ──
alter table public.whoop_workouts enable row level security;

drop policy if exists whoop_workouts_select_own_or_admin on public.whoop_workouts;

create policy whoop_workouts_select_own_or_admin on public.whoop_workouts
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());

-- ── newsletter_subscribers — deny all (service role only) ──
alter table public.newsletter_subscribers enable row level security;

-- ── newsletter_sends — deny all (service role only) ──
alter table public.newsletter_sends enable row level security;

-- ── data_exports ──
alter table public.data_exports enable row level security;

drop policy if exists data_exports_select_own on public.data_exports;
drop policy if exists data_exports_insert_own on public.data_exports;

create policy data_exports_select_own on public.data_exports
  for select using (user_id = auth.uid());

create policy data_exports_insert_own on public.data_exports
  for insert with check (user_id = auth.uid());


-- ============================================================================
-- PHASE 2 — USER-OWNED DATA
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern A: user_id = auth.uid()
-- ────────────────────────────────────────────────────────────────────────────

-- ── conversations ──
alter table public.conversations enable row level security;

drop policy if exists conversations_select_own on public.conversations;
drop policy if exists conversations_insert_own on public.conversations;
drop policy if exists conversations_update_own on public.conversations;
drop policy if exists conversations_delete_own on public.conversations;

create policy conversations_select_own on public.conversations
  for select using (user_id = auth.uid());
create policy conversations_insert_own on public.conversations
  for insert with check (user_id = auth.uid());
create policy conversations_update_own on public.conversations
  for update using (user_id = auth.uid());
create policy conversations_delete_own on public.conversations
  for delete using (user_id = auth.uid());

-- ── conversation_messages (via parent join) ──
alter table public.conversation_messages enable row level security;

drop policy if exists conversation_messages_select_own on public.conversation_messages;
drop policy if exists conversation_messages_insert_own on public.conversation_messages;

create policy conversation_messages_select_own on public.conversation_messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
create policy conversation_messages_insert_own on public.conversation_messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- ── auto_sessions ──
alter table public.auto_sessions enable row level security;

drop policy if exists auto_sessions_select_own on public.auto_sessions;
drop policy if exists auto_sessions_insert_own on public.auto_sessions;
drop policy if exists auto_sessions_update_own on public.auto_sessions;
drop policy if exists auto_sessions_delete_own on public.auto_sessions;

create policy auto_sessions_select_own on public.auto_sessions
  for select using (user_id = auth.uid());
create policy auto_sessions_insert_own on public.auto_sessions
  for insert with check (user_id = auth.uid());
create policy auto_sessions_update_own on public.auto_sessions
  for update using (user_id = auth.uid());
create policy auto_sessions_delete_own on public.auto_sessions
  for delete using (user_id = auth.uid());

-- ── auto_session_messages (via parent join) ──
alter table public.auto_session_messages enable row level security;

drop policy if exists auto_session_messages_select_own on public.auto_session_messages;
drop policy if exists auto_session_messages_insert_own on public.auto_session_messages;

create policy auto_session_messages_select_own on public.auto_session_messages
  for select using (
    exists (
      select 1 from public.auto_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
create policy auto_session_messages_insert_own on public.auto_session_messages
  for insert with check (
    exists (
      select 1 from public.auto_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- ── custom_templates ──
alter table public.custom_templates enable row level security;

drop policy if exists custom_templates_select_own on public.custom_templates;
drop policy if exists custom_templates_insert_own on public.custom_templates;
drop policy if exists custom_templates_update_own on public.custom_templates;
drop policy if exists custom_templates_delete_own on public.custom_templates;

create policy custom_templates_select_own on public.custom_templates
  for select using (user_id = auth.uid());
create policy custom_templates_insert_own on public.custom_templates
  for insert with check (user_id = auth.uid());
create policy custom_templates_update_own on public.custom_templates
  for update using (user_id = auth.uid());
create policy custom_templates_delete_own on public.custom_templates
  for delete using (user_id = auth.uid());

-- ── scenes ──
alter table public.scenes enable row level security;

drop policy if exists scenes_select_own on public.scenes;
drop policy if exists scenes_insert_own on public.scenes;
drop policy if exists scenes_update_own on public.scenes;
drop policy if exists scenes_delete_own on public.scenes;

create policy scenes_select_own on public.scenes
  for select using (user_id = auth.uid());
create policy scenes_insert_own on public.scenes
  for insert with check (user_id = auth.uid());
create policy scenes_update_own on public.scenes
  for update using (user_id = auth.uid());
create policy scenes_delete_own on public.scenes
  for delete using (user_id = auth.uid());

-- ── scene_assets (has its own user_id column) ──
alter table public.scene_assets enable row level security;

drop policy if exists scene_assets_select_own on public.scene_assets;
drop policy if exists scene_assets_insert_own on public.scene_assets;
drop policy if exists scene_assets_update_own on public.scene_assets;
drop policy if exists scene_assets_delete_own on public.scene_assets;

create policy scene_assets_select_own on public.scene_assets
  for select using (user_id = auth.uid());
create policy scene_assets_insert_own on public.scene_assets
  for insert with check (user_id = auth.uid());
create policy scene_assets_update_own on public.scene_assets
  for update using (user_id = auth.uid());
create policy scene_assets_delete_own on public.scene_assets
  for delete using (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern B: athlete_id = my_athlete_id()
-- ────────────────────────────────────────────────────────────────────────────

-- ── athlete_profiles ──
alter table public.athlete_profiles enable row level security;

drop policy if exists athlete_profiles_select_own_or_admin on public.athlete_profiles;
drop policy if exists athlete_profiles_update_own on public.athlete_profiles;

create policy athlete_profiles_select_own_or_admin on public.athlete_profiles
  for select using (profile_id = auth.uid() or public.is_admin());

create policy athlete_profiles_update_own on public.athlete_profiles
  for update using (profile_id = auth.uid());

-- ── athlete_notifications ──
alter table public.athlete_notifications enable row level security;

drop policy if exists athlete_notifications_select_own_or_admin on public.athlete_notifications;
drop policy if exists athlete_notifications_update_own on public.athlete_notifications;

create policy athlete_notifications_select_own_or_admin on public.athlete_notifications
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());

create policy athlete_notifications_update_own on public.athlete_notifications
  for update using (athlete_id = public.my_athlete_id());

-- ── athlete_schedule ──
alter table public.athlete_schedule enable row level security;

drop policy if exists athlete_schedule_select_own_or_admin on public.athlete_schedule;

create policy athlete_schedule_select_own_or_admin on public.athlete_schedule
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());

-- ── schedule_events ──
alter table public.schedule_events enable row level security;

drop policy if exists schedule_events_select_own_or_admin on public.schedule_events;
drop policy if exists schedule_events_insert_own on public.schedule_events;
drop policy if exists schedule_events_update_own on public.schedule_events;
drop policy if exists schedule_events_delete_own on public.schedule_events;

create policy schedule_events_select_own_or_admin on public.schedule_events
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());
create policy schedule_events_insert_own on public.schedule_events
  for insert with check (athlete_id = public.my_athlete_id());
create policy schedule_events_update_own on public.schedule_events
  for update using (athlete_id = public.my_athlete_id());
create policy schedule_events_delete_own on public.schedule_events
  for delete using (athlete_id = public.my_athlete_id());

-- ── throwing_details (via parent join through schedule_events) ──
alter table public.throwing_details enable row level security;

drop policy if exists throwing_details_select_own_or_admin on public.throwing_details;
drop policy if exists throwing_details_insert_own on public.throwing_details;
drop policy if exists throwing_details_update_own on public.throwing_details;
drop policy if exists throwing_details_delete_own on public.throwing_details;

create policy throwing_details_select_own_or_admin on public.throwing_details
  for select using (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and (e.athlete_id = public.my_athlete_id() or public.is_admin())
    )
  );
create policy throwing_details_insert_own on public.throwing_details
  for insert with check (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and e.athlete_id = public.my_athlete_id()
    )
  );
create policy throwing_details_update_own on public.throwing_details
  for update using (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and e.athlete_id = public.my_athlete_id()
    )
  );
create policy throwing_details_delete_own on public.throwing_details
  for delete using (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and e.athlete_id = public.my_athlete_id()
    )
  );

-- ── workout_details (via parent join through schedule_events) ──
alter table public.workout_details enable row level security;

drop policy if exists workout_details_select_own_or_admin on public.workout_details;
drop policy if exists workout_details_insert_own on public.workout_details;
drop policy if exists workout_details_update_own on public.workout_details;
drop policy if exists workout_details_delete_own on public.workout_details;

create policy workout_details_select_own_or_admin on public.workout_details
  for select using (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and (e.athlete_id = public.my_athlete_id() or public.is_admin())
    )
  );
create policy workout_details_insert_own on public.workout_details
  for insert with check (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and e.athlete_id = public.my_athlete_id()
    )
  );
create policy workout_details_update_own on public.workout_details
  for update using (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and e.athlete_id = public.my_athlete_id()
    )
  );
create policy workout_details_delete_own on public.workout_details
  for delete using (
    exists (
      select 1 from public.schedule_events e
      where e.id = event_id and e.athlete_id = public.my_athlete_id()
    )
  );

-- ── cqr_reviews (uses user_id, not athlete_id) ──
alter table public.cqr_reviews enable row level security;

drop policy if exists cqr_reviews_select_own_or_admin on public.cqr_reviews;

create policy cqr_reviews_select_own_or_admin on public.cqr_reviews
  for select using (user_id = auth.uid() or public.is_admin());

-- ── compete_reports (has athlete_id + created_by) ──
alter table public.compete_reports enable row level security;

drop policy if exists compete_reports_select_own_or_admin on public.compete_reports;

create policy compete_reports_select_own_or_admin on public.compete_reports
  for select using (
    athlete_id = public.my_athlete_id()
    or created_by = auth.uid()
    or public.is_admin()
  );

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern C: Admin-only or limited access
-- ────────────────────────────────────────────────────────────────────────────

-- ── invitations — deny all (admin service role only) ──
alter table public.invitations enable row level security;

-- ── tool_permissions — SELECT own + admin ──
alter table public.tool_permissions enable row level security;

drop policy if exists tool_permissions_select_own_or_admin on public.tool_permissions;

create policy tool_permissions_select_own_or_admin on public.tool_permissions
  for select using (user_id = auth.uid() or public.is_admin());

-- ── throwing_templates — per-athlete, admin managed via service role ──
alter table public.throwing_templates enable row level security;

drop policy if exists throwing_templates_select_own_or_admin on public.throwing_templates;

create policy throwing_templates_select_own_or_admin on public.throwing_templates
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());

-- ── workout_templates — per-athlete, admin managed via service role ──
alter table public.workout_templates enable row level security;

drop policy if exists workout_templates_select_own_or_admin on public.workout_templates;

create policy workout_templates_select_own_or_admin on public.workout_templates
  for select using (athlete_id = public.my_athlete_id() or public.is_admin());


-- ============================================================================
-- PHASE 3 — PUBLIC / REFERENCE DATA
-- Authenticated SELECT only; writes handled by service role (cron/ingest).
-- ============================================================================

-- ── Large Statcast tables ──
alter table public.pitches enable row level security;

drop policy if exists pitches_select_authenticated on public.pitches;
create policy pitches_select_authenticated on public.pitches
  for select using (auth.uid() is not null);

alter table public.milb_pitches enable row level security;

drop policy if exists milb_pitches_select_authenticated on public.milb_pitches;
create policy milb_pitches_select_authenticated on public.milb_pitches
  for select using (auth.uid() is not null);

-- ── Reference / lookup tables ──
alter table public.players enable row level security;

drop policy if exists players_select_authenticated on public.players;
create policy players_select_authenticated on public.players
  for select using (auth.uid() is not null);

alter table public.glossary enable row level security;

drop policy if exists glossary_select_authenticated on public.glossary;
create policy glossary_select_authenticated on public.glossary
  for select using (auth.uid() is not null);

alter table public.league_averages enable row level security;

drop policy if exists league_averages_select_authenticated on public.league_averages;
create policy league_averages_select_authenticated on public.league_averages
  for select using (auth.uid() is not null);

alter table public.player_season_stats enable row level security;

drop policy if exists player_season_stats_select_authenticated on public.player_season_stats;
create policy player_season_stats_select_authenticated on public.player_season_stats
  for select using (auth.uid() is not null);

alter table public.pitcher_season_command enable row level security;

drop policy if exists pitcher_season_command_select_authenticated on public.pitcher_season_command;
create policy pitcher_season_command_select_authenticated on public.pitcher_season_command
  for select using (auth.uid() is not null);

alter table public.pitcher_season_deception enable row level security;

drop policy if exists pitcher_season_deception_select_authenticated on public.pitcher_season_deception;
create policy pitcher_season_deception_select_authenticated on public.pitcher_season_deception
  for select using (auth.uid() is not null);

alter table public.game_umpires enable row level security;

drop policy if exists game_umpires_select_authenticated on public.game_umpires;
create policy game_umpires_select_authenticated on public.game_umpires
  for select using (auth.uid() is not null);

alter table public.wbc_pitches enable row level security;

drop policy if exists wbc_pitches_select_authenticated on public.wbc_pitches;
create policy wbc_pitches_select_authenticated on public.wbc_pitches
  for select using (auth.uid() is not null);

alter table public.season_constants enable row level security;

drop policy if exists season_constants_select_authenticated on public.season_constants;
create policy season_constants_select_authenticated on public.season_constants
  for select using (auth.uid() is not null);

alter table public.park_factors enable row level security;

drop policy if exists park_factors_select_authenticated on public.park_factors;
create policy park_factors_select_authenticated on public.park_factors
  for select using (auth.uid() is not null);

alter table public.sprint_speed enable row level security;

drop policy if exists sprint_speed_select_authenticated on public.sprint_speed;
create policy sprint_speed_select_authenticated on public.sprint_speed
  for select using (auth.uid() is not null);

alter table public.transactions enable row level security;

drop policy if exists transactions_select_authenticated on public.transactions;
create policy transactions_select_authenticated on public.transactions
  for select using (auth.uid() is not null);

alter table public.game_scores enable row level security;

drop policy if exists game_scores_select_authenticated on public.game_scores;
create policy game_scores_select_authenticated on public.game_scores
  for select using (auth.uid() is not null);

alter table public.abs_daily_summary enable row level security;

drop policy if exists abs_daily_summary_select_authenticated on public.abs_daily_summary;
create policy abs_daily_summary_select_authenticated on public.abs_daily_summary
  for select using (auth.uid() is not null);

alter table public.abs_breakdown enable row level security;

drop policy if exists abs_breakdown_select_authenticated on public.abs_breakdown;
create policy abs_breakdown_select_authenticated on public.abs_breakdown
  for select using (auth.uid() is not null);

alter table public.abs_team enable row level security;

drop policy if exists abs_team_select_authenticated on public.abs_team;
create policy abs_team_select_authenticated on public.abs_team
  for select using (auth.uid() is not null);

alter table public.abs_player enable row level security;

drop policy if exists abs_player_select_authenticated on public.abs_player;
create policy abs_player_select_authenticated on public.abs_player
  for select using (auth.uid() is not null);

alter table public.filter_templates enable row level security;

drop policy if exists filter_templates_select_authenticated on public.filter_templates;
create policy filter_templates_select_authenticated on public.filter_templates
  for select using (auth.uid() is not null);

-- research_feeds — does not exist as a table, skipped

alter table public.models enable row level security;

drop policy if exists models_select_authenticated on public.models;
create policy models_select_authenticated on public.models
  for select using (auth.uid() is not null);

alter table public.sos_scores enable row level security;

drop policy if exists sos_scores_select_authenticated on public.sos_scores;
create policy sos_scores_select_authenticated on public.sos_scores
  for select using (auth.uid() is not null);

alter table public.milb_sos_scores enable row level security;

drop policy if exists milb_sos_scores_select_authenticated on public.milb_sos_scores;
create policy milb_sos_scores_select_authenticated on public.milb_sos_scores
  for select using (auth.uid() is not null);

-- ── Additional reference / derived tables ──

alter table public.defensive_arm_strength enable row level security;
drop policy if exists defensive_arm_strength_select_authenticated on public.defensive_arm_strength;
create policy defensive_arm_strength_select_authenticated on public.defensive_arm_strength
  for select using (auth.uid() is not null);

alter table public.defensive_catch_probability enable row level security;
drop policy if exists defensive_catch_probability_select_authenticated on public.defensive_catch_probability;
create policy defensive_catch_probability_select_authenticated on public.defensive_catch_probability
  for select using (auth.uid() is not null);

alter table public.defensive_catcher_framing enable row level security;
drop policy if exists defensive_catcher_framing_select_authenticated on public.defensive_catcher_framing;
create policy defensive_catcher_framing_select_authenticated on public.defensive_catcher_framing
  for select using (auth.uid() is not null);

alter table public.defensive_oaa enable row level security;
drop policy if exists defensive_oaa_select_authenticated on public.defensive_oaa;
create policy defensive_oaa_select_authenticated on public.defensive_oaa
  for select using (auth.uid() is not null);

alter table public.defensive_oaa_outfield enable row level security;
drop policy if exists defensive_oaa_outfield_select_authenticated on public.defensive_oaa_outfield;
create policy defensive_oaa_outfield_select_authenticated on public.defensive_oaa_outfield
  for select using (auth.uid() is not null);

alter table public.defensive_run_value enable row level security;
drop policy if exists defensive_run_value_select_authenticated on public.defensive_run_value;
create policy defensive_run_value_select_authenticated on public.defensive_run_value
  for select using (auth.uid() is not null);

alter table public.design_rules enable row level security;
drop policy if exists design_rules_select_authenticated on public.design_rules;
create policy design_rules_select_authenticated on public.design_rules
  for select using (auth.uid() is not null);

alter table public.lahman_allstars enable row level security;
drop policy if exists lahman_allstars_select_authenticated on public.lahman_allstars;
create policy lahman_allstars_select_authenticated on public.lahman_allstars
  for select using (auth.uid() is not null);

alter table public.lahman_awards enable row level security;
drop policy if exists lahman_awards_select_authenticated on public.lahman_awards;
create policy lahman_awards_select_authenticated on public.lahman_awards
  for select using (auth.uid() is not null);

alter table public.lahman_batting enable row level security;
drop policy if exists lahman_batting_select_authenticated on public.lahman_batting;
create policy lahman_batting_select_authenticated on public.lahman_batting
  for select using (auth.uid() is not null);

alter table public.lahman_fielding enable row level security;
drop policy if exists lahman_fielding_select_authenticated on public.lahman_fielding;
create policy lahman_fielding_select_authenticated on public.lahman_fielding
  for select using (auth.uid() is not null);

alter table public.lahman_halloffame enable row level security;
drop policy if exists lahman_halloffame_select_authenticated on public.lahman_halloffame;
create policy lahman_halloffame_select_authenticated on public.lahman_halloffame
  for select using (auth.uid() is not null);

alter table public.lahman_people enable row level security;
drop policy if exists lahman_people_select_authenticated on public.lahman_people;
create policy lahman_people_select_authenticated on public.lahman_people
  for select using (auth.uid() is not null);

alter table public.lahman_pitching enable row level security;
drop policy if exists lahman_pitching_select_authenticated on public.lahman_pitching;
create policy lahman_pitching_select_authenticated on public.lahman_pitching
  for select using (auth.uid() is not null);

alter table public.league_metric_baselines enable row level security;
drop policy if exists league_metric_baselines_select_authenticated on public.league_metric_baselines;
create policy league_metric_baselines_select_authenticated on public.league_metric_baselines
  for select using (auth.uid() is not null);

alter table public.milb_pitch_baselines enable row level security;
drop policy if exists milb_pitch_baselines_select_authenticated on public.milb_pitch_baselines;
create policy milb_pitch_baselines_select_authenticated on public.milb_pitch_baselines
  for select using (auth.uid() is not null);

alter table public.pitch_baselines enable row level security;
drop policy if exists pitch_baselines_select_authenticated on public.pitch_baselines;
create policy pitch_baselines_select_authenticated on public.pitch_baselines
  for select using (auth.uid() is not null);

alter table public.player_summary enable row level security;
drop policy if exists player_summary_select_authenticated on public.player_summary;
create policy player_summary_select_authenticated on public.player_summary
  for select using (auth.uid() is not null);

alter table public.report_card_templates enable row level security;
drop policy if exists report_card_templates_select_authenticated on public.report_card_templates;
create policy report_card_templates_select_authenticated on public.report_card_templates
  for select using (auth.uid() is not null);

alter table public.schedule_programs enable row level security;
drop policy if exists schedule_programs_select_authenticated on public.schedule_programs;
create policy schedule_programs_select_authenticated on public.schedule_programs
  for select using (auth.uid() is not null);

alter table public.umpire_challenges enable row level security;
drop policy if exists umpire_challenges_select_authenticated on public.umpire_challenges;
create policy umpire_challenges_select_authenticated on public.umpire_challenges
  for select using (auth.uid() is not null);

-- ── Client-CRUD tables (authenticated full access) ──

alter table public.report_templates enable row level security;

drop policy if exists report_templates_select_authenticated on public.report_templates;
drop policy if exists report_templates_insert_authenticated on public.report_templates;
drop policy if exists report_templates_update_authenticated on public.report_templates;
drop policy if exists report_templates_delete_authenticated on public.report_templates;

create policy report_templates_select_authenticated on public.report_templates
  for select using (auth.uid() is not null);
create policy report_templates_insert_authenticated on public.report_templates
  for insert with check (auth.uid() is not null);
create policy report_templates_update_authenticated on public.report_templates
  for update using (auth.uid() is not null);
create policy report_templates_delete_authenticated on public.report_templates
  for delete using (auth.uid() is not null);

alter table public.milb_report_templates enable row level security;

drop policy if exists milb_report_templates_select_authenticated on public.milb_report_templates;
drop policy if exists milb_report_templates_insert_authenticated on public.milb_report_templates;
drop policy if exists milb_report_templates_update_authenticated on public.milb_report_templates;
drop policy if exists milb_report_templates_delete_authenticated on public.milb_report_templates;

create policy milb_report_templates_select_authenticated on public.milb_report_templates
  for select using (auth.uid() is not null);
create policy milb_report_templates_insert_authenticated on public.milb_report_templates
  for insert with check (auth.uid() is not null);
create policy milb_report_templates_update_authenticated on public.milb_report_templates
  for update using (auth.uid() is not null);
create policy milb_report_templates_delete_authenticated on public.milb_report_templates
  for delete using (auth.uid() is not null);

alter table public.overlay_templates enable row level security;

drop policy if exists overlay_templates_select_authenticated on public.overlay_templates;
drop policy if exists overlay_templates_insert_authenticated on public.overlay_templates;
drop policy if exists overlay_templates_update_authenticated on public.overlay_templates;
drop policy if exists overlay_templates_delete_authenticated on public.overlay_templates;

create policy overlay_templates_select_authenticated on public.overlay_templates
  for select using (auth.uid() is not null);
create policy overlay_templates_insert_authenticated on public.overlay_templates
  for insert with check (auth.uid() is not null);
create policy overlay_templates_update_authenticated on public.overlay_templates
  for update using (auth.uid() is not null);
create policy overlay_templates_delete_authenticated on public.overlay_templates
  for delete using (auth.uid() is not null);


-- ============================================================================
-- PHASE 4 — SYSTEM / ADMIN TABLES
-- Enable RLS with no policies = deny all for anon/authenticated.
-- Service role (cron jobs, admin routes) bypasses RLS.
-- ============================================================================

alter table public.cron_runs enable row level security;
alter table public.briefs enable row level security;
alter table public.daily_cards enable row level security;
alter table public.daily_cards_config enable row level security;
alter table public.daily_graphics enable row level security;


-- ============================================================================
-- PHASE 5 — BROADCAST MODULE (deferred)
-- All broadcast routes already use supabaseAdmin + checkProjectAccess().
-- RLS would require complex project-membership joins.
-- Skipped for now — noted as future work.
-- Tables NOT touched:
--   broadcast_sessions, broadcast_scenes, broadcast_projects,
--   broadcast_project_members, broadcast_assets, broadcast_widget_state,
--   broadcast_chat_messages, broadcast_scene_assets, broadcast_clip_markers
-- ============================================================================


-- ============================================================================
-- DONE
-- ============================================================================
-- Summary:
--   Helper functions:  2 (is_admin, my_athlete_id)
--   Tables with RLS enabled: ~50
--   Tables with explicit policies: ~35
--   Tables with RLS + no policies (deny all): ~8
--   Broadcast tables deferred: 9
-- ============================================================================

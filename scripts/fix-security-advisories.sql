-- ============================================================================
-- fix-security-advisories.sql
--
-- Fixes 60+ Supabase security linter advisories across 7 sections.
-- Idempotent: safe to run multiple times.
--
-- Run via: Supabase SQL Editor (paste entire file and execute)
--
-- Manual step (not scriptable):
--   Enable leaked password protection in
--   Dashboard > Authentication > Providers > Email
-- ============================================================================


-- ============================================================================
-- PRE-CHECK DIAGNOSTICS
-- Run these queries BEFORE the migration to snapshot current state.
-- Uncomment the block and execute separately in Supabase SQL Editor.
-- ============================================================================
/*
-- Tables missing RLS entirely
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity
ORDER BY tablename;

-- Functions with mutable search_path (no search_path in proconfig)
SELECT p.proname, pg_get_function_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       array_to_string(p.proconfig, ', ') AS config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (p.proconfig IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
  ))
ORDER BY p.proname;

-- Functions callable by anon
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- SECURITY DEFINER views
SELECT c.relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN ('lahman_pitching_calc', 'lahman_batting_calc');

-- Storage policies referencing broadcast-media
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND qual::text LIKE '%broadcast-media%';
*/


-- ============================================================================
-- SECTION 1: Enable RLS on 3 unprotected tables                       [ERROR]
-- ============================================================================
-- These tables are accessed exclusively via supabaseAdmin (service-role key)
-- in server-side API routes. RLS + no policies = deny all for anon/authenticated.
-- Service-role bypasses RLS entirely.

ALTER TABLE public.broadcast_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrity_checks ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- SECTION 2: Fix 2 SECURITY DEFINER views                            [ERROR]
-- ============================================================================
-- Set security_invoker = true so views respect the querying user's permissions
-- instead of the view creator's. Only accessed via server-side run_query
-- (service-role), so no functional change — purely defense-in-depth.
-- Requires PostgreSQL 15+ (Supabase default).

ALTER VIEW public.lahman_pitching_calc SET (security_invoker = true);
ALTER VIEW public.lahman_batting_calc SET (security_invoker = true);


-- ============================================================================
-- SECTION 3: Replace permissive RLS policies on 6 tables               [WARN]
-- ============================================================================
-- For each table, dynamically drop ALL existing policies using pg_policies
-- catalog (catches dashboard-created policies not in version control), then
-- create correct replacement policies where needed.

-- ── broadcast_clip_markers: deny all (service-role only) ──────────────────
-- All access via supabaseAdmin + checkProjectAccess() in API routes.
ALTER TABLE public.broadcast_clip_markers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'broadcast_clip_markers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.broadcast_clip_markers', pol.policyname);
  END LOOP;
END $$;
-- No replacement policies → deny all for anon/authenticated.

-- ── custom_templates: deny all (service-role only) ────────────────────────
-- API routes create inline supabaseAdmin client with hardcoded DEFAULT_USER_ID.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custom_templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.custom_templates', pol.policyname);
  END LOOP;
END $$;

-- ── filter_templates: deny all (unused) ──────────────────────────────────
-- Zero code references in the application. Table is vestigial.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'filter_templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.filter_templates', pol.policyname);
  END LOOP;
END $$;

-- ── models: deny all (service-role only) ─────────────────────────────────
-- All API routes (models, models/deploy, player-data) use supabaseAdmin.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'models'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.models', pol.policyname);
  END LOOP;
END $$;

-- ── overlay_templates: authenticated CRUD ────────────────────────────────
-- Direct client-side CRUD from OverlayTemplateBuilder.tsx and reports pages.
-- No user_id column → ownership-based policies not possible. Grant full CRUD
-- to authenticated only (denies anon). All users are authenticated.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'overlay_templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.overlay_templates', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY overlay_templates_select_authenticated ON public.overlay_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY overlay_templates_insert_authenticated ON public.overlay_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY overlay_templates_update_authenticated ON public.overlay_templates
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY overlay_templates_delete_authenticated ON public.overlay_templates
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ── report_templates: authenticated CRUD ─────────────────────────────────
-- Direct client-side CRUD from GenerateReportDropdown and reports pages.
-- Same rationale as overlay_templates above.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.report_templates', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY report_templates_select_authenticated ON public.report_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY report_templates_insert_authenticated ON public.report_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY report_templates_update_authenticated ON public.report_templates
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY report_templates_delete_authenticated ON public.report_templates
  FOR DELETE USING (auth.uid() IS NOT NULL);


-- ============================================================================
-- SECTION 4: Fix search_path on 15 functions                          [WARN]
-- ============================================================================
-- Prevents search_path injection on SECURITY DEFINER functions by pinning
-- to explicit schemas. Including 'extensions' ensures pg_trgm operators
-- (%, similarity()) used by search functions resolve correctly.

ALTER FUNCTION public.run_query(text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.run_mutation(text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.run_query_long(text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.search_players(text, integer)
  SET search_path TO public, extensions;

ALTER FUNCTION public.search_batters(text, integer)
  SET search_path TO public, extensions;

ALTER FUNCTION public.search_all_players(text, text, integer)
  SET search_path TO public, extensions;

ALTER FUNCTION public.search_milb_players(text, integer)
  SET search_path TO public, extensions;

ALTER FUNCTION public.search_milb_batters(text, integer)
  SET search_path TO public, extensions;

ALTER FUNCTION public.get_distinct_values(text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.refresh_league_averages(integer)
  SET search_path TO public, extensions;

ALTER FUNCTION public.refresh_player_summary()
  SET search_path TO public, extensions;

ALTER FUNCTION public.refresh_batter_summary()
  SET search_path TO public, extensions;

ALTER FUNCTION public.upsert_pitches(jsonb)
  SET search_path TO public, extensions;

ALTER FUNCTION public.handle_new_user()
  SET search_path TO public, extensions;

ALTER FUNCTION public.increment_email_send_counter(uuid, text)
  SET search_path TO public, extensions;


-- ============================================================================
-- SECTION 5: Restrict SECURITY DEFINER function access          [WARN/ERROR]
-- ============================================================================
-- Revoke EXECUTE from roles that should not call these functions directly.
-- Service-role (supabaseAdmin) is unaffected — it always has access.

-- ── Group A: Revoke from PUBLIC, anon, AND authenticated ─────────────────
-- Server-side only: called via supabaseAdmin in API routes, cron jobs, or
-- DB triggers. No legitimate client-side caller exists.
-- Must revoke from PUBLIC (not just named roles) because anon/authenticated
-- inherit the default EXECUTE grant on PUBLIC.

REVOKE EXECUTE ON FUNCTION public.run_query(text)                        FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_mutation(text)                     FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_query_long(text)                   FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_pitches(jsonb)                  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_player_summary()               FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_batter_summary()               FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_email_send_counter(uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                      FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_league_averages(integer)       FROM public, anon, authenticated;

-- ── Group B: Revoke from public + anon, re-grant to authenticated ────────
-- Called from browser components via authenticated Supabase client:
--   search_players   → GlobalPlayerSearch, PlayerSearchInput
--   search_batters   → hitter search UIs
--   search_all_players → unified player search
--   search_milb_*    → MiLB pages
--   get_distinct_values → useExploreData hook, MiLB explore page

REVOKE EXECUTE ON FUNCTION public.search_players(text, integer)          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.search_batters(text, integer)          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.search_all_players(text, text, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.search_milb_players(text, integer)     FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.search_milb_batters(text, integer)     FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_distinct_values(text)              FROM public, anon;

GRANT EXECUTE ON FUNCTION public.search_players(text, integer)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_batters(text, integer)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_all_players(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_milb_players(text, integer)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_milb_batters(text, integer)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_distinct_values(text)               TO authenticated;

-- ── Group C: Revoke from public + anon, re-grant to authenticated ────────
-- Used within RLS policy expressions (evaluated in the session of the
-- querying role). Must remain callable by authenticated.

REVOKE EXECUTE ON FUNCTION public.is_admin()          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_compete_admin()  FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.my_athlete_id()     FROM public, anon;

GRANT EXECUTE ON FUNCTION public.is_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_compete_admin()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_athlete_id()      TO authenticated;


-- ============================================================================
-- SECTION 6: Restrict materialized view access                        [WARN]
-- ============================================================================
-- Revoke SELECT from anon, keep for authenticated. These materialized views
-- are read from client-side hooks (useHitterData, MiLB pages) which always
-- use an authenticated session.

REVOKE SELECT ON public.batter_summary       FROM anon;
REVOKE SELECT ON public.milb_player_summary  FROM anon;
REVOKE SELECT ON public.milb_batter_summary  FROM anon;


-- ============================================================================
-- SECTION 7: Remove storage bucket listing policy                     [WARN]
-- ============================================================================
-- The broadcast-media bucket only needs signed-URL access (upload via
-- createSignedUploadUrl, read via public URLs). Anonymous bucket listing
-- is not needed. Dynamically drop any SELECT policy on storage.objects
-- that references broadcast-media.

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND cmd = 'SELECT'
      AND qual::text LIKE '%broadcast-media%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;


-- ============================================================================
-- SECTION 8 (informational): RLS-enabled tables with no policies      [INFO]
-- ============================================================================
-- These tables intentionally have RLS enabled with no policies (deny all
-- for anon/authenticated). All access goes through supabaseAdmin.
-- No changes needed — listed here for audit completeness.
--
--   broadcast_scene_assets    broadcast_scenes    cron_runs
--   daily_cards               daily_graphics      invitations
--   newsletter_sends          newsletter_subscribers    whoop_tokens


-- ============================================================================
-- NOT ADDRESSED (accepted risks)
-- ============================================================================
-- 1. pg_trgm in public schema (WARN)
--    Moving it to extensions would break the % operator in
--    app/api/lahman/search/route.ts and app/api/chat/route.ts.
--    The search_path fix in Section 4 provides forward-compatibility.
--
-- 2. Leaked password protection (Dashboard toggle, not SQL)
--    Enable in: Dashboard > Authentication > Providers > Email


-- ============================================================================
-- POST-CHECK VERIFICATION
-- Run these queries AFTER the migration to confirm all fixes.
-- Uncomment the block and execute separately in Supabase SQL Editor.
-- ============================================================================
/*
-- 1. Verify RLS is enabled on previously unprotected tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('broadcast_chat_messages', 'broadcast_project_members', 'integrity_checks');
-- Expected: all show rowsecurity = true

-- 2. Verify SECURITY INVOKER on views
SELECT c.relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('lahman_pitching_calc', 'lahman_batting_calc');
-- Expected: reloptions contains {security_invoker=true}

-- 3. Verify policies were dropped on deny-all tables (should return 0 rows)
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('broadcast_clip_markers', 'custom_templates', 'filter_templates', 'models');

-- 4. Verify authenticated CRUD policies on overlay/report templates
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('overlay_templates', 'report_templates')
ORDER BY tablename, cmd;
-- Expected: 4 policies each (SELECT, INSERT, UPDATE, DELETE)

-- 5. Verify search_path is set on all 15 functions
SELECT p.proname, pg_get_function_arguments(p.oid) AS args,
       array_to_string(p.proconfig, ', ') AS config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'run_query', 'run_mutation', 'run_query_long',
    'search_players', 'search_batters', 'search_all_players',
    'search_milb_players', 'search_milb_batters', 'get_distinct_values',
    'refresh_league_averages', 'refresh_player_summary', 'refresh_batter_summary',
    'upsert_pitches', 'handle_new_user', 'increment_email_send_counter'
  )
ORDER BY p.proname;
-- Expected: all show search_path=public, extensions in config

-- 6. Verify anon cannot EXECUTE any listed functions
SELECT p.proname, pg_get_function_arguments(p.oid) AS args,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'run_query', 'run_mutation', 'run_query_long',
    'search_players', 'search_batters', 'search_all_players',
    'search_milb_players', 'search_milb_batters', 'get_distinct_values',
    'refresh_league_averages', 'refresh_player_summary', 'refresh_batter_summary',
    'upsert_pitches', 'handle_new_user', 'increment_email_send_counter',
    'is_admin', 'is_compete_admin', 'my_athlete_id'
  )
ORDER BY p.proname;
-- Expected: ALL show anon_can_execute = false

-- 7. Verify Group A functions are denied for authenticated too
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'run_query', 'run_mutation', 'run_query_long',
    'upsert_pitches', 'refresh_player_summary', 'refresh_batter_summary',
    'increment_email_send_counter', 'handle_new_user', 'refresh_league_averages'
  )
ORDER BY p.proname;
-- Expected: ALL show auth_can_execute = false

-- 8. Verify Group B + C functions ARE callable by authenticated
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'search_players', 'search_batters', 'search_all_players',
    'search_milb_players', 'search_milb_batters', 'get_distinct_values',
    'is_admin', 'is_compete_admin', 'my_athlete_id'
  )
ORDER BY p.proname;
-- Expected: ALL show auth_can_execute = true

-- 9. Verify materialized views deny anon SELECT
SELECT c.relname,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_can_select
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('batter_summary', 'milb_player_summary', 'milb_batter_summary');
-- Expected: anon_can_select = false, auth_can_select = true

-- 10. Verify no SELECT policies on broadcast-media storage (should return 0 rows)
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename  = 'objects'
  AND cmd = 'SELECT'
  AND qual::text LIKE '%broadcast-media%';
*/

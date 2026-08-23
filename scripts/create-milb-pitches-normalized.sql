-- milb_pitches_normalized — MiLB data presented in the MLB shape.
--
-- Applied to production as migration create_milb_pitches_normalized_view (2026-08-22).
-- Kept after the 2026-08-23 physical backfill of milb_pitches.events because it still
-- converts pfx_x/pfx_z, and because it makes the events mapping idempotent for any row that
-- arrives before the ingest map is next corrected.
--
-- Two columns differ from `pitches` and every metric in lib/reportMetrics.ts is written
-- against the MLB one:
--   events        Title Case vs snake_case. Numerators string-match the MLB vocabulary while
--                 denominators use `events IS NOT NULL`, so the bias is directional and
--                 downward: 2025 MiLB K% rendered 0.0 against 38,717 real strikeouts.
--   pfx_x/pfx_z   MiLB stores inches, MLB stores feet, and shared display code multiplies by
--                 12 regardless — AAA four-seamers plotted at ~49-103" of break.
--
-- The column list is generated from information_schema so it cannot drift as columns are
-- added to the base table. Re-run this file to rebuild the view after a schema change.
--
-- Baserunning events (caught stealing, stolen bases, wild pitch, passed ball, pickoffs) have
-- no MLB equivalent; MLB leaves `events` NULL. Mapping them to NULL also stops them being
-- counted as plate appearances by `events IS NOT NULL`. These are the only values left in
-- Title Case in the base table — the backfill deliberately preserved them.
DO $do$
DECLARE cols text; ddl text;
BEGIN
  SELECT string_agg(
           CASE column_name
             WHEN 'events' THEN $c$CASE events
                WHEN 'Strikeout' THEN 'strikeout' WHEN 'Strikeout Double Play' THEN 'strikeout_double_play'
                WHEN 'Walk' THEN 'walk' WHEN 'Hit By Pitch' THEN 'hit_by_pitch'
                WHEN 'Groundout' THEN 'field_out' WHEN 'Flyout' THEN 'field_out'
                WHEN 'Lineout' THEN 'field_out' WHEN 'Pop Out' THEN 'field_out'
                WHEN 'Field Out' THEN 'field_out' WHEN 'Bunt Groundout' THEN 'field_out'
                WHEN 'Bunt Pop Out' THEN 'field_out' WHEN 'Bunt Lineout' THEN 'field_out'
                WHEN 'Double Play' THEN 'double_play' WHEN 'Grounded Into DP' THEN 'grounded_into_double_play'
                WHEN 'Forceout' THEN 'force_out' WHEN 'Fielders Choice' THEN 'fielders_choice'
                WHEN 'Fielders Choice Out' THEN 'fielders_choice_out' WHEN 'Sac Fly' THEN 'sac_fly'
                WHEN 'Sac Bunt' THEN 'sac_bunt' WHEN 'Sac Fly Double Play' THEN 'sac_fly_double_play'
                WHEN 'Triple Play' THEN 'triple_play' WHEN 'Single' THEN 'single'
                WHEN 'Double' THEN 'double' WHEN 'Triple' THEN 'triple' WHEN 'Home Run' THEN 'home_run'
                WHEN 'Field Error' THEN 'field_error' WHEN 'Catcher Interference' THEN 'catcher_interf'
                WHEN 'Caught Stealing 2B' THEN NULL WHEN 'Caught Stealing 3B' THEN NULL
                WHEN 'Caught Stealing Home' THEN NULL WHEN 'Pickoff Caught Stealing Home' THEN NULL
                WHEN 'Cs Double Play' THEN NULL WHEN 'Stolen Base 2B' THEN NULL
                WHEN 'Stolen Base 3B' THEN NULL WHEN 'Wild Pitch' THEN NULL
                WHEN 'Passed Ball' THEN NULL WHEN 'Runner Out' THEN NULL
                WHEN 'Batter Out' THEN NULL
                ELSE events
              END AS events$c$
             WHEN 'pfx_x' THEN '(pfx_x / 12.0) AS pfx_x'
             WHEN 'pfx_z' THEN '(pfx_z / 12.0) AS pfx_z'
             ELSE quote_ident(column_name)
           END, E',\n  ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'milb_pitches';

  IF cols IS NULL THEN RAISE EXCEPTION 'milb_pitches not found'; END IF;

  ddl := format('CREATE OR REPLACE VIEW public.milb_pitches_normalized AS SELECT %s FROM public.milb_pitches', cols);
  EXECUTE ddl;
END
$do$;

COMMENT ON VIEW public.milb_pitches_normalized IS
  'milb_pitches with events normalized to the MLB snake_case vocabulary and pfx_x/pfx_z converted from inches to feet, so lib/reportMetrics.ts SQL is valid against MiLB data.';

GRANT SELECT ON public.milb_pitches_normalized TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Make the `biomech-reports` storage bucket private.
--
-- Why: `scripts/create-biomech-captures.sql:114-116` created this bucket with
-- `public = true`, relying on unguessable UUID paths. These PDFs name a real athlete —
-- at Neptune, often a minor — and carry their biomechanics assessment. An unguessable
-- URL is obscurity, not access control: it leaks permanently via referrer headers,
-- browser history, shared links, and anything that logs URLs, and it cannot be revoked.
-- The adjacent raw-capture bucket was already created private, and
-- `app/api/mechanics/captures/[id]/raw/route.ts:37` already serves it with a 300s signed
-- URL — this brings reports in line with the pattern the same feature already uses.
--
-- Ordering note: run this AFTER deploying the code change, not before. Once the bucket
-- is private, existing public URLs stop resolving; the new
-- `app/api/compete/reports/[id]/pdf` route is what keeps old reports readable.
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1. Flip the bucket to private.
update storage.buckets
set public = false
where id = 'biomech-reports';

-- 2. Rewrite stored public URLs down to bare storage paths.
--    Legacy rows hold: https://<project>.supabase.co/storage/v1/object/public/biomech-reports/<path>
--    The serving route tolerates both forms, but normalising makes the column mean one thing.
update public.compete_reports
set pdf_url = split_part(
      substring(pdf_url from position('/biomech-reports/' in pdf_url) + length('/biomech-reports/')),
      '?', 1
    )
where pdf_url is not null
  and pdf_url ~ '^https?://'
  and position('/biomech-reports/' in pdf_url) > 0;

commit;

-- ── Verification ──
-- Expect: public = false
select id, public from storage.buckets where id = 'biomech-reports';

-- Expect: 0 rows still holding an absolute URL.
select count(*) as still_absolute
from public.compete_reports
where pdf_url is not null and pdf_url ~ '^https?://';

-- Sanity: what the paths look like now.
select id, pdf_url from public.compete_reports
where subject_type = 'biomech' and pdf_url is not null
order by report_date desc nulls last
limit 5;

-- query_cache — TTL cache for heavy aggregation endpoints.
--
-- Consumed by lib/queryCache.ts (getCached / setCache / cached / invalidateCache /
-- invalidateBySource / purgeExpired), which has referenced this table since it was written.
-- The table did not exist until 2026-08-22: getCached folds the resulting 42P01 into
-- `if (error || !data) return null`, which is indistinguishable from a cache miss, and every
-- setCache call carries `.catch(() => {})`. The layer therefore stored nothing, silently,
-- and every "cached" route recomputed on every request.
--
-- Applied to production as migration create_query_cache_table.

CREATE TABLE IF NOT EXISTS public.query_cache (
  cache_key   text        PRIMARY KEY,
  response    jsonb       NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- getCached: cache_key = $1 AND expires_at > now()  — equality served by the primary key.
CREATE INDEX IF NOT EXISTS idx_query_cache_expires_at
  ON public.query_cache (expires_at);

-- invalidateCache: cache_key LIKE 'prefix%'. Under a non-C collation a default btree cannot
-- serve a prefix LIKE; text_pattern_ops can.
CREATE INDEX IF NOT EXISTS idx_query_cache_key_prefix
  ON public.query_cache (cache_key text_pattern_ops);

-- Written by route handlers through the service role only. RLS enabled with no policy denies
-- anon and authenticated outright; service_role bypasses RLS.
ALTER TABLE public.query_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.query_cache IS
  'TTL cache for heavy aggregation endpoints, written via lib/queryCache.ts by the service role.';

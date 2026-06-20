-- Idempotency key for Resend/Svix webhook events.
-- The webhook receiver dedupes on the Svix message id (svix-id) so retries/replays
-- can't insert duplicate email_events or double-increment send counters.
-- See app/api/emails/webhook/route.ts. (Applied to production 2026-06.)

ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS provider_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS email_events_provider_event_id_key
  ON public.email_events (provider_event_id) WHERE provider_event_id IS NOT NULL;

COMMENT ON COLUMN public.email_events.provider_event_id IS
  'Svix/Resend webhook message id (svix-id) for idempotent event ingestion.';

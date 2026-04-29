-- Migration: Add encrypted email + blind index columns to newsletter_subscribers
-- Run via Supabase SQL Editor. Idempotent (IF NOT EXISTS / IF EXISTS guards).
--
-- After running backfill-newsletter-encryption.ts and verifying all rows have
-- email_hash populated, run the follow-up migration to drop the plaintext email column.

-- 1. Add new columns
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS encrypted_email text,
  ADD COLUMN IF NOT EXISTS email_hash text;

-- 2. Unique index on email_hash for dedup lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_hash
  ON newsletter_subscribers (email_hash);

-- 3. Follow-up (run AFTER backfill is verified):
-- ALTER TABLE newsletter_subscribers DROP COLUMN IF EXISTS email;
-- DROP INDEX IF EXISTS newsletter_subscribers_email_key;

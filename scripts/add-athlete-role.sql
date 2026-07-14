-- Add the 'athlete' role to profiles.role.
--
-- The original profiles_role_check only permitted user/admin/owner, so inviting
-- an athlete silently failed: generateLink → on_auth_user_created trigger inserts
-- a default 'user' profile, then the invite route's upsert to role='athlete' was
-- rejected by the CHECK constraint (and its error was swallowed). The user ended
-- up as 'user' with no tool grants — locked out of everything, dumped on the
-- launcher instead of Compete.
--
-- Applied to prod via Supabase migration `add_athlete_role` (2026-07-14).
-- Keep this list in sync with ASSIGNABLE_ROLES in lib/roles.ts.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['user'::text, 'athlete'::text, 'admin'::text, 'owner'::text]));

-- Repair any account whose 'athlete' role was rejected while the old constraint
-- was in place (role fell back to the trigger default 'user'), cross-referencing
-- the invitations table for the intended role.
UPDATE public.profiles p
SET role = 'athlete'
FROM invitations i
WHERE i.email = p.email AND i.role = 'athlete' AND p.role = 'user';

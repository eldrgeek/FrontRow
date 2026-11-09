-- FrontRow admins by email (2026-11-07; Mike: "The Hootnet guys should all be
-- admins"). NOT YET APPLIED. Applying it is an auth change: Mike's yes first.
-- Idempotent: safe to re-run. Runs after 002 (frontrow_admins, is_frontrow_admin).
--
-- Before this, is_frontrow_admin matched frontrow_admins.user_id only, so a
-- person had to sign in to Soma Auth once and then be added by hand. Now a row
-- may name only an email (user_id NULL): it counts for the account with that
-- email once Soma Auth has CONFIRMED the address (email_confirmed_at), so a
-- password sign-up that claims someone's address without proving it gets
-- nothing. Every policy and RPC that calls is_frontrow_admin (002's venue
-- policies, 005's frontrow_can_manage_theater, 006's save_performance, the
-- builder's grants) picks this up with no other change.
--
-- The email allow-list in server/tickets.mjs (ADMIN_EMAILS) carries the same
-- people for the Netlify and frontrow-server gates.

CREATE OR REPLACE FUNCTION public.is_frontrow_admin(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.frontrow_admins a
    WHERE a.user_id = uid
       OR (a.user_id IS NULL AND EXISTS (
             SELECT 1 FROM auth.users u
             WHERE u.id = uid AND u.email_confirmed_at IS NOT NULL
               AND lower(u.email) = lower(a.email)))
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_frontrow_admin(uuid) TO anon, authenticated, service_role;

-- The Hootnet group (emails from their own mail to Mike, 2026-08-16).
INSERT INTO public.frontrow_admins (email) VALUES
  ('npstookey@gmail.com'),        -- Noel Paul Stookey
  ('gtcoveney@gmail.com'),        -- George Coveney
  ('majorpeabody@gmail.com'),     -- Harold Miller
  ('dwjessop@gmail.com'),         -- Doug "Jess" Jessop
  ('neale.eckstein@gmail.com')    -- Neale Eckstein
ON CONFLICT (email) DO NOTHING;

-- To take someone's admin away:  DELETE FROM public.frontrow_admins WHERE email = '<email>';

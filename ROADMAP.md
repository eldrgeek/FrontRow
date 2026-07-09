# FrontRow Theater — Roadmap / Feature Backlog

Source: review meeting 2026-07-08 (Fathom call 737345438, "Jess Jessop's Zoom
Meeting"). Stakeholder feedback primarily from **Jess** (Jess Jessop), with
Mike and George Coveney. Captured by Claude-COO. These are requirements to feed
through the FrontRow feedback/review queue — not yet built.

## Admins
Per the meeting's Next Steps ("grant Jess and George admin access"):
- **Mike Wolf** — mw@mike-wolf.com (seeded in `app_roles` + `frontrow_admins`)
- **Jess Jessop** — dwjessop@gmail.com (email allow-list; no SOMA account yet)
- **George Coveney** — gtcoveney@gmail.com (email allow-list; no SOMA account yet)

Jess/George become admins on first SOMA sign-in via the functions' email
allow-list (`netlify/functions/lib/appAdmin.ts`). Move to `app_roles` once they
have accounts.

## The overall note
Make FrontRow feel like a **real live performance venue**, not a technical
interface — and make it **theatrical / "sparkly"**, not drab. Better seat
visibility, performer prep, audience social features, smoother front door.

## 1. Front door / onboarding (HIGH — ties to "front door confusing")
- The entrance is confusing; users shouldn't have to figure out backstage plumbing.
- **Invite-link bypass** (Mike's key idea): an invite link to a specific show
  lets audience/performers **jump straight into the show with no auth**. Signing
  in / registering with SOMA is **optional** (offered, not required). This is the
  primary fix for the "front door is confusing" concern.

## 2. Seat interaction & identity display (HIGH)
- On seat select, immediately show the person's **name and/or face**.
- Per-user configurable: **just face / just name / both**.
- Users control what others see about them (privacy setting).

## 3. Audience social interaction
- Let audience members **talk to each other** — a **conversation room** for
  attendees of the same show. Doubles as a **post-show** space to discuss
  favorite moments.

## 4. Performer view / stage presence
- Clearer stage setup when a performer enters.
- A visible **placard**: performer name, show title, start time.
- A **placeholder image** for the performer.

## 5. Green room / holding area (HIGH — performer logistics)
- Virtual **green room** / waiting area for performers.
- **Countdown** to going live, with a virtual host/assistant voice:
  "You're live in 15 minutes", "10 minutes", …
- Performer can **see the audience** (faces/names, per settings).

## 6. Show format / event structure
- Shows have a **set duration**.
- Variable **capacity** — keep small/intimate by default (one or two rows), able
  to scale up.
- Clear process for **scheduling shows** and generating **shareable links**
  (feeds the invite-link bypass above).

## 7. Lobby / halftime
- A **lobby** / break area; a (half-joking) **halftime** where people step out,
  mingle, and return.

## 8. Visual redesign ("it's drab; this is theater, make it sparkly")
- Full visual upgrade of the front experience. Candidate lead: **Ren** (SOMA
  UI/design specialist; built soma-campus's 14-building virtual world), with
  **Cody** (Codex) for implementation. (Herm = Hermes messaging agent, not design.)

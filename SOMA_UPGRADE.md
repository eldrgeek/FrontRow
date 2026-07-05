# FrontRow SOMA Upgrade — Implementation Plan

**Status:** Phase 1 complete (schema + auth scaffolding) | Phase 2 ready (integration)  
**Branch:** `frontrow-soma-upgrade`  
**Date:** 2026-07-05  
**Author:** Claude (Sonnet 5) for Mike Wolf

---

## What's Been Built (Phase 1)

### 1. Database Schema ✅
**File:** `migrations/001_frontrow_soma_upgrade.sql`

11 tables + RLS policies:
- `frontrow_admins` — super admin registry (5 people)
- `room_templates` — immutable layout dictionary (Proscenium, Cabaret, Black Box)
- `venues` — theater venues with hierarchy (super_venue_id for complexes)
- `venue_settings` — per-venue customization (colors, curtain style, seat defaults)
- `sessions` — shows/performances (status, performer_ids[], timestamps)
- `session_settings` — per-session config (seat count, spotlight, curtain state)
- `show_feedback` — audience ratings/comments on performances (anonymous by default)
- `frontrow_feedback` — design feedback from team (SOMA standard)
- `venue_changelog` — audit log of venue changes
- `session_changelog` — audit log of session events
- `audience_attendance` — tracks who attended a session (for feedback eligibility)

**RLS policies enforce:**
- Super admins: full access to all tables
- Theater managers: own venues + their sessions
- Performance managers: own sessions only (per-invite)
- Performers: own sessions + can see feedback about their performance
- Audience: see active venues, attend/replay shows, submit feedback
- Anonymity: feedback is anon by default; users can self-identify in the message

**To deploy:** Run the SQL in Supabase Dashboard → SQL Editor (omfwcodoimjmbrhssvfl project)

---

### 2. React Types ✅
**File:** `front-row-vite/src/types/frontrow.ts`

Complete TypeScript interfaces for:
- `Venue`, `RoomTemplate`, `VenueSettings`
- `Session`, `SessionSettings`
- `ShowFeedback`, `FrontRowFeedback`
- `VenueChangelog`, `SessionChangelog`
- `FrontRowUser`, `UserRole`

---

### 3. Supabase Integration ✅
**File:** `front-row-vite/src/lib/supabase.ts`

Client initialization + FrontRow-specific helpers:
- `isSuperAdmin(userId)` — check if user is a super admin
- `getVenuesForUser(userId)` — load active venues
- `getSession(sessionId)` — fetch session + settings
- `getUserRole(userId, venueId)` — determine role in a venue
- Uses shared Supabase project (omfwcodoimjmbrhssvfl)

---

### 4. Auth Context ✅
**File:** `front-row-vite/src/contexts/AuthContext.tsx`

React Context for auth state + SOMA magic-link flow:
- `useAuth()` hook exposes: `session`, `user`, `isSuperAdmin`, `signInWithMagicLink()`, `signOut()`
- Auto-detects session on mount + listens for auth state changes
- Wraps the whole app to make auth available everywhere

---

### 5. Lobby Component ✅
**File:** `front-row-vite/src/components/Lobby.tsx` + `Lobby.css`

Post-auth landing page:
- Lists all active venues in a grid
- Click venue → navigate to `/venue/[id]`
- Super admins see link to `/admin`
- User menu with logout + role badge
- Responsive design (mobile-friendly)

---

### 6. Admin Dashboard ✅
**File:** `front-row-vite/src/components/AdminDashboard.tsx` + `AdminDashboard.css`

Super admin management interface:
- **Venues tab:** list all venues, toggle active/inactive, edit link
- **Sessions tab:** list all sessions, manage performers, view status
- **Feedback tab:** design feedback queue (scaffolded, not yet implemented)
- Only accessible to super admins (redirects otherwise)

---

## What's Still Needed (Phase 2)

### A. Router Setup
**What:** Wire up React Router to use the new auth + lobby flow  
**Files to create:**
- Update `App.tsx` to:
  - Wrap app in `<AuthProvider>`
  - Set up routes: `/login` → auth flow, `/` → lobby, `/venue/[id]` → theater room, `/admin` → admin dashboard
  - Redirect unauthenticated users to `/login`

### B. Login Page
**What:** SOMA Auth magic-link flow  
**Files to create:**
- `components/LoginPage.tsx` — email input + "Sign in with magic link" flow
- `components/AuthCallback.tsx` — handle OAuth redirect from Supabase (e.g., `/auth/callback`)

### C. Venue Room Component (Refactor App.tsx)
**What:** Multi-venue room support (currently App.tsx is single-venue)  
**Work:**
- Extract current App.tsx logic into a reusable `<Room>` component
- Pass `venue_id` + `session_id` as props
- Component sets up Socket.io connection to the right namespace (e.g., `venue/${venue_id}`)
- Fetch session state from database on mount
- Subscribe to real-time updates via Supabase (session status, performer_ids, settings)

### D. Performer Invite Flow
**What:** Theater/performance managers can invite performers  
**Files to create:**
- `components/PerformerInviteModal.tsx` — form to email invite
- Netlify function `netlify/functions/invite-performer.js` — send email + generate invite token
- `components/InviteAccept.tsx` — `/invite/performer?token=...` link handling

### E. LiveKit Token Integration
**What:** Tie LiveKit tokens to venue membership  
**Work:**
- Update existing LiveKit token endpoint to validate:
  - User is authenticated
  - User is in this venue (performer_ids or attended the session)
  - Issue token scoped to that venue + session
- Prevent token generation for unauthorized users

### F. Feedback Submission
**What:** Wire up feedback forms  
**Files to create:**
- `components/ShowFeedbackForm.tsx` — post-show rating + anonymous comment
- `components/DesignFeedbackWidget.tsx` — SOMA-standard feedback for admins
- Netlify function `netlify/functions/submit-show-feedback.js` — store in Supabase

### G. Admin Features
**What:** Full admin CRUD  
**Files to create:**
- `components/AdminVenueForm.tsx` — create/edit venues, set theater manager
- `components/AdminSessionManager.tsx` — create sessions, invite performers, manage state
- `components/AdminFeedbackList.tsx` — view + respond to design feedback

### H. Supabase Invite System
**What:** Super admin invites for registering new super admins  
**Files to create:**
- Netlify function `netlify/functions/invite-super-admin.js` — send invite email
- `components/InviteSuperAdmin.tsx` — form for admins to send invites
- Invite token logic (store in a table or JWT)

---

## Integration Checklist

**Before launching Phase 2:**

- [ ] Deploy SQL schema to Supabase (via Dashboard SQL Editor)
- [ ] Test schema RLS policies (spot-check a few INSERT/SELECT scenarios)
- [ ] Register the 5 super admins in `frontrow_admins` table (via SQL or function)
- [ ] Verify Supabase CORS + redirect URI allow-list includes FrontRow domains:
  - Production: `https://frontrowtheater.netlify.app/**`
  - Staging/Preview: `https://*--frontrow*.netlify.app/**`
  - Local dev: `http://localhost:5173/**`

**After Phase 2 is complete:**

- [ ] Test full auth flow (magic link → lobby → pick venue → room)
- [ ] Test performer invite flow (admin invites → email → accept → room access)
- [ ] Test feedback submission + admin review
- [ ] Verify RLS blocks unauthorized access (e.g., audience can't see backend controls)
- [ ] Load test: simulate 20 users in one venue (Socket.io + Supabase)

---

## File Structure After Phase 1

```
FrontRow/
├── migrations/
│   └── 001_frontrow_soma_upgrade.sql         ← Deploy this first
├── front-row-vite/
│   └── src/
│       ├── contexts/
│       │   └── AuthContext.tsx                ✅ New
│       ├── lib/
│       │   └── supabase.ts                    ✅ New
│       ├── types/
│       │   └── frontrow.ts                    ✅ New
│       ├── components/
│       │   ├── Lobby.tsx                      ✅ New
│       │   ├── Lobby.css                      ✅ New
│       │   ├── AdminDashboard.tsx             ✅ New
│       │   ├── AdminDashboard.css             ✅ New
│       │   ├── App.tsx                        ⏳ Needs routing refactor
│       │   └── ... (other components)
│       └── App.css
└── netlify/functions/
    └── ... (existing functions)
```

---

## Next Steps for Mike

1. **Review the schema** — does `001_frontrow_soma_upgrade.sql` look right? Any changes to the RLS policies or table structure?

2. **Approve the auth flow direction** — does the Lobby → Venue routing flow make sense?

3. **Ready to proceed?** I can:
   - Continue with Phase 2 (Router setup, Login page, Venue room refactor) — **high effort, 4-6 hours of focused work**
   - Or break it into smaller chunks (login page first, then room refactor, then admin features)

4. **Deploy the schema** — Once you review and approve, run the SQL in Supabase Dashboard, then register the 5 super admins via `INSERT INTO frontrow_admins ...`

---

## Technical Decisions Made

- **Shared Supabase project:** Uses omfwcodoimjmbrhssvfl (Legends + Playmaker already use it). FrontRow tables are isolated via RLS.
- **Magic-link auth:** Simple, no passwords. Consistent with SOMA Auth standard.
- **Anonymous feedback by default:** User can self-identify in the message. Encourages honesty.
- **Venue hierarchy:** `super_venue_id` allows Theater Complexes → individual theaters, but optional for standalone venues.
- **Performers array on session:** Multiple performers per show from day 1 (no refactor needed later).
- **Changelog tables:** Separate `venue_changelog` (config) and `session_changelog` (events) for clean audit trails.

---

## Known Limitations (to be addressed in Phase 2)

- ⏳ Performer invites not yet implemented (needs email + token logic)
- ⏳ LiveKit token validation doesn't check venue membership yet
- ⏳ Replay eligibility not yet enforced (can_replay flag exists, but no playback UI)
- ⏳ Performance manager role is scaffolded but not fully wired (per-session delegation)
- ⏳ Feedback comments in design feedback not yet viewable in admin UI

---

## Questions for Mike

1. Approve schema direction?
2. Should I continue with Phase 2 implementation, or wait for your feedback?
3. When do you want to register the 5 super admins?
4. Should performer invites be email-based, or in-app form (for people already signed up)?

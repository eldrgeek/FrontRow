# FrontRow SOMA Upgrade — Implementation Plan

**Status:** Phase 1 complete (schema + auth scaffolding + canon) | Phase 2 in progress (components + integration)  
**Branch:** `frontrow-soma-upgrade`  
**Last updated:** 2026-07-05 (evening)  
**Author:** Claude team (Sonnet 5, Opie, Haiku) for Mike Wolf

---

## What's Been Built (Phase 1 + Early Phase 2)

### 1. Database Schema ✅
**File:** `migrations/001_frontrow_soma_upgrade.sql`

13 tables + RLS policies (updated for delegation model):
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
- `profiles` — user profiles with `is_ai` flag (for UX affordances only)
- `delegations` — many-to-many user delegation table (principal → agent)

**Delegation model (NEW):**
- Any user can have multiple agents, be agent for multiple users
- `is_ai` flag is ONLY for UI labels ("agent is AI" vs "agent is human")
- Zero permission/capability distinction between human and AI agents
- Trust-based: agent gets full authority once delegated to
- Audit trail: every action logged with agent_id + principal_id

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

### 7. REST API Routes ✅
**File:** `server/api-routes.js`

Delegation-aware REST endpoints:
- **Venues:** GET (all active), POST (create — super admin only)
- **Sessions:** GET (all), POST (create — theater manager+), include optional `?on_behalf_of=user_id`
- **Performers:** POST `/sessions/:id/invite-performer` (theater manager+)
- **Feedback:** POST `/feedback/show` (audience), POST `/feedback/design` (any user)
- **Delegations:** GET agents, GET agent-for, POST (create), DELETE (revoke)
- **Auth middleware:** `extractUser()` validates JWT, `checkDelegation()` verifies delegation chain
- **Audit logging:** every action logged with actor + on_behalf_of + details

All endpoints respect delegation: requester is principal OR requester is delegated by principal.

### 8. Login Page ✅
**File:** `front-row-vite/src/components/LoginPage.tsx` + `LoginPage.css`

Magic-link email auth flow:
- Email input form
- Magic link sent confirmation
- Responsive design
- Error handling

### 9. Auth Callback ✅
**File:** `front-row-vite/src/components/AuthCallback.tsx` + `AuthCallback.css`

OAuth redirect handler:
- Validates session after email link click
- Redirects to lobby if authenticated, login if not
- Loading spinner during check

### 10. Auth Context (Enhanced) ✅
**File:** `front-row-vite/src/contexts/AuthContext.tsx`

Expanded to track delegation:
- `agents` array (people/AIs this user delegated to)
- `agentFor` array (people this user is agent for)
- `isAI` boolean (for UX affordances)
- Methods: `delegateTo()`, `revokeDelegation()`
- Auto-loads delegation data on auth

### 11. SOMA Canon Standard ✅
**File:** `~/Projects/SOMA/SOMA-APP-STANDARD.md` (§14)

Documented agent/delegation pattern as load-bearing standard:
- Any user can delegate to any user (many-to-many, no scoping)
- `is_ai` flag for UX only
- REST API surface for universal accessibility
- RLS enforcement (one-line check per table)
- Audit trail (agent_id + principal_id + action)
- Reference implementation: FrontRow (performers delegating on behalf of manager)
- Load-bearing for Legends Connect Phase 0, Playmaker, future SOMA apps

---

## What's Still Needed (Phase 2 Remaining)

### A. Router Setup
**What:** Wire up React Router to use the new auth + lobby flow  
**Work:**
- Update `App.tsx` to:
  - Wrap app in `<AuthProvider>`
  - Set up routes: `/login` → LoginPage, `/auth/callback` → AuthCallback, `/` → Lobby, `/venue/[id]` → Room, `/admin` → AdminDashboard, `/settings` → DelegationSettings
  - Add route guards (redirect unauthenticated users to `/login`)

### B. Venue Room Component (Refactor App.tsx) ⏳
**What:** Multi-venue room support (currently App.tsx is single-venue)  
**Work:**
- Extract current App.tsx logic into a reusable `<Room>` component
- Pass `venue_id` + `session_id` as props
- Component sets up Socket.io connection to the right namespace (e.g., `venue/${venue_id}`)
- Fetch session state from database on mount
- Subscribe to real-time updates via Supabase (session status, performer_ids, settings)

### C. Server Integration
**What:** Wire REST API routes into Express server  
**Work:**
- Import `api-routes.js` into `server/index.js`
- Mount routes: `app.use('/api/v1', router)`
- Integrate with Socket.io namespaces (one per venue)
- CORS config for frontend origin

### D. Delegation Settings UI
**What:** User can manage agents  
**Files to create:**
- `components/DelegationSettings.tsx` — "Your agents" + "You are agent for" lists
- Add to settings page (accessible from `/settings`)

### E. Performer Invite Flow
**What:** Theater/performance managers can invite performers  
**Work:**
- Theater manager sees `POST /api/v1/sessions/:id/invite-performer` available
- Can call it directly or from admin dashboard
- Email invite (optional Phase 2 deferred) — invite token + link flow

### F. LiveKit Token Integration
**What:** Tie LiveKit tokens to venue membership  
**Work:**
- Update existing LiveKit token endpoint to validate:
  - User is authenticated
  - User is in this venue (performer_ids or attended the session)
  - `?on_behalf_of` support for delegated performers
  - Issue token scoped to venue + session
- Prevent token generation for unauthorized users

### G. Feedback Forms
**What:** Wire up feedback submission  
**Files to create:**
- `components/ShowFeedbackForm.tsx` — post-show rating + anonymous comment (anonymous by default, self-identify optional)
- `components/DesignFeedbackWidget.tsx` — SOMA-standard design feedback for admins
- Use `/api/v1/feedback/show` and `/api/v1/feedback/design` endpoints

### H. Server-side API Integration
**What:** Connect API routes to Supabase  
**Work:**
- Add SUPABASE_SERVICE_ROLE_KEY to Netlify env
- Wire up audit logging to a table or JSONL
- Test delegation chain validation (on_behalf_of parameter)
- Verify RLS policies work as expected

### I. OpenAPI Spec (Optional Phase 2)
**What:** Document REST API for AI agents  
**Work:**
- Generate OpenAPI spec from routes
- Host at `/api/openapi.json`
- Makes it easy for AIs to discover available operations

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

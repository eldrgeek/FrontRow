# FrontRow Phase 2 Handoff

**Branch:** `frontrow-soma-upgrade`  
**Status:** Phase 1 complete, Phase 2 ready to start  
**Date:** 2026-07-05  
**From:** Claude team (Sonnet/Opie) → Next session (Haiku primary)

---

## What's Done (Phase 1 ✅)

All committed to `frontrow-soma-upgrade`:

1. **Schema + Delegation Model** — `migrations/001_frontrow_soma_upgrade.sql`
   - 13 tables (profiles, delegations, venues, sessions, feedback, changelog, etc)
   - RLS policies (delegation-aware: `auth.uid() = principal OR auth.uid() is delegated by principal`)
   - Many-to-many delegation (any user → any user, no scoping)

2. **REST API Routes** — `server/api-routes.js`
   - Venues, Sessions, Performers, Feedback, Delegations endpoints
   - Delegation middleware: `extractUser()`, `checkDelegation()`
   - All support `?on_behalf_of=user_id` parameter
   - Audit logging skeleton (logs to console, ready for DB)

3. **Frontend Components** — all styled, ready to wire:
   - `LoginPage.tsx` + CSS
   - `AuthCallback.tsx` + CSS
   - `Lobby.tsx` + CSS (venue browser)
   - `AdminDashboard.tsx` + CSS (super admin interface)

4. **Auth Context** — `AuthContext.tsx`
   - Tracks `agents` (who I delegated to) + `agentFor` (who I'm agent for)
   - Methods: `delegateTo()`, `revokeDelegation()`
   - Auto-loads on auth

5. **Types** — `types/frontrow.ts`
   - Complete TypeScript interfaces for all entities

6. **SOMA Canon** — `~/Projects/SOMA/SOMA-APP-STANDARD.md` §14
   - Agent/Delegation documented as load-bearing standard
   - REST API surface, RLS model, audit trail specified
   - Reference implementations (FrontRow, Legends Connect, Playmaker)

---

## Phase 2 Tasks (9 items, sequential order)

### 1. Router Setup (1-2 hours)
**Goal:** Wire LoginPage, Lobby, AdminDashboard with React Router  
**Files to edit:**
- `App.tsx` — add React Router + AuthProvider wrapper
- Add routes:
  - `/login` → LoginPage
  - `/auth/callback` → AuthCallback
  - `/` → Lobby (protected)
  - `/admin` → AdminDashboard (protected, super-admin only)
  - `/settings` → DelegationSettings (protected)
  - `/venue/:id` → Room (protected, stub for now)
- Route guards: redirect unauthenticated to `/login`, non-super-admin away from `/admin`

**Success criteria:** Click through login → lobby → admin, all routes resolve

### 2. Delegation Settings Component (1 hour)
**Goal:** UI for managing agents  
**Files to create:**
- `components/DelegationSettings.tsx` + CSS
- Show: "Your agents: [list with revoke buttons]" + "You are agent for: [list]"
- Call `/api/v1/delegations/agents` and `/api/v1/delegations/agent-for` on load
- Revoke button calls `DELETE /api/v1/delegations/:agent_id`

**Success criteria:** User can see their agents and revoke delegation

### 3. Server Integration (2 hours)
**Goal:** Wire API routes into Express server  
**Files to edit:**
- `server/index.js` — import and mount `api-routes.js`
  - `const { router } = require('./api-routes.js');`
  - `app.use('/api/v1', router);`
- Add CORS config for frontend origin
- Verify Supabase client initialized (service role key from env)

**Success criteria:** 
- `curl http://localhost:3001/api/v1/venues` returns JSON
- Routes accept `Authorization: Bearer <token>` headers

### 4. LiveKit Token Validation (1-2 hours)
**Goal:** Tie token generation to venue membership  
**Files to edit:**
- Existing LiveKit token endpoint (or create if missing)
- Add checks:
  - User authenticated (JWT valid)
  - User in venue (is performer OR attended session OR is theater manager for venue)
  - Support `?on_behalf_of=user_id` for delegated performers
  - Issue token with room name = `venue_${venue_id}`
- Return 403 if unauthorized

**Success criteria:** Performer can request token, audience cannot

### 5. Feedback Forms (1.5 hours)
**Goal:** Wire up feedback submission UI  
**Files to create:**
- `components/ShowFeedbackForm.tsx` — post-show form
  - Rating (1-5, optional)
  - Text (optional)
  - Author name (optional, anonymous by default)
  - Submit button calls `POST /api/v1/feedback/show`
  - CSS styling
- `components/DesignFeedbackWidget.tsx` — SOMA design feedback
  - Type: bug or feature
  - Description
  - Submit calls `POST /api/v1/feedback/design`

**Success criteria:** Forms submit and data appears in Supabase

### 6. Performer Invite Flow (1.5 hours)
**Goal:** Theater managers can invite performers via admin dashboard  
**Files to edit:**
- `AdminDashboard.tsx` — add button to session row: "Invite Performer"
- Create modal/form `PerformerInviteModal.tsx`:
  - Text input for performer email/ID
  - Submit button calls `POST /api/v1/sessions/:id/invite-performer`
  - Updates session.performer_ids
  - Shows success/error

**Success criteria:** Admin can invite performer, performer_ids updates in DB

### 7. Audit Logging Backend (1 hour)
**Goal:** Persist audit logs to database  
**Work:**
- Create `public.audit_log` table:
  ```sql
  id uuid pk
  timestamp timestamptz
  actor_id uuid
  on_behalf_of_user_id uuid (nullable)
  action text
  resource_id uuid (nullable)
  resource_type text
  details jsonb
  ```
- Update `api-routes.js` `logAction()` to insert into this table instead of console.log

**Success criteria:** Actions appear in audit_log table with actor + on_behalf_of

### 8. Room Component Refactor (2-3 hours)
**Goal:** Extract current App.tsx logic into reusable `<Room>` component  
**Work:**
- Create `components/Room.tsx` that accepts `{ venueId, sessionId }`
- Move all 3D/WebRTC logic from current App.tsx
- Connect to `/api/v1/sessions/:id` to fetch session state
- Subscribe to real-time updates (Supabase or Socket.io)
- Render theater + audience controls based on user role

**Success criteria:** Room component renders venue 3D scene, accepts performer/audience input

### 9. Integration Testing (1.5 hours)
**Goal:** End-to-end test of auth → lobby → venue → feedback flow  
**Work:**
- Create test user (or use super admin email)
- Test flow:
  1. Email login, click magic link
  2. See lobby with active venues
  3. Click venue → see Room
  4. Invite performer (if admin)
  5. Submit feedback (if audience)
  6. Check audit log
  7. Revoke delegation, verify access denied
- Document any blockers or bugs found

**Success criteria:** Full flow works end-to-end

---

## Key Design Decisions (Locked In)

- **Delegation model:** Many-to-many, no permission scoping, `is_ai` for UX only
- **Auth pattern:** Magic-link email via Supabase, stored in shared project
- **REST surface:** Primary integration point for AIs/agents, no MCP required
- **Audit trail:** Every action logged with actor_id + on_behalf_of_user_id
- **RLS enforcement:** One-line check per table: `(auth.uid() = principal OR delegated_by)`
- **Component architecture:** Room is isolated (accepts venue/session props), Lobby/Admin are full-page

---

## Known Deferred (Not Blockers)

- Performer email invites (token-based link flow) — can use email + manual for now
- Replay feature UX (can_replay flag exists, no playback UI)
- Performance manager role (scaffolded, not fully wired per-session)
- OpenAPI spec (nice-to-have, AIs can use REST directly)
- Theater manager UI to create venues/sessions (admin only for now)

---

## Continuation Prompt for Next Session

```
We're upgrading FrontRow to a first-class SOMA app with:
- Multi-venue support (unique URLs per venue)
- Agent/delegation model (any user can act on behalf of any user)
- REST API for AI agents to call on behalf of principals
- Feedback + changelog tracking

Phase 1 is complete (schema, auth context, REST API, components).

Phase 2 is 9 integration tasks (router, delegation UI, server integration, etc).

**Your job:** Build Phase 2, starting with Router Setup (task #1).

**Key context:**
- Branch: frontrow-soma-upgrade
- All Phase 1 work is committed
- Components exist but aren't wired to routes yet
- API routes exist but aren't mounted to Express server yet
- Delegation model is: many-to-many (any user → any user), trust-based, no scoping

**What's load-bearing:**
- The delegation model is now a SOMA-APP-STANDARD (§14)
- Every action must be audit-logged with actor_id + on_behalf_of_user_id
- All REST endpoints support ?on_behalf_of parameter
- RLS policies check: requester is principal OR requester is delegated by principal

**First task:** Router setup — wire LoginPage, AuthCallback, Lobby, AdminDashboard with React Router routes. Estimated 1-2 hours.

See PHASE-2-HANDOFF.md for full task list and success criteria for each.

Mike's design direction: This is a SOMA app for humans AND AIs. Agents should be able to call the API and act on behalf of principals. No configuration needed, just REST calls. The /handoff protocol design should be the first task AFTER Phase 2 completes (to automate these handoffs).
```

---

## Files to Know

- Schema: `migrations/001_frontrow_soma_upgrade.sql` (deploy to Supabase)
- API routes: `server/api-routes.js` (mount into Express)
- Auth: `front-row-vite/src/contexts/AuthContext.tsx` (already handles delegation)
- Components: `front-row-vite/src/components/{LoginPage,AuthCallback,Lobby,AdminDashboard}.tsx`
- Types: `front-row-vite/src/types/frontrow.ts`
- Upgrade docs: `SOMA_UPGRADE.md` (current status + design decisions)

---

**Ready to hand off. Good luck, next team! 🚀**

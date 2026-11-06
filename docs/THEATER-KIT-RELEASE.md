# Theater kit release runbook

_Written 2026-11-05 by Claude (Claude Code, release thread "FRT: Plan the theater kit release") for Mike Wolf. Mike: "Have somebody take a look at this and see if there are holes in the plan and fill them, and then get a team to work building this."_

This takes the theater kit from five draft PRs to production. **Every step marked 🔒 changes production and waits for Mike's yes.** Everything else an AI does before asking.

## What ships

| PR | Repo | What | Touches |
|---|---|---|---|
| #4 | FrontRow | Guest evening rebuilt to the vision film | Netlify, frontrow-server |
| #5 | FrontRow | Theaters as definition records | Netlify, frontrow-server (`api-routes.js`), migrations 003 and 005 |
| #8 | FrontRow | Lobby doors, seat templates, theme tokens | Netlify |
| #7 | FrontRow | Builder at `/build/:theater` with a SOMA room | Netlify, needs soma-rooms #11 and `apps.json` |
| #9 | FrontRow | Each screen is its own house (seats, show state, chat, LiveKit room). **Merged into #4's branch on 2026-11-06**, so it ships with #4 | frontrow-server (`rooms.js`), Netlify token function |
| #6 | FrontRow | Ticket grants gate the LiveKit token mint | Netlify functions, frontrow-server (`tickets.mjs`), migration 004 |
| #11 | FrontRow | Performances and Library recordings | frontrow-server (`performances.mjs`), migration 006 |
| #13 | FrontRow | Box office: sell and mail audience tickets | Netlify functions (`box-office-*`, `mail-work`), migration 007, a mail worker on the Mac |
| this PR | FrontRow | CORS fix, this runbook, the cross-stack e2e | frontrow-server |
| #11 | soma-rooms | App ops: room AIs propose typed edits | VPS `soma-rooms-v1` |

Not part of the release: #12 (CI and Claude auto-merge). See "Auto-merge" below before merging it.

**Where things run.** The FrontRow front end and its functions are on Netlify (`frontrowtheater`, master = production). The socket server is **not on Render**: it is pm2 `frontrow-server` on the VPS, in `/opt/frontrow-server`, which is not a git checkout (deploy = copy files, restart). SOMA Rooms is pm2 `soma-rooms-v1` on the VPS. Supabase is project `omfwcodoimjmbrhssvfl`. Video is LiveKit Cloud project `hootnet-zkp2l3aj` for FrontRow and the VPS LiveKit for SOMA Rooms.

## Order, and why

**Merge order: #4, #5, #8, #7, #6, #11, #13, then this PR.** #9 is already inside #4. Done on 2026-11-06 as one series of merge commits pushed to master (this PR's branch), at #4 ce94618, #5 47563f7, #8 6be75ce, #7 aee1d2d, #6 c21aaef, #11 1c2013b, #13 1a242d3. Hand resolutions, all mechanical:
- **#6** after #7: `server/index.js`, take #6's token block. `netlify/functions/get-livekit-token.ts`: take #6's (it delegates to `server/tickets.mjs` `handleToken`, which already limits performers to a ticket or a signed-in admin, the gate #4 ce94618 added). In `useLiveKit.ts`, take #6's `getToken` with `&room=${encodeURIComponent(livekitRoomRef.current)}`; #6's `tokenRequestHeaders` sends the Supabase session, so the admin's Bearer still goes with a performer request.
- **#13** after #11: root `package.json`, keep both scripts.
- After #6, #4's `scripts/livekit-token-selftest.mjs` expected the identity `performer`; #6 mints `performer-<id>` and reserves every performer name. The test now expects `performer-<id>`.

On the result: tsc, the build, the functions typecheck, `test:builder` (19), `test:tickets` (83), `test:rooms` (63), `test:performances` (85), `test:box-office` (117), `test:livekit-token` (9) and the cross-stack e2e (22, migrations 002 to 007) all pass. `npm run lint` reports 65 problems, the same 65 as master.

**Migration order: 003, 004, 005, 006, 007.** 004 needs 003's slugs. 005 replaces 004's `frontrow_ticket_can_manage` and room-mode hooks, so it must follow 004. 006 renames `frontrow_ticket_redeem` to `frontrow_ticket_redeem_base` and wraps it, so **re-run 006 after any re-run of 004 or 005**. 007 (box office) adds functions and changes none of 004's. Apply 003 only once #5's venue-list filter is live, or master's `/venues` lists the three screens as venues. Everything from 003 on is additive and idempotent (run twice in tests).

**One production deploy, not six.** Every merge to master is a Netlify production deploy, and between merges the site would run functions whose database functions don't exist yet. So lock publishing first, merge everything, apply the migrations, then publish the last build once.

## Preflight (AI, no production change)

1. Each PR is rebased on the one before it and its base is set accordingly. #7 and #11 were rebuilt on 2026-11-05 after the rehearsal found them carrying old copies of earlier PRs.
2. Rebuild the rehearsal (master + the PRs in order + this PR's commits) and on it run:
   - `cd front-row-vite && npx tsc -b && npm run build && npm run test:builder`
   - `cd netlify/functions && npm run typecheck`
   - `npm run test:tickets`, `npm run test:rooms`, `npm run test:performances`, `npm run test:box-office` (real Postgres / real Socket.io)
   - the cross-stack e2e (below)
3. soma-rooms #11: CI green (`test` and the LiveKit `e2e` job).
4. Read Supabase state through Chrome on Mike's Mac (the cloud container can't reach it): 003, 004, 005 not applied; `venues` holds only Front Row.

## Release

| # | Step | Who | Check that it worked |
|---|---|---|---|
| 1 | 🔒 Netlify: **Deploys → Lock to stop auto publishing** on `frontrowtheater` | Mike's click | The current production deploy shows "locked" |
| 2 | 🔒 Merge #4 (with #9 inside), retarget #5 to master, merge #5; retarget and merge #8, #7; merge #6, #11; retarget and merge #13; merge this PR | AI, on Mike's yes | Each Netlify build is green; none is published |
| 3 | 🔒 Supabase SQL editor: run `003_theater_definitions.sql`, `004_frontrow_tickets.sql`, `005_theater_roles_grants_status.sql`, `006_performances.sql`, `007_box_office.sql` in that order, one at a time | AI drives the editor in Mike's Chrome, Mike says yes | After 003: `select slug from venues where super_venue_id is null` → `front-row`, and three child rows with `screen_key` revolution, live, library. After 004: `select count(*) from frontrow_tickets` → 0, and the other app's `tickets` table still holds its rows. After 005: `select status from venues where slug='front-row'` → `open`. After 006: `select proname from pg_proc where proname like 'frontrow_ticket_redeem%'` → both `_redeem` and `_redeem_base`. After 007: `select count(*) from pg_proc where proname like 'frontrow_box_office%'` is above 0 |
| 4 | Netlify environment (production **and** deploy-preview): `SUPABASE_SERVICE_ROLE_KEY` set; `SUPABASE_URL` or `VITE_SUPABASE_URL` set; `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` are the LiveKit Cloud key Mike made on 2026-11-05 (the old key is rejected); `FRONTROW_TICKETS` **unset** (stage mode: ticketless audience still get in). No new variables for #9 or #11. For #13's mail: `FRONTROW_MAIL_PUBKEY` and `FRONTROW_MAIL_WORKER_TOKEN`, both made on the Mac by `node scripts/ticket-mail-worker.mjs keys`; optional `FRONTROW_MAIL_SENDER`, `FRONTROW_SITE_ORIGIN`, `FRONTROW_SEATS` (default 12). Without them the box office still sells, and mail waits. `VITE_SOMA_ROOMS_URL` is optional: the code defaults to `https://vps.mike-wolf.com/soma-rooms` | AI reads, 🔒 Mike sets anything missing | Names present in Site settings → Environment variables |
| 5 | 🔒 frontrow-server on the VPS (below) | AI on Mike's yes | `/api/health` 200; ticketless performer token → 403; audience token → 200 |
| 6 | 🔒 soma-rooms: merge #11, deploy `soma-rooms-v1`, add the `frontrow` app (below) | AI on Mike's yes | `curl -s 127.0.0.1:8796/healthz`; `/build/front-row` on production shows the room panel, not "unknown app" |
| 7 | 🔒 Netlify: publish the last master deploy and unlock | Mike's click | Production's build SHA (footer) matches master |
| 8 | Live smoke (below) | AI in Mike's Chrome, then two people | All pass |
| 9 | 🔒 Box office mail (#13), optional and separate: install the `ticket-mail-worker` launchd job on the Mac and `arm` it. Nothing is mailed before `arm` | AI on the Mac, on Mike's yes (it sends mail to buyers) | A test sale to Mike's own address arrives |

**Auto-merge (#12).** #12 adds CI and a Claude auto-merge workflow that merges a ready (non-draft) `claude/` PR into master once its checks pass. Every kit PR is a draft, so today it merges nothing. But if #12 lands first and someone marks a kit PR ready, it goes to master out of order, and master is production. Merge #12 after this release, or keep every kit PR a draft until step 2. The Netlify lock in step 1 stops the publish either way.

### Step 5: frontrow-server

```bash
ssh vps
cd /opt/frontrow-server
ts=$(date -u +%Y%m%dT%H%M%SZ)
for f in index.js api-routes.js tickets.mjs rooms.js performances.mjs; do [ -f $f ] && cp $f $f.bak-$ts-pre-kit; done
# From a checkout of master at the release commit, on the Mac:
#   scp server/index.js server/api-routes.js server/tickets.mjs server/rooms.js server/performances.mjs vps:/opt/frontrow-server/
grep -q SUPABASE_SERVICE_ROLE_KEY .env && echo key-present   # the ticket gate needs it; prints no value
pm2 restart frontrow-server && sleep 2 && pm2 logs frontrow-server --lines 20 --nostream
```

`tickets.mjs`, `rooms.js` and `performances.mjs` must sit beside `index.js`. frontrow-server's `.env` may add, all optional:
- `MAX_SEATS` (default 12): seats in Front Row's live house only.
- `MAX_HOUSES` (default 200): how many houses may be open at once.
- `FRONTROW_PERFORMANCES=1`: house status moves update performance records.
- `FRONTROW_LIBRARY_JOB_MS` (at least 60000): runs the Library job.

The last two need `SUPABASE_SERVICE_ROLE_KEY`. Leave both off for the first release and turn them on once the smoke passes. No new npm packages (`livekit-server-sdk` is already a dependency). Keep the `.bak-*` files out of any served directory. Rollback: copy the `.bak-$ts-pre-kit` files back and restart.

### Step 6: SOMA Rooms

Follow `soma-rooms/docs/DEPLOY.md` (the VPS has no GitHub access: `git archive` from the Mac). Then add to `/opt/soma-rooms-v1/apps.json`:

```json
{ "id": "frontrow", "name": "Front Row Theater",
  "origins": ["https://frontrowtheater.netlify.app",
              "https://deploy-preview-*--frontrowtheater.netlify.app",
              "http://localhost:5173"],
  "admins": ["mw@mike-wolf.com"] }
```

and `pm2 restart soma-rooms-v1`. This is the entry in soma-rooms `docs/APP-OPS.md`. Pattern origins, and the builder's `approve: 'app'` ops (#7 from 7a359bb), need soma-rooms #11 at b399f5e or later: an older service refuses the builder's op declaration, so this deploy must land before anyone uses `/build/`. Restarting drops anyone in a live room, so check `pm2 logs` for joins first. The VPS LiveKit (`wolfchat-livekit`) must be 1.9 or newer, because livekit-client 2.23 stalls on 1.8. A room holds 8 people; AIs on a connector don't count toward that.

### Step 8: live smoke

1. `/` → invitation → ticket → lobby → three doors → the house; a seat; another browser sees the seat camera.
2. Green room as Jess (signed in as an admin): Places, Go on now. Not signed in: refused.
3. Post-show chat between two browsers.
4. `/build/front-row` signed in as Mike: "Saved to the theater's shared record", the room panel joins, an AI proposal through a connector appears, Approve saves version 2, `/show/jess-wayne/lobby` shows the change.
5. Issue a performer ticket (box office or `ticket-issue`), open its link in a private window: joins as the performer. Revoke it: the next token request is refused.
6. `/venues` lists one theater, not four.

## Rollback

- **Netlify:** publish the previous production deploy (one click). Old pages don't call the new tables, so the migrations can stay.
- **frontrow-server:** restore the `.bak-*` files, restart.
- **soma-rooms:** redeploy the previous archive; remove the `frontrow` entry.
- **Migrations:** no down-migrations exist. They are additive, so the fix is forward. If 003 must be undone, the visible effect to remove is the three child venue rows (`update venues set active=false where super_venue_id is not null`).

## Decisions and owners

- **Moving FrontRow's token minting to the VPS LiveKit.** This is not in this release. The new LiveKit Cloud key works (verified on the preview on 2026-11-05).
  - Moving needs a FrontRow key in the VPS `livekit.yaml`, `VITE_LIVEKIT_URL=wss://vps.mike-wolf.com`, and the same `LIVEKIT_API_*` on Netlify and frontrow-server, all changed at the same moment.
  - **Owner:** the "Give each theater room its own show" thread (#9), which accepted on 2026-11-05. @SR reviews the `livekit.yaml` change.
  - It is a Mike-gated VPS change of its own.
  - The VPS LiveKit must be 1.9 or later, because the SOMA Rooms client stalls on 1.8.
- **LiveKit capacity per room.** A FrontRow room today is 12 seats + the performer, each publishing a 320x240 camera, so about 13 publishers and 13×12 subscriptions. That is well within one SFU node; the limit to check is the LiveKit Cloud plan's concurrent participants and bandwidth across all screens playing at once (a 10-screen theater is 10 rooms). With #9, Front Row's live house is pinned at `MAX_SEATS` (12) and every other house holds up to 99 seats. That count is taken from the first guest's page today and should come from the stored definition or the performance record (a follow-up for #9). A 99-seat house with cameras on is 99 publishers in one room, which needs a LiveKit plan check before anyone sells it. SOMA Rooms creates rooms with `maxParticipants: 8` people, and AIs on a connector don't count toward it.

## Gaps found while writing this

- #7 carried old copies of #8's commits and conflicted in `blueprints.ts`; fixed by the builder thread (c8dd8cc).
- A ticket could be issued for a screen that doesn't exist. Fixed in #6 (c21aaef): `frontrow_ticket_scope_ok` checks the theater and its screen, and the e2e's ticket for the AI-added screen passes that check.
- #11 was built on old heads of #7 and #6; rebuilt by the performances thread (02dcfd0).
- soma-rooms origins couldn't match deploy previews; fixed in soma-rooms #11 (b399f5e, pattern origins).
- #11 had addShelfItem and removeShelfItem as `approve: 'anyone'` while the builder's other ops are `'app'`; fixed in #11 1c2013b, which also took #7 7a359bb.
- #13 sells tickets for performances that 006 refuses (no `performances` row). Being fixed in #13; see Order.
- #9 was merged into #4's branch by another session on 2026-11-06, which moved the App.tsx resolution to the #8 merge.
- `localhost:5173` was dropped from frontrow-server's CORS list by #4; restored in this PR. The VPS runs #4's `index.js` since 2026-11-04, so local dev against production is broken until step 5.

## The cross-stack e2e

`tests/cross-stack/kit-release.e2e.mjs` runs the release as one path against real parts: this repo's front end built with `VITE_SOMA_ROOMS_URL`, a real SOMA Rooms service (soma-rooms #11) with `frontrow` registered as above, `livekit-server --dev`, Postgres with migrations 002 onward, and `server/tickets.mjs`. Sign-in is stood in (Mike as an admin), and the page's Supabase calls go to a small PostgREST subset over that database with `auth.uid()` from the JWT, so RLS and grants are the migrations' own.

Path: the builder loads Front Row's stored record → joins its SOMA room and declares four ops → Mike's AI (a real AI connector) proposes a fourth screen → the card appears → Approve saves version 2 through `save_theater_definition` (new child venue, change note naming the AI and the approver) → the AI reads `applied` → a performer ticket for the new screen mints a token for `frontrow-front-row--<screen>` that LiveKit accepts and that does not open the live screen.

```bash
# soma-rooms checked out at #11 (or main once it merges), with deps and the client built:
#   (cd ../soma-rooms && npm run install-all && npm run build)
SOMA_ROOMS_DIR=../soma-rooms LIVEKIT_BIN=livekit-server npm run test:kit-release -- [shots-dir]
```

Needs livekit-server 1.9 or later (soma-rooms' client, livekit-client 2.23, stalls on 1.8 with "negotiation timed out"), initdb/psql, and Playwright's Chromium (`CHROMIUM_PATH` to use another). Exit 2 means a dependency is missing, not a failure.

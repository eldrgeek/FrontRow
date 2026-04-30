# FrontRow Phase 2 — Feature Expansion Specification

**Version**: 0.1.0  
**Date**: 2026-04-30  
**Status**: Draft  
**Author**: Cowork / Claude (spec-writer skill)

---

## Section 0: Background Context

FrontRow is a live-performance virtual venue built on React + Three.js (React Three Fiber) for the 3D environment, LiveKit (WebRTC SFU) for media streaming, and Socket.io for coordination signals. The frontend is deployed to **frontrowtheater.netlify.app** (Netlify) and the backend to Render (`frontrow-tvu6.onrender.com`). A self-hosted LiveKit server runs at `vpsmikewolf.duckdns.org`.

**What Phase 1 built:**
- A 3D semicircle stage (`Stage.tsx`) with a flat video-screen at the back wall
- 9 audience seats in a 180° arc (`SeatSelection.tsx`), each displaying a user's photo or live video stream as a texture on a cube
- A performer role (`?mode=performer`) that publishes camera+mic to LiveKit; the audience subscribes and the stream is rendered as a Three.js `VideoTexture` on the big screen (`useVideoTexture` hook)
- Socket.io coordination for show state (`idle → pre-show → live → post-show`), seat assignment, and countdown
- An `ArtistControls` HTML overlay for the performer with Go Live / End Show / countdown
- Browser-based local recording via `MediaRecorder`

**What Phase 2 adds:**
Five tightly coupled features (F1–F5) that transform FrontRow from a streaming relay into a genuine virtual theater with spatial performer presence, production management, audience interaction, and a structured show lifecycle.

**Key architectural constraints (must not break):**
- No server-side media processing — all heavy media work stays in the browser
- LiveKit remains the single media plane (no peer-to-peer signaling revival)
- Socket.io remains the control plane for show state and data channel messages
- The existing `App.tsx` / `Stage.tsx` / `useLiveKit.ts` structure is the foundation; new features extend it, not replace it
- Netlify serverless functions handle token generation; no new server runtimes unless explicitly noted

---

## Non-Negotiables

- F1 background removal MUST run entirely in-browser (no server round-trips for video frames)
- F2 house manager configuration MUST be authoritative — all clients reflect HM config, not local guesses
- F3 backstage audio/video MUST be invisible and inaudible to audience participants
- F4 reaction data MUST use LiveKit DataChannel (not Socket.io) to avoid server fan-out at peak reaction load
- F5 curtain animations MUST be CSS-only on the frontend; no canvas re-renders for pure presentation transitions

---

## Out of Scope

- Server-side video recording or cloud VOD storage (stub only in F5)
- Multi-room or multi-stage support
- Mobile layout overhaul (existing responsive behavior preserved, not extended)
- Authentication / accounts (future revision)
- Paid ticketing or access control
- More than one performer on stage simultaneously (F1 covers single performer)

---

## Success Criteria

- [ ] F1: Audience sees performer composited over stage geometry (not on the big screen) with background removed; entrance animation plays on "Go Live"
- [ ] F2: `/housemanager` route loads a config panel; choices (seat count, arrangement, title, start time) are received by all clients on join
- [ ] F3: Performer at `/backstage` can see/hear themselves and other backstage occupants; audience cannot; "Go Live" triggers F1 entrance
- [ ] F4: Audience reaction buttons send data; performer UI shows applause meter updating in real time
- [ ] F5: HM curtain open/close animates visually; performer walk-offstage animation plays on intentional exit; recording stub exists
- [ ] No regression: existing `?mode=performer` + `?mode=watch` entry flows still work
- [ ] TypeScript compiles clean (`npm run typecheck`) after all changes

---

## F1 — Performer Background Removal + Stage Entrance

### User-Facing Behavior

Instead of appearing on the flat back-wall screen, the performer is composited directly onto the 3D stage floor as a life-size presence. Their background is removed in real time so only their silhouette/body appears against the stage scenery. When they "Go Live" (from backstage or the standard flow) they start small and far away, gliding forward over 3 seconds to their default position at center stage. Arrow keys or a slider let them move forward/backward while performing.

### Technical Approach

**Background removal — `useSegmentation.ts` hook (new)**

```
@mediapipe/selfie_segmentation  (npm package, browser WASM)
```

1. Performer's `MediaStream` video track is drawn to an offscreen `<canvas>` element at 30 fps using `requestAnimationFrame`.
2. `SelfieSegmentation` from `@mediapipe/selfie_segmentation` runs on each frame (model: `1` = landscape, lower latency).
3. The segmentation mask is used to composite the person pixels over a transparent background on a second offscreen canvas.
4. `canvas.captureStream(30)` produces a new `MediaStream` with the keyed video track.
5. This keyed stream is what gets published to LiveKit, replacing the raw camera stream.

The segmentation model runs on the CPU via WASM; on modern hardware it sustains 25–30 fps at 640×480. No GPU or server required.

**Stage composite — `PerformerMesh.tsx` (new component)**

Instead of `useVideoTexture` writing to the `CurvedScreen`, a new `<PerformerMesh>` Three.js object is placed on the stage:

- Geometry: a `<Plane>` sized to approximate human proportions (~2 m tall, ~1 m wide) with `side={THREE.DoubleSide}`
- Material: `MeshBasicMaterial` with the keyed video texture + `transparent={true}` + `alphaTest={0.1}` so the transparent pixels disappear
- The texture is updated from a `<video>` element fed by the audience-side keyed stream (same `useVideoTexture` hook, but pointing at the keyed track)
- The plane always faces the audience camera (`billboard` mode via `useFrame` rotating Y-axis toward camera, or `@react-three/drei`'s `<Billboard>`)

**Entrance animation**

Performer starts at `position={[0, 1, -8]}` (back of stage, small perceived size due to depth) and animates to `position={[0, 1, 0]}` (front of stage) over 3000 ms using a `useSpring` from `@react-spring/three` or a manual lerp in `useFrame`. The `isLive` prop triggers the animation when set to `true`.

**Performer position control (performer side)**

`ArtistControls.tsx` gains a slider (range `−8` to `0`, step `0.1`, mapped to the Z position) and arrow-key listeners (`ArrowUp` → move forward, `ArrowDown` → move back). Position is broadcast to all participants via LiveKit DataChannel so audience `PerformerMesh` updates synchronously.

**DataChannel message:**
```json
{ "type": "performer-position", "z": -3.5 }
```

**Audience side:**

`useLiveKit.ts` subscribes to `DataReceived` room events; `performer-position` messages update a shared Zustand store (or React context) that `PerformerMesh` reads from.

### LiveKit Usage

| Concern | Mechanism |
|---|---|
| Keyed video stream | Published as performer's Camera track (replaces raw) |
| Position updates | LiveKit `room.localParticipant.publishData()` → `RoomEvent.DataReceived` on subscribers |
| Audience receives keyed video | Existing `TrackSubscribed` handler in `useLiveKit.ts`; stream passed to `PerformerMesh` instead of `CurvedScreen` |

### Estimated Complexity: **L**

Segmentation pipeline + new Three.js mesh + entrance animation + DataChannel position sync each work independently, but the integration across `useLiveKit`, `Stage`, and `ArtistControls` touches many files.

### Dependencies

- F3 (Backstage): "Go Live" button in F3 triggers the F1 entrance animation; F1 must expose a `triggerEntrance()` callback
- None on F2, F4, F5

---

## F2 — House Manager Role

### User-Facing Behavior

A House Manager (HM) arrives at `/housemanager` before the show. They see a configuration panel (not the 3D venue) where they set: seat count (1–20), seating arrangement (orchestra / semicircle / cabaret / classroom), curtain style (red velvet / black / none), show title, and scheduled start time. When they save, the configuration is pushed to all connected clients immediately. Any client that joins after the HM configured the room receives the config on connect. The HM has a persistent control panel overlay (not a seat) for the duration of the show — they can also open/close curtains (F5) and monitor who is connected.

### Technical Approach

**Routing — `index.tsx`**

React Router v6 is added (`react-router-dom`). Routes:
- `/` → existing `App` (audience/performer)
- `/housemanager` → new `HouseManagerApp` component
- `/backstage` → new `BackstageApp` component (F3)

**HouseManager config schema (server-side, Socket.io)**

```ts
interface VenueConfig {
  seatCount: number;         // 1–20, default 9
  arrangement: 'orchestra' | 'semicircle' | 'cabaret' | 'classroom';
  curtainStyle: 'red-velvet' | 'black' | 'none';
  showTitle: string;
  scheduledStart: string | null;  // ISO 8601 or null
}
```

`server/index.js` gains a `venueConfig` object (in-memory, reset on server restart). A new Socket.io event `hm-set-config` sets and broadcasts; a `hm-get-config` (or the `connect` handshake) returns current config to new joiners.

**Server events:**

| Event | Direction | Payload |
|---|---|---|
| `hm-set-config` | HM client → server | `VenueConfig` |
| `venue-config` | server → all clients | `VenueConfig` |
| `hm-get-config` | client → server | _(empty)_ |

On `connect`, server emits `venue-config` to the newly connected socket with current config.

**HouseManager UI — `HouseManagerApp.tsx` (new)**

A full-screen HTML panel (no 3D canvas) with:
- Form fields for each config option, auto-saving on change with 300 ms debounce
- Live participant list (names, roles) polled from `/api/diagnostics`
- Curtain control buttons wired to F5 events
- Show title displayed at top

**Client-side config consumption — `App.tsx`**

A new `useVenueConfig()` hook subscribes to `venue-config` events and returns the current config. `SeatSelection.tsx` reads `seatCount` and `arrangement` to recalculate seat positions. `Stage.tsx` reads `showTitle` and `curtainStyle`.

**`SeatSelection.tsx` arrangement geometries:**

| Arrangement | Seat layout algorithm |
|---|---|
| `orchestra` | 180° arc, 2 rows (existing behavior extended to 2 rows if seatCount > 9) |
| `semicircle` | Full 180° arc, 1 row (current default) |
| `cabaret` | 4 small clusters at 90° offsets, 2–3 seats each |
| `classroom` | Straight rows, 3 columns, N rows |

### LiveKit Usage

None — HM control is purely Socket.io signaling. HM does not publish a media track.

### Estimated Complexity: **M**

New route + server config store + 4 seat arrangement algorithms + config propagation are all self-contained. The arrangement math is the most involved part.

### Dependencies

- F5 (Lifecycle): HM curtain controls are defined here, executed in F5
- None on F1, F3, F4

---

## F3 — Performer Backstage / Green Room

### User-Facing Behavior

Performers navigate to `/backstage`. They see a private preview: their own webcam feed with background removed (reusing F1 segmentation), an audio level meter, a simple gain slider, and their name/bio entry field. Other participants at `/backstage` (co-performers, HM) can see and hear each other via a private LiveKit room — the audience cannot. A "Go Live" button moves the performer to the main stage, triggering the F1 entrance animation in the main room.

### Technical Approach

**Two LiveKit rooms**

| Room | Name | Who joins |
|---|---|---|
| Main room | `frontrow-main` | Audience + live performers (existing) |
| Backstage room | `frontrow-backstage` | Performers before going live, HM |

The token endpoint (`/api/livekit-token` and Netlify function `get-livekit-token`) gains a `room` query param already (currently hardcoded to `frontrow-main`). F3 passes `room=frontrow-backstage`.

Audience clients never request a token for `frontrow-backstage`, so they cannot subscribe to backstage tracks.

**`BackstageApp.tsx` (new component)**

- Renders a 2D HTML layout (no Three.js)
- Starts the segmentation pipeline (F1's `useSegmentation` hook) for self-preview
- Publishes local camera+mic to `frontrow-backstage` room via `useLiveKit`
- Subscribes to other backstage participants' tracks, rendering them as `<video>` tiles
- Audio level meter: `AudioContext` + `AnalyserNode` on local stream, rAF loop reading `getByteFrequencyData`, rendered as a CSS bar
- Gain control: `GainNode` inserted between `getUserMedia` track and LiveKit publisher; slider maps 0–2× gain
- Name/bio form stored in `sessionStorage` (`frontrow_performer_bio`)

**"Go Live" flow**

1. Performer clicks "Go Live" in `BackstageApp`
2. Client disconnects from `frontrow-backstage` room
3. Client connects to `frontrow-main` room as performer (existing `connectAsPerformer` in `useLiveKit.ts`)
4. Emits `artist-go-live` to Socket.io (existing event)
5. A new Socket.io event `performer-entered` (with performer name + bio) is broadcast to all main-room clients
6. Main room's `PerformerMesh` receives `isLive=true`, triggering F1 entrance animation

React Router: `BackstageApp` calls `navigate('/')` after connecting to main room so the performer lands in the standard venue UI with their performer controls.

**HM visibility into backstage**

HM joins `frontrow-backstage` with `role=housemanager` (token grants subscribe-only). HM UI shows backstage video tiles in a sidebar.

### LiveKit Usage

| Concern | Mechanism |
|---|---|
| Backstage isolation | Separate LiveKit room `frontrow-backstage` |
| Performer → main room | `disconnect()` backstage + `connectAsPerformer()` main |
| HM monitoring backstage | Subscribe-only token for `frontrow-backstage` |
| Audience isolation | Audience never receives a `frontrow-backstage` token |

### Estimated Complexity: **M**

Two-room management is the key challenge. The segmentation reuse from F1 saves effort. Audio gain via `GainNode` is straightforward.

### Dependencies

- F1 (Segmentation): reuses `useSegmentation` hook for self-preview and keyed stream
- F2 (House Manager): HM joins backstage room using subscribe-only token
- F1 (Entrance): Go Live triggers F1 entrance animation in main room

---

## F4 — Audience Interaction

### User-Facing Behavior

Audience members see three reaction buttons below their view controls: 👏 Clap, 😂 Laugh, 🤩 Wow. Clicking sends a reaction that feeds a real-time applause meter — a glowing bar at the bottom of the stage visible to everyone (subtle, non-distracting). The performer sees the same meter and can enable a "spotlight" toggle that casts a moving light pool on the stage floor that tracks their position.

### Technical Approach

**Reaction data flow — LiveKit DataChannel (not Socket.io)**

Audience clients send reactions via `room.localParticipant.publishData()`:

```json
{ "type": "reaction", "kind": "clap" | "laugh" | "wow", "ts": 1746000000000 }
```

`kind` is the reaction type. `ts` is the client timestamp (used to discard stale reactions on the receiver).

All participants (including the performer) receive reactions via `RoomEvent.DataReceived`. A sliding 5-second window counts reactions and normalizes to a 0–1 intensity value. The applause meter renders this value.

**Applause meter — `AppauseMeter.tsx` (new Three.js component)**

Placed in `Stage.tsx` at `position={[0, 0.15, -4]}` (front of stage floor, slightly elevated). Geometry: a thin `<Plane>` 10 m wide × 0.2 m tall. Material: `MeshBasicMaterial` with a horizontal gradient from `#002244` (empty) to `#FFD700` (full) — achieved via a small `DataTexture` updated each frame. Width is scaled via `scale-x` prop driven by the 0–1 intensity.

A simple emissive glow effect (using `drei`'s `<Sparkles>` or a secondary transparent plane with additive blending) makes the meter visible in the 3D scene without being distracting.

**Reaction buttons — HTML overlay in `ViewControls.tsx`**

Three emoji buttons added to the existing `ViewControls` panel. They call a `sendReaction(kind)` function exposed from a new `useReactions()` hook:

```ts
function useReactions(room: Room | null): {
  sendReaction: (kind: 'clap' | 'laugh' | 'wow') => void;
  intensity: number;  // 0–1
}
```

The hook also maintains the sliding-window counter and exposes `intensity` to drive the meter.

**Spotlight — performer-controlled, Three.js `SpotLight`**

`ArtistControls.tsx` gains a "Spotlight" toggle checkbox. When enabled, the performer client broadcasts:

```json
{ "type": "spotlight", "enabled": true }
```

All clients add a `<SpotLight>` (from `drei`) to `Stage.tsx` pointing downward at the performer's current XZ position. Position is updated from the `performer-position` DataChannel messages (F1). The spotlight casts a pool ~2 m in diameter, color warm white (`#FFF5E0`), intensity 2.0, with soft penumbra.

### LiveKit Usage

| Concern | Mechanism |
|---|---|
| Reactions | `publishData()` → `DataReceived` event, all participants |
| Intensity aggregation | Client-side 5-second sliding window, no server involvement |
| Spotlight toggle | `publishData()` → `DataReceived`, performer identity only for enable/disable |
| Spotlight position | Reuses `performer-position` DataChannel messages from F1 |

### Estimated Complexity: **S**

DataChannel publish/subscribe is already scaffolded in LiveKit. The Three.js meter and spotlight are simple geometry additions. The sliding-window math is trivial.

### Dependencies

- F1 (performer-position): Spotlight position tracks F1's DataChannel position messages
- None on F2, F3, F5

---

## F5 — Graceful Show Lifecycle

### User-Facing Behavior

The House Manager can open or close the curtains at any point — a CSS animation sweeps two red velvet panels (or black drapes, or nothing, per F2 config) across the screen to signal show start/end. When a performer leaves deliberately (not a crash), they animate off to stage-right over 1 second before disconnecting. A "Record Show" toggle stub exists in the HM panel but emits a console log only (placeholder for future server-side recording).

### Technical Approach

**Curtains — CSS + Socket.io signal**

HM clicks "Open Curtain" / "Close Curtain" in `HouseManagerApp`. This emits:

```json
{ "type": "curtain", "state": "open" | "closed" }
```

via Socket.io event `hm-curtain`. Server stores `curtainState` in `activeShow` and broadcasts `curtain-state` to all clients.

Clients maintain `curtainState` in React state. A new `<CurtainOverlay>` component renders two absolutely-positioned `<div>` elements covering the `<Canvas>`:

```css
.curtain-left, .curtain-right {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
  background: linear-gradient(to right, #8B0000, #CC0000); /* red velvet */
  transition: transform 2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
}
.curtain-left  { left:  0; transform-origin: left;  }
.curtain-right { right: 0; transform-origin: right; }

.curtain-open .curtain-left  { transform: translateX(-100%); }
.curtain-open .curtain-right { transform: translateX(100%);  }
```

`curtainStyle` from F2 config switches the background gradient (or hides curtains entirely for `none`).

**Walk-offstage animation**

Performer's `ArtistControls` gains an "Exit Stage" button alongside "End Show". Clicking:

1. Emits `performer-exiting` DataChannel message
2. On all clients: `PerformerMesh` in `Stage.tsx` begins a 1-second Three.js animation translating the performer plane to `position.x = +8` (stage right) and scaling to `0` opacity via material `opacity` tween
3. After 1100 ms (animation complete + small buffer): performer client calls `stopPerformerStream()` (existing function) and emits `artist-end-show`

The `useFrame` lerp on `PerformerMesh` handles the translation/fade; a `walkOff` boolean prop triggers it.

**Show recording stub**

`HouseManagerApp` has a "Record Show" toggle that:
- Logs `console.log('[FrontRow] Recording: started/stopped')` 
- Emits `hm-record-toggle` Socket.io event (server logs receipt, does nothing else)
- Displays "Recording (stub)" text in the HM panel

**Server additions for F5:**

```js
activeShow.curtainState = 'closed'; // initial

io.on('hm-curtain', (socket, data) => {
  activeShow.curtainState = data.state;
  io.emit('curtain-state', { state: data.state });
});
```

New `activeShow` fields:
```ts
curtainState: 'open' | 'closed'  // persists in activeShow during show
```

New Socket.io events:

| Event | Direction | Payload |
|---|---|---|
| `hm-curtain` | HM → server | `{ state: 'open' \| 'closed' }` |
| `curtain-state` | server → all | `{ state: 'open' \| 'closed' }` |
| `performer-exiting` | broadcast via DataChannel | `{}` |
| `hm-record-toggle` | HM → server | `{ recording: boolean }` |

### LiveKit Usage

| Concern | Mechanism |
|---|---|
| Walk-off signal | LiveKit DataChannel `performer-exiting` |
| Curtains | Socket.io only (no media) |
| Recording stub | Socket.io event, no LiveKit involvement |

### Estimated Complexity: **S**

Curtains are pure CSS — no Three.js work. Walk-off reuses existing F1 `PerformerMesh`. Recording is a stub. The main work is F5's Socket.io plumbing (curtain state) and the walk-off DataChannel event.

### Dependencies

- F1 (PerformerMesh): walk-off animation is triggered on the same mesh
- F2 (House Manager): curtain style and HM control panel are defined in F2

---

## Implementation Roadmap

### Phase 2A — Foundation (Weeks 1–2)

Focus: routing, LiveKit DataChannel plumbing, venue config propagation. No visible 3D changes yet.

- [ ] Add `react-router-dom` v6; wire `/`, `/housemanager`, `/backstage` routes in `index.tsx`
- [ ] Extend `server/index.js` with `venueConfig` store + `hm-set-config` / `venue-config` events
- [ ] Extend `server/index.js` with `curtainState` store + `hm-curtain` / `curtain-state` events
- [ ] Add `hm-record-toggle` stub to server
- [ ] Extend LiveKit token endpoint to accept `room` param (both `/api/livekit-token` and Netlify function)
- [ ] Add `useVenueConfig()` hook to `App.tsx` — subscribe to `venue-config`, expose config object
- [ ] Add DataChannel send/receive scaffolding to `useLiveKit.ts` — `publishData()` + `DataReceived` event

### Phase 2B — House Manager + Backstage (Weeks 2–3)

- [ ] Build `HouseManagerApp.tsx` — config form, participant list, curtain controls, recording stub
- [ ] Extend `SeatSelection.tsx` with `arrangement` + `seatCount` props and 4 layout algorithms
- [ ] Build `BackstageApp.tsx` — self-preview, audio meter, gain control, name/bio form, Go Live button
- [ ] Extend `useLiveKit.ts` with `connectToRoom(roomName)` abstraction replacing hardcoded `frontrow-main`
- [ ] Add `CurtainOverlay` CSS component; wire to `curtain-state` Socket.io event in `App.tsx`

### Phase 2C — Background Removal + Stage Presence (Weeks 3–4)

- [ ] Install `@mediapipe/selfie_segmentation`; build `useSegmentation.ts` hook
- [ ] Build offscreen canvas pipeline: raw camera → segmentation → keyed canvas → `captureStream()`
- [ ] Modify `useLiveKit.connectAsPerformer()` to accept a pre-keyed `MediaStream` instead of calling `enableCameraAndMicrophone()`
- [ ] Build `PerformerMesh.tsx` — billboard plane, keyed video texture, transparent material
- [ ] Integrate entrance animation into `PerformerMesh` with `@react-spring/three` spring
- [ ] Add performer position slider + arrow key listener to `ArtistControls.tsx`
- [ ] Add `performer-position` DataChannel publish in `ArtistControls`; subscribe in `PerformerMesh`
- [ ] Remove performer stream from `CurvedScreen` when `PerformerMesh` is active (avoid duplicate rendering)

### Phase 2D — Audience Interaction + Walk-Off (Week 4–5)

- [ ] Build `useReactions()` hook — sliding-window counter, `publishData()`, `DataReceived` listener
- [ ] Add reaction buttons to `ViewControls.tsx`
- [ ] Build `AppauseMeter.tsx` Three.js component; add to `Stage.tsx`
- [ ] Add spotlight toggle to `ArtistControls.tsx`; add `<SpotLight>` to `Stage.tsx` driven by performer position
- [ ] Add "Exit Stage" button to `ArtistControls.tsx`; implement walk-off animation in `PerformerMesh`

### Phase 2E — Integration Testing + Polish (Week 5–6)

- [ ] E2E tests: HM config propagation to audience
- [ ] E2E tests: backstage isolation (audience cannot receive backstage tracks)
- [ ] E2E tests: reaction buttons → applause meter updates
- [ ] E2E tests: curtain open/close → CSS class applied across clients
- [ ] Performance test: segmentation pipeline at 640×480 on target hardware
- [ ] TypeScript: `npm run typecheck` clean with all new files
- [ ] Lint: `npm run lint` passing
- [ ] Deploy to staging (`develop` branch) and smoke test on live Netlify URL

---

## Safety Invariants

- **Backstage isolation**: A token with `room=frontrow-backstage` MUST only be issued to clients that have identified as a performer or HM. The token endpoint checks the `role` param; if `role` is `audience`, it MUST return `frontrow-main` only.
- **DataChannel volume**: Reactions use `publishData()` with `reliable=false` (lossy UDP-like) to prevent queue buildup during heavy clapping. Position updates use `reliable=false` as well. Only `performer-exiting` uses `reliable=true`.
- **Segmentation frame budget**: The `useSegmentation` hook MUST skip frames if the previous segmentation call has not returned (no overlapping calls). A `processingRef` flag gates entry.
- **Curtain state on reconnect**: `activeShow.curtainState` MUST be included in the `connect` handshake response so late-joining clients render the correct curtain state immediately.
- **Walk-off timeout**: If `stopPerformerStream()` is not called within 5 s of `performer-exiting` (e.g. client crash before completing animation), the server MUST emit `artist-end-show` automatically via the existing `disconnect` handler.

---

## Data Structures

### `VenueConfig` (server-side, broadcast to all clients)

```ts
interface VenueConfig {
  seatCount: number;
  arrangement: 'orchestra' | 'semicircle' | 'cabaret' | 'classroom';
  curtainStyle: 'red-velvet' | 'black' | 'none';
  showTitle: string;
  scheduledStart: string | null; // ISO 8601 UTC or null
}
```

### DataChannel message envelope

```ts
interface DataMessage {
  type: 'performer-position' | 'reaction' | 'spotlight' | 'performer-exiting';
  // type-specific fields below
}

interface PerformerPositionMsg extends DataMessage {
  type: 'performer-position';
  z: number;   // -8 to 0
}

interface ReactionMsg extends DataMessage {
  type: 'reaction';
  kind: 'clap' | 'laugh' | 'wow';
  ts: number;  // epoch ms
}

interface SpotlightMsg extends DataMessage {
  type: 'spotlight';
  enabled: boolean;
}

interface PerformerExitingMsg extends DataMessage {
  type: 'performer-exiting';
}
```

### `ActiveShow` server object (extended)

```ts
interface ActiveShow {
  // existing
  artistId: string | null;
  startTime: Date | null;
  status: 'idle' | 'pre-show' | 'live' | 'post-show';
  audienceSeats: Record<string, AudienceSeat>;
  countdown: CountdownState;
  // new in Phase 2
  venueConfig: VenueConfig;
  curtainState: 'open' | 'closed';
}
```

---

## New Files Summary

| File | Feature | Purpose |
|---|---|---|
| `src/hooks/useSegmentation.ts` | F1 | MediaPipe selfie segmentation pipeline |
| `src/components/PerformerMesh.tsx` | F1 | Composited performer on stage, entrance animation |
| `src/HouseManagerApp.tsx` | F2 | House manager control panel (no 3D) |
| `src/hooks/useVenueConfig.ts` | F2 | Socket.io venue config subscription |
| `src/BackstageApp.tsx` | F3 | Performer green room (2D preview + Go Live) |
| `src/components/CurtainOverlay.tsx` | F5 | CSS curtain open/close animation |
| `src/hooks/useReactions.ts` | F4 | DataChannel reaction send/receive + sliding window |
| `src/components/AppauseMeter.tsx` | F4 | Three.js applause bar on stage floor |

---

## Modified Files Summary

| File | Changes |
|---|---|
| `src/index.tsx` | Add React Router, route `/housemanager` and `/backstage` |
| `src/App.tsx` | Subscribe to `venue-config`, `curtain-state`; add `<CurtainOverlay>` |
| `src/hooks/useLiveKit.ts` | Parameterize room name; add DataChannel send/receive; accept pre-keyed stream |
| `src/components/Stage.tsx` | Add `<PerformerMesh>`, `<AppauseMeter>`, `<SpotLight>`; remove performer from `CurvedScreen` when live as mesh |
| `src/components/ArtistControls.tsx` | Add position slider, spotlight toggle, Exit Stage button |
| `src/components/SeatSelection.tsx` | Accept `seatCount` + `arrangement` props; implement 4 layout algorithms |
| `src/components/ViewControls.tsx` | Add reaction buttons |
| `server/index.js` | Add `venueConfig`, `curtainState`, `hm-*` events, `performer-exiting` timeout guard |
| `netlify/functions/get-livekit-token.js` | Accept `room` param; enforce room access by role |
| `src/config.ts` | No change expected |

---

## References

[1] MediaPipe Selfie Segmentation — https://developers.google.com/mediapipe/solutions/vision/image_segmenter — Accessed 2026-04-30  
[2] LiveKit DataChannel (publishData) — https://docs.livekit.io/realtime/client/data-messages/ — Accessed 2026-04-30  
[3] @react-spring/three — https://www.react-spring.dev/docs/guides/react-three-fiber — Accessed 2026-04-30  
[4] React Router v6 — https://reactrouter.com/en/main — Accessed 2026-04-30  
[5] Three.js SpotLight — https://threejs.org/docs/#api/en/lights/SpotLight — Accessed 2026-04-30  
[6] @react-three/drei Billboard — https://github.com/pmndrs/drei#billboard — Accessed 2026-04-30  
[7] Web Audio API GainNode — https://developer.mozilla.org/en-US/docs/Web/API/GainNode — Accessed 2026-04-30  
[8] MediaRecorder API — https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder — Accessed 2026-04-30


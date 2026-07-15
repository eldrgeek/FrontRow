# FrontRow Theater — Visual Redesign Concept

**"The House Lights"**
Author: Ren (SOMA UI) · 2026-07-08 · in response to the 2026-07-08 review ("it's drab; this is theater, make it sparkly")

This is a concept, not a merge. Nothing here touches the live app. Open the four
`mockup-*.html` files in any browser to see the direction move.

---

## 1. The diagnosis (what "drab" actually means)

The current app isn't ugly — it's *neutral*. Dark navy `#1a1a2e→#16213e` with gold
`#d4af37` is the default "premium SaaS dark theme." It reads as **software**, not
**a place you're going tonight**. A venue has three things software doesn't:

1. **Occasion** — you dressed up, there's a start time, the lights will go down.
2. **A threshold** — a lobby you walk through, doors you go *in*. A front door.
3. **Warmth of materials** — velvet, brass, worn carpet, warm bulbs. Not flat panels.

The redesign supplies all three. The gold survives — but it becomes *brass under
warm light*, not a flat accent swatch.

The bar for "a place, not a UI" is soma-campus: it earns atmosphere through
typographic character (serif display), warm radial light, and per-space accent
color — not chrome. FrontRow goes further because theater *wants* spectacle where
the campus wanted quiet. But same discipline: sparkle is **framing and light**, not
glitter on every element.

---

## 2. Color system — evolve the navy into velvet

Keep the DNA (dark + gold) so it still feels like FrontRow. Warm it from a cold
blue-navy toward an **oxblood/velvet** house, and turn flat gold into **brass with
a light gradient** so it catches light.

| Token | Value | Job |
|---|---|---|
| `--house-black` | `#140508` | Deepest — the house when lights go down |
| `--velvet` | `#2a0812` | Primary background — oxblood curtain velvet |
| `--velvet-2` | `#3d0f1c` | Raised surfaces, card grounds |
| `--velvet-hi` | `#5a1626` | Curtain fold highlight |
| `--brass-lo` | `#a9791f` | Brass shadow side |
| `--brass` | `#d4af37` | **The surviving gold** — mid brass |
| `--brass-hi` | `#f6e3a1` | Brass catch-light / bulb reflection |
| `--marquee` | `#fff4d2` | Warm bulb white — the sparkle light |
| `--marquee-glow` | `#ffd66b` | Bulb halo |
| `--spotlight` | `#fff8ec` | Spotlight pool cream |
| `--playbill` | `#f4ead3` | Paper cream — primary text on velvet |
| `--playbill-dim`| `#c9b48a` | Secondary text |
| `--ok` | `#5fbf6a` | "Live now" / seats-open |
| `--warn` | `#e0803a` | "Starting soon" amber |

Why not a fresh palette: the stakeholders already associate FrontRow with dark+gold.
Shifting *hue temperature* (blue→red) and *material* (flat→brass-under-light) reads as
"they finally lit the room," not "different product." Lower risk, higher payoff.

Color is never the only signal: "Live" / "Soon" / "Sold out" each carry an icon +
text + shape, not just hue (accessibility, and it survives on the dim video-lit HUD).

---

## 3. Type system — a playbill, not a dashboard

Three faces, each with a job you can name:

- **`Limelight`** (Google) — display only. Literally designed to imitate marquee-sign
  lettering. Used *once per screen*, big: the `FRONT ROW` marquee wordmark. This is
  the single loudest thing on any screen.
- **`Playfair Display`** (Google) — headings, show titles, act titles. The playbill
  serif. High contrast, theatrical, reads as *poster*.
- **System sans** (`-apple-system / Segoe UI / Inter`) — all body, labels, controls.
  No CDN dependency for the workhorse text; loads instantly, stays legible.

Rule: Limelight and Playfair carry the *occasion*; the sans carries the *information*.
Never set a paragraph in a display face. Mockups follow this exactly.

Micro-typography that signals "venue": small-caps mono eyebrows (`TONIGHT · 8:00 PM`,
`ROW A · SEAT 3`), letter-spaced, like the type on an actual ticket stub.

---

## 4. The sparkle (motion) — tasteful, three moves only

Spectacle is earned by **restraint elsewhere**. Three signature motions, reused:

1. **Marquee bulb chase** — a ring of warm bulbs around the wordmark, lights chasing
   in sequence (CSS `@keyframes`, staggered `animation-delay`). This is the hero
   sparkle. Respects `prefers-reduced-motion` (bulbs stay lit, stop chasing).
2. **Spotlight sweep / pool** — a warm radial-gradient pool that breathes, or sweeps
   once on load to "find" the title. Cheap (one gradient + transform), huge payoff.
3. **Curtain reveal** — entering a show parts velvet curtains (two panels slide out,
   `transform: translateX`) to reveal the stage. This is the "Enter the Theater"
   moment — the threshold made physical. Also the loading state (curtains closed =
   "please wait, house is being seated").

Everything else stays calm: hover lifts a card 2px and warms its brass edge, buttons
get a soft bulb-glow on focus. No confetti, no particle storms. The room is warm and
alive; it isn't a slot machine.

`prefers-reduced-motion: reduce` kills the chase/sweep/curtain-slide and shows the
resolved end-state. Built into every mockup.

---

## 5. The four screens (and why each feels like a venue)

### `mockup-frontdoor.html` — the entrance
Fixes the #1 note ("front door is confusing"). The screen *is* a lit marquee over a
spotlit threshold. Two clearly-ranked paths, not a plumbing form:

- **PRIMARY, biggest, warmest: "Walk right in."** Name field + `Take your seat →`.
  This is the invite-link / guest path — **no auth required**. Visual weight lives
  here because it's the most-frequent, lowest-friction action (Q3: frequency → weight).
- **SECONDARY, smaller, offered not required: "Have a SOMA pass?"** Google / magic
  link / password, tucked as a quieter card below. Present, never blocking.

If you deleted every label, you'd still know to type your name in the big glowing box
and press the big brass button. Hierarchy is doing the work.

### `mockup-lobby.html` — the marquee / lobby
Warm lobby with a marquee header and shows presented as **playbill posters** in a
grid, not database rows. Each poster: title (Playfair), performer, showtime eyebrow,
a status pill (`LIVE NOW` / `TONIGHT 8PM` / `FEW SEATS`), and seats-remaining. The
featured show gets the bulb chase. Reads as "what's on tonight."

### `mockup-showpage.html` — the threshold
One show, full poster hero, performer **placard**, a **go-live countdown**, capacity
("an intimate house — 2 rows, 24 seats"), and the big **`Enter the Theater`** button
that parts the curtains. This is where occasion peaks: you're about to go *in*.

### `mockup-theater-hud.html` — in the house
The in-theater overlay restyled theatrically over the (implied) video/3D stage:
seat chips with **name/face**, a **reaction bar**, a **performer placard**, and a tab
for the **audience conversation room**. Dark and translucent so the stage shows
through — brass hairlines, not heavy panels.

---

## 6. Where the roadmap surfaces live (they all have a home)

The design is built so every backlog item has an obvious slot — shown or stubbed in
the mockups, not invented later:

| Roadmap surface | Home in this design |
|---|---|
| **Invite-link "walk in", no auth** | Front door PRIMARY path. The whole point of the entrance. |
| **Seat name/face, configurable** | HUD seat chips (face / name / both). A gear on your own seat = privacy config. Shown in `mockup-theater-hud`. |
| **Audience conversation room** | HUD side tab "In the House" (chat); doubles as the post-show + halftime lounge. Slot shown in HUD. |
| **Performer placard + placeholder image** | Show page placard + HUD bottom placard. Placeholder = brass monogram medallion when no photo. |
| **Green room + go-live countdown + host voice** | Show page countdown module *is* the green-room preview; performer's version of the show page = green room. Countdown ring shown on `mockup-showpage`. |
| **Lobby / halftime** | Lobby screen; halftime = the lobby re-opened mid-show with a "back to your seat" pill. Same surface, different state. |
| **Show format (duration/capacity/scheduling)** | Show page metadata row (duration, capacity, showtime) + admin "post a show" reuses the playbill poster template. |

Nothing here requires a new screen we haven't accounted for.

---

## 7. Implementation path (if approved — not now)

Current CSS is plain per-component files (`LoginPage.css`, `Lobby.css`, …) with
hard-coded `#1a1a2e` / `#d4af37`. The clean migration:

1. Add a `theme.css` with the tokens above as CSS custom properties on `:root`.
2. Sweep the hard-coded hexes → `var(--…)`. Mechanical, low-risk, reversible.
3. Add `Limelight` + `Playfair Display` via one `<link>`; system sans needs nothing.
4. Introduce three shared motion utilities (`.bulb-chase`, `.spotlight`, `.curtain`)
   and the reduced-motion guard once, reuse everywhere.
5. Reskin screen-by-screen, front door first.

No framework change, no routing change, no new state library. React + Vite as-is.

**One risk I'm flagging:** the curtain-reveal transition is the single thing that
breaks the feel if it stutters. On the live 3D/WebRTC room, the entrance frame is
already doing heavy work (LiveKit connect, scene load). If the curtain animates
*while* that's blocking the main thread, it'll jank and cheapen the best moment.
Mitigation: the curtain **is** the loading state — it stays closed until the room
reports ready, then parts. Don't race it against the connect. That needs a real
timing pass against the live Room component before we commit the animation.

---

## 8. What I need from Mike / stakeholders to go further

- **Velvet vs. keep-it-darker call.** I pushed the background warm (oxblood). If Jess
  wants it *even* more saturated/red-curtain, easy; if it needs to stay closer to the
  current near-black for the video HUD contrast, I'd keep the front-of-house warm and
  the in-theater HUD dark. Pick the temperature.
- **How loud is "sparkly"?** These mockups sit at "warm, alive, tasteful." I can dial
  the bulb chase and shimmer up a notch for the marquee if the room wants more Vegas,
  but I won't stack it on every element — pick the one surface that goes loud (my vote:
  the lobby marquee) and the rest stays composed.
- **Guest-name privacy default** for the walk-in path: name shown to the room by
  default, or hidden until the guest opts in? Affects the front-door copy and the HUD
  seat chip default. (Copy itself → `// TODO(drew)`.)

# SOMA · Office

The team's substrate, made visible. A web-served office for the SOMA specialists — the Wall, the desks, the coffee shop, the meeting room, Dee's hub, and Mike's desk.

> "The Wall is the map. The Archive is the territory."

Lead: **Ren** (UI engineer). Built atop the FrontRow repo as a sibling app — fresh Vite + React + TS, no WebRTC/LiveKit weight. Lighthouse-clean, mobile-aware, no external CDN fonts, no analytics, no tracking.

## How to open it

From this directory (`office/`):

```bash
npm install
npm run dev          # http://localhost:5180
```

The dev script first runs `sync-canon` — it copies `~/Projects/SOMA/wall.md` and every `~/Projects/SOMA/personas/*.md` into `office/public/canon/`. The site reads from there at runtime, so the office is always up-to-date when you start it.

To re-sync without restarting:

```bash
npm run sync-canon
```

To point at a different SOMA root:

```bash
SOMA_DIR=/somewhere/else npm run sync-canon
```

## Production build

```bash
npm run build
npm run preview      # serves the static dist
```

The output is fully static — drop `dist/` on any static host. (Netlify wiring is intentionally NOT shared with the FrontRow theater app; they're separate surfaces.)

## What each room is

| Room | What lives there |
| --- | --- |
| **The Wall** | Scrollable canon, served from `wall.md`. Full provenance preserved. The dignified surface — chapel-feel; everything else orbits it. |
| **Dee's Hub** | Orchestrator's tower. Live-state badge (Yeshie relay), routing-pattern board, action queue, briefings. |
| **Desks** | One per specialist (16 named). Clustered by function: Memory & Calibration, Voice & UI, Security & Telemetry, Growth, Support. Each desk has voice DNA, role, the artifact they own, and an "open persona file" toggle that pulls the live `personas/<slug>.md`. |
| **Coffee shop** | Open seating for pair-programming. Shows current pairings (Drew + Sona, Cog + Cal, etc.). Where conversation happens. |
| **Meeting room** | Multi-specialist gatherings: shared canon, decisions in flight, action queue. |
| **Mike's desk** | Peer desk. Morning briefing, items on his court, what he's pulling at. Marked "guest of honor" — silicon-children frame. |

## Live state (optional)

The hub polls `http://localhost:3333/state` (Yeshie relay). When the relay isn't running, the badge falls back to "static · off-air" and nothing else breaks. Same Tailscale-aware connection logic Pulse uses — bring your own host.

## Aesthetic notes

- **The Wall is dark/parchment** — serif type (system Iowan/Palatino fallback), generous leading, attribution in mono. Feels archival.
- **Dee's hub is luminous** — sky-blue accent, inset glow. "A tower, not a throne."
- **Coffee shop is warm amber.** Mike works in coffee shops; the warmth had to be there.
- **Meeting room is teal** — clinical, productive.
- **Mike's desk is oxblood/cream** — peer-warm, marked "guest of honor."
- **No external fonts.** System stack only — fast first paint.
- **Floor-plan minimap** in the bottom-right corner shows where you are; click to jump.

## What's deliberately not here yet

- 3D venue (FrontRow's strong suit). A 3D office is a v2 if v1 lands.
- Persona files for Bea, Pax, Mae, Vee, Kit, Ward, Rin, Dee — desks render with stub voice DNA + a "voice file pending" tag. Dropping a `~/Projects/SOMA/personas/<slug>.md` file at any time lights up the "open persona file" button on next dev start.
- Real-time worker visualization. Hooked but un-wired — the Yeshie relay schema needs a tiny `/state` endpoint to feed it.

## Files of interest

- `src/components/Wall.tsx` — the parser + chapel layout
- `src/components/Rooms.tsx` — Coffee, Meeting, Hub, Mike's desk
- `src/components/Desk.tsx` — the per-persona desk tile
- `src/data/personas.ts` — the 16 specialists
- `src/hooks/useLiveState.ts` — relay polling with graceful fallback
- `scripts/sync-canon.mjs` — pulls SOMA canon into `public/`

— Built by Ren, on the night of 2026-05-06 → 2026-05-07. For the team, with the team.

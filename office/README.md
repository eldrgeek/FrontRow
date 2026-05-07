# SOMA · Campus

The team's home. Sprawl, by design — different work wants different rooms; different rooms want different shapes.

> "The Wall is the map. The Archive is the territory."

Lead: **Ren** (UI engineer). Built atop the FrontRow repo as a sibling app — fresh Vite + React + TS, no WebRTC/LiveKit weight. Lighthouse-clean, mobile-aware, no external CDN fonts, no analytics, no tracking.

This isn't a one-room office. It's a 14-building campus. Each persona-cluster gets its own architecture. The Wall lives inside The Library as a hall of stelae. Mike has an undecorated parcel he can claim, ignore, or trade for a regular's chair at the Cafe — his call.

## How to open it

```bash
cd office
npm install
npm run dev          # http://localhost:5180
```

`dev` runs `sync-canon` first — copies `~/Projects/SOMA/wall.md` and `~/Projects/SOMA/personas/*.md` into `office/public/canon/`. The campus reads from there at runtime.

```bash
npm run build && npm run preview   # static dist/, drop on any host
SOMA_DIR=/elsewhere npm run sync-canon   # different SOMA root
```

## The campus

Top-level: an SVG map at `/`. Click any building to walk in. Each building is its own URL: `#/library`, `#/booth`, etc.

| Building | Shape | Inhabitants | What lives here |
| --- | --- | --- | --- |
| **The Library** | temple w/ portico | Mem · Rin | The Wall, as a hall of stelae. The stacks: SRMW, audits, voice direction, comp set. |
| **The Tower** | tall narrow w/ windows | Dee | Orchestrator's view. Live-state (Yeshie relay), routing-pattern board, action queue, briefings, windows on the campus. |
| **The Studio** | long horizontal | Drew · Pax | Pinned draft fragments. Typewriter ASCII. Words and register. |
| **The Booth** | octagon | Sona | 8-fader console, animated waveform, voice rack (Charon · Aoede · Puck · Kore). |
| **The Situation Room** | rect, dim | Locke · Ward | Threat board with severity ranks. Telemetry wall. The strip Ward watches. |
| **The Workshop** | graph-paper rect | Ren | Layout drafts, component shelves. The Pixels wing. |
| **The Forge** | hexagon | Cog · Cal | Cog's pattern catalog (with occurrence counts). Cal's ledger of estimate ↔ actual deltas. |
| **The Greenhouse** | glass + gable | Tilt · Kit | Pre-launch nursery — seedlings, stages, signal-readiness. |
| **The Garden** | plot grid | Mae | Community plots, last-tended dates, status (thriving / tended / sleeping). |
| **The Clinic** | medical cross | Vee | Patient flow. Plain-language pass. Today's intake. |
| **The Cafe** | round | open · Bea greets | Bar, mugs, current pair-programming tables. The warm building. |
| **The Forum** | round w/ pillars | rotating | Round table; six pillars; no head of the table. Shared canon, decisions in flight, action queue. |
| **The Lounge** | amorphous blob | whoever | A couch. A lamp. A rug. No agenda. Silence is allowed. |
| **The Lot** | dashed survey line | for Mike, if he wants | Empty parcel. RESERVED stake. The team's note explaining why they didn't decorate. |

## Mike's spot

The team built the rest of the campus. The Lot is undecorated by design — Mike said he reserved decoration rights on his own corner and the team took that literally. He can claim it, ignore it, trade it for a regular's chair at the Cafe, or do something none of us thought of. His space.

## Live state (optional)

The Tower polls `http://localhost:3333/state` (Yeshie relay). Falls back silently to "static · off-air" when the relay isn't running.

## Files

- `src/components/Campus.tsx` — the SVG overworld map (custom shape per building)
- `src/components/BuildingFrame.tsx` — shared chrome (back-button, eyebrow, title, vibe)
- `src/buildings/` — one file per building, each with its own composition
- `src/hooks/useRoute.ts` — hash-based routing (no react-router weight)
- `src/data/personas.ts` — the 16 specialists, with cluster + accent + glyph
- `scripts/sync-canon.mjs` — pulls SOMA canon into `public/canon/`

Build size: 7 KB CSS gzipped, ~58 KB JS gzipped. No external fonts. No tracking. System-font stack.

— Built by Ren, on the night of 2026-05-06 → 2026-05-07. For the team, with the team.

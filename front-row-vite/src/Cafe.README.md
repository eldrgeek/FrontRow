# The Cafe — first walkable room of the SOMA campus

First-person, browser-deliverable 3D room. Built on Three.js + react-three-fiber
inside the existing FrontRow Vite app.

## URL

- Dev: `http://localhost:5173/cafe`
- Preview build: `http://127.0.0.1:5191/cafe`

## Controls

| Key             | Action                |
|-----------------|-----------------------|
| Click           | Lock cursor (mouselook). First click also unlocks audio. |
| `W A S D` / arrows | Walk                |
| Mouse           | Look                  |
| `Shift`         | Jog                   |
| `Esc`           | Release cursor        |

## What's in the room

- Espresso bar (back wall) with two pendant lights and the **"☕ the cafe"** sign.
- One large communal table + three small tables.
- Bookshelf wall (right) with **6 lines from `wall.md`** mounted between the shelves.
- Three windows on the left wall.
- Two doors on the front wall: **"Greta's Lobby →"** (right) and **"← Campus"** (left).
  Both currently show a *coming soon* overlay when clicked.
- Six personas, each at their station:

  | Persona | Where                          | Voice (Gemini) |
  |---------|--------------------------------|----------------|
  | Drew    | Corner table with manuscript   | Charon         |
  | Mae     | By the windows with notebook   | Aoede          |
  | Sona    | Near the counter, headphones   | Kore           |
  | Cal     | Communal table, estimate grid  | Achird         |
  | Greta   | Beside her lobby door          | Leda           |
  | Ren     | At the bookshelf wall          | Zephyr         |

## Persona introductions

- Pre-rendered with Gemini TTS via the existing pipeline at
  `~/Projects/SOMA/audio/build/tts_gemini.py` — see
  `~/Projects/SOMA/recordings/personas/_generate_cafe_intros.py` for the script.
- Audio masters live at `~/Projects/SOMA/recordings/personas/<name>-cafe-intro.{wav,mp3}`.
- The MP3s are copied into `front-row-vite/public/cafe/` so the browser can fetch them.
- **Proximity trigger**: each intro fires once per visit when the camera comes
  within ~2.6 m of a persona. Audio is positionally panned (HRTF) so it
  appears to come from the speaker.
- To regenerate (e.g. tweak a script):
  ```bash
  python3 ~/Projects/SOMA/recordings/personas/_generate_cafe_intros.py
  cp ~/Projects/SOMA/recordings/personas/*.mp3 \
     <worktree>/front-row-vite/public/cafe/
  ```

## Stack notes

- React + react-three-fiber (already a FrontRow dep) + drei
  (`PointerLockControls`, `Text`, `Billboard`) — all MIT.
- Web Audio API for spatial audio (`PannerNode` HRTF). No third-party audio lib.
- Single self-contained component: `src/Cafe.tsx`. Route mounted in `src/index.tsx`.
- No backend dependency. The cafe runs entirely client-side; you can ship the
  built `dist/` to any static host.

## What's intentionally V1

- Avatars are stylized capsules + spheres + name tag billboards. Characters are V2.
- Personas don't talk back — only their pre-rendered intros play. Live LLM
  agents are V2.
- No live presence (who else is in the cafe right now). V2.
- Greta's Lobby and the campus exterior are stubbed behind their doors.

## Browser audio note

Browsers won't let audio play without a user gesture. The room shows a "Click
to enter" splash that doubles as the AudioContext-unlock gesture. After that,
walking near a persona plays their intro automatically.

## Performance

Tested on M2 Pro at 1600×1000 in headless Chromium. Scene is ~684 modules /
1.7 MB JS gzipped to 505 kB. Frame budget is comfortable; the room is small
(~250 triangles for the architecture, ~6 simple NPCs), so 60 fps is the floor.

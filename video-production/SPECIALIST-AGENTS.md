# FrontRow Video Production — Specialist Agent Roster

> This document defines the specialist agents needed to produce high-quality demo videos of FrontRow repeatedly and reliably. Each agent is a dispatched Claude task with a focused skill set, clear inputs/outputs, and a defined handoff protocol.

---

## Overview: The Production Assembly Line

```
Script Writer
    ↓ SCRIPT.md
Yeshie Demo Driver ──────────────────────────── Screen Recorder Coordinator
    ↓ payload sequence                                  ↓ raw MP4(s)
Architecture Animator                                   ↓
    ↓ arch_*.mp4 clips                                  ↓
ElevenLabs Voice Producer                               ↓
    ↓ beat_01.mp3 … beat_N.mp3                         ↓
                        ↓                               ↓
                    DaVinci Resolve Editor ◄────────────
                        ↓
                    FrontRow-Demo.mp4
```

---

## Specialist 1 — Script Writer

**Role**: Translates a product brief into a structured, timestamped demo script that every downstream agent can consume without ambiguity.

**Skill file**: `~/.claude/skills/script-writer/SKILL.md`

**Domain expertise**:
- Demo video narrative structure (hook → feature tour → payoff)
- FrontRow's user roles: House Manager (`/housemanager`), Performer (`/backstage`, `?mode=performer`), Audience (`?mode=watch`)
- Phase 2 feature set: background removal, entrance animation, curtains, reactions, applause meter, spotlight, walk-offstage
- Beat timing craft: matching narration syllable count to clip duration
- ElevenLabs sentence length constraints (~150 chars per TTS call for natural pacing)

**Inputs**:
- Product brief (audience, tone, key message, feature list)
- SPEC-PHASE2.md (for accurate feature descriptions)
- Target video length in seconds

**Outputs**: `SCRIPT.md` with this structure per beat:
```markdown
## Beat 03 — Performer Walks On

- duration_s: 6
- ui_action: "Yeshie: click 'Go Live' in BackstageRoom; wait 3s for entrance animation"
- narration: "With one click, the performer glides forward — composited live onto the stage, background gone."
- visual: "Stage view: PerformerMesh animates from z=-8 to z=0 over 3s. Spotlight follows."
- clip_type: screen_recording
- beat_id: beat_03
- depends_on: beat_02
```

**Invocation**:
```
Dispatch task: script-writer
Context: {brief, SPEC-PHASE2.md contents, target_duration_s: 180}
Prompt: "Write SCRIPT.md for a FrontRow Phase 2 demo video. Use the beat schema exactly.
         Cover all Phase 2 features. Total duration must be 170–190 seconds.
         Each narration line must be under 160 characters."
Output path: video-production/SCRIPT.md
```

---

## Specialist 2 — Yeshie Demo Driver

**Role**: Translates each `ui_action` beat from SCRIPT.md into a Yeshie payload sequence that drives the browser to demonstrate features in the correct order with correct timing.

**Skill file**: `~/.claude/skills/yeshie-demo-driver/SKILL.md`

**Domain expertise**:
- Yeshie payload format (JSON with `action`, `selector`, `value`, `wait_ms` fields)
- Yeshie script types: `navigate`, `click`, `type`, `wait`, `eval`, `screenshot`, `scroll`
- FrontRow URL scheme: `/housemanager`, `/backstage`, `/?mode=watch`, `/?mode=performer`
- FrontRow Socket.io event names: `hm:configUpdate`, `hm:curtain`, `performer:goLive`, `venue:curtain`
- React component selectors for FrontRow UI (e.g. `[data-testid="go-live-btn"]`, `.curtain-control`, `.reaction-btn`)
- Multi-tab coordination: HM tab + performer tab + two audience tabs must run concurrently
- Timing strategy: `wait_ms` buffers for animation completion (entrance = 3500ms, curtain = 1200ms)

**Inputs**:
- `SCRIPT.md` (beats with `ui_action` fields)
- FrontRow component list + data-testid inventory (from codebase scan)
- Base URL (e.g. `http://localhost:5173` for local or `https://frontrowtheater.netlify.app`)

**Outputs**:
- `yeshie-payloads/` directory containing:
  - `00_setup.json` — open tabs, navigate to roles
  - `beat_01.json` … `beat_N.json` — one payload file per beat
  - `run_sequence.json` — ordered list of payload files with inter-beat delays
- `YESHIE_README.md` — explains how to load and run the sequence

**Payload format example**:
```json
{
  "beat_id": "beat_03",
  "description": "Performer clicks Go Live; entrance animation plays",
  "tab": "performer",
  "steps": [
    { "action": "click", "selector": "[data-testid='go-live-btn']" },
    { "action": "wait", "wait_ms": 3500 },
    { "action": "screenshot", "filename": "beat_03_entrance_done.png" }
  ]
}
```

**Invocation**:
```
Dispatch task: yeshie-demo-driver
Context: {SCRIPT.md contents, component list from front-row-vite/src/components/}
Prompt: "Convert each beat's ui_action into a Yeshie payload JSON file.
         Name files beat_NN.json. Produce run_sequence.json at the end.
         Use data-testid selectors where available; fall back to CSS class.
         Include a wait_ms after every animation-triggering click."
Output path: video-production/yeshie-payloads/
```

---

## Specialist 3 — Architecture Animator

**Role**: Produces animated MP4 clips that visualize FrontRow's technical topology — LiveKit SFU, Socket.io control plane, browser media pipeline, component graph — to be cut into the video as "how it works" beats.

**Skill file**: `~/.claude/skills/arch-animator/SKILL.md`

**Domain expertise**:
- Python `matplotlib` animation (`FuncAnimation`, `blit=True`, `ffmpeg` writer)
- SVG animation via `svgwrite` + CSS `@keyframes` → rasterized with `cairosvg` + `ffmpeg`
- `networkx` for graph layout (spring layout for topology diagrams)
- FrontRow architecture: LiveKit SFU at `vpsmikewolf.duckdns.org`, Netlify frontend, Render backend, Socket.io on backend
- Color palette: FrontRow brand (deep red `#8B0000`, gold `#D4AF37`, dark stage `#1a1a2e`)
- Clip resolution: 1920×1080, 30fps, H.264, ~10–20s per architecture beat

**Inputs**:
- Architecture description text (from SPEC-PHASE2.md or brief)
- Color palette spec
- List of beats marked `clip_type: architecture` in SCRIPT.md

**Outputs**:
- `arch_clips/arch_livekit_topology.mp4` — animated node graph: browser nodes → LiveKit SFU → subscriber browsers
- `arch_clips/arch_dataflow.mp4` — data flow: camera → segmentation → LiveKit → VideoTexture → Three.js plane
- `arch_clips/arch_socketio.mp4` — Socket.io event fan-out: HM emits → server → all clients update
- Each clip: 1920×1080, H.264, AAC silent audio track (for Resolve compatibility)

**Invocation**:
```
Dispatch task: arch-animator
Context: {architecture beat descriptions from SCRIPT.md, color palette}
Prompt: "Write and execute Python scripts (matplotlib + ffmpeg) to produce animated
         MP4 clips for each architecture beat. Save to video-production/arch_clips/.
         Each clip must be 1920×1080 H.264 with a silent AAC audio track.
         Use FrontRow brand colors. Animate node-by-node reveal with connecting edges."
Output path: video-production/arch_clips/
```

**Key Python pattern**:
```python
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import networkx as nx

G = nx.DiGraph()
G.add_edges_from([("Browser A", "LiveKit SFU"), ("LiveKit SFU", "Browser B")])
pos = nx.spring_layout(G, seed=42)
fig, ax = plt.subplots(figsize=(19.2, 10.8), dpi=100)

def animate(frame):
    ax.clear()
    nodes_to_show = list(G.nodes)[:frame+1]
    nx.draw_networkx(G.subgraph(nodes_to_show), pos, ax=ax, ...)

ani = animation.FuncAnimation(fig, animate, frames=len(G.nodes)+5, interval=500)
writer = animation.FFMpegWriter(fps=30, codec='libx264')
ani.save('arch_livekit_topology.mp4', writer=writer)
```

---

## Specialist 4 — ElevenLabs Voice Producer

**Role**: Takes each narration line from SCRIPT.md, calls the ElevenLabs API, and produces named MP3 files ready for Resolve import.

**Skill file**: `~/.claude/skills/elevenlabs-voice-producer/SKILL.md`

**Domain expertise**:
- ElevenLabs v1 API: `/v1/text-to-speech/{voice_id}` endpoint
- Voice IDs in use on this project (from past work in `~/Projects/Sidekick/build_video.py`):
  - Primary narrator: `EXAVITQu4vr4xnSDxMaL` ("Bella" — warm, theatrical)
  - Alternate: `21m00Tcm4TlvDq8ikWAM` ("Rachel")
- Optimal settings for demo narration: `stability: 0.45`, `similarity_boost: 0.75`, `style: 0.2`, `use_speaker_boost: true`
- Model: `eleven_multilingual_v2` for natural pacing
- File naming: `beat_NN_narration.mp3` to match beat IDs
- Handling API rate limits: 3 req/s, retry with exponential backoff
- Trimming silence: use `pydub` to strip leading/trailing silence > 200ms

**Inputs**:
- `SCRIPT.md` (narration lines per beat)
- `ELEVENLABS_API_KEY` env var
- Voice ID preference (defaults to Bella)

**Outputs**:
- `narration/beat_01_narration.mp3` … `narration/beat_N_narration.mp3`
- `narration/MANIFEST.json` — maps beat_id → filename → duration_s
- `narration/beat_NN_narration.wav` optionally (if Resolve needs WAV)

**Invocation**:
```
Dispatch task: elevenlabs-voice-producer
Context: {SCRIPT.md narration lines, ELEVENLABS_API_KEY}
Prompt: "Extract every narration line from SCRIPT.md. Call ElevenLabs TTS for each.
         Use voice EXAVITQu4vr4xnSDxMaL, stability=0.45, similarity_boost=0.75.
         Save as beat_NN_narration.mp3. Write MANIFEST.json with duration_s per file.
         Trim leading/trailing silence with pydub."
Output path: video-production/narration/
```

**Key API pattern** (adapted from Sidekick build_video.py):
```python
import requests, os, json
from pydub import AudioSegment

def generate_narration(text: str, beat_id: str, voice_id: str = "EXAVITQu4vr4xnSDxMaL"):
    resp = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]},
        json={
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.75,
                               "style": 0.2, "use_speaker_boost": True}
        }
    )
    path = f"video-production/narration/{beat_id}_narration.mp3"
    with open(path, "wb") as f:
        f.write(resp.content)
    # Trim silence
    audio = AudioSegment.from_mp3(path)
    trimmed = audio.strip_silence(silence_len=200, silence_thresh=-45, padding=100)
    trimmed.export(path, format="mp3")
    return path, len(trimmed) / 1000.0  # duration in seconds
```

---

## Specialist 5 — DaVinci Resolve Editor

**Role**: Python-scripts a complete DaVinci Resolve project: imports all clips and audio, assembles the timeline in beat order, syncs narration to video, adds text overlays, and exports the final MP4.

**Skill file**: `~/.claude/skills/resolve-editor/SKILL.md`

**Domain expertise**:
- DaVinci Resolve Python API (`DaVinciResolveScript` module, loaded from `/Applications/DaVinci Resolve/Developer/Scripting/`)
- Core API surface: `GetProjectManager()`, `CreateProject()`, `GetMediaStorage()`, `AddItemListToMediaPool()`, `AppendToTimeline()`, `SetClipProperty()`, `ExportCurrentFrameAsStill()`
- Resolve's timeline clip properties: `"Start"`, `"End"`, `"Duration"`, `"Custom Clip Color"`
- Text+ title clip insertion: `mediaPool.CreateTimelineFromClips()` with generator clips
- Frame rate: 30fps (match screen recordings)
- Export preset: "H.264 Master" → MP4, 1920×1080, AAC 192kbps audio
- Limitation awareness: free tier has no noise reduction or motion blur; use Fusion sparingly
- The Resolve Python interpreter is the one bundled with Resolve (`/Applications/DaVinci Resolve/Developer/Scripting/`), not system Python — scripts must be run via Resolve's built-in console or via `bmd.scriptapp("Resolve")`

**Inputs**:
- `narration/MANIFEST.json` (beat → audio file → duration_s)
- `screen_recordings/` directory (raw MP4s from Screen Recorder Coordinator)
- `arch_clips/` directory (animated MP4s from Architecture Animator)
- `SCRIPT.md` (beat order, visual descriptions for text overlays)

**Outputs**:
- DaVinci Resolve project file: `FrontRow-Demo.drp` (auto-saved by Resolve)
- Final export: `FrontRow-Phase2-Demo.mp4` (1920×1080 H.264)
- `resolve_build.log` — clip placement log with timecodes

**Invocation**:
```
Dispatch task: resolve-editor
Context: {MANIFEST.json, list of screen recording files, list of arch clips, SCRIPT.md}
Prompt: "Write and run the Python skeleton in video-production/resolve_build.py.
         Import all clips. Place them on the timeline in beat order.
         Set each clip's duration to match narration MANIFEST.json duration_s.
         Sync audio track: place beat_NN_narration.mp3 at the same start timecode
         as the matching video clip. Export to FrontRow-Phase2-Demo.mp4."
Output path: video-production/ (project auto-saved by Resolve)
```

---

## Specialist 6 — Screen Recorder Coordinator

**Role**: Orchestrates screen capture before, during, and after each Yeshie payload runs, producing clean raw MP4 clips named to match beat IDs.

**Skill file**: `~/.claude/skills/screen-recorder/SKILL.md`

**Domain expertise**:
- macOS `screencapture -V <duration> output.mov` for timed captures
- Screenpipe REST API at `localhost:3030`: `POST /record/start`, `POST /record/stop`, `GET /frames?start=...&end=...`
- Screenpipe search: `GET /search?q=FrontRow&content_type=ui` to find relevant frame ranges
- `ffmpeg` post-processing: crop to browser window, scale to 1920×1080, trim to exact beat duration
- Browser window identification: use `osascript` to get Chrome window bounds, pass to `screencapture -R x,y,w,h`
- Naming convention: `screen_recordings/beat_NN_raw.mp4` → `screen_recordings/beat_NN.mp4` after trim
- Coordination with Yeshie: writes a `RECORDING_READY` sentinel file that Yeshie Driver watches before starting each beat's payload

**Inputs**:
- `run_sequence.json` from Yeshie Demo Driver (beat order + inter-beat delays)
- `SCRIPT.md` duration_s per beat

**Outputs**:
- `screen_recordings/beat_NN_raw.mp4` — unedited captures at system resolution
- `screen_recordings/beat_NN.mp4` — trimmed + scaled to 1920×1080
- `screen_recordings/RECORDING_LOG.json` — maps beat_id → file → actual_duration_s

**Invocation**:
```
Dispatch task: screen-recorder-coordinator
Context: {run_sequence.json, SCRIPT.md beat durations, Chrome window bounds}
Prompt: "For each beat in run_sequence.json: start screencapture, signal Yeshie to run
         the payload, stop screencapture after duration_s + 0.5s buffer.
         Trim and scale each raw capture to 1920×1080 with ffmpeg.
         Write RECORDING_LOG.json when all beats are captured."
Output path: video-production/screen_recordings/
```

**Key shell patterns**:
```bash
# Get Chrome window bounds via AppleScript
osascript -e 'tell application "Google Chrome" to get bounds of window 1'
# → {x, y, w, h}

# Start timed capture of a region
screencapture -V 8 -R "0,0,1920,1080" screen_recordings/beat_03_raw.mov

# Trim + scale with ffmpeg
ffmpeg -i beat_03_raw.mov -t 6.0 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 18 beat_03.mp4
```

---

## Agent Coordination Protocol

All agents write outputs into `~/Projects/FrontRow/video-production/` with the following directory contract:

```
video-production/
├── SCRIPT.md                    ← Script Writer output; all others read this
├── yeshie-payloads/             ← Yeshie Demo Driver output
│   ├── 00_setup.json
│   ├── beat_01.json … beat_N.json
│   └── run_sequence.json
├── arch_clips/                  ← Architecture Animator output
│   ├── arch_livekit_topology.mp4
│   ├── arch_dataflow.mp4
│   └── arch_socketio.mp4
├── narration/                   ← ElevenLabs Voice Producer output
│   ├── beat_01_narration.mp3 … beat_N_narration.mp3
│   └── MANIFEST.json
├── screen_recordings/           ← Screen Recorder Coordinator output
│   ├── beat_NN_raw.mp4
│   ├── beat_NN.mp4
│   └── RECORDING_LOG.json
├── resolve_build.py             ← DaVinci Resolve Editor script
├── FrontRow-Phase2-Demo.mp4     ← Final output
└── resolve_build.log
```

**Handoff signal**: each agent writes a `.<agent>_done` sentinel file (e.g. `.script_done`, `.narration_done`) when complete. The orchestrator (or next dispatched agent) checks for these before starting.

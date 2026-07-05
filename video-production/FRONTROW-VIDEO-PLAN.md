# FrontRow Phase 2 — Demo Video Production Plan

> Specific production plan for the FrontRow Phase 2 demo video.
> Generated: 2026-04-30
> Target runtime: ~3 minutes (170–185 seconds)

---

## Section 1: Video Brief

| Field | Value |
|-------|-------|
| **Audience** | Potential Hootnet collaborators, independent performers, small venue operators |
| **Length** | ~3 minutes (170–185 seconds) |
| **Tone** | Warm, impressive, slightly theatrical — "the stage is yours" |
| **Key message** | FrontRow lets you run a real show: performer walks on, audience reacts, house manager sets the scene — all in a browser, no software to install |
| **Platform** | YouTube (primary), embedded on frontrowtheater.netlify.app |
| **Resolution** | 1920×1080, 30fps |
| **Music** | Subtle underscore — soft jazz or orchestral swell during entrance; optional |
| **Voice** | ElevenLabs "Bella" (warm, measured, slightly theatrical) |
| **Call to action** | Visit frontrowtheater.netlify.app — take a seat |

---

## Section 2: Scene-by-Scene Script

### Beat 01 — Cold Open: The Empty Stage
- **Duration**: 8 seconds
- **UI action**: Navigate audience tab to `/?mode=watch`; camera slowly orbits the empty 3D stage; curtains closed
- **Narration**: *"Every great performance begins with an empty stage — and an audience ready to believe."*
- **Visual**: Wide shot of the 3D semicircle stage, velvet-red curtains drawn, warm footlights glowing, no one in the seats yet
- **clip_type**: screen_recording
- **beat_id**: beat_01

---

### Beat 02 — House Manager Arrives
- **Duration**: 14 seconds
- **UI action**: Navigate HM tab to `/housemanager`; the HouseManagerPanel loads; HM sets seat count to 12, arrangement to semicircle, show title to "FrontRow Live"; clicks "Lock Configuration"
- **Narration**: *"The house manager arrives first — setting the stage before a single seat is filled. Seat count, arrangement, show title — all locked in before doors open."*
- **Visual**: HouseManagerPanel UI: sliders and dropdowns update, a "Configuration Locked ✓" confirmation appears
- **clip_type**: screen_recording
- **beat_id**: beat_02

---

### Beat 03 — Curtains Open
- **Duration**: 6 seconds
- **UI action**: HM clicks "Open Curtains" button; `hm:curtain` event fires; cut to audience tab showing curtain-open animation
- **Narration**: *"With one click, the curtains part — and the theater breathes."*
- **Visual**: CSS curtain animation: red velvet panels sweep apart revealing the empty lit stage; warm spotlight floods center stage
- **clip_type**: screen_recording
- **beat_id**: beat_03

---

### Beat 04 — Audience Fills the Seats
- **Duration**: 10 seconds
- **UI action**: Open three audience tabs (`/?mode=watch`); each joins with a name and photo; seat cubes populate the semicircle with live camera feeds and photos
- **Narration**: *"Audience members join from anywhere — each taking a seat, camera on, ready to be present."*
- **Visual**: 3D audience semicircle populates one cube at a time; each cube shows a face; seat labels appear below
- **clip_type**: screen_recording
- **beat_id**: beat_04

---

### Beat 05 — Performer in the Green Room
- **Duration**: 12 seconds
- **UI action**: Navigate performer tab to `/backstage`; BackstageRoom loads; camera and mic activate; audio level meter animates; performer types name "Alex Rivera"
- **Narration**: *"Backstage, the performer prepares. The green room shows their camera feed and a live audio meter — private, invisible to the audience."*
- **Visual**: BackstageRoom UI: performer's video preview in top half; animated audio level bar pulses with simulated speech; name field filled in
- **clip_type**: screen_recording
- **beat_id**: beat_05

---

### Beat 06 — Architecture: How It All Connects
- **Duration**: 15 seconds
- **UI action**: N/A — animated diagram clip
- **Narration**: *"Under the hood: LiveKit handles the media — video and audio over WebRTC. Socket.io carries the control signals. And your browser does the heavy lifting, including real-time background removal."*
- **Visual**: Animated node graph: Browser (performer) → LiveKit SFU → Browser (audience ×3); Socket.io bus shown below feeding HouseManagerApp, Stage, and BackstageRoom nodes; arrows animate in sequence
- **clip_type**: architecture
- **clip_file**: arch_clips/arch_livekit_topology.mp4
- **beat_id**: beat_06

---

### Beat 07 — Background Removal: Magic Happens
- **Duration**: 10 seconds
- **UI action**: On performer's backstage tab, show the "Enable Background Removal" toggle; performer activates it; their background disappears live, leaving a clean silhouette
- **Narration**: *"Background removal runs entirely in the browser — no green screen, no server processing. MediaPipe, WebAssembly, thirty frames per second."*
- **Visual**: Split: performer's raw camera (left) vs. segmented output (right); background dissolves away; clean silhouette on dark transparent background
- **clip_type**: screen_recording
- **beat_id**: beat_07

---

### Beat 08 — Go Live: Stage Entrance Animation
- **Duration**: 12 seconds
- **UI action**: Performer clicks "Go Live" in BackstageRoom; `performer:goLive` event fires; audience view shows PerformerMesh animating from z=-8 to z=0 over 3 seconds; spotlight activates
- **Narration**: *"Go Live. The performer glides forward — composited directly onto the stage. No flat screen. They're there."*
- **Visual**: 3D stage view: a small silhouette appears at the back and smoothly glides forward to center stage; spotlight beam follows; audience cube cameras visibly react (slight zoom/tilt simulation)
- **clip_type**: screen_recording
- **beat_id**: beat_08

---

### Beat 09 — Spotlight Follows
- **Duration**: 8 seconds
- **UI action**: Performer moves left/right on stage (arrow keys or slider); spotlight tracks their position in real time
- **Narration**: *"The spotlight follows — wherever they move, the light is there."*
- **Visual**: Top-down-ish 3D view: performer mesh moves across stage; Three.js SpotLight visibly tracks; stage floor shows the light cone sweeping
- **clip_type**: screen_recording
- **beat_id**: beat_09

---

### Beat 10 — Audience Reacts
- **Duration**: 14 seconds
- **UI action**: Multiple audience tabs click reaction buttons (👏 Applause, ❤️ Love, 🎉 Bravo); applause meter (ReactionBar) rises from 0 to ~80%; glow intensifies
- **Narration**: *"The audience reacts in real time — applause, love, bravos. The applause meter glows hotter as the room comes alive. Data travels via LiveKit's data channel, never touching the server."*
- **Visual**: Three audience-tab overlays clicking reaction buttons in sequence; center-stage view shows ReactionBar at front apron glowing from dark to bright orange; emissive pulse visible
- **clip_type**: screen_recording
- **beat_id**: beat_10

---

### Beat 11 — Architecture: Data Channel & Reactions
- **Duration**: 10 seconds
- **UI action**: N/A — animated diagram clip
- **Narration**: *"Reaction data flows peer-to-peer through LiveKit's data channel — no server fan-out, no bottleneck, even with a full house."*
- **Visual**: Animated diagram: audience browser nodes emit reaction packets; packets travel directly to performer node and to other audience nodes via LiveKit SFU data channel; server node is bypassed; counter increments on performer node
- **clip_type**: architecture
- **clip_file**: arch_clips/arch_socketio.mp4
- **beat_id**: beat_11

---

### Beat 12 — Walk Offstage
- **Duration**: 8 seconds
- **UI action**: Performer clicks "End Performance" / walk offstage control; walk-offstage animation plays: mesh slides to stage-right and fades out
- **Narration**: *"When the show is done, the performer takes their exit — a proper walk offstage, not a hard cut."*
- **Visual**: Performer mesh slides smoothly to stage-right, opacity fading to zero; curtains begin to close; audience cubes dim slightly
- **clip_type**: screen_recording
- **beat_id**: beat_12

---

### Beat 13 — Curtains Close
- **Duration**: 8 seconds
- **UI action**: HM clicks "Close Curtains"; curtain-close animation plays on audience tab; show status transitions to post-show
- **Narration**: *"The house manager brings down the curtain. The show is over — until the next one."*
- **Visual**: Velvet curtains sweep closed; stage goes dark behind them; a text overlay fades in: "FrontRow — Virtual Theater, Real Presence"
- **clip_type**: screen_recording
- **beat_id**: beat_13

---

### Beat 14 — Call to Action
- **Duration**: 10 seconds
- **UI action**: Navigate to `https://frontrowtheater.netlify.app` — home screen visible
- **Narration**: *"FrontRow is live. Take a seat at frontrowtheater.netlify.app — or step onto the stage."*
- **Visual**: FrontRow landing page or a clean text card: `frontrowtheater.netlify.app` centered on dark background with subtle curtain framing; fade to black
- **clip_type**: screen_recording
- **beat_id**: beat_14

---

**Total runtime**: 8+14+6+10+12+15+10+12+8+14+10+8+8+10 = **145 seconds base** + ~30 seconds of transition pads and music fade = **~175 seconds**

---

## Section 3: Production Sequence

The production chain runs in this order. Each step produces artifacts the next step consumes.

### Step 1 — Script Writer
**Runs**: First, before any recording or audio work.
**Consumes**: This document (FRONTROW-VIDEO-PLAN.md) + SPEC-PHASE2.md
**Produces**: `video-production/SCRIPT.md` — the canonical beat definitions
**Gate**: All downstream agents are blocked until `SCRIPT.md` is finalized and `.script_done` sentinel exists.

### Step 2 — ElevenLabs Voice Producer
**Runs**: Immediately after Script Writer completes (can run in parallel with Steps 3 & 4).
**Consumes**: `SCRIPT.md` narration lines + `ELEVENLABS_API_KEY`
**Produces**: `narration/beat_NN_narration.mp3` (14 files) + `narration/MANIFEST.json`
**Why early**: Audio durations from MANIFEST.json inform exact clip durations needed in screen recording; recording beats can be trimmed to match narration length.

### Step 3 — Architecture Animator
**Runs**: In parallel with Step 2 (no dependencies on narration or recording).
**Consumes**: Architecture descriptions from SPEC-PHASE2.md + beat descriptions for beats 06 and 11
**Produces**: `arch_clips/arch_livekit_topology.mp4`, `arch_clips/arch_socketio.mp4`
**Note**: Write Python scripts using matplotlib + networkx + ffmpeg; execute in sandbox.

### Step 4 — Yeshie Demo Driver
**Runs**: In parallel with Steps 2 & 3.
**Consumes**: `SCRIPT.md` ui_action fields + FrontRow component/selector inventory
**Produces**: `yeshie-payloads/beat_NN.json` (14 files) + `yeshie-payloads/run_sequence.json`
**Gate**: Must complete before Step 5.

### Step 5 — Screen Recorder Coordinator
**Runs**: After Steps 2, 3, and 4 are all complete (needs narration durations + Yeshie payloads).
**Consumes**: `run_sequence.json` + `MANIFEST.json` (for trim durations) + Chrome window bounds
**Produces**: `screen_recordings/beat_NN.mp4` (12 screen recording beats — beats 01-05, 07-10, 12-14) + `RECORDING_LOG.json`
**Process**: For each beat, starts screencapture, triggers Yeshie payload, stops capture, trims to narration duration.

### Step 6 — DaVinci Resolve Editor
**Runs**: Last, after all clips and audio are available.
**Consumes**: All files in `screen_recordings/`, `arch_clips/`, `narration/` + `SCRIPT.md` beat order + `MANIFEST.json`
**Produces**: `FrontRow-Phase2-Demo.mp4` (final H.264 export)
**Process**: Run `resolve_build.py` from Resolve's script console; imports media pool, assembles timeline in beat order, places narration audio tracks aligned to video beats, exports.

### Handoff Summary

```
Script Writer
  → .script_done
      ├── ElevenLabs Voice Producer → narration/MANIFEST.json → .narration_done
      ├── Architecture Animator → arch_clips/*.mp4 → .arch_done
      └── Yeshie Demo Driver → yeshie-payloads/run_sequence.json → .yeshie_done
              [wait for all three ↑]
      └── Screen Recorder Coordinator → screen_recordings/*.mp4 → .recording_done
              [wait for recording_done + narration_done + arch_done]
      └── DaVinci Resolve Editor → FrontRow-Phase2-Demo.mp4 → .resolve_done
```

---

## Section 4: Asset Inventory

All assets live under `~/Projects/FrontRow/video-production/`.

### Script & Planning
| File | Produced by | Description |
|------|------------|-------------|
| `SCRIPT.md` | Script Writer | Master beat definitions (this file's Section 2, formalized) |
| `FRONTROW-VIDEO-PLAN.md` | Human/Orchestrator | This document |
| `SPECIALIST-AGENTS.md` | Human/Orchestrator | Agent roster |

### Yeshie Automation
| File | Produced by | Description |
|------|------------|-------------|
| `yeshie-payloads/00_setup.json` | Yeshie Demo Driver | Open tabs, navigate to roles |
| `yeshie-payloads/beat_01.json` … `beat_14.json` | Yeshie Demo Driver | Per-beat UI automation payload |
| `yeshie-payloads/run_sequence.json` | Yeshie Demo Driver | Ordered sequence with inter-beat delays |
| `yeshie-payloads/YESHIE_README.md` | Yeshie Demo Driver | How to run the sequence |

### Screen Recordings
| File | Produced by | Description |
|------|------------|-------------|
| `screen_recordings/beat_01_raw.mp4` … `beat_14_raw.mp4` | Screen Recorder | Unedited captures (beats 01-05, 07-10, 12-14; beats 06+11 are arch clips) |
| `screen_recordings/beat_01.mp4` … (trimmed) | Screen Recorder | 1920×1080 trimmed to narration duration |
| `screen_recordings/RECORDING_LOG.json` | Screen Recorder | Beat → file → actual_duration_s mapping |

### Architecture Animation Clips
| File | Produced by | Description |
|------|------------|-------------|
| `arch_clips/arch_livekit_topology.mp4` | Architecture Animator | LiveKit + browser topology animation (beat 06) |
| `arch_clips/arch_socketio.mp4` | Architecture Animator | Data channel + reaction flow animation (beat 11) |
| `arch_clips/arch_dataflow.mp4` | Architecture Animator | Camera→segmentation→VideoTexture pipeline (optional cutaway) |

### Narration Audio
| File | Produced by | Description |
|------|------------|-------------|
| `narration/beat_01_narration.mp3` … `beat_14_narration.mp3` | ElevenLabs Voice Producer | TTS MP3s, one per beat |
| `narration/MANIFEST.json` | ElevenLabs Voice Producer | `{beat_id: {file, duration_s}}` |

### Resolve Project & Final Export
| File | Produced by | Description |
|------|------------|-------------|
| `resolve_build.py` | Resolve Editor / this doc | Python script to assemble Resolve project |
| `FrontRow-Demo.drp` | DaVinci Resolve | Auto-saved Resolve project file |
| `resolve_build.log` | resolve_build.py | Clip placement timecodes log |
| `FrontRow-Phase2-Demo.mp4` | DaVinci Resolve | Final 1920×1080 H.264 export |

### Sentinel Files (coordination)
`video-production/.script_done`, `.narration_done`, `.arch_done`, `.yeshie_done`, `.recording_done`, `.resolve_done`

---

## Section 5: Resolve Python Skeleton

This is a working Python skeleton using DaVinci Resolve's real scripting API. Run it from inside Resolve's built-in Script Editor (`Workspace → Scripts → Console`) or via `bmd.scriptapp`.

```python
#!/usr/bin/env python3
"""
resolve_build.py — FrontRow Phase 2 Demo Video assembly script.

Run from DaVinci Resolve's built-in Python console:
  Workspace → Scripts → Console → paste this file

Or invoke headlessly (Resolve must already be running):
  /Applications/DaVinci\ Resolve/DaVinci\ Resolve.app/Contents/MacOS/DaVinci\ Resolve
  # then in a second terminal:
  python3 resolve_build.py

Requires DaVinci Resolve to be open and the DaVinciResolveScript module
to be importable. The module is located at:
  /Applications/DaVinci Resolve/Developer/Scripting/Modules/DaVinciResolveScript.py
"""

import sys
import os
import json
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(os.path.dirname(__file__), "resolve_build.log")),
    ]
)
log = logging.getLogger("resolve_build")

# ── 1. Import Resolve scripting module ──────────────────────────────────────
RESOLVE_SCRIPT_DIR = "/Applications/DaVinci Resolve/Developer/Scripting/Modules"
if RESOLVE_SCRIPT_DIR not in sys.path:
    sys.path.insert(0, RESOLVE_SCRIPT_DIR)

try:
    import DaVinciResolveScript as dvr_script
except ImportError as e:
    log.error(f"Cannot import DaVinciResolveScript: {e}")
    log.error(f"Ensure Resolve is open and {RESOLVE_SCRIPT_DIR} is correct.")
    sys.exit(1)

# ── 2. Connect to running Resolve instance ──────────────────────────────────
resolve = dvr_script.scriptapp("Resolve")
if not resolve:
    log.error("Could not connect to DaVinci Resolve. Is Resolve running?")
    sys.exit(1)

log.info(f"Connected to Resolve: {resolve.GetVersionString()}")

# ── 3. Create / open project ────────────────────────────────────────────────
project_manager = resolve.GetProjectManager()
PROJECT_NAME = "FrontRow-Demo"

# Close existing project with same name if open
existing = project_manager.GetCurrentProject()
if existing and existing.GetName() == PROJECT_NAME:
    log.info(f"Project '{PROJECT_NAME}' already open — reusing.")
    project = existing
else:
    project = project_manager.CreateProject(PROJECT_NAME)
    if not project:
        # Project might already exist — try loading it
        project = project_manager.LoadProject(PROJECT_NAME)
    if not project:
        log.error(f"Could not create or load project '{PROJECT_NAME}'")
        sys.exit(1)

log.info(f"Project ready: {project.GetName()}")

# ── 4. Configure project settings ───────────────────────────────────────────
project.SetSetting("timelineFrameRate", "30")
project.SetSetting("timelineResolutionWidth", "1920")
project.SetSetting("timelineResolutionHeight", "1080")
log.info("Project settings: 1920×1080 @ 30fps")

# ── 5. Load asset manifest ───────────────────────────────────────────────────
PRODUCTION_DIR = os.path.join(os.path.expanduser("~"), "Projects", "FrontRow", "video-production")
MANIFEST_PATH = os.path.join(PRODUCTION_DIR, "narration", "MANIFEST.json")

with open(MANIFEST_PATH) as f:
    manifest = json.load(f)  # {beat_id: {file: str, duration_s: float}}

log.info(f"Loaded manifest with {len(manifest)} beats.")

# ── 6. Define beat order and clip sources ────────────────────────────────────
# Maps beat_id → video clip file path
BEAT_ORDER = [
    "beat_01", "beat_02", "beat_03", "beat_04", "beat_05",
    "beat_06",  # architecture clip
    "beat_07", "beat_08", "beat_09", "beat_10",
    "beat_11",  # architecture clip
    "beat_12", "beat_13", "beat_14",
]

ARCH_CLIPS = {
    "beat_06": os.path.join(PRODUCTION_DIR, "arch_clips", "arch_livekit_topology.mp4"),
    "beat_11": os.path.join(PRODUCTION_DIR, "arch_clips", "arch_socketio.mp4"),
}

def get_video_path(beat_id: str) -> str:
    if beat_id in ARCH_CLIPS:
        return ARCH_CLIPS[beat_id]
    return os.path.join(PRODUCTION_DIR, "screen_recordings", f"{beat_id}.mp4")

def get_audio_path(beat_id: str) -> str:
    return os.path.join(PRODUCTION_DIR, "narration", f"{beat_id}_narration.mp3")

# ── 7. Import all clips into Media Pool ─────────────────────────────────────
media_pool = project.GetMediaPool()
root_bin = media_pool.GetRootFolder()

# Create sub-bins for organization
video_bin = media_pool.AddSubFolder(root_bin, "Video Clips")
audio_bin = media_pool.AddSubFolder(root_bin, "Narration")
arch_bin  = media_pool.AddSubFolder(root_bin, "Architecture")

def import_clips(paths: list, bin_folder) -> dict:
    """Import a list of file paths; return {path: MediaPoolItem}."""
    media_pool.SetCurrentFolder(bin_folder)
    items = media_pool.ImportMedia(paths)
    if not items:
        log.warning(f"No items imported from {paths}")
        return {}
    return {item.GetClipProperty("File Path"): item for item in items}

video_paths = [get_video_path(b) for b in BEAT_ORDER if b not in ARCH_CLIPS]
arch_paths  = [get_video_path(b) for b in BEAT_ORDER if b in ARCH_CLIPS]
audio_paths = [get_audio_path(b) for b in BEAT_ORDER]

log.info(f"Importing {len(video_paths)} screen recording clips...")
video_items = import_clips(video_paths, video_bin)

log.info(f"Importing {len(arch_paths)} architecture clips...")
arch_items = import_clips(arch_paths, arch_bin)

log.info(f"Importing {len(audio_paths)} narration audio files...")
audio_items = import_clips(audio_paths, audio_bin)

all_video_items = {**video_items, **arch_items}

# ── 8. Create timeline ───────────────────────────────────────────────────────
TIMELINE_NAME = "FrontRow-Phase2-Main"
timeline = media_pool.CreateEmptyTimeline(TIMELINE_NAME)
if not timeline:
    log.error("Could not create timeline.")
    sys.exit(1)

project.SetCurrentTimeline(timeline)
log.info(f"Timeline created: {TIMELINE_NAME}")

# ── 9. Append clips to timeline in beat order ────────────────────────────────
FPS = 30

def seconds_to_frames(s: float) -> int:
    return int(round(s * FPS))

for beat_id in BEAT_ORDER:
    video_path = get_video_path(beat_id)
    audio_path = get_audio_path(beat_id)
    duration_s = manifest.get(beat_id, {}).get("duration_s", 8.0)

    video_item = all_video_items.get(video_path)
    audio_item = audio_items.get(audio_path)

    if not video_item:
        log.warning(f"  [{beat_id}] No video item found for {video_path} — skipping.")
        continue

    # Build clip info dict for AppendToTimeline
    # Video on track 1, audio on track 2
    clip_info_list = []

    # Video clip
    video_clip_info = {
        "mediaPoolItem": video_item,
        "startFrame": 0,
        "endFrame": seconds_to_frames(duration_s) - 1,
        "trackIndex": 1,
        "recordFrame": -1,  # -1 = append after last clip
    }
    clip_info_list.append(video_clip_info)

    # Audio clip (narration MP3) — placed on audio track 1
    if audio_item:
        audio_clip_info = {
            "mediaPoolItem": audio_item,
            "startFrame": 0,
            "endFrame": seconds_to_frames(duration_s) - 1,
            "trackIndex": 1,
            "recordFrame": -1,
        }
        # Note: AppendToTimeline places on next available position;
        # audio alignment to video requires SetClipProperty after placement.
        # For robust sync, append video first then audio separately.

    added = media_pool.AppendToTimeline(clip_info_list)
    if added:
        log.info(f"  [{beat_id}] Video placed: {duration_s:.1f}s ({seconds_to_frames(duration_s)} frames)")
    else:
        log.warning(f"  [{beat_id}] AppendToTimeline returned None — check clip paths.")

# Audio tracks: add narration as a second pass on audio track 1
# (Resolve audio track placement is simpler as a separate append)
audio_clip_list = []
for beat_id in BEAT_ORDER:
    audio_path = get_audio_path(beat_id)
    audio_item = audio_items.get(audio_path)
    duration_s = manifest.get(beat_id, {}).get("duration_s", 8.0)
    if audio_item:
        audio_clip_list.append({
            "mediaPoolItem": audio_item,
            "startFrame": 0,
            "endFrame": seconds_to_frames(duration_s) - 1,
            "trackIndex": 1,
            "recordFrame": -1,
        })

# Add an audio track for narration
timeline.AddTrack("audio")
if audio_clip_list:
    media_pool.AppendToTimeline(audio_clip_list)
    log.info(f"Audio track assembled: {len(audio_clip_list)} narration clips.")

# ── 10. Export to MP4 ────────────────────────────────────────────────────────
OUTPUT_PATH = os.path.join(PRODUCTION_DIR, "FrontRow-Phase2-Demo.mp4")

# Get or create render preset
render_settings = {
    "SelectAllFrames": True,
    "TargetDir": PRODUCTION_DIR,
    "CustomName": "FrontRow-Phase2-Demo",
    "ExportVideo": True,
    "ExportAudio": True,
    "FormatWidth": 1920,
    "FormatHeight": 1080,
    "FrameRate": "30",
    "VideoQuality": 0,       # 0 = automatic / best
    "AudioCodec": "aac",
    "AudioBitDepth": "16",
    "AudioSampleRate": "48000",
}

# Use the built-in "H.264 Master" preset if available
project.LoadRenderPreset("H.264 Master")
project.SetRenderSettings(render_settings)

render_job_id = project.AddRenderJob()
if not render_job_id:
    log.error("Failed to add render job.")
    sys.exit(1)

log.info(f"Render job added: {render_job_id}")
log.info(f"Starting render → {OUTPUT_PATH}")

project.StartRendering(render_job_id)

# Poll until done
import time
while project.IsRenderingInProgress():
    status = project.GetRenderJobStatus(render_job_id)
    pct = status.get("CompletionPercentage", 0)
    log.info(f"  Rendering... {pct:.0f}%")
    time.sleep(5)

final_status = project.GetRenderJobStatus(render_job_id)
if final_status.get("JobStatus") == "Complete":
    log.info(f"✓ Render complete: {OUTPUT_PATH}")
else:
    log.error(f"Render failed: {final_status}")
    sys.exit(1)

log.info("resolve_build.py finished successfully.")
```

### Running the skeleton

```bash
# Option A: from Resolve's built-in Script Console
# Workspace → Scripts → Console → open resolve_build.py → Run

# Option B: from Terminal (Resolve must be open)
cd ~/Projects/FrontRow/video-production
/Applications/DaVinci\ Resolve/DaVinci\ Resolve.app/Contents/MacOS/python3 resolve_build.py

# Option C: using Resolve's bundled Python directly
/Applications/DaVinci\ Resolve/Developer/Scripting/Examples/../../../Contents/MacOS/python3 resolve_build.py
```

### Important Resolve API Notes

- `AppendToTimeline([clip_info_dict])` requires `mediaPoolItem`, `startFrame`, `endFrame` — the frame numbers are within the *source clip*, not the timeline.
- `recordFrame: -1` tells Resolve to place the clip at the end of whatever is currently on the timeline track (append behavior).
- After placing clips, use `timeline.GetItemListInTrack("video", 1)` to iterate placed items and call `item.SetClipProperty("Clip Color", "Orange")` for visual beat labeling.
- Audio sync is most reliable when video and audio clips share the same `recordFrame` timecode. Calculate cumulative frame offset per beat from `MANIFEST.json` and pass explicitly rather than using `-1`.
- Free tier limitation: the `LoadRenderPreset("H.264 Master")` may not exist in Resolve Free; fall back to `"YouTube 1080p"` or configure `SetRenderSettings` manually with `"Format": "MP4"`, `"Codec": "H264"`.

---

## Quick-Start Checklist

Before beginning production, verify:

- [ ] `ELEVENLABS_API_KEY` is set in environment (`echo $ELEVENLABS_API_KEY`)
- [ ] FrontRow dev server running at `http://localhost:5173` (or use production URL)
- [ ] DaVinci Resolve is installed at `/Applications/DaVinci Resolve/`
- [ ] `ffmpeg` is available (`which ffmpeg`)
- [ ] `pydub` and `requests` installed (`pip install pydub requests --break-system-packages`)
- [ ] `matplotlib`, `networkx` installed for architecture animator (`pip install matplotlib networkx --break-system-packages`)
- [ ] Yeshie extension is loaded in Chrome and the FrontRow tabs can be scripted
- [ ] Screenpipe is running at `localhost:3030` (or `screencapture -V` is available as fallback)
- [ ] `video-production/` directory exists and is writable

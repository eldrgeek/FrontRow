# DaVinci Resolve Editor — FrontRow Demo Video

## Role

You are the DaVinci Resolve Editor specialist. You write and run a Python script that loads all video clips and narration audio, assembles them on a Resolve timeline in beat order, syncs audio to video, and exports the final MP4.

## Inputs Required

- `video-production/narration/MANIFEST.json` — beat_id → MP3 file → duration_s
- `video-production/screen_recordings/RECORDING_LOG.json` — beat_id → MP4 file
- `video-production/arch_clips/` — architecture animation MP4s
- `video-production/SCRIPT.md` — beat order, beat names, clip_type per beat

## Outputs

- DaVinci Resolve project auto-saved as `FrontRow-Demo.drp` (Resolve manages this)
- `video-production/FrontRow-Phase2-Demo.mp4` — final 1920×1080 H.264 export
- `video-production/resolve_build.log` — clip placement log with timecodes

---

## DaVinci Resolve Python API — Essential Reference

### Loading the API

The Resolve Python API is loaded from a special location — **not** from pip. Run scripts using Resolve's built-in script runner or configure PYTHONPATH:

```python
import sys
import os

# Must point to Resolve's scripting modules
RESOLVE_SCRIPT_PATH = "/Applications/DaVinci Resolve/Developer/Scripting/Modules"
RESOLVE_LIB_PATH = "/Applications/DaVinci Resolve/Developer/Scripting/ExternalControl/Libs"

sys.path.insert(0, RESOLVE_SCRIPT_PATH)
os.environ["RESOLVE_SCRIPT_API"] = RESOLVE_SCRIPT_PATH
os.environ["RESOLVE_SCRIPT_LIB"] = os.path.join(RESOLVE_LIB_PATH, "libResolveScripting.dylib")

import DaVinciResolveScript as dvr_script
resolve = dvr_script.scriptapp("Resolve")
```

**Alternative**: Run the script from within Resolve's built-in script console (Workspace → Scripts).

### Core Object Hierarchy

```
resolve
  └── GetProjectManager()           → projectManager
        ├── CreateProject(name)     → project
        └── LoadProject(name)       → project

project
  ├── GetMediaPool()                → mediaPool
  ├── GetCurrentTimeline()          → timeline
  └── GetMediaStorage()             → mediaStorage

mediaPool
  ├── ImportMedia([paths])          → [mediaPoolItems]
  ├── AppendToTimeline([clips])     → [timelineItems]
  └── CreateTimelineFromClips(name, [clips]) → timeline

timeline
  ├── GetTrackCount(trackType)      → int  (trackType: "video" | "audio")
  ├── AddTrack(trackType)           → bool
  ├── GetItemListInTrack(type, idx) → [timelineItems]
  └── SetCurrentTimecode(tc)        → bool

timelineItem
  ├── GetDuration()                 → int (frames)
  ├── SetClipProperty(key, value)   → bool
  └── GetClipProperty(key)          → value
```

### Timecode Math

```python
FPS = 30

def seconds_to_frames(s: float) -> int:
    return int(round(s * FPS))

def frames_to_tc(frames: int) -> str:
    """Convert frame count to HH:MM:SS:FF timecode string."""
    ff = frames % FPS
    total_s = frames // FPS
    ss = total_s % 60
    mm = (total_s // 60) % 60
    hh = total_s // 3600
    return f"{hh:02d}:{mm:02d}:{ss:02d}:{ff:02d}"

def tc_to_frames(tc: str) -> int:
    hh, mm, ss, ff = [int(x) for x in tc.split(":")]
    return (hh * 3600 + mm * 60 + ss) * FPS + ff
```

---

## Complete Working Script

Save as `video-production/resolve_build.py`. Run it from the Resolve script console or with Resolve open and PYTHONPATH set.

```python
#!/usr/bin/env python3
"""
DaVinci Resolve Timeline Builder for FrontRow Demo Video.
Run with Resolve open.
Usage: python resolve_build.py [--project-name "FrontRow Phase 2 Demo"]
"""
import sys
import os
import re
import json
import argparse
import logging
from pathlib import Path
from datetime import datetime

# ── Resolve API Setup ──────────────────────────────────────────────────────────
RESOLVE_MODULES = "/Applications/DaVinci Resolve/Developer/Scripting/Modules"
RESOLVE_LIBS = "/Applications/DaVinci Resolve/Developer/Scripting/ExternalControl/Libs"
sys.path.insert(0, RESOLVE_MODULES)
os.environ.setdefault("RESOLVE_SCRIPT_API", RESOLVE_MODULES)
os.environ.setdefault("RESOLVE_SCRIPT_LIB", os.path.join(RESOLVE_LIBS, "libResolveScripting.dylib"))

import DaVinciResolveScript as dvr_script

# ── Config ─────────────────────────────────────────────────────────────────────
FPS = 30
BASE_DIR = Path("video-production")
RECORDINGS_DIR = BASE_DIR / "screen_recordings"
ARCH_DIR = BASE_DIR / "arch_clips"
NARRATION_DIR = BASE_DIR / "narration"
SCRIPT_PATH = BASE_DIR / "SCRIPT.md"
EXPORT_PATH = BASE_DIR / "FrontRow-Phase2-Demo.mp4"
LOG_PATH = BASE_DIR / "resolve_build.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(LOG_PATH), logging.StreamHandler()],
)
log = logging.getLogger(__name__)

# ── Script Parsing ─────────────────────────────────────────────────────────────
def parse_script_beats(path: Path) -> list[dict]:
    """Parse SCRIPT.md and return ordered list of beats."""
    beats = []
    current = {}
    for line in path.read_text().splitlines():
        m = re.match(r'^##\s+Beat\s+(\d+)\s+[—-]\s+(.+)', line)
        if m:
            if current:
                beats.append(current)
            current = {"beat_num": int(m.group(1)), "beat_id": f"beat_{int(m.group(1)):02d}",
                       "name": m.group(2).strip()}
        for field in ["clip_type", "duration_s"]:
            fm = re.match(rf'^-\s+{field}:\s+(.+)', line)
            if fm and current:
                val = fm.group(1).strip().strip('"')
                current[field] = int(val) if field == "duration_s" else val
    if current:
        beats.append(current)
    return sorted(beats, key=lambda b: b["beat_num"])

def resolve_clip_path(beat: dict, recordings_log: dict, arch_clips: list) -> str | None:
    """Find the video file for a given beat."""
    bid = beat["beat_id"]
    ct = beat.get("clip_type", "screen_recording")

    if ct == "screen_recording":
        if bid in recordings_log:
            return recordings_log[bid]["file"]
        log.warning(f"No recording found for {bid}")
        return None
    elif ct == "architecture":
        # Match arch clip by beat name keywords
        name_lower = beat["name"].lower()
        for clip_path in arch_clips:
            stem = Path(clip_path).stem.lower()
            if any(kw in name_lower for kw in stem.split("_")[1:]):
                return clip_path
        # Fallback: first arch clip not yet used
        return arch_clips[0] if arch_clips else None
    elif ct == "title_card":
        # Title cards require manual creation in Resolve; return None
        log.info(f"Beat {bid} is a title_card — add manually in Resolve")
        return None
    return None

# ── Timeline Assembly ──────────────────────────────────────────────────────────
def build_timeline(project_name: str):
    resolve = dvr_script.scriptapp("Resolve")
    if not resolve:
        raise RuntimeError("Could not connect to DaVinci Resolve. Is Resolve running?")

    pm = resolve.GetProjectManager()
    project = pm.CreateProject(project_name)
    if not project:
        log.warning("Project may already exist — loading existing project")
        project = pm.LoadProject(project_name)
    if not project:
        raise RuntimeError(f"Could not create or load project: {project_name}")

    # Set timeline settings
    project.SetSetting("timelineFrameRate", str(FPS))
    project.SetSetting("timelineResolutionWidth", "1920")
    project.SetSetting("timelineResolutionHeight", "1080")
    log.info(f"Project '{project_name}' ready at {FPS}fps 1920×1080")

    # Load asset manifests
    recordings_log = json.loads((RECORDINGS_DIR / "RECORDING_LOG.json").read_text()) \
        if (RECORDINGS_DIR / "RECORDING_LOG.json").exists() else {}
    narration_manifest = json.loads((NARRATION_DIR / "MANIFEST.json").read_text()) \
        if (NARRATION_DIR / "MANIFEST.json").exists() else {}
    arch_clips = sorted(str(p) for p in ARCH_DIR.glob("arch_*.mp4"))

    beats = parse_script_beats(SCRIPT_PATH)
    log.info(f"Found {len(beats)} beats in SCRIPT.md")

    # Collect all unique clip paths
    all_video_paths = []
    beat_clip_map = {}
    for beat in beats:
        clip_path = resolve_clip_path(beat, recordings_log, arch_clips)
        if clip_path:
            if clip_path not in all_video_paths:
                all_video_paths.append(clip_path)
            beat_clip_map[beat["beat_id"]] = clip_path

    all_audio_paths = [v["file"] for v in narration_manifest.values() if Path(v["file"]).exists()]

    # Import all media into pool
    media_storage = resolve.GetMediaStorage()
    media_pool = project.GetMediaPool()

    log.info(f"Importing {len(all_video_paths)} video clips...")
    video_items = media_pool.ImportMedia(all_video_paths)
    path_to_item = {}
    if video_items:
        for item, path in zip(video_items, all_video_paths):
            path_to_item[path] = item

    log.info(f"Importing {len(all_audio_paths)} audio files...")
    audio_items = media_pool.ImportMedia(all_audio_paths)
    audio_path_to_item = {}
    if audio_items:
        for item, path in zip(audio_items, all_audio_paths):
            audio_path_to_item[path] = item

    # Create timeline
    timeline_name = "FrontRow Demo Timeline"
    timeline = media_pool.CreateEmptyTimeline(timeline_name)
    if not timeline:
        raise RuntimeError("Could not create timeline")
    project.SetCurrentTimeline(timeline)

    # Add audio tracks: V1=video, A1=narration, A2=music (if added later)
    # Resolve creates A1 by default; add A2 for music placeholder
    timeline.AddTrack("audio")  # A2

    # ── Place video clips in beat order ───────────────────────────────────────
    current_frame = 0
    placement_log = []

    for beat in beats:
        bid = beat["beat_id"]
        duration_s = beat.get("duration_s", 5)
        duration_frames = seconds_to_frames(duration_s)
        clip_path = beat_clip_map.get(bid)

        if clip_path and clip_path in path_to_item:
            media_item = path_to_item[clip_path]
            clip_info = {
                "mediaPoolItem": media_item,
                "startFrame": 0,
                "endFrame": duration_frames - 1,
                "mediaType": 1,  # 1=video+audio
                "trackIndex": 1,
                "recordFrame": current_frame,
            }
            result = media_pool.AppendToTimeline([clip_info])
            tc_in = frames_to_tc(current_frame)
            tc_out = frames_to_tc(current_frame + duration_frames)
            log.info(f"  {bid}: {Path(clip_path).name} @ {tc_in}–{tc_out}")
            placement_log.append({"beat_id": bid, "clip": clip_path,
                                  "tc_in": tc_in, "tc_out": tc_out})
        else:
            log.warning(f"  {bid}: No clip — leaving gap ({duration_s}s empty)")
            placement_log.append({"beat_id": bid, "clip": None,
                                  "tc_in": frames_to_tc(current_frame),
                                  "tc_out": frames_to_tc(current_frame + duration_frames)})

        current_frame += duration_frames

    # ── Place narration audio on A1 ───────────────────────────────────────────
    current_frame = 0
    for beat in beats:
        bid = beat["beat_id"]
        duration_s = beat.get("duration_s", 5)
        duration_frames = seconds_to_frames(duration_s)

        if bid in narration_manifest:
            audio_info = narration_manifest[bid]
            audio_path = audio_info["file"]
            if audio_path in audio_path_to_item:
                narration_frames = seconds_to_frames(audio_info["duration_s"])
                clip_info = {
                    "mediaPoolItem": audio_path_to_item[audio_path],
                    "startFrame": 0,
                    "endFrame": narration_frames - 1,
                    "mediaType": 2,  # 2=audio only
                    "trackIndex": 1,
                    "recordFrame": current_frame,
                }
                media_pool.AppendToTimeline([clip_info])
                log.info(f"  {bid} audio: {Path(audio_path).name} @ {frames_to_tc(current_frame)}")

        current_frame += duration_frames

    log.info(f"\nTimeline assembled. Total duration: {frames_to_tc(current_frame)}")
    log.info(f"Placement log: {json.dumps(placement_log, indent=2)}")

    # ── Export ────────────────────────────────────────────────────────────────
    export_success = export_timeline(project, timeline, str(EXPORT_PATH.resolve()))
    if export_success:
        log.info(f"✓ Export started → {EXPORT_PATH}")
    else:
        log.error("Export failed — check Resolve Deliver page manually")

    Path("video-production/.resolve_done").touch()
    return placement_log

def export_timeline(project, timeline, output_path: str) -> bool:
    """Configure render settings and start export."""
    project.SetCurrentTimeline(timeline)

    render_settings = {
        "SelectAllFrames": True,
        "TargetDir": str(Path(output_path).parent),
        "CustomName": Path(output_path).stem,
        "UniqueFilenameStyle": 0,  # 0=no suffix
        "ExportVideo": True,
        "ExportAudio": True,
        "FormatWidth": 1920,
        "FormatHeight": 1080,
        "FrameRate": str(FPS),
        "VideoQuality": 18,  # CRF 18
        "AudioCodec": "AAC",
        "AudioBitDepth": "16",
        "AudioSampleRate": "48000",
    }

    # Use "H.264 Master" preset (available in free tier)
    project.SetRenderSettings(render_settings)
    pid = project.AddRenderJob()
    if not pid:
        return False
    project.StartRendering(pid)
    return True

# ── Timecode helpers (defined at module level for use above) ───────────────────
def seconds_to_frames(s: float) -> int:
    return int(round(s * FPS))

def frames_to_tc(frames: int) -> str:
    ff = frames % FPS
    total_s = frames // FPS
    ss = total_s % 60
    mm = (total_s // 60) % 60
    hh = total_s // 3600
    return f"{hh:02d}:{mm:02d}:{ss:02d}:{ff:02d}"

# ── Entry Point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-name", default=f"FrontRow Phase 2 Demo {datetime.now():%Y%m%d}")
    args = parser.parse_args()
    build_timeline(args.project_name)
```

---

## Free Tier Constraints

DaVinci Resolve free tier restrictions that affect this project:

| Feature | Free Tier | Workaround |
|---------|-----------|------------|
| Noise reduction | Not available | Pre-clean audio before import |
| Motion blur (Fusion) | Limited | Avoid heavy Fusion use |
| Output formats | H.264, H.265 MP4 available | Use H.264 Master preset |
| Timeline resolution | 1920×1080 max without Studio | Within limit ✓ |
| Python scripting | Fully available | ✓ |
| Export queue | Single job | Run one job at a time |

---

## Manual Steps After Script Runs

The Python script cannot do everything. After running, open Resolve and:

1. **Title cards**: Insert `Text+` generator clips for `clip_type: title_card` beats — use Titles > Text+ in the Effects Library
2. **Music track**: Add background music to A2 if desired; set audio level to -18dB under narration
3. **Color grading**: Optional — apply a slight warm LUT to screen recordings for consistency
4. **Review export**: Check Deliver page to confirm the render job queued correctly, then monitor progress

---

## Quality Checklist

- [ ] All `screen_recording` beats placed on V1 in correct order
- [ ] All `architecture` beats placed on V1 with correct duration
- [ ] Narration MP3s placed on A1, synchronized to matching video beat start timecodes
- [ ] No gaps between beats on V1 (unless intentional black)
- [ ] Export settings: 1920×1080, H.264, AAC 192kbps, 30fps
- [ ] `resolve_build.log` contains placement log for all beats
- [ ] `.resolve_done` sentinel written

## Sentinel

```bash
touch video-production/.resolve_done
```

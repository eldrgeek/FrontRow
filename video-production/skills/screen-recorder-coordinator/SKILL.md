# Screen Recorder Coordinator — FrontRow Demo Video

## Role

You are the Screen Recorder Coordinator specialist. You orchestrate screen capture around Yeshie demo playback, producing one clean raw MP4 per script beat, then trimming and scaling each to 1920×1080 for the Resolve Editor.

## Inputs Required

- `video-production/yeshie-payloads/run_sequence.json` — beat order, which tab to record, duration per beat
- `video-production/SCRIPT.md` — `duration_s` per beat (ground truth for trim length)
- Chrome window bounds (detected via AppleScript at runtime)

## Outputs

```
video-production/screen_recordings/
├── beat_01_raw.mov       ← raw capture at system resolution
├── beat_01.mp4           ← trimmed + scaled to 1920×1080 H.264
├── beat_02_raw.mov
├── beat_02.mp4
├── …
└── RECORDING_LOG.json   ← maps beat_id → file → actual_duration_s
```

---

## Prerequisites

```bash
# Verify tools
ffmpeg -version | head -1          # Must be installed
screencapture --help 2>&1 | head   # macOS built-in, always present
osascript -e 'tell application "System Events" to get name of first process' # AppleScript works
```

---

## Coordination Model

The recorder and Yeshie run in a synchronized loop using sentinel files:

```
Recorder writes   → RECORDING_READY   → Yeshie starts payload execution
Yeshie writes     → PAYLOAD_COMPLETE  → Recorder stops early (or recorder uses fixed duration)
Recorder writes   → BEAT_DONE         → Orchestrator confirms and moves to next beat
```

Sentinel directory: `video-production/screen_recordings/sentinels/`

---

## macOS Screen Capture Reference

### Get Chrome Window Bounds (AppleScript)

```bash
osascript -e '
tell application "Google Chrome"
  set b to bounds of window 1
  return (item 1 of b) & "," & (item 2 of b) & "," & (item 3 of b) & "," & (item 4 of b)
end tell'
# Returns: x1,y1,x2,y2  (e.g., "0,25,1440,900")
# Convert to x,y,width,height for screencapture -R:
# x=x1, y=y1, w=x2-x1, h=y2-y1
```

### Timed Region Capture

```bash
# Capture a 8-second window region to MOV
screencapture -V 8 -R "0,25,1440,875" video-production/screen_recordings/beat_03_raw.mov
```

**`screencapture` flags:**
- `-V <seconds>` — record video for N seconds then stop
- `-R x,y,width,height` — capture specific screen region
- `-x` — no sound (suppress shutter)
- Output format: `.mov` (H.264 QuickTime) by default

### ffmpeg: Trim + Scale to 1920×1080

```bash
ffmpeg -y \
  -i video-production/screen_recordings/beat_03_raw.mov \
  -t 8.0 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a aac -b:a 128k \
  -pix_fmt yuv420p \
  video-production/screen_recordings/beat_03.mp4
```

**Padding logic:** `scale` shrinks to fit 1920×1080 preserving aspect ratio, `pad` adds black bars to reach exact 1920×1080. This handles Retina (2x) displays where raw captures are 2880×1800.

### Retina Display Handling

On Retina Macs, `screencapture -R` uses physical pixels (2x). The raw MOV will be 2880×1800 for a 1440×900 region. The ffmpeg `scale` filter handles this correctly — no special treatment needed.

---

## Complete Orchestration Script

Save as `video-production/record_beats.py` and run it after Yeshie payloads are ready:

```python
#!/usr/bin/env python3
"""
Screen Recorder Coordinator for FrontRow Demo Video.
Usage: python record_beats.py [--beat beat_03] [--dry-run]
Requires: ffmpeg, screencapture (macOS), osascript (macOS)
"""
import os
import json
import time
import subprocess
import argparse
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path("video-production")
RECORDINGS_DIR = BASE_DIR / "screen_recordings"
SENTINELS_DIR = RECORDINGS_DIR / "sentinels"
PAYLOADS_DIR = BASE_DIR / "yeshie-payloads"
SEQUENCE_FILE = PAYLOADS_DIR / "run_sequence.json"
PRE_BUFFER_S = 0.5   # Start recording N seconds before Yeshie fires
POST_BUFFER_S = 0.5  # Extra recording time after beat duration

# ── Helpers ────────────────────────────────────────────────────────────────────
def get_chrome_bounds() -> str:
    """Returns 'x,y,w,h' string for Chrome window 1."""
    script = '''
tell application "Google Chrome"
  set b to bounds of window 1
  set x1 to item 1 of b
  set y1 to item 2 of b
  set x2 to item 3 of b
  set y2 to item 4 of b
  return x1 & "," & y1 & "," & (x2 - x1) & "," & (y2 - y1)
end tell'''
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    bounds = result.stdout.strip()
    print(f"Chrome bounds: {bounds}")
    return bounds

def write_sentinel(name: str):
    SENTINELS_DIR.mkdir(parents=True, exist_ok=True)
    (SENTINELS_DIR / name).touch()

def wait_for_sentinel(name: str, timeout_s: float = 30.0):
    path = SENTINELS_DIR / name
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if path.exists():
            path.unlink()  # consume it
            return True
        time.sleep(0.1)
    raise TimeoutError(f"Sentinel {name} not written within {timeout_s}s")

def record_beat(beat_id: str, duration_s: int, bounds: str, dry_run: bool = False) -> Path:
    """Run screencapture for duration + buffers. Returns path to raw MOV."""
    total_s = duration_s + PRE_BUFFER_S + POST_BUFFER_S
    raw_path = RECORDINGS_DIR / f"{beat_id}_raw.mov"

    cmd = ["screencapture", "-V", str(int(total_s)), "-R", bounds, "-x", str(raw_path)]
    print(f"  Recording {total_s:.1f}s → {raw_path.name}")

    if dry_run:
        print(f"  DRY RUN: would run: {' '.join(cmd)}")
        return raw_path

    proc = subprocess.Popen(cmd)
    # Signal Yeshie after PRE_BUFFER_S
    time.sleep(PRE_BUFFER_S)
    write_sentinel(f"RECORDING_READY_{beat_id}")
    proc.wait()
    return raw_path

def trim_and_scale(beat_id: str, raw_path: Path, duration_s: int) -> Path:
    """Trim raw MOV to exact duration and scale to 1920×1080."""
    out_path = RECORDINGS_DIR / f"{beat_id}.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-i", str(raw_path),
        "-ss", str(PRE_BUFFER_S),       # Skip pre-buffer
        "-t", str(duration_s),           # Exact beat duration
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
               "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        str(out_path)
    ]
    print(f"  Encoding → {out_path.name}")
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path

def get_actual_duration(mp4_path: Path) -> float:
    """Probe MP4 duration with ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(mp4_path)],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--beat", help="Record only this beat (e.g. beat_03)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    sequence = json.loads(SEQUENCE_FILE.read_text())
    beats = [b for b in sequence["sequence"] if b.get("record", False)]

    if args.beat:
        beats = [b for b in beats if b["beat_id"] == args.beat]
        if not beats:
            raise ValueError(f"Beat {args.beat} not found in sequence or not recordable")

    bounds = get_chrome_bounds()
    log = {}

    for beat in beats:
        beat_id = beat["beat_id"]
        duration_s = beat["duration_s"]
        print(f"\n── {beat_id} ({duration_s}s) ──")

        raw_path = record_beat(beat_id, duration_s, bounds, dry_run=args.dry_run)

        if not args.dry_run:
            out_path = trim_and_scale(beat_id, raw_path, duration_s)
            actual_dur = get_actual_duration(out_path)
            log[beat_id] = {
                "raw_file": str(raw_path),
                "file": str(out_path),
                "actual_duration_s": actual_dur,
                "target_duration_s": duration_s,
            }
            write_sentinel(f"BEAT_DONE_{beat_id}")
            print(f"  ✓ Done — actual: {actual_dur:.2f}s, target: {duration_s}s")

    if not args.dry_run:
        log_path = RECORDINGS_DIR / "RECORDING_LOG.json"
        log_path.write_text(json.dumps(log, indent=2))
        print(f"\n✓ RECORDING_LOG.json written ({len(log)} beats)")
        Path("video-production/.recordings_done").touch()
        print("✓ .recordings_done sentinel written")

if __name__ == "__main__":
    main()
```

---

## RECORDING_LOG.json Format

The Resolve Editor reads this alongside MANIFEST.json:

```json
{
  "beat_01": {
    "raw_file": "video-production/screen_recordings/beat_01_raw.mov",
    "file": "video-production/screen_recordings/beat_01.mp4",
    "actual_duration_s": 8.03,
    "target_duration_s": 8
  },
  "beat_03": {
    "raw_file": "video-production/screen_recordings/beat_03_raw.mov",
    "file": "video-production/screen_recordings/beat_03.mp4",
    "actual_duration_s": 5.01,
    "target_duration_s": 5
  }
}
```

---

## Timing Buffer Guidance

| Situation | Recommendation |
|-----------|---------------|
| Simple click, no animation | PRE=0.5s, POST=0.5s |
| Animated entrance (3.5s) | PRE=0.5s, POST=1.0s (capture animation tail) |
| Curtain animation (1.2s) | PRE=0.5s, POST=0.5s |
| Multi-tab sequence | Increase POST to 2.0s |

Always add at least 0.5s before Yeshie fires to ensure recording is active. Always add at least 0.5s after the beat's expected end.

---

## Troubleshooting

**Black frames at start**: Increase `PRE_BUFFER_S` to 1.0s.

**Animation cut off at end**: Increase `POST_BUFFER_S` to 1.5s and re-record.

**Wrong resolution in output**: Raw capture is Retina (2x) but ffmpeg scaled correctly — check that `-vf scale=1920:1080:force_original_aspect_ratio=decrease` is present.

**screencapture exits early**: macOS may exit if the recording region is off-screen. Re-run `get_chrome_bounds()` and verify Chrome is on the primary display.

**Yeshie sentinel never received**: Yeshie Driver may have failed. Check `video-production/yeshie-payloads/` for PAYLOAD_COMPLETE sentinel files manually.

---

## Quality Checklist

- [ ] All `screen_recording` beats from SCRIPT.md have corresponding `.mp4` files
- [ ] All output files are exactly 1920×1080 (verify with `ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height`)
- [ ] All output files are H.264 MP4 with AAC audio track
- [ ] `RECORDING_LOG.json` exists and maps every recorded beat
- [ ] No black-frame segments longer than 0.5s at start of any clip
- [ ] `.recordings_done` sentinel written

## Sentinel

```bash
touch video-production/.recordings_done
```

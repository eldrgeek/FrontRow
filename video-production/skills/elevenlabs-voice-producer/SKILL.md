# ElevenLabs Voice Producer — FrontRow Demo Video

## Role

You are the ElevenLabs Voice Producer specialist. You read every narration line from `video-production/SCRIPT.md`, call the ElevenLabs TTS API for each one, produce named MP3 files, trim silence, verify durations, and write a MANIFEST.json mapping beat IDs to files and durations.

## Inputs Required

- `video-production/SCRIPT.md` — extract the `narration:` field from every beat
- `ELEVENLABS_API_KEY` environment variable (must be set before running)
- Voice ID preference (default: George `Yko7PKHZNXotIFUBG7I9` — warm theatrical narrator)

## Outputs

```
video-production/narration/
├── beat_01_narration.mp3
├── beat_02_narration.mp3
├── …
├── beat_NN_narration.mp3
└── MANIFEST.json
```

---

## API Reference

### Endpoint

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

### Request Headers

```
xi-api-key: <ELEVENLABS_API_KEY>
Content-Type: application/json
Accept: audio/mpeg
```

### Request Body

```json
{
  "text": "<narration line>",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.45,
    "similarity_boost": 0.75,
    "style": 0.20,
    "use_speaker_boost": true
  }
}
```

### Voice IDs

| Voice | ID | Character |
|-------|----|-----------|
| George (default) | `Yko7PKHZNXotIFUBG7I9` | Warm, theatrical, authoritative narrator |
| Bella (alternate) | `EXAVITQu4vr4xnSDxMaL` | Warm, slightly higher register |
| Rachel (alternate) | `21m00Tcm4TlvDq8ikWAM` | Clear, neutral |

**Use George by default** for FrontRow's theatrical tone. Switch to Bella or Rachel only if the user requests a female voice.

### Voice Settings Guide

| Setting | Value | Effect |
|---------|-------|--------|
| `stability` | 0.45 | Natural variation — not robotic, not inconsistent |
| `similarity_boost` | 0.75 | Strong voice character adherence |
| `style` | 0.20 | Light expressiveness — theatrical but not over the top |
| `use_speaker_boost` | true | Enhanced clarity for screen narration |

Do NOT use `speed` parameter — it's not in v1 API; use `eleven_turbo_v2_5` for faster generation if needed.

### Rate Limits

- 3 requests/second on Creator plan
- Sleep 0.35s between API calls
- On 429 (rate limit): exponential backoff starting at 2s, max 3 retries

---

## Complete Working Script

Save as `video-production/generate_narration.py` and run it:

```python
#!/usr/bin/env python3
"""
ElevenLabs Voice Producer for FrontRow Demo Video.
Usage: python generate_narration.py [--voice-id VOICE_ID] [--dry-run]
"""
import os
import re
import json
import time
import argparse
import requests
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────
DEFAULT_VOICE_ID = "Yko7PKHZNXotIFUBG7I9"  # George
MODEL_ID = "eleven_multilingual_v2"
VOICE_SETTINGS = {
    "stability": 0.45,
    "similarity_boost": 0.75,
    "style": 0.20,
    "use_speaker_boost": True,
}
OUTPUT_DIR = Path("video-production/narration")
SCRIPT_PATH = Path("video-production/SCRIPT.md")
REQUEST_INTERVAL_S = 0.35
MAX_RETRIES = 3

# ── Parsing ────────────────────────────────────────────────────────────────────
def parse_script(path: Path) -> list[dict]:
    """Extract beats with narration lines from SCRIPT.md."""
    beats = []
    current_beat = {}
    for line in path.read_text().splitlines():
        # Detect beat header: ## Beat NN — Name
        m = re.match(r'^##\s+Beat\s+(\d+)\s+[—-]\s+(.+)', line)
        if m:
            if current_beat:
                beats.append(current_beat)
            current_beat = {
                "beat_num": int(m.group(1)),
                "beat_id": f"beat_{int(m.group(1)):02d}",
                "name": m.group(2).strip(),
            }
        # Detect narration field
        n = re.match(r'^-\s+narration:\s+"?(.+?)"?\s*$', line)
        if n and current_beat:
            text = n.group(1).strip().strip('"')
            current_beat["narration"] = text
        # Detect duration
        d = re.match(r'^-\s+duration_s:\s+(\d+)', line)
        if d and current_beat:
            current_beat["duration_s"] = int(d.group(1))
    if current_beat:
        beats.append(current_beat)

    # Filter: skip beats with narration "none" or missing
    return [b for b in beats if b.get("narration") and b["narration"].lower() != "none"]

# ── TTS API ────────────────────────────────────────────────────────────────────
def generate_tts(text: str, voice_id: str, api_key: str) -> bytes:
    """Call ElevenLabs API with retry logic. Returns raw MP3 bytes."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    payload = {"text": text, "model_id": MODEL_ID, "voice_settings": VOICE_SETTINGS}

    for attempt in range(MAX_RETRIES):
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        if resp.status_code == 200:
            return resp.content
        elif resp.status_code == 429:
            wait = 2 ** attempt
            print(f"  Rate limited. Waiting {wait}s...")
            time.sleep(wait)
        else:
            raise RuntimeError(f"ElevenLabs API error {resp.status_code}: {resp.text[:200]}")
    raise RuntimeError("Max retries exceeded")

# ── Audio Processing ───────────────────────────────────────────────────────────
def trim_silence(mp3_path: Path) -> float:
    """Trim leading/trailing silence from MP3. Returns actual duration in seconds."""
    try:
        from pydub import AudioSegment
        from pydub.silence import detect_silence

        audio = AudioSegment.from_mp3(str(mp3_path))
        silence_chunks = detect_silence(audio, min_silence_len=200, silence_thresh=-45)

        # Trim leading silence
        start_trim = silence_chunks[0][1] - 50 if silence_chunks and silence_chunks[0][0] == 0 else 0
        # Trim trailing silence
        end_trim = silence_chunks[-1][0] + 50 if silence_chunks and silence_chunks[-1][1] == len(audio) else len(audio)

        trimmed = audio[start_trim:end_trim]
        trimmed.export(str(mp3_path), format="mp3", bitrate="192k")
        return len(trimmed) / 1000.0  # ms → s

    except ImportError:
        print("  pydub not installed — skipping silence trim. pip install pydub --break-system-packages")
        # Estimate duration from file size: ~192kbps MP3 ≈ 24000 bytes/s
        return mp3_path.stat().st_size / 24000.0

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice-id", default=DEFAULT_VOICE_ID)
    parser.add_argument("--dry-run", action="store_true", help="Parse script but don't call API")
    args = parser.parse_args()

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key and not args.dry_run:
        raise EnvironmentError("ELEVENLABS_API_KEY environment variable not set")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    beats = parse_script(SCRIPT_PATH)
    print(f"Found {len(beats)} narration beats")

    manifest = {}

    for beat in beats:
        beat_id = beat["beat_id"]
        narration = beat["narration"]
        out_path = OUTPUT_DIR / f"{beat_id}_narration.mp3"

        print(f"\n[{beat_id}] {narration[:60]}{'…' if len(narration) > 60 else ''}")

        if args.dry_run:
            print("  DRY RUN — skipping API call")
            manifest[beat_id] = {"file": str(out_path), "duration_s": beat.get("duration_s", 0), "dry_run": True}
            continue

        # Skip if already generated
        if out_path.exists():
            print("  Already exists — checking duration...")
            duration = trim_silence(out_path)
            manifest[beat_id] = {"file": str(out_path), "duration_s": duration}
            print(f"  Duration: {duration:.2f}s")
            continue

        # Generate
        print("  Calling ElevenLabs API...")
        mp3_bytes = generate_tts(narration, args.voice_id, api_key)
        out_path.write_bytes(mp3_bytes)
        print(f"  Written {len(mp3_bytes):,} bytes → {out_path.name}")

        # Trim silence and measure duration
        duration = trim_silence(out_path)
        print(f"  Duration after trim: {duration:.2f}s (beat target: {beat.get('duration_s', '?')}s)")

        # Warn if narration runs long
        target = beat.get("duration_s", 0)
        if target and duration > target + 1.0:
            print(f"  ⚠️  NARRATION TOO LONG: {duration:.1f}s > {target}s target. Consider shortening.")

        manifest[beat_id] = {"file": str(out_path), "duration_s": duration, "narration": narration}
        time.sleep(REQUEST_INTERVAL_S)

    # Write manifest
    manifest_path = OUTPUT_DIR / "MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\n✓ MANIFEST.json written with {len(manifest)} entries")

    # Write sentinel
    Path("video-production/.narration_done").touch()
    print("✓ .narration_done sentinel written")

if __name__ == "__main__":
    main()
```

---

## MANIFEST.json Format

The Resolve Editor reads this file to place audio clips. Example:

```json
{
  "beat_01": {
    "file": "video-production/narration/beat_01_narration.mp3",
    "duration_s": 7.4,
    "narration": "FrontRow transforms any space into a live theater — with real seats, real reactions, real presence."
  },
  "beat_02": {
    "file": "video-production/narration/beat_02_narration.mp3",
    "duration_s": 5.2,
    "narration": "The House Manager opens the dashboard — one person controls the entire show."
  }
}
```

---

## Duration Mismatch Handling

When narration audio is longer than the beat's `duration_s`:

1. **Minor overage (<1s)**: note in manifest as `"overrun_s": 0.8` — Resolve Editor will slightly speed up the video clip
2. **Major overage (>1s)**: flag with `"needs_edit": true` — human editor must shorten the narration line and regenerate
3. **Silent beats** (`narration: "none"`): skip entirely; Resolve Editor handles silence automatically

---

## Quality Checklist

- [ ] All beats with narration text have a corresponding MP3 file
- [ ] No MP3 file has more than 200ms of leading silence
- [ ] No MP3 file has more than 300ms of trailing silence
- [ ] All durations logged in MANIFEST.json
- [ ] Beats with `narration: "none"` are absent from MANIFEST.json (intentional)
- [ ] Rate limit: no more than 3 requests/second
- [ ] MANIFEST.json is valid JSON
- [ ] `.narration_done` sentinel written

## Sentinel

```bash
touch video-production/.narration_done
```

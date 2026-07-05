#!/usr/bin/env python3
"""Generate narration audio files for FrontRow demo video using OpenAI TTS API."""

import json
import os
import subprocess
import time
import urllib.request

API_KEY = "REDACTED_OPENAI_KEY_ROTATE_ME"
API_URL = "https://api.openai.com/v1/audio/speech"
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

BEATS = {
    "beat_01": "Every great performance begins with an empty stage and an audience ready to believe.",
    "beat_02": "The house manager arrives first, setting the stage before a single seat is filled. Seat count, arrangement, show title, all locked in before doors open.",
    "beat_03": "With one click, the curtains part and the theater breathes.",
    "beat_04": "Audience members join from anywhere, each taking a seat, camera on, ready to be present.",
    "beat_05": "Backstage, the performer prepares. The green room shows their camera feed and a live audio meter, private, invisible to the audience.",
    "beat_06": "Under the hood, LiveKit handles the media, video and audio over WebRTC. Socket.io carries the control signals. And your browser does the heavy lifting, including real-time background removal.",
    "beat_07": "Background removal runs entirely in the browser. No green screen, no server processing. MediaPipe, WebAssembly, thirty frames per second.",
    "beat_08": "Go Live. The performer glides forward, composited directly onto the stage. No flat screen. They are there.",
    "beat_09": "The spotlight follows. Wherever they move, the light is there.",
    "beat_10": "The audience reacts in real time. Applause, love, bravos. The applause meter glows hotter as the room comes alive.",
    "beat_11": "Reaction data flows peer to peer through LiveKit's data channel. No server fan-out, no bottleneck, even with a full house.",
    "beat_12": "When the show is done, the performer takes their exit. A proper walk offstage, not a hard cut.",
    "beat_13": "The house manager brings down the curtain. The show is over, until the next one.",
    "beat_14": "FrontRow is live. Take a seat at frontrowtheater.netlify.app, or step onto the stage.",
}


def generate_audio(beat_id: str, text: str) -> bool:
    """Generate a single audio file. Returns True on success."""
    payload = json.dumps({
        "model": "tts-1-hd",
        "input": text,
        "voice": "nova",
        "response_format": "wav",
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    output_path = os.path.join(OUTPUT_DIR, f"{beat_id}.wav")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status != 200:
                write_blocker(f"API returned status {resp.status} for {beat_id}: {resp.read().decode()}")
                return False
            with open(output_path, "wb") as f:
                f.write(resp.read())
        print(f"  OK: {beat_id}.wav")
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        write_blocker(f"HTTP {e.code} for {beat_id}: {body}")
        return False
    except Exception as e:
        write_blocker(f"Exception for {beat_id}: {e}")
        return False


def write_blocker(msg: str):
    path = os.path.join(OUTPUT_DIR, "VOICE_BLOCKER.md")
    with open(path, "w") as f:
        f.write(f"# TTS Generation Blocked\n\n{msg}\n")
    print(f"BLOCKED: {msg}")


def get_duration(filepath: str) -> float:
    """Get WAV duration using ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", filepath],
        capture_output=True, text=True,
    )
    return round(float(result.stdout.strip()), 2)


def main():
    print(f"Generating {len(BEATS)} narration files...\n")

    for i, (beat_id, text) in enumerate(BEATS.items()):
        print(f"[{i+1}/{len(BEATS)}] {beat_id}")
        if not generate_audio(beat_id, text):
            return  # blocker written, stop
        if i < len(BEATS) - 1:
            time.sleep(0.5)

    print("\nAll files generated. Building manifest...")

    manifest = {}
    for beat_id in BEATS:
        wav_path = os.path.join(OUTPUT_DIR, f"{beat_id}.wav")
        duration = get_duration(wav_path)
        manifest[beat_id] = {"file": f"{beat_id}.wav", "duration_s": duration}
        print(f"  {beat_id}: {duration}s")

    manifest_path = os.path.join(OUTPUT_DIR, "MANIFEST.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest written to {manifest_path}")


if __name__ == "__main__":
    main()

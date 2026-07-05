# Specialist Ledger — FrontRow Demo v0

Maps each output artifact to the specialist role that produced it, with notes on execution.

## Script Writer

| File | Notes |
|------|-------|
| `output/script-final.md` | 14 beats, 145s total. Produced directly by orchestrator. Smooth — straightforward adaptation of FRONTROW-VIDEO-PLAN.md beat structure. |

## ElevenLabs Voice Producer (fallback: macOS TTS)

| File | Duration | Notes |
|------|----------|-------|
| `output/audio/beat_01.wav` | 4.23s | macOS `say -v Samantha -r 160` |
| `output/audio/beat_02.wav` | 9.10s | |
| `output/audio/beat_03.wav` | 3.16s | |
| `output/audio/beat_04.wav` | 5.47s | |
| `output/audio/beat_05.wav` | 8.00s | |
| `output/audio/beat_06.wav` | 11.90s | Longest narration — architecture explanation |
| `output/audio/beat_07.wav` | 9.15s | |
| `output/audio/beat_08.wav` | 6.68s | |
| `output/audio/beat_09.wav` | 3.52s | Shortest meaningful narration |
| `output/audio/beat_10.wav` | 7.13s | |
| `output/audio/beat_11.wav` | 7.26s | |
| `output/audio/beat_12.wav` | 5.93s | |
| `output/audio/beat_13.wav` | 4.66s | |
| `output/audio/beat_14.wav` | 5.20s | |
| `output/audio/MANIFEST.json` | — | Duration manifest for all 14 beats |

**What went smoothly**: Fast generation (~54s total), all 14 beats produced without errors.
**Workaround**: ElevenLabs API key missing — used macOS TTS. Voice quality is v0-grade.

## Architecture Animator

| File | Duration | Notes |
|------|----------|-------|
| `output/clips/beat_06.mp4` | 15s | LiveKit topology — 6 nodes + 6 edges, progressive reveal |
| `output/clips/beat_11.mp4` | 10s | Reaction data channel — fan-out with animated dots |

**What went smoothly**: matplotlib + networkx + ffmpeg pipeline worked first try. Both clips verified at 1920x1080 H.264 with silent AAC.
**Workaround**: None needed.

## Screen Recorder Coordinator (via Playwright)

| File | Duration | URL | Notes |
|------|----------|-----|-------|
| `output/clips/beat_01.mp4` | 8s | `/?mode=watch` | 0.9 MB, networkidle timeout but rendered |
| `output/clips/beat_02.mp4` | 14s | `/housemanager` | 0.2 MB, loaded cleanly |
| `output/clips/beat_03.mp4` | 6s | `/?mode=watch` | 1.1 MB |
| `output/clips/beat_04.mp4` | 10s | `/?mode=watch` | 1.1 MB |
| `output/clips/beat_05.mp4` | 12s | `/backstage` | 0.2 MB, loaded cleanly |
| `output/clips/beat_07.mp4` | 10s | `/backstage` | 0.2 MB |
| `output/clips/beat_08.mp4` | 12s | `/?mode=watch` | 1.3 MB |
| `output/clips/beat_09.mp4` | 8s | `/?mode=watch` | 1.1 MB |
| `output/clips/beat_10.mp4` | 14s | `/?mode=watch` | 1.3 MB |
| `output/clips/beat_12.mp4` | 8s | `/?mode=watch` | 1.1 MB |
| `output/clips/beat_13.mp4` | 8s | `/?mode=watch` | 1.2 MB |
| `output/clips/beat_14.mp4` | 10s | `/` | 0.2 MB, landing page loaded cleanly |

**What went smoothly**: Playwright headless capture worked for all 12 pages. No crashes or missing clips.
**Workaround**: No interactive UI actions (clicks, form fills). Beats that require curtain opens, go-live, reactions show resting state only. The `?mode=watch` pages triggered networkidle timeout due to persistent WebSocket connections but still rendered.

## Resolve Editor (replaced with ffmpeg)

| File | Notes |
|------|-------|
| `output/frontrow-demo-v0.mp4` | 145s, 5.1 MB, 1920x1080 H.264 30fps |

**What went smoothly**: ffmpeg mix + concat worked for all 14 beats without errors. Narration mixed with 500ms start delay.
**Workaround**: DaVinci Resolve skipped per instructions (GUI-only). ffmpeg used for both per-beat audio mixing and final concatenation.

## Yeshie Demo Driver

**Not used** — Playwright was used directly for screen capture instead of the Yeshie automation + screencapture pipeline. This means no interactive UI actions were performed during recording.

## Pipeline Timing

| Phase | Duration | Agent |
|-------|----------|-------|
| Script writing | ~2 min | Orchestrator (direct) |
| Narration (14 WAVs) | ~54s | Background agent |
| Architecture clips (2) | ~2 min | Background agent |
| Screen recordings (12) | ~8 min | Background agent |
| Assembly (ffmpeg) | ~30s | Orchestrator (direct) |
| **Total wall clock** | **~12 min** | |

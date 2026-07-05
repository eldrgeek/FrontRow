# Specialist Ledger — FrontRow Demo v1

## DIFF FROM V0

| Area | v0 | v1 | Status |
|------|----|----|--------|
| **Voice** | macOS `say` (Samantha) — robotic | OpenAI `tts-1-hd` voice `nova` — warm, natural | **Fixed** |
| **Source** | frontrowtheater.netlify.app (no Phase 2) | localhost:5176 (Phase 2 commit 4218119) | **Fixed** |
| **Interactions** | Static page loads only | Playwright clicks/fills on HM + backstage beats | **Improved** |
| **3D venue** | Netlify deploy rendered 3D via WebGL | Headless Chromium lacks GPU — 3D beats are dark/blank | **Regression** |
| **Architecture** | matplotlib animations | Reused from v0 (Mike: "OK as-is") | **Same** |
| **Assembly** | ffmpeg concat | Same approach | **Same** |

## OPEN TO MIKE

1. **ElevenLabs key**: Still not found anywhere. OpenAI TTS `nova` is much better than `say` but not ElevenLabs quality. If you have the key, add it to `~/Projects/CIE/secrets.yaml` as `ELEVENLABS_API_KEY` and we'll swap in v2.
2. **Headless WebGL**: The 3D venue beats (01, 03, 04, 08-10, 12-13) render as dark/minimal canvas in headless Chromium because there's no GPU. Options:
   - Use headed Playwright (requires a display — `DISPLAY=:0` or Xvfb)
   - Use `screencapture` on a real Chrome window (Yeshie pipeline)
   - Use chrome-devtools MCP to drive a real browser and capture
3. **Background music**: No track on disk. If you have one, drop it in and we'll mix.
4. **Reaction buttons / BG removal toggle**: Not found in the DOM during Playwright recording. Either the selectors changed since SPECIALIST-AGENTS.md was written, or they require WebSocket/backend state to appear. Need a running backend + LiveKit to fully demo these.
5. **Video duration**: 2:25 vs plan's 2:55. Narration fills ~89s of 145s video. Could add transitions or extend beat durations.

## Script Writer

| File | Notes |
|------|-------|
| `output/script-final.md` | Reused from v0 — same 14-beat structure |

## ElevenLabs Voice Producer → OpenAI TTS

| File | Duration | Notes |
|------|----------|-------|
| `v1/audio/beat_01.wav` | 5.08s | OpenAI tts-1-hd, voice nova |
| `v1/audio/beat_02.wav` | 8.89s | |
| `v1/audio/beat_03.wav` | 3.26s | |
| `v1/audio/beat_04.wav` | 5.16s | |
| `v1/audio/beat_05.wav` | 8.03s | |
| `v1/audio/beat_06.wav` | 11.55s | Longest — architecture narration |
| `v1/audio/beat_07.wav` | 7.94s | |
| `v1/audio/beat_08.wav` | 6.42s | |
| `v1/audio/beat_09.wav` | 3.48s | |
| `v1/audio/beat_10.wav` | 6.94s | |
| `v1/audio/beat_11.wav` | 7.50s | |
| `v1/audio/beat_12.wav` | 5.29s | |
| `v1/audio/beat_13.wav` | 4.60s | |
| `v1/audio/beat_14.wav` | 5.25s | |
| `v1/audio/MANIFEST.json` | — | |

**Smooth**: API worked first try, all 14 files generated in ~2 min.
**Workaround**: ElevenLabs unavailable → OpenAI TTS used instead.

## Architecture Animator

| File | Notes |
|------|-------|
| `v1/clips/beat_06.mp4` | Copied from v0 — LiveKit topology, 15s |
| `v1/clips/beat_11.mp4` | Copied from v0 — Reaction data channel, 10s |

**Smooth**: No work needed — Mike approved v0 versions.

## Screen Recorder Coordinator (Playwright on localhost:5176)

| File | Size | Interactive | Notes |
|------|------|-------------|-------|
| `v1/clips/beat_01.mp4` | 36K | Static | 3D venue — dark canvas (no GPU) |
| `v1/clips/beat_02.mp4` | 524K | **Yes** | HM dashboard — typed title, clicked curtain button |
| `v1/clips/beat_03.mp4` | 38K | Static | Audience view — dark canvas |
| `v1/clips/beat_04.mp4` | 42K | Static | Audience seats — dark canvas |
| `v1/clips/beat_05.mp4` | 616K | **Yes** | Backstage — clicked Go Live, typed in input |
| `v1/clips/beat_07.mp4` | 300K | Static | No BG removal toggle found |
| `v1/clips/beat_08.mp4` | 58K | Static | Stage entrance — dark canvas |
| `v1/clips/beat_09.mp4` | 48K | Static | Spotlight — dark canvas |
| `v1/clips/beat_10.mp4` | 61K | Static | No reaction buttons found |
| `v1/clips/beat_12.mp4` | 36K | Static | Walk offstage — dark canvas |
| `v1/clips/beat_13.mp4` | 36K | Static | Curtains close — dark canvas |
| `v1/clips/beat_14.mp4` | 295K | Static | Landing page — rendered cleanly |

**Smooth**: Playwright connected to local dev server instantly (no 30s timeouts). Beats 02 and 05 had successful interactive clicks.
**Workaround**: Headless Chromium has no WebGL GPU — all `?mode=watch` beats render dark. Need headed browser or screen capture for 3D content.

## Resolve Editor → ffmpeg

| File | Notes |
|------|-------|
| `v1/frontrow-demo-v1.mp4` | 145s, 3.1 MB, 1920x1080 H.264 30fps, AAC stereo |

**Smooth**: All 14 beats mixed and concatenated without errors.

## Pipeline Timing

| Phase | Duration |
|-------|----------|
| Voice (OpenAI TTS, 14 files) | ~2 min |
| Screen recordings (Playwright, 12 beats) | ~5 min |
| Architecture (copy from v0) | instant |
| Assembly (ffmpeg) | ~30s |
| **Total wall clock** | **~8 min** |

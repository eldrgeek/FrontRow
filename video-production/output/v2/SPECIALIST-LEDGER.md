# Specialist Ledger — FrontRow Demo v2

## DIFF FROM V1

| Area | v1 | v2 | Status |
|------|----|----|--------|
| **Show flow** | Static page loads, no interactions between participants | Full 4-participant orchestrated show with real socket events | **Fixed** |
| **Audience perspective** | Dark/blank 3D canvas (headless WebGL) | Headed Playwright with ANGLE GPU — 3D stage renders live | **Fixed** |
| **Performer entrance** | Not captured (static audience view) | Performer goes live from backstage, enters stage, visible in audience view | **Fixed** |
| **Curtain animation** | Not captured (button was disabled due to inverted logic) | Curtain open/close driven by HM clicks, captured from audience perspective | **Fixed** |
| **Reactions** | Not captured (buttons not visible without seat selection) | Reactions fired via test API, reaction bar glow captured | **Fixed** |
| **Narration sync** | Generic script, silent gaps between beats | Script rewritten to match exact orchestrator timeline, no gaps | **Fixed** |
| **Voice** | OpenAI tts-1-hd nova | Same (quality good enough) | **Same** |
| **Architecture diagram** | matplotlib animation | Dropped — not needed for audience-perspective video | **Removed** |
| **Silent gaps** | ~50% of video was black/silent | Zero gaps — every beat has narration + visual | **Fixed** |

## Bug Fixes Made During v2

1. **ReactionBar.tsx**: `data-testid` on R3F `<mesh>` crashes Three.js → changed to `name=`
2. **PerformerMesh.tsx**: Same `data-testid` crash → changed to `name=`
3. **HouseManagerPanel.tsx**: Curtain open/close buttons had inverted `disabled` logic → swapped
4. **server/index.js**: `activeShow` reset in test endpoint and show-reset handler missing `reactions`, `venueConfig`, `performerOnStage` etc → added all fields

## Orchestrator

| File | Purpose |
|------|---------|
| `scripts/run-demo-show.js` | Playwright orchestrator — boots servers, runs 4 browser windows, drives full show timeline |

**Modes**: `--live` (watch only) | `--record` (capture all 4 perspectives to video)

**Timeline**:
- T=0: HM arrives, configures venue (12 seats, semicircle, locks config)
- T=10: Audiences arrive, assigned seats via test API
- T=20: Performer enters backstage, types name, starts camera, goes live
- T=30: HM opens curtains
- T=35: Performer enters stage (via broadcast-message test API)
- T=40: Audience 1 fires applause reaction
- T=45: Audience 2 fires cheer reaction
- T=50: Spotlight activates
- T=55: HM closes curtains
- T=60: Show ends

## Voice Producer (OpenAI TTS)

| File | Duration | Notes |
|------|----------|-------|
| `v2/audio/beat_01.mp3` | 7.34s | OpenAI tts-1-hd, voice nova |
| `v2/audio/beat_02.mp3` | 7.85s | |
| `v2/audio/beat_03.mp3` | 7.15s | |
| `v2/audio/beat_04.mp3` | 5.40s | |
| `v2/audio/beat_05.mp3` | 4.01s | |
| `v2/audio/beat_06.mp3` | 6.46s | |
| `v2/audio/beat_07.mp3` | 4.90s | |
| `v2/audio/beat_08.mp3` | 4.22s | |
| `v2/audio/beat_09.mp3` | 2.35s | |
| `v2/audio/beat_10.mp3` | 3.77s | CTA |

## Screen Recordings (Playwright, headed, ANGLE GPU)

| File | Duration | Interactive | Notes |
|------|----------|-------------|-------|
| `raw/audience-perspective.mp4` | 54.6s | **Full show** | Primary source — 3D stage renders correctly |
| `raw/audience-2.mp4` | 61.3s | Seated | Second audience POV |
| `raw/house-manager.mp4` | 68.4s | **Full HM flow** | Config + curtain controls |
| `raw/performer.mp4` | 107.9s | **Full performer flow** | Backstage → stage transition |

## Assembly (ffmpeg)

| File | Notes |
|------|-------|
| `frontrow-demo-v2.mp4` | 58.6s, 1.6 MB, 1920x1080 H.264 30fps, AAC stereo |

10 beats, zero silent gaps. Each beat: clip cut from raw recording, narration mixed with 300ms delay.

## Pipeline Timing

| Phase | Duration |
|-------|----------|
| Orchestrator run (--record) | ~2 min |
| Voice (OpenAI TTS, 10 files) | ~30s |
| Assembly (ffmpeg cut + mix + concat) | ~15s |
| **Total wall clock** | **~3 min** |

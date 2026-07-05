# FrontRow Demo v1 — Production Notes

## Voice Fix (Mike: "Horrible voice synthesis")
- Switched from macOS `say` to **OpenAI TTS `tts-1-hd`** with voice `nova`
- Much warmer and more natural than macOS TTS
- ElevenLabs key still not available — add to secrets.yaml for v2 if desired

## Source Fix (Mike: "Images are from yesterday")
- Switched from frontrowtheater.netlify.app to **local dev server** (localhost:5176)
- Running Phase 2 code from commit 4218119
- Vite dev server booted successfully (ports 5173-5175 were occupied, landed on 5176)

## Interaction Fix (Mike: "Narration describes new features but does not show them")
- Added Playwright interactive actions for beats 02 (HM: typed title, clicked curtain button) and 05 (backstage: clicked Go Live)
- Other interactive beats (reactions, BG removal) couldn't find their DOM elements — likely need backend/LiveKit running

## Remaining Issue: Headless WebGL
- 3D venue beats (01, 03, 04, 08-10, 12-13) render as dark/blank canvas
- Headless Chromium lacks GPU acceleration for Three.js/WebGL
- This is WORSE than v0 (which used the deployed site and got real renders)
- Fix options: headed Playwright, screencapture, or chrome-devtools MCP on real Chrome

## Architecture Clips (Mike: "Diagrams are OK for a start")
- Reused v0 clips unchanged (beat_06.mp4, beat_11.mp4)

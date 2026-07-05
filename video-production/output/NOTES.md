# FrontRow Demo v0 — Production Notes

## ElevenLabs Fallback
- **ElevenLabs API key not found** in `~/Projects/CIE/secrets.yaml` (file contains HF, Anthropic, OpenAI, Gemini, Groq keys but no ElevenLabs)
- **Fallback used**: macOS `say` command with voice "Samantha" at rate 160 wpm
- Audio quality is robotic TTS — replace with ElevenLabs "Bella" voice for v1
- Generated as AIFF then converted to WAV via ffmpeg

## Screen Recording Method
- Used **Playwright** (v1.59.1) headless Chromium with built-in video recording
- Viewport: 1920x1080, output scaled/padded to exact 1920x1080
- The `?mode=watch` pages hit 30s `networkidle` timeout (WebSocket/WebRTC connections keep network active) but pages rendered fine
- No interactive UI actions performed (no clicks, no form fills) — just page loads and static captures
- This means beats that require click interactions (curtain open, go live, reactions) show the resting state only

## Architecture Animation Clips
- Generated via matplotlib + networkx + ffmpeg
- beat_06: LiveKit topology node graph, 15s
- beat_11: Reaction data channel fan-out, 10s
- Both include silent AAC audio track for concat compatibility

## Assembly
- ffmpeg concat demuxer used for final assembly
- Narration audio mixed with 500ms delay start per beat
- No background music (none available on disk)
- Output: H.264, AAC, 1920x1080, 30fps, ~5.1 MB

## Known Issues for v1
1. TTS voice is robotic — needs ElevenLabs
2. Screen recordings are static page loads, not interactive demos
3. No actual curtain animations, go-live entrance, or reaction clicks captured
4. No background music
5. Some pages (backstage, housemanager) may show auth/permission dialogs
6. Total duration is 2:25 — plan called for ~2:55 with transitions

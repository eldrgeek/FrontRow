# FrontRow Demo Review — v1

> Reviewed: 2026-05-01
> Video: /Users/mikewolf/Projects/frontrow/video-production/output/v1/frontrow-demo-v1.mp4
> Reviewers: Gemini 2.5 Pro, Claude Sonnet 4.6, OpenAI Whisper

## Executive Summary

FrontRow v1 is a partially functional demo that successfully delivers narration and UI screenshots for the House Manager and Backstage beats, but fails critically on nearly every 3D venue beat due to headless Chromium's lack of GPU rendering, producing black or white frames where the product's most visually impressive feature should be. The architecture animation beats are technically sound but the overall video is under-length (~2:25 vs 2:55 target) and missing several planned interactions. Audio quality is the clear highlight; visuals are the critical liability.

## Critical Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
| 1 | 0:00-0:08 | screen-recorder-coordinator | Beat 01 Cold Open renders as a solid white frame — the 3D venue never appears | Frame at 0:00 is pure white throughout what should be an 8-second wide shot of the velvet-curtain 3D stage. Headless Chromium cannot render WebGL without a GPU. (claude) | Re-record Beat 01 using headed Chrome with a real display (Xvfb or physical monitor), or use the Yeshie/chrome-devtools MCP pipeline to capture a real browser window showing the 3D venue with curtains closed. |
| 2 | 0:22-0:38 | screen-recorder-coordinator | Beats 03 and 04 (Curtains Open + Audience Fills Seats) are solid black frames — no 3D curtain animation or audience semicircle visible | Frames at 0:24, 0:27, 0:30, 0:33, 0:36 are all black. Narration describes curtains parting and audience seats filling, but nothing is shown. This is the product's core visual promise and it is completely absent. (claude) | Re-record using a headed browser with GPU. Ensure the curtain animation CSS fires and the 3D seat cubes populate before capture begins. Consider a short pre-roll delay in the Playwright/Yeshie script to let WebGL initialize. |
| 3 | 1:15-1:45 | screen-recorder-coordinator | Beats 07-10 (Background Removal, Performer Entrance, Spotlight, Reactions) are entirely black frames — ~30 seconds of the video's most impressive features are invisible | Frames at 1:15, 1:18, 1:21, 1:24, 1:27, 1:30, 1:33, 1:36, 1:39, 1:42, 1:45 are all black. Narration mentions background removal, MediaPipe, the performer gliding onto stage, the spotlight following, and the applause meter — none of it is visible. (claude) | These beats require a live backend + LiveKit + a real GPU-rendered browser. Use the Yeshie pipeline with a physical or virtual display. If a full live demo is impossible for v2, substitute pre-recorded screen captures or edited footage of a real session. |
| 4 | 2:00-2:12 | screen-recorder-coordinator | Beats 12-13 (Performer Exit + Curtain Close) are black frames — the closing theatrical moments are invisible | Frames at 2:00, 2:03, 2:06, 2:09, 2:12 are all black. Narration describes the walk-off and the house manager closing the curtain, but the screen is dark. (claude) | Same root cause as other 3D beats — requires headed browser with GPU. Re-record these beats as part of the full GPU-capable re-recording pass. |

## Major Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
| 1 | 0:09-0:21 | yeshie-demo-driver | Beat 02 House Manager panel shows seat count changing from 20 to 27, but the planned interaction was setting it to 12; 'Lock Config' button is never clicked | Frames at 0:09 show Seat Count: 20, frames at 0:12-0:21 show Seat Count: 27. The shooting script specifies setting to 12 and clicking 'Lock Configuration'. The Lock Config button is visible but never activated — no confirmation state appears. | Claude also: The 'Enter show title...' placeholder is visible in all HM frames but the field is never filled. The narration says 'show title, all locked in before doors open' but the UI contradicts this. (both) | Update the Playwright script for Beat 02 to explicitly set seat count to 12 (or any demo-appropriate value), fill in a show title, and programmatically click 'Lock Config'. Verify a confirmation visual appears before cut. |
| 2 | 0:38-0:50 | screen-recorder-coordinator | Beat 05 Backstage/Green Room shows camera preview as a dark placeholder with a camera emoji — no actual camera feed or audio meter visible | Frames at 0:39-0:48 show a black rectangle with a small camera icon. The narration says 'live audio meter' but no audio visualization is present. The 'Disconnected' badge in the top-right confirms no backend connection. (claude) | Run a real backend + LiveKit instance so the performer tab actually connects. If that's not possible for v2, inject a placeholder video stream using Playwright's fake media flags (--use-fake-device-for-media-stream) so the camera preview shows a live-looking feed. |
| 3 | 0:50-1:03 | architecture-animator | Architecture diagram labels are very small and may be unreadable on YouTube at 1080p — 'WebSocket.io' label is partially cut and 'Socket.io' label is cramped | Frames at 0:57 and 1:00 show the topology graph with thin yellow/blue connector labels ('WebRTC media', 'WebSocket.io', 'Socket.io') that are tiny relative to the frame. On mobile or compressed streams these will be illegible. | Claude also: Frame at 0:57 shows a green 'Render Backend' node connected via Socket.io. The beat_06 narration covers LiveKit, WebRTC, and Socket.io but does not explain what the Render Backend does, leaving viewers confused. (both) | Increase font size for all edge labels to at least 14pt in the matplotlib/animation source. Consider adding a legend panel alongside the graph instead of inline labels. |
| 4 | 1:48-1:57 | architecture-animator | Beat 11 Reaction Data Channel diagram has the same small-label legibility problem, and the animated dots are very faint | Frames at 1:51 and 1:54 show the reaction data channel diagram with 'Data Channel' italic label in small text. The animated yellow dots representing data flow are barely visible against the dark background. (claude) | Increase label font size and dot size/opacity. Use a higher-contrast color (white or bright gold) for the data-flow dots. Ensure the animation is exported at full 1080p without compression artifacts. |
| 5 | 2:14-2:24 | yeshie-demo-driver | Beat 14 Call to Action shows a generic audience join screen rather than any tailored end card or the planned final shot | Frames at 2:15-2:24 show the 'Tonight's Concert / Jess Wayne' join form. While this is valid product UI, it is static and unguided — no URL text overlay, no CTA graphic, no demonstration of clicking through to the venue. (claude) | Add a text overlay (via resolve-editor) showing 'frontrowtheater.netlify.app' prominently. Alternatively, have the Yeshie driver demonstrate entering a name and clicking 'Enter FRONT ROW' to show the flow completing. |
| 6 | 0:00-2:24 | resolve-editor | No background music track is present anywhere in the video — the production plan calls for ambient jazz/orchestral underscore throughout | Audio review reveals only narration voice, no music bed. The specialist ledger confirms 'No track on disk.' The plan specifies 'Soft ambient pad', 'Brief orchestral swell', and 'Tech-style ambient' at various beats. | Claude also: The whisper transcript shows narration ends around 2:24. The plan targets 170-185 seconds. Multiple beats (01, 03-04, 07-10, 12-13) consist entirely of black frames that add dead time without value. (both) | Source a royalty-free soft jazz or orchestral underscore (e.g., from Pixabay, Artlist, or Free Music Archive). Mix at -18 to -20 dB under the narration, swell briefly at beat 03 curtain open, and fade out at beat 14. |

## Minor Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
| 1 | 0:00-0:08 | resolve-editor | No title card or opening graphic — the video cuts immediately from white to HM panel with no branding moment | The video opens on a white frame then jumps to the House Manager panel. A theatrical title card ('FRONT ROW') would set tone and give the audience a moment to orient. (claude) | Add a 2-3 second title card in DaVinci Resolve using the existing FrontRow branding (purple background, gold FRONT ROW text from the HM panel) before Beat 01. |
| 2 | 0:38-0:50 | elevenlabs-voice-producer | Beat 05 narration has a noticeable pause gap between 'prepares' and the next sentence at 0:40 | Whisper transcript shows '[0:38-0:40] Backstage, the performer prepares.' then '[0:40-0:46]' for the next sentence — a split that suggests a breath/gap artifact in the TTS output. (claude) | Re-generate beat_05.wav with the full narration as a single continuous string, or trim the silence in the audio file using ffmpeg's silenceremove filter before assembly. |
| 3 | 2:14-2:24 | elevenlabs-voice-producer | The URL in the CTA narration ('frontrowtheatre.netlify.app') uses British spelling 'theatre' while the actual URL uses American 'theater' | Whisper transcript at 2:14-2:19 captures 'frontrowtheatre.netlify.app' — the voice says 'theatre' but the actual deployment is 'frontrowtheater.netlify.app'. (claude) | Re-generate beat_14.wav with the correct URL spelling 'frontrowtheater.netlify.app'. Verify the generated audio against the transcript before assembly. |

## Specialist Scorecard

| Specialist | Issues Owned | Critical | Major | Minor | Notes |
|------------|-------------|----------|-------|-------|-------|
| yeshie-demo-driver | 2 | 0 | 2 | 0 | |
| screen-recorder-coordinator | 5 | 4 | 1 | 0 | |
| architecture-animator | 2 | 0 | 2 | 0 | |
| resolve-editor | 2 | 0 | 1 | 1 | |
| elevenlabs-voice-producer | 2 | 0 | 0 | 2 | |

## RSI Progress Score

| Dimension | Score (0-10) | Prior | Delta | Notes |
|-----------|-------------|-------|-------|-------|
| visual_quality | 2 | — | — | The majority of the video's most important beats — the 3D venue, curtain animations, performer on stage, spotlight, and reactions — render as pure black or white frames due to headless GPU failure. Only the HM panel, backstage UI, and architecture diagrams are visible. The product's flagship visual experience is essentially invisible. |
| audio_quality | 7 | — | — | OpenAI TTS nova voice is warm, well-paced, and natural — a significant improvement over macOS say. Pronunciation is clean throughout. Deductions for: no music track at all, one noticeable pause artifact in beat 05, and the URL misspelling in beat 14. If ElevenLabs Bella is sourced for v2 and music is added, this could reach 9. |
| pacing | 4 | — | — | Narration pacing per beat is good when content is present. However, multiple long stretches of black frames create dead air that destroys viewer momentum (e.g., 0:22-0:38, 1:15-1:45, 2:00-2:12). The video is also ~30 seconds short of target. Architecture beats are appropriately paced. |
| plan_adherence | 3 | — | — | All 14 beat narrations were recorded and are present. However: Beat 01 (empty stage) shows nothing, Beat 02 (HM config) skips seat count target and lock interaction, Beats 03-04 (curtains + audience) are black, Beats 07-10 (BG removal, entrance, spotlight, reactions) are black, Beats 12-13 (exit, curtain close) are black. No music. No URL overlay CTA. The script and audio plan are followed; the visual and interaction plan is largely unmet. |
| bug_count_inverted | 1 | — | — | 4 critical bugs (white/black frame rendering failures covering ~60% of video runtime), 7 major bugs (missing interactions, no music, wrong URL, illegible labels, under-length, no title card interaction). This is far above the threshold for a score above 2. |
| **Overall** | **3.4** | **—** | **—** | |

## Reviewer Disagreements

| Timecode | Gemini Says | Claude Says | Resolution |
|----------|-------------|-------------|------------|
| 0:00-0:08 | (not flagged) | Beat 01 Cold Open renders as a solid white frame — the 3D venue never appears | Claude-only finding |
| 0:22-0:38 | (not flagged) | Beats 03 and 04 (Curtains Open + Audience Fills Seats) are solid black frames — no 3D curtain animation or audience semicircle visible | Claude-only finding |
| 1:15-1:45 | (not flagged) | Beats 07-10 (Background Removal, Performer Entrance, Spotlight, Reactions) are entirely black frames — ~30 seconds of the video's most impressive features are invisible | Claude-only finding |
| 2:00-2:12 | (not flagged) | Beats 12-13 (Performer Exit + Curtain Close) are black frames — the closing theatrical moments are invisible | Claude-only finding |
| 0:09-0:21 | (not flagged) | Beat 02 House Manager panel shows seat count changing from 20 to 27, but the planned interaction was setting it to 12; 'Lock Config' button is never clicked | Claude-only finding |
| 0:09-0:21 | (not flagged) | Show Title field remains empty throughout Beat 02 — a key planned interaction is skipped | Claude-only finding |
| 0:38-0:50 | (not flagged) | Beat 05 Backstage/Green Room shows camera preview as a dark placeholder with a camera emoji — no actual camera feed or audio meter visible | Claude-only finding |
| 0:50-1:03 | (not flagged) | Architecture diagram labels are very small and may be unreadable on YouTube at 1080p — 'WebSocket.io' label is partially cut and 'Socket.io' label is cramped | Claude-only finding |
| 1:48-1:57 | (not flagged) | Beat 11 Reaction Data Channel diagram has the same small-label legibility problem, and the animated dots are very faint | Claude-only finding |
| 2:14-2:24 | (not flagged) | Beat 14 Call to Action shows a generic audience join screen rather than any tailored end card or the planned final shot | Claude-only finding |
| 0:00-2:24 | (not flagged) | No background music track is present anywhere in the video — the production plan calls for ambient jazz/orchestral underscore throughout | Claude-only finding |
| 0:00-2:24 | (not flagged) | Video is 2:25 — significantly under the 2:55-3:05 planned target — gap is filled by black frames rather than content | Claude-only finding |
| 0:00-0:08 | (not flagged) | No title card or opening graphic — the video cuts immediately from white to HM panel with no branding moment | Claude-only finding |
| 0:38-0:50 | (not flagged) | Beat 05 narration has a noticeable pause gap between 'prepares' and the next sentence at 0:40 | Claude-only finding |
| 2:14-2:24 | (not flagged) | The URL in the CTA narration ('frontrowtheatre.netlify.app') uses British spelling 'theatre' while the actual URL uses American 'theater' | Claude-only finding |
| 0:50-1:03 | (not flagged) | Architecture diagram shows 'Render Backend' node but this component is not mentioned in the narration for this beat and its role is unclear | Claude-only finding |

## Whisper Transcript vs Script

```
[0:00-0:05] Every great performance begins with an empty stage and an audience ready to believe.
[0:08-0:13] The house manager arrives first, setting the stage before a single seat is filled.
[0:13-0:18] Seat count, arrangement, show title, all locked in before doors open.
[0:22-0:26] With one click, the curtains part and the theater breathes.
[0:27-0:33] Audience members join from anywhere, each taking a seat, camera on, ready to be present.
[0:38-0:40] Backstage, the performer prepares.
[0:40-0:46] The green room shows their camera feed and a live audio meter, private, invisible to the audience.
[0:50-0:55] Under the hood, LiveKit handles the media, video, and audio over WebRTC.
[0:55-1:02] Socket.io carries the control signals, and your browser does the heavy lifting, including real-time background removal.
[1:05-1:08] Background removal runs entirely in the browser.
[1:08-1:13] No green screen, no server processing, MediaPipe WebAssembly 30 frames per second.
[1:15-1:21] Go live, the performer glides forward composited directly onto the stage, no flat screen.
[1:21-1:22] They are there.
[1:26-1:30] The spotlight follows. Wherever they move, the light is there.
[1:34-1:38] The audience reacts in real-time. Applause, love, bravos.
[1:38-1:41] The applause meter glows hotter as the room comes alive.
[1:48-1:52] Reaction data flows peer-to-peer through LiveKit's data channel.
[1:52-1:55] No server fan out, no bottleneck, even with a full house.
[1:58-2:01] When the show is done, the performer takes their exit.
[2:01-2:03] A proper walk off stage, not a hard cut.
[2:06-2:11] The house manager brings down the curtain, the show is over, until the next one.
[2:14-2:19] Front Row is live. Take a seat at frontrowtheatre.netlify.app or step onto the stage.
[2:22-2:24] Thank you for watching.
```

## Raw Reviewer Outputs

<details>
<summary>Gemini 2.5 Pro Raw Response</summary>

```
GEMINI FAILED: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent: [429 Too Many Requests] Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay. 
```

</details>

<details>
<summary>Claude Sonnet 4.6 Raw Response</summary>

```
```json
{
  "summary": "FrontRow v1 is a partially functional demo that successfully delivers narration and UI screenshots for the House Manager and Backstage beats, but fails critically on nearly every 3D venue beat due to headless Chromium's lack of GPU rendering, producing black or white frames where the product's most visually impressive feature should be. The architecture animation beats are technically sound but the overall video is under-length (~2:25 vs 2:55 target) and missing several planned interactions. Audio quality is the clear highlight; visuals are the critical liability.",
  "issues": [
    {
      "severity": "critical",
      "timecode": "0:00-0:08",
      "specialist": "screen-recorder-coordinator",
      "issue": "Beat 01 Cold Open renders as a solid white frame — the 3D venue never appears",
      "evidence": "Frame at 0:00 is pure white throughout what should be an 8-second wide shot of the velvet-curtain 3D stage. Headless Chromium cannot render WebGL without a GPU.",
      "fix_shape": "Re-record Beat 01 using headed Chrome with a real display (Xvfb or physical monitor), or use the Yeshie/chrome-devtools MCP pipeline to capture a real browser window showing the 3D venue with curtains closed."
    },
    {
      "severity": "critical",
      "timecode": "0:22-0:38",
      "specialist": "screen-recorder-coordinator",
      "issue": "Beats 03 and 04 (Curtains Open + Audience Fills Seats) are solid black frames — no 3D curtain animation or audience semicircle visible",
      "evidence": "Frames at 0:24, 0:27, 0:30, 0:33, 0:36 are all black. Narration describes curtains parting and audience seats filling, but nothing is shown. This is the product's core visual promise and it is completely absent.",
      "fix_shape": "Re-record using a headed browser with GPU. Ensure the curtain animation CSS fires and the 3D seat cubes populate before capture begins. Consider a short pre-roll delay in the Playwright/Yeshie script to let WebGL initialize."
    },
    {
      "severity": "critical",
      "timecode": "1:15-1:45",
      "specialist": "screen-recorder-coordinator",
      "issue": "Beats 07-10 (Background Removal, Performer Entrance, Spotlight, Reactions) are entirely black frames — ~30 seconds of the video's most impressive features are invisible",
      "evidence": "Frames at 1:15, 1:18, 1:21, 1:24, 1:27, 1:30, 1:33, 1:36, 1:39, 1:42, 1:45 are all black. Narration mentions background removal, MediaPipe, the performer gliding onto stage, the spotlight following, and the applause meter — none of it is visible.",
      "fix_shape": "These beats require a live backend + LiveKit + a real GPU-rendered browser. Use the Yeshie pipeline with a physical or virtual display. If a full live demo is impossible for v2, substitute pre-recorded screen captures or edited footage of a real session."
    },
    {
      "severity": "critical",
      "timecode": "2:00-2:12",
      "specialist": "screen-recorder-coordinator",
      "issue": "Beats 12-13 (Performer Exit + Curtain Close) are black frames — the closing theatrical moments are invisible",
      "evidence": "Frames at 2:00, 2:03, 2:06, 2:09, 2:12 are all black. Narration describes the walk-off and the house manager closing the curtain, but the screen is dark.",
      "fix_shape": "Same root cause as other 3D beats — requires headed browser with GPU. Re-record these beats as part of the full GPU-capable re-recording pass."
    },
    {
      "severity": "major",
      "timecode": "0:09-0:21",
      "specialist": "yeshie-demo-driver",
      "issue": "Beat 02 House Manager panel shows seat count changing from 20 to 27, but the planned interaction was setting it to 12; 'Lock Config' button is never clicked",
      "evidence": "Frames at 0:09 show Seat Count: 20, frames at 0:12-0:21 show Seat Count: 27. The shooting script specifies setting to 12 and clicking 'Lock Configuration'. The Lock Config button is visible but never activated — no confirmation state appears.",
      "fix_shape": "Update the Playwright script for Beat 02 to explicitly set seat count to 12 (or any demo-appropriate value), fill in a show title, and programmatically click 'Lock Config'. Verify a confirmation visual appears before cut."
    },
    {
      "severity": "major",
      "timecode": "0:09-0:21",
      "specialist": "yeshie-demo-driver",
      "issue": "Show Title field remains empty throughout Beat 02 — a key planned interaction is skipped",
      "evidence": "The 'Enter show title...' placeholder is visible in all HM frames but the field is never filled. The narration says 'show title, all locked in before doors open' but the UI contradicts this.",
      "fix_shape": "Add a Playwright fill() call targeting the Show Title input, entering something like 'FrontRow Live', before the Lock Config click."
    },
    {
      "severity": "major",
      "timecode": "0:38-0:50",
      "specialist": "screen-recorder-coordinator",
      "issue": "Beat 05 Backstage/Green Room shows camera preview as a dark placeholder with a camera emoji — no actual camera feed or audio meter visible",
      "evidence": "Frames at 0:39-0:48 show a black rectangle with a small camera icon. The narration says 'live audio meter' but no audio visualization is present. The 'Disconnected' badge in the top-right confirms no backend connection.",
      "fix_shape": "Run a real backend + LiveKit instance so the performer tab actually connects. If that's not possible for v2, inject a placeholder video stream using Playwright's fake media flags (--use-fake-device-for-media-stream) so the camera preview shows a live-looking feed."
    },
    {
      "severity": "major",
      "timecode": "0:50-1:03",
      "specialist": "architecture-animator",
      "issue": "Architecture diagram labels are very small and may be unreadable on YouTube at 1080p — 'WebSocket.io' label is partially cut and 'Socket.io' label is cramped",
      "evidence": "Frames at 0:57 and 1:00 show the topology graph with thin yellow/blue connector labels ('WebRTC media', 'WebSocket.io', 'Socket.io') that are tiny relative to the frame. On mobile or compressed streams these will be illegible.",
      "fix_shape": "Increase font size for all edge labels to at least 14pt in the matplotlib/animation source. Consider adding a legend panel alongside the graph instead of inline labels."
    },
    {
      "severity": "major",
      "timecode": "1:48-1:57",
      "specialist": "architecture-animator",
      "issue": "Beat 11 Reaction Data Channel diagram has the same small-label legibility problem, and the animated dots are very faint",
      "evidence": "Frames at 1:51 and 1:54 show the reaction data channel diagram with 'Data Channel' italic label in small text. The animated yellow dots representing data flow are barely visible against the dark background.",
      "fix_shape": "Increase label font size and dot size/opacity. Use a higher-contrast color (white or bright gold) for the data-flow dots. Ensure the animation is exported at full 1080p without compression artifacts."
    },
    {
      "severity": "major",
      "timecode": "2:14-2:24",
      "specialist": "yeshie-demo-driver",
      "issue": "Beat 14 Call to Action shows a generic audience join screen rather than any tailored end card or the planned final shot",
      "evidence": "Frames at 2:15-2:24 show the 'Tonight's Concert / Jess Wayne' join form. While this is valid product UI, it is static and unguided — no URL text overlay, no CTA graphic, no demonstration of clicking through to the venue.",
      "fix_shape": "Add a text overlay (via resolve-editor) showing 'frontrowtheater.netlify.app' prominently. Alternatively, have the Yeshie driver demonstrate entering a name and clicking 'Enter FRONT ROW' to show the flow completing."
    },
    {
      "severity": "major",
      "timecode": "0:00-2:24",
      "specialist": "resolve-editor",
      "issue": "No background music track is present anywhere in the video — the production plan calls for ambient jazz/orchestral underscore throughout",
      "evidence": "Audio review reveals only narration voice, no music bed. The specialist ledger confirms 'No track on disk.' The plan specifies 'Soft ambient pad', 'Brief orchestral swell', and 'Tech-style ambient' at various beats.",
      "fix_shape": "Source a royalty-free soft jazz or orchestral underscore (e.g., from Pixabay, Artlist, or Free Music Archive). Mix at -18 to -20 dB under the narration, swell briefly at beat 03 curtain open, and fade out at beat 14."
    },
    {
      "severity": "major",
      "timecode": "0:00-2:24",
      "specialist": "resolve-editor",
      "issue": "Video is 2:25 — significantly under the 2:55-3:05 planned target — gap is filled by black frames rather than content",
      "evidence": "The whisper transcript shows narration ends around 2:24. The plan targets 170-185 seconds. Multiple beats (01, 03-04, 07-10, 12-13) consist entirely of black frames that add dead time without value.",
      "fix_shape": "Once 3D beats are re-recorded, the duration gap should close naturally. If still short, extend beat durations in the assembly script, add a music-only intro/outro, or add a title card section."
    },
    {
      "severity": "minor",
      "timecode": "0:00-0:08",
      "specialist": "resolve-editor",
      "issue": "No title card or opening graphic — the video cuts immediately from white to HM panel with no branding moment",
      "evidence": "The video opens on a white frame then jumps to the House Manager panel. A theatrical title card ('FRONT ROW') would set tone and give the audience a moment to orient.",
      "fix_shape": "Add a 2-3 second title card in DaVinci Resolve using the existing FrontRow branding (purple background, gold FRONT ROW text from the HM panel) before Beat 01."
    },
    {
      "severity": "minor",
      "timecode": "0:38-0:50",
      "specialist": "elevenlabs-voice-producer",
      "issue": "Beat 05 narration has a noticeable pause gap between 'prepares' and the next sentence at 0:40",
      "evidence": "Whisper transcript shows '[0:38-0:40] Backstage, the performer prepares.' then '[0:40-0:46]' for the next sentence — a split that suggests a breath/gap artifact in the TTS output.",
      "fix_shape": "Re-generate beat_05.wav with the full narration as a single continuous string, or trim the silence in the audio file using ffmpeg's silenceremove filter before assembly."
    },
    {
      "severity": "minor",
      "timecode": "2:14-2:24",
      "specialist": "elevenlabs-voice-producer",
      "issue": "The URL in the CTA narration ('frontrowtheatre.netlify.app') uses British spelling 'theatre' while the actual URL uses American 'theater'",
      "evidence": "Whisper transcript at 2:14-2:19 captures 'frontrowtheatre.netlify.app' — the voice says 'theatre' but the actual deployment is 'frontrowtheater.netlify.app'.",
      "fix_shape": "Re-generate beat_14.wav with the correct URL spelling 'frontrowtheater.netlify.app'. Verify the generated audio against the transcript before assembly."
    },
    {
      "severity": "minor",
      "timecode": "0:50-1:03",
      "specialist": "architecture-animator",
      "issue": "Architecture diagram shows 'Render Backend' node but this component is not mentioned in the narration for this beat and its role is unclear",
      "evidence": "Frame at 0:57 shows a green 'Render Backend' node connected via Socket.io. The beat_06 narration covers LiveKit, WebRTC, and Socket.io but does not explain what the Render Backend does, leaving viewers confused.",
      "fix_shape": "Either add a brief narration line explaining the Render Backend ('a lightweight server that composites the final stage view'), or remove the node from the architecture diagram to keep it clean and focused on the narrated components."
    }
  ],
  "scores": {
    "visual_quality": {
      "score": 2,
      "notes": "The majority of the video's most important beats — the 3D venue, curtain animations, performer on stage, spotlight, and reactions — render as pure black or white frames due to headless GPU failure. Only the HM panel, backstage UI, and architecture diagrams are visible. The product's flagship visual experience is essentially invisible."
    },
    "audio_quality": {
      "score": 7,
      "notes": "OpenAI TTS nova voice is warm, well-paced, and natural — a significant improvement over macOS say. Pronunciation is clean throughout. Deductions for: no music track at all, one noticeable pause artifact in beat 05, and the URL misspelling in beat 14. If ElevenLabs Bella is sourced for v2 and music is added, this could reach 9."
    },
    "pacing": {
      "score": 4,
      "notes": "Narration pacing per beat is good when content is present. However, multiple long stretches of black frames create dead air that destroys viewer momentum (e.g., 0:22-0:38, 1:15-1:45, 2:00-2:12). The video is also ~30 seconds short of target. Architecture beats are appropriately paced."
    },
    "plan_adherence": {
      "score": 3,
      "notes": "All 14 beat narrations were recorded and are present. However: Beat 01 (empty stage) shows nothing, Beat 02 (HM config) skips seat count target and lock interaction, Beats 03-04 (curtains + audience) are black, Beats 07-10 (BG removal, entrance, spotlight, reactions) are black, Beats 12-13 (exit, curtain close) are black. No music. No URL overlay CTA. The script and audio plan are followed; the visual and interaction plan is largely unmet."
    },
    "bug_count_inverted": {
      "score": 1,
      "notes": "4 critical bugs (white/black frame rendering failures covering ~60% of video runtime), 7 major bugs (missing interactions, no music, wrong URL, illegible labels, under-length, no title card interaction). This is far above the threshold for a score above 2."
    }
  }
}
```
```

</details>

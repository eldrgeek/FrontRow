# FrontRow Demo Review — v2

> Reviewed: 2026-05-01
> Video: /Users/mikewolf/Projects/frontrow/video-production/output/v2/frontrow-demo-v2.mp4
> Reviewers: Gemini 2.5 Pro, Claude Sonnet 4.6, OpenAI Whisper

## Executive Summary

FrontRow v2 is a substantial improvement over v1 — the 3D stage now renders, the House Manager UI is visible, and narration is clean and well-paced. However, the video is critically short (~57 seconds vs the 170–185 second target), several planned beats are entirely missing (backstage/performer view, applause reaction bar glow, spotlight, curtain close, call-to-action card), and multiple beats show mismatched visuals relative to what the narration describes, undermining credibility at key moments.

## Critical Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
| 1 | 0:00-0:04 | screen-recorder-coordinator | Video opens with 4 seconds of pure white frames instead of the 3D empty stage with closed curtains | Frames at 0:00, 0:01, and 0:03 are completely white. Beat 1 narration ('A theater, waiting…') plays over blank white, destroying the cold open entirely. The 3D stage does not appear until 0:04. (claude) | Ensure the audience-perspective browser window is fully loaded and the 3D scene is rendered before recording begins. Trim the white leader frames in Resolve so Beat 1 starts on the first visible stage frame. |
| 2 | 0:04-0:07 | yeshie-demo-driver | Beat 1 shows the stage with curtains already open and a 'Welcome, Alex!' message — not the closed-curtain empty stage described in narration and the shooting script | Frame at 0:04 shows a half-lit 3D semicircle stage with blue seat cubes already present and a red backdrop reading 'Welcome, Alex!' in the upper portion. The curtains are not drawn. The shooting script specifies 'closed red velvet curtains, empty seats.' (claude) | At T=0 the orchestrator must load the audience tab before any show state is set — specifically before HM configures or opens curtains. The stage should show curtains closed with zero audience cubes. Re-sequence the Playwright orchestrator so the cold-open capture happens before any socket events fire. |
| 3 | 0:16-0:29 | resolve-editor | Beat 3 narration ('Audience members join from anywhere…') plays over the House Manager console UI, not the 3D audience view with populating seat cubes | Frames 0:16 through 0:22 show the HouseManagerPanel with 'FrontRow Live Demo' typed and config locked. The narration simultaneously describes audience members claiming seats with photos on glowing cubes. The visual and audio are for completely different beats. (claude) | Re-cut the timeline so that the audience-perspective clip (seat cubes populating) is synced to the Beat 3 narration segment. The HM console footage should end no later than the Beat 2 narration endpoint (~0:16). |
| 4 | 0:23-0:29 | yeshie-demo-driver | Beat 4 narration ('Backstage, the performer checks camera and mic…') plays but no backstage/performer view is ever shown — the entire performer perspective is absent from the video | Frames 0:24–0:27 are pure white (another white-frame gap). There is no capture of the backstage room, camera feed, audio meter, name input, or 'Go Live' button at any point in the video. The shooting script lists performer.mp4 as the source for Beat 4. (claude) | Record the performer backstage tab (the performer.mp4 clip) using a headed browser. The orchestrator should drive: camera permission granted, stage name typed ('Alex'), Go Live clicked. Capture those interactions and hand the clip to resolve-editor for insertion at the Beat 4 position. |
| 5 | 0:24-0:29 | screen-recorder-coordinator | Second white-frame gap of ~5 seconds appears mid-video, covering the transition from Beat 3 to Beat 4 | Frames at 0:24, 0:25, and 0:27 are pure white. This is the same headless-rendering or tab-switching artifact seen in v1. The narration continues playing over blank white. (claude) | Identify what browser tab or window switch caused the white flash. Use a continuous single-window recording or pre-load all tabs before recording begins. Add a crossfade or cut transition in Resolve to bridge any unavoidable gaps rather than leaving white frames. |

## Major Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
| 1 | 0:29-0:52 | yeshie-demo-driver | Beat 5 (curtains open animation) is not visually demonstrated — the audience view goes directly from no-curtains to the lit stage with green screen element, with no sweeping curtain animation visible | Frame at 0:30 shows the curtains already swept to the sides (two red vertical panels) with a green rectangle center-stage. There is no captured moment of the curtain sweep itself. The shooting script specifies 'curtains sweep apart' as the key visual. (claude) | Start the Beat 5 clip a few seconds earlier — capture the moment the HM clicks 'Open Curtains' and record the full CSS sweep animation from closed to open. This requires timing the Playwright screenshot/video capture to begin just before the curtain-open socket event fires. |
| 2 | 0:30-0:52 | architecture-animator | The 'performer on stage' visual is a plain green rectangle — it does not communicate a real performer, camera feed, or meaningful visual presence | Frames 0:30 through 0:52 show a green card/rectangle center-stage with animated yellow shapes inside it (chevrons, ovals). This appears to be a placeholder or green-screen tile rather than a camera feed or avatar. The narration says 'every audience member sees them in real time' but viewers will not understand what they are looking at. (claude) | Ensure the performer's actual camera feed (or a convincing placeholder avatar/video tile) renders inside the stage performer mesh. If this is a WebRTC feed issue in the test environment, use a recorded video loopback as the performer camera source so the tile shows a recognizable human face or avatar. |
| 3 | 0:40-0:52 | yeshie-demo-driver | Beats 7–9 (applause reaction bar glow, spotlight activation, curtain close) described in narration are never shown — the audience view is static throughout | Narration from 0:40–0:52 describes: 'Applause erupts — the reaction bar glows hotter,' 'A spotlight snaps on,' 'the performer takes a bow,' 'the curtains close.' The 3D stage view (frames 0:40–0:52) shows no reaction bar, no spotlight change, no curtain movement — the scene is visually identical across all these frames. (claude) | Verify the test API calls for reactions (T=40 applause, T=45 cheer) and spotlight (T=50) are firing during the recorded take. Add logging to confirm socket events are received by the audience browser. Check that ReactionBar and spotlight mesh respond to state changes in the 3D scene. If the events are firing but not rendering, debug the Three.js state update path. |
| 4 | 0:52-0:57 | resolve-editor | Video ends on dark purple frames with no call-to-action card — the CTA beat is entirely missing from the final cut | Frames at 0:54, 0:55, and 0:57 are dark purple/near-black. The narration CTA ('FrontRow. Your stage, your audience, your browser. Take a seat.') plays at 0:52–0:56 but no static card with the FrontRow logo and URL (frontrowtheater.netlify.app) is shown. (claude) | Generate the static CTA card (FrontRow logo + URL on dark background) as specified in the production plan Beat 10. Import it into Resolve and place it under the CTA narration segment. Duration should be ~5 seconds. |
| 5 | 0:00-0:57 | resolve-editor | Final video is ~57 seconds — approximately 65% shorter than the 170–185 second target runtime specified in the production plan | Video ends at approximately 0:57 based on the final frame sequence. The production plan specifies ~3 minutes (170–185 seconds). Even the shorter shooting script targets ~65 seconds; the actual video falls short of that too due to missing beats and white-frame gaps replacing content. (claude) | Once all missing clips are recorded (backstage/performer, reaction bar, spotlight, curtain close, CTA card), reassemble the full timeline in Resolve targeting the 65-second shooting-script runtime as a floor. Review against the 170–185s production plan to determine if additional beats need to be re-added. |

## Minor Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
| 1 | 0:07-0:15 | screen-recorder-coordinator | Beat 2 HM console shows a YouTube embed partially visible behind the red stage backdrop in the audience-perspective window, breaking the illusion of a clean 3D venue | Frame at 0:06 shows a YouTube player thumbnail bleeding through the upper portion of the red stage backdrop in the background tab/window. This appears to be a browser tab contamination artifact. (claude) | Ensure no browser tabs with YouTube or other external content are visible or composited into the recording window. Use a dedicated browser profile or incognito window for each role (HM, audience, performer) to prevent tab bleed. |
| 2 | 0:07-0:15 | yeshie-demo-driver | HM panel shows 'Unlock Config' (red button) indicating config is already locked before the demo shows the locking action — viewers miss the satisfying 'Lock Config' click moment | Frame at 0:09 shows the HouseManagerPanel already in the locked state (red 'Unlock Config' button visible, warning message 'Config locked — seat count changes disabled while show is active'). The shooting script specifies showing the slider move to 12, arrangement set, title typed, then config locked as a sequence. (claude) | Reset show state before starting the HM recording take. Drive the full configuration sequence live: slide seat count to 12, select semicircle, type 'FrontRow Live Demo', then click 'Lock Config' — capturing each step before the lock fires. |
| 3 | 0:16-0:22 | screen-recorder-coordinator | Beat 3 audience-perspective frame shows 'Pick your seat' text on the red backdrop rather than populated seat cubes with audience avatars, suggesting audience members have not yet joined | Frame at 0:16 shows the 3D stage with 'Pick your seat' text on the red panel, and only 2 cubes have changed color (one white/light, one yellow) out of 12. The narration says audience members are 'each claiming a seat, their photo appearing.' (claude) | Ensure all audience browser tabs are fully seated (seat assignment API calls complete, WebSocket state propagated) before the Beat 3 clip is captured. Add a Playwright wait for all seat cubes to render non-blue before starting the recording window for this beat. |

## Specialist Scorecard

| Specialist | Issues Owned | Critical | Major | Minor | Notes |
|------------|-------------|----------|-------|-------|-------|
| yeshie-demo-driver | 5 | 2 | 2 | 1 | |
| architecture-animator | 1 | 0 | 1 | 0 | |
| resolve-editor | 3 | 1 | 2 | 0 | |
| screen-recorder-coordinator | 4 | 2 | 0 | 2 | |

## RSI Progress Score

| Dimension | Score (0-10) | Prior | Delta | Notes |
|-----------|-------------|-------|-------|-------|
| visual_quality | 3 | 2.0 | 1.0 | The 3D stage now renders (a major improvement over v1's total GPU failure), but white-frame gaps, the performer's placeholder green rectangle, absent reaction/spotlight effects, missing backstage footage, and the YouTube bleed artifact collectively keep this score very low. The product's most impressive visual moments — curtain sweep, reaction bar glow, spotlight — are either absent or unrecognizable. |
| audio_quality | 8 | 7.0 | 1.0 | Narration is clean, well-paced, and natural throughout. The Whisper transcript matches the script closely with no mispronunciations or audible artifacts. Slight deduction because no background music or ambient theater audio is present, which the production plan specified as optional but desirable, and because audio occasionally outpaces the visuals it describes. |
| pacing | 4 | 4.0 | 0.0 | The narration pacing is good in isolation, but white-frame dead-air gaps at 0:00–0:04 and 0:24–0:29 break flow. Several beats where narration describes dynamic action (audience filling in, reactions, spotlight) are backed by static unchanging visuals, creating a mismatch that makes the pacing feel awkward even where timing is technically adequate. |
| plan_adherence | 2 | 3.0 | -1.0 | Of the 10 planned beats, only Beats 2 (HM console) and partial Beat 1 (empty stage) are meaningfully shown. Beats 4 (backstage), 7 (applause), 8 (spotlight/bow), 9 (curtain close), and 10 (CTA card) are entirely absent. Beat 3 (audience filling seats) and Beat 5 (curtain sweep) are shown but mismatched or incomplete. The video is also ~65% under the target runtime. |
| bug_count_inverted | 2 | 1.0 | 1.0 | 5 critical issues, 5 major issues, 3 minor issues identified. The white-frame gaps, missing beats, performer green-rectangle placeholder, absent reaction/spotlight rendering, and missing CTA card represent a high defect density for a production-ready demo. Score reflects 0 critical bugs = 10 baseline minus heavy deductions for the volume and severity of issues found. |
| **Overall** | **3.8** | **—** | **n/a** | |

## Reviewer Disagreements

| Timecode | Gemini Says | Claude Says | Resolution |
|----------|-------------|-------------|------------|
| 0:00-0:04 | (not flagged) | Video opens with 4 seconds of pure white frames instead of the 3D empty stage with closed curtains | Claude-only finding |
| 0:04-0:07 | (not flagged) | Beat 1 shows the stage with curtains already open and a 'Welcome, Alex!' message — not the closed-curtain empty stage described in narration and the shooting script | Claude-only finding |
| 0:16-0:29 | (not flagged) | Beat 3 narration ('Audience members join from anywhere…') plays over the House Manager console UI, not the 3D audience view with populating seat cubes | Claude-only finding |
| 0:23-0:29 | (not flagged) | Beat 4 narration ('Backstage, the performer checks camera and mic…') plays but no backstage/performer view is ever shown — the entire performer perspective is absent from the video | Claude-only finding |
| 0:24-0:29 | (not flagged) | Second white-frame gap of ~5 seconds appears mid-video, covering the transition from Beat 3 to Beat 4 | Claude-only finding |
| 0:29-0:52 | (not flagged) | Beat 5 (curtains open animation) is not visually demonstrated — the audience view goes directly from no-curtains to the lit stage with green screen element, with no sweeping curtain animation visible | Claude-only finding |
| 0:30-0:52 | (not flagged) | The 'performer on stage' visual is a plain green rectangle — it does not communicate a real performer, camera feed, or meaningful visual presence | Claude-only finding |
| 0:40-0:52 | (not flagged) | Beats 7–9 (applause reaction bar glow, spotlight activation, curtain close) described in narration are never shown — the audience view is static throughout | Claude-only finding |
| 0:52-0:57 | (not flagged) | Video ends on dark purple frames with no call-to-action card — the CTA beat is entirely missing from the final cut | Claude-only finding |
| 0:00-0:57 | (not flagged) | Final video is ~57 seconds — approximately 65% shorter than the 170–185 second target runtime specified in the production plan | Claude-only finding |
| 0:07-0:15 | (not flagged) | Beat 2 HM console shows a YouTube embed partially visible behind the red stage backdrop in the audience-perspective window, breaking the illusion of a clean 3D venue | Claude-only finding |
| 0:07-0:15 | (not flagged) | HM panel shows 'Unlock Config' (red button) indicating config is already locked before the demo shows the locking action — viewers miss the satisfying 'Lock Config' click moment | Claude-only finding |
| 0:16-0:22 | (not flagged) | Beat 3 audience-perspective frame shows 'Pick your seat' text on the red backdrop rather than populated seat cubes with audience avatars, suggesting audience members have not yet joined | Claude-only finding |

## Whisper Transcript vs Script

```
[0:00-0:06] A theater, waiting, 12 seats arranged in a semicircle, red curtains drawn, and backstage,
[0:06-0:08] a performer getting ready.
[0:08-0:13] The house manager arrives first, setting 12 seats, semicircle arrangement, and locking
[0:13-0:16] the configuration before doors open.
[0:16-0:21] Audience members join from anywhere, each claiming a seat, their photo appearing on
[0:21-0:23] a glowing cube in the 3D theater.
[0:23-0:29] Backstage, the performer checks camera and mic, types their stage name, and hits go live.
[0:29-0:33] The house manager opens the curtains and the theater comes alive.
[0:33-0:35] The performer steps onto the stage.
[0:35-0:40] Every audience member sees them in real time, rendered right in the browser.
[0:40-0:45] Applause erupts, the reaction bar at the stage edge glows hotter with every clap.
[0:45-0:50] A spotlight snaps on, the performer takes a bow, the audience cheers, and the curtains
[0:50-0:52] close, show complete.
[0:52-0:56] Front row, your stage, your audience, your browser, take a seat.
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
  "summary": "FrontRow v2 is a substantial improvement over v1 — the 3D stage now renders, the House Manager UI is visible, and narration is clean and well-paced. However, the video is critically short (~57 seconds vs the 170–185 second target), several planned beats are entirely missing (backstage/performer view, applause reaction bar glow, spotlight, curtain close, call-to-action card), and multiple beats show mismatched visuals relative to what the narration describes, undermining credibility at key moments.",
  "issues": [
    {
      "severity": "critical",
      "timecode": "0:00-0:04",
      "specialist": "screen-recorder-coordinator",
      "issue": "Video opens with 4 seconds of pure white frames instead of the 3D empty stage with closed curtains",
      "evidence": "Frames at 0:00, 0:01, and 0:03 are completely white. Beat 1 narration ('A theater, waiting…') plays over blank white, destroying the cold open entirely. The 3D stage does not appear until 0:04.",
      "fix_shape": "Ensure the audience-perspective browser window is fully loaded and the 3D scene is rendered before recording begins. Trim the white leader frames in Resolve so Beat 1 starts on the first visible stage frame."
    },
    {
      "severity": "critical",
      "timecode": "0:04-0:07",
      "specialist": "yeshie-demo-driver",
      "issue": "Beat 1 shows the stage with curtains already open and a 'Welcome, Alex!' message — not the closed-curtain empty stage described in narration and the shooting script",
      "evidence": "Frame at 0:04 shows a half-lit 3D semicircle stage with blue seat cubes already present and a red backdrop reading 'Welcome, Alex!' in the upper portion. The curtains are not drawn. The shooting script specifies 'closed red velvet curtains, empty seats.'",
      "fix_shape": "At T=0 the orchestrator must load the audience tab before any show state is set — specifically before HM configures or opens curtains. The stage should show curtains closed with zero audience cubes. Re-sequence the Playwright orchestrator so the cold-open capture happens before any socket events fire."
    },
    {
      "severity": "critical",
      "timecode": "0:16-0:29",
      "specialist": "resolve-editor",
      "issue": "Beat 3 narration ('Audience members join from anywhere…') plays over the House Manager console UI, not the 3D audience view with populating seat cubes",
      "evidence": "Frames 0:16 through 0:22 show the HouseManagerPanel with 'FrontRow Live Demo' typed and config locked. The narration simultaneously describes audience members claiming seats with photos on glowing cubes. The visual and audio are for completely different beats.",
      "fix_shape": "Re-cut the timeline so that the audience-perspective clip (seat cubes populating) is synced to the Beat 3 narration segment. The HM console footage should end no later than the Beat 2 narration endpoint (~0:16)."
    },
    {
      "severity": "critical",
      "timecode": "0:23-0:29",
      "specialist": "yeshie-demo-driver",
      "issue": "Beat 4 narration ('Backstage, the performer checks camera and mic…') plays but no backstage/performer view is ever shown — the entire performer perspective is absent from the video",
      "evidence": "Frames 0:24–0:27 are pure white (another white-frame gap). There is no capture of the backstage room, camera feed, audio meter, name input, or 'Go Live' button at any point in the video. The shooting script lists performer.mp4 as the source for Beat 4.",
      "fix_shape": "Record the performer backstage tab (the performer.mp4 clip) using a headed browser. The orchestrator should drive: camera permission granted, stage name typed ('Alex'), Go Live clicked. Capture those interactions and hand the clip to resolve-editor for insertion at the Beat 4 position."
    },
    {
      "severity": "critical",
      "timecode": "0:24-0:29",
      "specialist": "screen-recorder-coordinator",
      "issue": "Second white-frame gap of ~5 seconds appears mid-video, covering the transition from Beat 3 to Beat 4",
      "evidence": "Frames at 0:24, 0:25, and 0:27 are pure white. This is the same headless-rendering or tab-switching artifact seen in v1. The narration continues playing over blank white.",
      "fix_shape": "Identify what browser tab or window switch caused the white flash. Use a continuous single-window recording or pre-load all tabs before recording begins. Add a crossfade or cut transition in Resolve to bridge any unavoidable gaps rather than leaving white frames."
    },
    {
      "severity": "major",
      "timecode": "0:29-0:52",
      "specialist": "yeshie-demo-driver",
      "issue": "Beat 5 (curtains open animation) is not visually demonstrated — the audience view goes directly from no-curtains to the lit stage with green screen element, with no sweeping curtain animation visible",
      "evidence": "Frame at 0:30 shows the curtains already swept to the sides (two red vertical panels) with a green rectangle center-stage. There is no captured moment of the curtain sweep itself. The shooting script specifies 'curtains sweep apart' as the key visual.",
      "fix_shape": "Start the Beat 5 clip a few seconds earlier — capture the moment the HM clicks 'Open Curtains' and record the full CSS sweep animation from closed to open. This requires timing the Playwright screenshot/video capture to begin just before the curtain-open socket event fires."
    },
    {
      "severity": "major",
      "timecode": "0:30-0:52",
      "specialist": "architecture-animator",
      "issue": "The 'performer on stage' visual is a plain green rectangle — it does not communicate a real performer, camera feed, or meaningful visual presence",
      "evidence": "Frames 0:30 through 0:52 show a green card/rectangle center-stage with animated yellow shapes inside it (chevrons, ovals). This appears to be a placeholder or green-screen tile rather than a camera feed or avatar. The narration says 'every audience member sees them in real time' but viewers will not understand what they are looking at.",
      "fix_shape": "Ensure the performer's actual camera feed (or a convincing placeholder avatar/video tile) renders inside the stage performer mesh. If this is a WebRTC feed issue in the test environment, use a recorded video loopback as the performer camera source so the tile shows a recognizable human face or avatar."
    },
    {
      "severity": "major",
      "timecode": "0:40-0:52",
      "specialist": "yeshie-demo-driver",
      "issue": "Beats 7–9 (applause reaction bar glow, spotlight activation, curtain close) described in narration are never shown — the audience view is static throughout",
      "evidence": "Narration from 0:40–0:52 describes: 'Applause erupts — the reaction bar glows hotter,' 'A spotlight snaps on,' 'the performer takes a bow,' 'the curtains close.' The 3D stage view (frames 0:40–0:52) shows no reaction bar, no spotlight change, no curtain movement — the scene is visually identical across all these frames.",
      "fix_shape": "Verify the test API calls for reactions (T=40 applause, T=45 cheer) and spotlight (T=50) are firing during the recorded take. Add logging to confirm socket events are received by the audience browser. Check that ReactionBar and spotlight mesh respond to state changes in the 3D scene. If the events are firing but not rendering, debug the Three.js state update path."
    },
    {
      "severity": "major",
      "timecode": "0:52-0:57",
      "specialist": "resolve-editor",
      "issue": "Video ends on dark purple frames with no call-to-action card — the CTA beat is entirely missing from the final cut",
      "evidence": "Frames at 0:54, 0:55, and 0:57 are dark purple/near-black. The narration CTA ('FrontRow. Your stage, your audience, your browser. Take a seat.') plays at 0:52–0:56 but no static card with the FrontRow logo and URL (frontrowtheater.netlify.app) is shown.",
      "fix_shape": "Generate the static CTA card (FrontRow logo + URL on dark background) as specified in the production plan Beat 10. Import it into Resolve and place it under the CTA narration segment. Duration should be ~5 seconds."
    },
    {
      "severity": "major",
      "timecode": "0:00-0:57",
      "specialist": "resolve-editor",
      "issue": "Final video is ~57 seconds — approximately 65% shorter than the 170–185 second target runtime specified in the production plan",
      "evidence": "Video ends at approximately 0:57 based on the final frame sequence. The production plan specifies ~3 minutes (170–185 seconds). Even the shorter shooting script targets ~65 seconds; the actual video falls short of that too due to missing beats and white-frame gaps replacing content.",
      "fix_shape": "Once all missing clips are recorded (backstage/performer, reaction bar, spotlight, curtain close, CTA card), reassemble the full timeline in Resolve targeting the 65-second shooting-script runtime as a floor. Review against the 170–185s production plan to determine if additional beats need to be re-added."
    },
    {
      "severity": "minor",
      "timecode": "0:07-0:15",
      "specialist": "screen-recorder-coordinator",
      "issue": "Beat 2 HM console shows a YouTube embed partially visible behind the red stage backdrop in the audience-perspective window, breaking the illusion of a clean 3D venue",
      "evidence": "Frame at 0:06 shows a YouTube player thumbnail bleeding through the upper portion of the red stage backdrop in the background tab/window. This appears to be a browser tab contamination artifact.",
      "fix_shape": "Ensure no browser tabs with YouTube or other external content are visible or composited into the recording window. Use a dedicated browser profile or incognito window for each role (HM, audience, performer) to prevent tab bleed."
    },
    {
      "severity": "minor",
      "timecode": "0:07-0:15",
      "specialist": "yeshie-demo-driver",
      "issue": "HM panel shows 'Unlock Config' (red button) indicating config is already locked before the demo shows the locking action — viewers miss the satisfying 'Lock Config' click moment",
      "evidence": "Frame at 0:09 shows the HouseManagerPanel already in the locked state (red 'Unlock Config' button visible, warning message 'Config locked — seat count changes disabled while show is active'). The shooting script specifies showing the slider move to 12, arrangement set, title typed, then config locked as a sequence.",
      "fix_shape": "Reset show state before starting the HM recording take. Drive the full configuration sequence live: slide seat count to 12, select semicircle, type 'FrontRow Live Demo', then click 'Lock Config' — capturing each step before the lock fires."
    },
    {
      "severity": "minor",
      "timecode": "0:16-0:22",
      "specialist": "screen-recorder-coordinator",
      "issue": "Beat 3 audience-perspective frame shows 'Pick your seat' text on the red backdrop rather than populated seat cubes with audience avatars, suggesting audience members have not yet joined",
      "evidence": "Frame at 0:16 shows the 3D stage with 'Pick your seat' text on the red panel, and only 2 cubes have changed color (one white/light, one yellow) out of 12. The narration says audience members are 'each claiming a seat, their photo appearing.'",
      "fix_shape": "Ensure all audience browser tabs are fully seated (seat assignment API calls complete, WebSocket state propagated) before the Beat 3 clip is captured. Add a Playwright wait for all seat cubes to render non-blue before starting the recording window for this beat."
    }
  ],
  "scores": {
    "visual_quality": {
      "score": 3,
      "notes": "The 3D stage now renders (a major improvement over v1's total GPU failure), but white-frame gaps, the performer's placeholder green rectangle, absent reaction/spotlight effects, missing backstage footage, and the YouTube bleed artifact collectively keep this score very low. The product's most impressive visual moments — curtain sweep, reaction bar glow, spotlight — are either absent or unrecognizable."
    },
    "audio_quality": {
      "score": 8,
      "notes": "Narration is clean, well-paced, and natural throughout. The Whisper transcript matches the script closely with no mispronunciations or audible artifacts. Slight deduction because no background music or ambient theater audio is present, which the production plan specified as optional but desirable, and because audio occasionally outpaces the visuals it describes."
    },
    "pacing": {
      "score": 4,
      "notes": "The narration pacing is good in isolation, but white-frame dead-air gaps at 0:00–0:04 and 0:24–0:29 break flow. Several beats where narration describes dynamic action (audience filling in, reactions, spotlight) are backed by static unchanging visuals, creating a mismatch that makes the pacing feel awkward even where timing is technically adequate."
    },
    "plan_adherence": {
      "score": 2,
      "notes": "Of the 10 planned beats, only Beats 2 (HM console) and partial Beat 1 (empty stage) are meaningfully shown. Beats 4 (backstage), 7 (applause), 8 (spotlight/bow), 9 (curtain close), and 10 (CTA card) are entirely absent. Beat 3 (audience filling seats) and Beat 5 (curtain sweep) are shown but mismatched or incomplete. The video is also ~65% under the target runtime."
    },
    "bug_count_inverted": {
      "score": 2,
      "notes": "5 critical issues, 5 major issues, 3 minor issues identified. The white-frame gaps, missing beats, performer green-rectangle placeholder, absent reaction/spotlight rendering, and missing CTA card represent a high defect density for a production-ready demo. Score reflects 0 critical bugs = 10 baseline minus heavy deductions for the volume and severity of issues found."
    }
  }
}
```
```

</details>

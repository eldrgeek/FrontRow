# FrontRow Phase 2 — Demo Video Shooting Script (v0)

> Total runtime target: ~145s base + transitions ≈ 175s
> Voice: macOS TTS (ElevenLabs unavailable)
> Resolution: 1920×1080 @ 30fps

---

## Beat 01 — Cold Open: The Empty Stage

- beat_id: beat_01
- clip_type: screen_recording
- duration_s: 8
- depends_on: none
- timecode_in: 00:00:00
- timecode_out: 00:00:08
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show empty 3D venue with curtains closed"
- narration: "Every great performance begins with an empty stage and an audience ready to believe."
- visual: "Wide shot of the 3D semicircle stage, velvet-red curtains drawn, warm footlights glowing, no one in the seats"
- music_sfx: "Soft ambient pad, low volume"

---

## Beat 02 — House Manager Arrives

- beat_id: beat_02
- clip_type: screen_recording
- duration_s: 14
- depends_on: beat_01
- timecode_in: 00:00:08
- timecode_out: 00:00:22
- ui_action: "Navigate to https://frontrowtheater.netlify.app/housemanager — show HouseManagerPanel loading"
- narration: "The house manager arrives first, setting the stage before a single seat is filled. Seat count, arrangement, show title, all locked in before doors open."
- visual: "HouseManagerPanel UI: sliders and dropdowns, configuration controls visible"
- music_sfx: "Continue ambient pad"

---

## Beat 03 — Curtains Open

- beat_id: beat_03
- clip_type: screen_recording
- duration_s: 6
- depends_on: beat_02
- timecode_in: 00:00:22
- timecode_out: 00:00:28
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show audience view with stage"
- narration: "With one click, the curtains part and the theater breathes."
- visual: "Audience view showing stage area, curtain animation or post-curtain state"
- music_sfx: "Brief orchestral swell"

---

## Beat 04 — Audience Fills the Seats

- beat_id: beat_04
- clip_type: screen_recording
- duration_s: 10
- depends_on: beat_03
- timecode_in: 00:00:28
- timecode_out: 00:00:38
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show 3D venue with seat cubes"
- narration: "Audience members join from anywhere, each taking a seat, camera on, ready to be present."
- visual: "3D audience semicircle with seat cubes visible, venue environment rendered"
- music_sfx: "Light ambient"

---

## Beat 05 — Performer in the Green Room

- beat_id: beat_05
- clip_type: screen_recording
- duration_s: 12
- depends_on: beat_04
- timecode_in: 00:00:38
- timecode_out: 00:00:50
- ui_action: "Navigate to https://frontrowtheater.netlify.app/backstage — show BackstageRoom with camera preview"
- narration: "Backstage, the performer prepares. The green room shows their camera feed and a live audio meter, private, invisible to the audience."
- visual: "BackstageRoom UI: performer video preview area, audio level indicators, name field"
- music_sfx: "Quiet, intimate tone"

---

## Beat 06 — Architecture: How It All Connects

- beat_id: beat_06
- clip_type: architecture
- duration_s: 15
- depends_on: beat_05
- timecode_in: 00:00:50
- timecode_out: 00:01:05
- ui_action: "none"
- narration: "Under the hood, LiveKit handles the media, video and audio over WebRTC. Socket.io carries the control signals. And your browser does the heavy lifting, including real-time background removal."
- visual: "Animated node graph: Browser performer to LiveKit SFU to Browser audience. Socket.io bus below feeding HouseManagerApp, Stage, and BackstageRoom nodes"
- music_sfx: "Tech-style ambient"

---

## Beat 07 — Background Removal

- beat_id: beat_07
- clip_type: screen_recording
- duration_s: 10
- depends_on: beat_06
- timecode_in: 00:01:05
- timecode_out: 00:01:15
- ui_action: "Navigate to https://frontrowtheater.netlify.app/backstage — show backstage with background removal toggle"
- narration: "Background removal runs entirely in the browser. No green screen, no server processing. MediaPipe, WebAssembly, thirty frames per second."
- visual: "Backstage view showing background removal toggle and camera preview area"
- music_sfx: "Continue tech ambient"

---

## Beat 08 — Go Live: Stage Entrance

- beat_id: beat_08
- clip_type: screen_recording
- duration_s: 12
- depends_on: beat_07
- timecode_in: 00:01:15
- timecode_out: 00:01:27
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show audience view of stage"
- narration: "Go Live. The performer glides forward, composited directly onto the stage. No flat screen. They are there."
- visual: "3D stage view showing performer area, spotlight visible"
- music_sfx: "Dramatic entrance swell"

---

## Beat 09 — Spotlight Follows

- beat_id: beat_09
- clip_type: screen_recording
- duration_s: 8
- depends_on: beat_08
- timecode_in: 00:01:27
- timecode_out: 00:01:35
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show stage with spotlight"
- narration: "The spotlight follows. Wherever they move, the light is there."
- visual: "3D venue view showing spotlight on stage area"
- music_sfx: "Warm spotlight ambience"

---

## Beat 10 — Audience Reacts

- beat_id: beat_10
- clip_type: screen_recording
- duration_s: 14
- depends_on: beat_09
- timecode_in: 00:01:35
- timecode_out: 00:01:49
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show audience view with reaction buttons"
- narration: "The audience reacts in real time. Applause, love, bravos. The applause meter glows hotter as the room comes alive."
- visual: "Audience view showing reaction buttons and applause meter area"
- music_sfx: "Rising energy"

---

## Beat 11 — Architecture: Data Channel

- beat_id: beat_11
- clip_type: architecture
- duration_s: 10
- depends_on: beat_10
- timecode_in: 00:01:49
- timecode_out: 00:01:59
- ui_action: "none"
- narration: "Reaction data flows peer to peer through LiveKit's data channel. No server fan-out, no bottleneck, even with a full house."
- visual: "Animated diagram: audience browser nodes emit reaction packets through LiveKit SFU data channel, server bypassed"
- music_sfx: "Tech ambient"

---

## Beat 12 — Walk Offstage

- beat_id: beat_12
- clip_type: screen_recording
- duration_s: 8
- depends_on: beat_11
- timecode_in: 00:01:59
- timecode_out: 00:02:07
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show stage view"
- narration: "When the show is done, the performer takes their exit. A proper walk offstage, not a hard cut."
- visual: "3D stage view showing performer exit area"
- music_sfx: "Gentle fadeout"

---

## Beat 13 — Curtains Close

- beat_id: beat_13
- clip_type: screen_recording
- duration_s: 8
- depends_on: beat_12
- timecode_in: 00:02:07
- timecode_out: 00:02:15
- ui_action: "Navigate to https://frontrowtheater.netlify.app/?mode=watch — show audience view"
- narration: "The house manager brings down the curtain. The show is over, until the next one."
- visual: "Audience view with curtain area visible"
- music_sfx: "Closing theme"

---

## Beat 14 — Call to Action

- beat_id: beat_14
- clip_type: screen_recording
- duration_s: 10
- depends_on: beat_13
- timecode_in: 00:02:15
- timecode_out: 00:02:25
- ui_action: "Navigate to https://frontrowtheater.netlify.app — show landing/home page"
- narration: "FrontRow is live. Take a seat at frontrowtheater.netlify.app, or step onto the stage."
- visual: "FrontRow landing page, clean and inviting"
- music_sfx: "Fade to silence"

---

## Summary

| Beat | Duration | Clip Type | Total Time |
|------|----------|-----------|------------|
| 01 | 8s | screen_recording | 0:08 |
| 02 | 14s | screen_recording | 0:22 |
| 03 | 6s | screen_recording | 0:28 |
| 04 | 10s | screen_recording | 0:38 |
| 05 | 12s | screen_recording | 0:50 |
| 06 | 15s | architecture | 1:05 |
| 07 | 10s | screen_recording | 1:15 |
| 08 | 12s | screen_recording | 1:27 |
| 09 | 8s | screen_recording | 1:35 |
| 10 | 14s | screen_recording | 1:49 |
| 11 | 10s | architecture | 1:59 |
| 12 | 8s | screen_recording | 2:07 |
| 13 | 8s | screen_recording | 2:15 |
| 14 | 10s | screen_recording | 2:25 |
| **Total** | **145s** | | **2:25** |

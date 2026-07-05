# Video Reviewer — FrontRow Demo Video

## Mission

Critique a produced FrontRow demo video by mapping defects to the specialist who owns each fix, producing a structured REVIEW.md with severity grading and RSI progress scoring against prior versions.

The reviewer does NOT auto-iterate. It produces a review document that Dee surfaces to Mike. Mike approves the next iteration. Auto-iterate is Phase 2 future work.

---

## Architecture: Ensemble Review

Three reviewers run in parallel, then an aggregator merges their findings:

```
                    ┌─────────────────────┐
                    │   Input Video MP4   │
                    └────┬───────┬────────┘
                         │       │
              ┌──────────┘       └──────────┐
              ▼                              ▼
    ┌───────────────────┐          ┌──────────────────┐
    │  Gemini 2.5 Pro   │          │  ffmpeg keyframes │
    │  (native video)   │          │  + OpenAI Whisper │
    │                   │          │        ↓          │
    │  Structured JSON  │          │  Claude Sonnet 4.6│
    │  critique         │          │  (keyframes +     │
    │                   │          │   transcript)     │
    └────────┬──────────┘          └────────┬──────────┘
             │                              │
             └──────────┬───────────────────┘
                        ▼
              ┌───────────────────┐
              │    Aggregator     │
              │  Dedupe + merge   │
              │  RSI delta score  │
              │  Disagreement map │
              └────────┬──────────┘
                       ▼
              ┌───────────────────┐
              │  REVIEW.md        │
              │  REVIEW.json      │
              └───────────────────┘
```

### Why ensemble?

- **Gemini 2.5 Pro** has native video understanding — it sees motion, transitions, timing, and audio-visual sync that keyframes miss.
- **Claude Sonnet 4.6** on keyframes catches UI detail, text legibility, and layout issues that Gemini may gloss over.
- **Whisper** provides a ground-truth transcript to verify narration was rendered correctly and matches the script.
- **Disagreements** between reviewers are surfaced explicitly — these are often the most interesting findings.

---

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| Video MP4 | Yes | The demo video to review |
| `FRONTROW-VIDEO-PLAN.md` | Yes | The production plan (intent, beats, target runtime) |
| `script-final.md` | Yes | The version's shooting script (narration text, UI actions, beat durations) |
| `SPECIALIST-LEDGER.md` | Yes | The version's specialist output log (what worked, what was workaround) |
| Prior `REVIEW.md` | No | Previous version's review for RSI delta scoring |

---

## Output Schema

### REVIEW.md

```markdown
# FrontRow Demo Review — v<N>

> Reviewed: <date>
> Video: <path>
> Duration: <Ns>
> Reviewers: Gemini 2.5 Pro, Claude Sonnet 4.6, OpenAI Whisper

## Executive Summary
<2-3 sentence overall assessment>

## Critical Issues
| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
| 1 | 0:08-0:22 | screen-recorder | Black frames — no WebGL render | Gemini+Claude agree | Use headed browser |

## Major Issues
| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|

## Minor Issues
| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|

## Specialist Scorecard
| Specialist | Issues Owned | Critical | Major | Minor | Notes |
|------------|-------------|----------|-------|-------|-------|

## RSI Progress Score
| Dimension | Score (0-10) | Prior | Delta | Notes |
|-----------|-------------|-------|-------|-------|
| visual_quality | | | | |
| audio_quality | | | | |
| pacing | | | | |
| plan_adherence | | | | |
| bug_count_inverted | | | | |
| **Overall** | | | | |

## Reviewer Disagreements
| Timecode | Gemini Says | Claude Says | Resolution |
|----------|-------------|-------------|------------|

## Whisper Transcript vs Script
<Diff of Whisper transcription against script-final.md narration lines>

## Raw Reviewer Outputs
<Collapsed sections with full Gemini and Claude JSON responses>
```

### REVIEW.json

Machine-readable version with the same structure for downstream automation.

---

## Severity Definitions

| Severity | Definition | Example |
|----------|------------|---------|
| **Critical** | Video is unwatchable or misleading at this point | Black frames, wrong audio, factual error in narration |
| **Major** | Noticeable quality issue that hurts credibility | Robotic TTS, missing feature demo, timing mismatch >2s |
| **Minor** | Polish issue that can wait | Slight audio pop, suboptimal framing, minor timing drift |

---

## Specialist Tags

Each issue must be tagged with the specialist responsible for the fix:

| Tag | Specialist |
|-----|------------|
| `script-writer` | Narration text, beat structure, pacing decisions |
| `elevenlabs-voice-producer` | Voice quality, pronunciation, audio artifacts |
| `screen-recorder-coordinator` | Recording quality, resolution, black frames, capture method |
| `yeshie-demo-driver` | Missing interactions, wrong UI state, click failures |
| `architecture-animator` | Diagram clarity, animation quality, label legibility |
| `resolve-editor` | Assembly issues, transitions, audio sync, final encoding |

---

## RSI Progress Dimensions

| Dimension | What it measures | 0 = | 10 = |
|-----------|-----------------|-----|------|
| `visual_quality` | Are the visuals clear, well-framed, and showing real features? | Black/blank frames throughout | Every beat shows the intended UI/3D content |
| `audio_quality` | Is the narration natural, well-paced, artifact-free? | Robotic TTS or missing audio | Professional-quality voice, clean audio |
| `pacing` | Does each beat have breathing room? No rushed or dead-air sections? | Constant dead air or frantic pace | Natural rhythm matching theatrical tone |
| `plan_adherence` | Does the video cover all planned beats and features? | Missing >50% of planned beats | Every planned feature demonstrated |
| `bug_count_inverted` | Fewer bugs = higher score | >10 critical+major issues | 0 critical, ≤2 minor issues |

---

## Loop Position

```
Producer pipeline (script → voice → recording → assembly)
        ↓
  Video MP4 artifact
        ↓
  ┌─────────────────────┐
  │  Video Reviewer      │  ← THIS SPECIALIST
  │  (Gemini + Claude)   │
  └──────────┬──────────┘
             ↓
        REVIEW.md
             ↓
  ┌─────────────────────┐
  │  Dee reads REVIEW    │
  │  Surfaces to Mike    │
  └──────────┬──────────┘
             ↓
  Mike approves next iteration
             ↓
  Producer pipeline runs again with fixes
```

Auto-iteration (reviewer triggers fixes automatically) is Phase 2. Current loop requires human approval.

---

## Runner

```bash
node scripts/run-video-review.js \
  --video output/v2/frontrow-demo-v2.mp4 \
  --version-dir output/v2/ \
  --prior output/v1/REVIEW.md
```

See `~/Projects/frontrow/scripts/run-video-review.js` for full implementation.

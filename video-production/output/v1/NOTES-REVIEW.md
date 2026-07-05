# Video Reviewer — Run Notes

## Model API Issues

### Gemini 2.5 Pro — 429 Credits Depleted
The GEMINI_API_KEY in ~/Projects/CIE/secrets.yaml has depleted prepay credits.
The runner gracefully degraded to Claude-only mode. To restore the ensemble:
- Visit https://ai.studio/projects to add billing
- Or use a different Gemini API key

### Claude Model ID
The model ID format is `claude-sonnet-4-6` (no date suffix). The date-suffixed
formats `claude-sonnet-4-6-20250514` and `claude-sonnet-4-5-20241022` both return 404.
This is specific to this API key's tier.

### OpenAI Whisper
Worked perfectly. 25MB file size limit was not an issue for these short videos.
The verbose_json response format with segment timestamps provided good time-aligned
transcripts for cross-referencing against the script.

## Degraded Mode
Both v1 and v2 reviews ran in Claude-only mode (Gemini failed).
This means:
- No native video understanding (Gemini's strength)
- Keyframe-based analysis only (1.5s intervals)
- No disagreement data between reviewers
- Scores reflect a single reviewer rather than an ensemble average

For full ensemble operation, replenish Gemini credits.

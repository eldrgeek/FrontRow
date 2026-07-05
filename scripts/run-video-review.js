#!/usr/bin/env node
/**
 * run-video-review.js — Ensemble video reviewer for FrontRow demo videos.
 *
 * Gemini 2.5 Pro (native video) + Claude Sonnet 4.6 (keyframes + Whisper transcript)
 * → aggregated REVIEW.md + REVIEW.json
 *
 * Usage:
 *   node scripts/run-video-review.js \
 *     --video output/v2/frontrow-demo-v2.mp4 \
 *     --version-dir output/v2/ \
 *     --prior output/v1/REVIEW.md
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PRODUCTION_DIR = path.join(PROJECT_ROOT, "video-production");

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" && args[i + 1]) parsed.video = args[++i];
    else if (args[i] === "--version-dir" && args[i + 1])
      parsed.versionDir = args[++i];
    else if (args[i] === "--prior" && args[i + 1]) parsed.prior = args[++i];
  }
  if (!parsed.video || !parsed.versionDir) {
    console.error(
      "Usage: run-video-review.js --video PATH --version-dir PATH [--prior PATH]"
    );
    process.exit(1);
  }
  // Resolve relative to production dir
  const resolve = (p) =>
    path.isAbsolute(p) ? p : path.resolve(PRODUCTION_DIR, p);
  parsed.video = resolve(parsed.video);
  parsed.versionDir = resolve(parsed.versionDir);
  if (parsed.prior) parsed.prior = resolve(parsed.prior);
  return parsed;
}

// ── Load secrets from ~/Projects/CIE/secrets.yaml ────────────────────────────

function loadSecrets() {
  const secretsPath = path.join(
    process.env.HOME,
    "Projects/CIE/secrets.yaml"
  );
  if (!fs.existsSync(secretsPath)) return;
  const content = fs.readFileSync(secretsPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^(\w+):\s*"?([^"]+)"?\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim();
    }
  }
}

// ── Load context files ───────────────────────────────────────────────────────

function loadContext(versionDir, priorPath) {
  const tryRead = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "");

  const plan = tryRead(path.join(PRODUCTION_DIR, "FRONTROW-VIDEO-PLAN.md"));
  const script =
    tryRead(path.join(versionDir, "script-final.md")) ||
    tryRead(path.join(PRODUCTION_DIR, "output", "script-final.md"));
  const ledger = tryRead(path.join(versionDir, "SPECIALIST-LEDGER.md"));
  const prior = priorPath ? tryRead(priorPath) : "";

  return { plan, script, ledger, prior };
}

// ── Build the review prompt ──────────────────────────────────────────────────

function buildReviewPrompt(ctx, whisperTranscript) {
  return `You are a video production reviewer for a demo video of "FrontRow," a virtual theater product.

Your job: watch/analyze the video and produce a structured critique. Map every defect to the specialist who should fix it.

## Specialist Tags
- script-writer: narration text, beat structure, pacing decisions
- elevenlabs-voice-producer: voice quality, pronunciation, audio artifacts
- screen-recorder-coordinator: recording quality, resolution, black frames, capture method
- yeshie-demo-driver: missing interactions, wrong UI state, click failures
- architecture-animator: diagram clarity, animation quality, label legibility
- resolve-editor: assembly issues, transitions, audio sync, final encoding

## Severity Levels
- critical: video is unwatchable or misleading at this point
- major: noticeable quality issue that hurts credibility
- minor: polish issue that can wait

## Scoring Dimensions (0-10 each)
- visual_quality: are visuals clear, well-framed, showing real features?
- audio_quality: is narration natural, well-paced, artifact-free?
- pacing: does each beat have breathing room? No rushed or dead-air?
- plan_adherence: does the video cover all planned beats and features?
- bug_count_inverted: fewer bugs = higher score (10 = 0 critical + ≤2 minor)

## Context

### Production Plan (intent)
${ctx.plan.slice(0, 3000)}

### Shooting Script (what should happen per beat)
${ctx.script.slice(0, 4000)}

### Specialist Ledger (what actually happened)
${ctx.ledger.slice(0, 3000)}

${whisperTranscript ? `### Whisper Transcript (what was actually said)\n${whisperTranscript.slice(0, 2000)}` : ""}

${ctx.prior ? `### Prior Version Review (for RSI delta)\n${ctx.prior.slice(0, 2000)}` : ""}

## Output Format

Respond with valid JSON only. Schema:
{
  "summary": "2-3 sentence overall assessment",
  "issues": [
    {
      "severity": "critical|major|minor",
      "timecode": "M:SS-M:SS",
      "specialist": "specialist-tag",
      "issue": "description",
      "evidence": "what you observed",
      "fix_shape": "suggested fix approach"
    }
  ],
  "scores": {
    "visual_quality": { "score": 0-10, "notes": "" },
    "audio_quality": { "score": 0-10, "notes": "" },
    "pacing": { "score": 0-10, "notes": "" },
    "plan_adherence": { "score": 0-10, "notes": "" },
    "bug_count_inverted": { "score": 0-10, "notes": "" }
  }
}`;
}

// ── Gemini Reviewer (native video upload) ────────────────────────────────────

async function reviewWithGemini(videoPath, prompt) {
  console.log("[Gemini] Starting native video review...");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const { GoogleAIFileManager } = await import(
    "@google/generative-ai/server"
  );

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const fileManager = new GoogleAIFileManager(apiKey);
  const genAI = new GoogleGenerativeAI(apiKey);

  // Upload video
  console.log("[Gemini] Uploading video to Files API...");
  const uploadResult = await fileManager.uploadFile(videoPath, {
    mimeType: "video/mp4",
    displayName: path.basename(videoPath),
  });
  console.log(
    `[Gemini] Upload complete: ${uploadResult.file.name} (${uploadResult.file.state})`
  );

  // Poll until ACTIVE
  let file = uploadResult.file;
  while (file.state === "PROCESSING") {
    console.log("[Gemini] Waiting for video processing...");
    await new Promise((r) => setTimeout(r, 5000));
    file = await fileManager.getFile(file.name);
  }
  if (file.state !== "ACTIVE") {
    throw new Error(`Gemini file processing failed: ${file.state}`);
  }
  console.log("[Gemini] Video ready. Sending review prompt...");

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
  const result = await model.generateContent([
    {
      fileData: {
        mimeType: file.mimeType,
        fileUri: file.uri,
      },
    },
    { text: prompt },
  ]);

  const text = result.response.text();
  console.log(`[Gemini] Response received (${text.length} chars)`);

  // Clean up uploaded file
  try {
    await fileManager.deleteFile(file.name);
  } catch {
    // Ignore cleanup errors
  }

  return text;
}

// ── Claude Reviewer (keyframes + transcript) ─────────────────────────────────

async function extractKeyframes(videoPath) {
  const framesDir = path.join(
    path.dirname(videoPath),
    ".review_keyframes"
  );
  fs.mkdirSync(framesDir, { recursive: true });

  console.log("[Claude] Extracting keyframes every 1.5s...");
  execSync(
    `ffmpeg -y -i "${videoPath}" -vf "fps=1/1.5,scale=960:540" -q:v 5 "${framesDir}/frame_%04d.jpg" 2>/dev/null`
  );

  const frames = fs
    .readdirSync(framesDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map((f) => path.join(framesDir, f));
  console.log(`[Claude] Extracted ${frames.length} keyframes`);
  return frames;
}

async function transcribeWithWhisper(videoPath) {
  console.log("[Whisper] Extracting audio...");
  const audioPath = videoPath.replace(".mp4", "_review_audio.wav");
  try {
    execSync(
      `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" 2>/dev/null`
    );
  } catch {
    console.log("[Whisper] Audio extraction failed — video may have no audio");
    return "";
  }

  const stat = fs.statSync(audioPath);
  if (stat.size < 1000) {
    console.log("[Whisper] Audio file too small — likely silent");
    fs.unlinkSync(audioPath);
    return "";
  }

  // Whisper API has 25MB limit — check size
  if (stat.size > 25 * 1024 * 1024) {
    console.log("[Whisper] Audio >25MB — truncating to first 10 minutes");
    const truncPath = audioPath.replace(".wav", "_trunc.wav");
    execSync(
      `ffmpeg -y -i "${audioPath}" -t 600 "${truncPath}" 2>/dev/null`
    );
    fs.unlinkSync(audioPath);
    fs.renameSync(truncPath, audioPath);
  }

  console.log("[Whisper] Transcribing via OpenAI API...");
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    fs.unlinkSync(audioPath);

    const segments = transcription.segments || [];
    const text = segments
      .map((s) => {
        const start = formatTime(s.start);
        const end = formatTime(s.end);
        return `[${start}-${end}] ${s.text.trim()}`;
      })
      .join("\n");

    console.log(
      `[Whisper] Transcribed ${segments.length} segments, ${text.length} chars`
    );
    return text || transcription.text || "";
  } catch (err) {
    console.log(`[Whisper] API error: ${err.message}`);
    fs.unlinkSync(audioPath);
    return "";
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function reviewWithClaude(keyframePaths, transcript, prompt) {
  console.log(
    `[Claude] Sending ${keyframePaths.length} keyframes + transcript...`
  );
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Limit to ~40 keyframes to stay within token limits
  const step = Math.max(1, Math.floor(keyframePaths.length / 40));
  const selectedFrames = keyframePaths.filter((_, i) => i % step === 0);
  console.log(
    `[Claude] Using ${selectedFrames.length} of ${keyframePaths.length} frames`
  );

  const imageContent = selectedFrames.map((fp, i) => {
    const data = fs.readFileSync(fp).toString("base64");
    const timecode = formatTime(i * step * 1.5);
    return [
      { type: "text", text: `Frame at ${timecode}:` },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data },
      },
    ];
  });

  const content = [
    ...imageContent.flat(),
    { type: "text", text: prompt },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  console.log(`[Claude] Response received (${text.length} chars)`);

  // Clean up keyframes
  const framesDir = path.dirname(selectedFrames[0]);
  try {
    fs.rmSync(framesDir, { recursive: true });
  } catch {
    // ignore
  }

  return text;
}

// ── JSON extraction helper ───────────────────────────────────────────────────

function extractJSON(text) {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // ignore
  }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // ignore
    }
  }

  // Try finding first { to last }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      // ignore
    }
  }

  return null;
}

// ── Aggregator ───────────────────────────────────────────────────────────────

function aggregateReviews(geminiRaw, claudeRaw, whisperTranscript, ctx) {
  const gemini = extractJSON(geminiRaw);
  const claude = extractJSON(claudeRaw);

  if (!gemini && !claude) {
    throw new Error(
      "Both reviewers returned unparseable responses. Cannot aggregate."
    );
  }

  const geminiIssues = gemini?.issues || [];
  const claudeIssues = claude?.issues || [];

  // Merge and dedupe issues
  const allIssues = [];
  const seen = new Set();

  function issueKey(issue) {
    return `${issue.specialist}:${issue.timecode}:${issue.issue.slice(0, 50)}`;
  }

  for (const issue of geminiIssues) {
    const key = issueKey(issue);
    if (!seen.has(key)) {
      seen.add(key);
      allIssues.push({ ...issue, source: "gemini" });
    }
  }

  for (const issue of claudeIssues) {
    const key = issueKey(issue);
    // Check for similar existing issue (same specialist + overlapping timecode)
    const similar = allIssues.find(
      (existing) =>
        existing.specialist === issue.specialist &&
        existing.timecode === issue.timecode
    );
    if (similar) {
      similar.source = "both";
      similar.evidence += ` | Claude also: ${issue.evidence}`;
    } else if (!seen.has(key)) {
      seen.add(key);
      allIssues.push({ ...issue, source: "claude" });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, major: 1, minor: 2 };
  allIssues.sort(
    (a, b) =>
      (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2)
  );

  // Compute scores (average of both reviewers)
  const dimensions = [
    "visual_quality",
    "audio_quality",
    "pacing",
    "plan_adherence",
    "bug_count_inverted",
  ];
  const scores = {};
  for (const dim of dimensions) {
    const gScore = gemini?.scores?.[dim]?.score;
    const cScore = claude?.scores?.[dim]?.score;
    const validScores = [gScore, cScore].filter(
      (s) => s !== undefined && s !== null
    );
    const avg =
      validScores.length > 0
        ? validScores.reduce((a, b) => a + b, 0) / validScores.length
        : 0;
    scores[dim] = {
      score: Math.round(avg * 10) / 10,
      gemini: gScore ?? "n/a",
      claude: cScore ?? "n/a",
      notes:
        gemini?.scores?.[dim]?.notes ||
        claude?.scores?.[dim]?.notes ||
        "",
    };
  }

  // Overall score
  const overall =
    dimensions.reduce((sum, d) => sum + (scores[d]?.score || 0), 0) /
    dimensions.length;
  scores.overall = { score: Math.round(overall * 10) / 10 };

  // Parse prior scores if available
  let priorScores = null;
  if (ctx.prior) {
    priorScores = parsePriorScores(ctx.prior);
  }

  // Find disagreements
  const disagreements = [];
  for (const gIssue of geminiIssues) {
    const claudeHas = claudeIssues.some(
      (c) =>
        c.specialist === gIssue.specialist &&
        c.timecode === gIssue.timecode
    );
    if (!claudeHas) {
      disagreements.push({
        timecode: gIssue.timecode,
        gemini_says: gIssue.issue,
        claude_says: "(not flagged)",
        resolution: "Gemini-only finding",
      });
    }
  }
  for (const cIssue of claudeIssues) {
    const geminiHas = geminiIssues.some(
      (g) =>
        g.specialist === cIssue.specialist &&
        g.timecode === cIssue.timecode
    );
    if (!geminiHas) {
      disagreements.push({
        timecode: cIssue.timecode,
        gemini_says: "(not flagged)",
        claude_says: cIssue.issue,
        resolution: "Claude-only finding",
      });
    }
  }

  // Specialist scorecard
  const specialistMap = {};
  for (const issue of allIssues) {
    const sp = issue.specialist || "unknown";
    if (!specialistMap[sp])
      specialistMap[sp] = { critical: 0, major: 0, minor: 0, total: 0 };
    specialistMap[sp][issue.severity || "minor"]++;
    specialistMap[sp].total++;
  }

  return {
    summary: gemini?.summary || claude?.summary || "Review completed.",
    issues: allIssues,
    scores,
    priorScores,
    disagreements,
    specialistScorecard: specialistMap,
    whisperTranscript,
    rawGemini: geminiRaw,
    rawClaude: claudeRaw,
  };
}

function parsePriorScores(priorMd) {
  const scores = {};
  const lines = priorMd.split("\n");
  for (const line of lines) {
    const m = line.match(
      /\|\s*(visual_quality|audio_quality|pacing|plan_adherence|bug_count_inverted|Overall)\s*\|\s*([\d.]+)\s*\|/i
    );
    if (m) {
      scores[m[1].toLowerCase().replace(/\s/g, "_")] = parseFloat(m[2]);
    }
  }
  return Object.keys(scores).length > 0 ? scores : null;
}

// ── Render REVIEW.md ─────────────────────────────────────────────────────────

function renderReviewMd(agg, videoPath) {
  const version = path.basename(path.dirname(videoPath));
  const date = new Date().toISOString().split("T")[0];

  function issueTable(issues) {
    if (issues.length === 0)
      return "| | | | | | |\n| — | — | None | — | — | — |";
    return issues
      .map(
        (issue, i) =>
          `| ${i + 1} | ${issue.timecode || "—"} | ${issue.specialist || "—"} | ${issue.issue || "—"} | ${issue.evidence || "—"} (${issue.source || "—"}) | ${issue.fix_shape || "—"} |`
      )
      .join("\n");
  }

  const critical = agg.issues.filter((i) => i.severity === "critical");
  const major = agg.issues.filter((i) => i.severity === "major");
  const minor = agg.issues.filter((i) => i.severity === "minor");

  let scoreDelta = "";
  if (agg.priorScores) {
    scoreDelta = Object.entries(agg.scores)
      .filter(([k]) => k !== "overall")
      .map(([dim, s]) => {
        const prior = agg.priorScores[dim];
        const delta =
          prior !== undefined ? (s.score - prior).toFixed(1) : "n/a";
        const priorStr = prior !== undefined ? prior.toFixed(1) : "—";
        return `| ${dim} | ${s.score} | ${priorStr} | ${delta} | ${s.notes || ""} |`;
      })
      .join("\n");
    const priorOverall = agg.priorScores.overall;
    const overallDelta =
      priorOverall !== undefined
        ? (agg.scores.overall.score - priorOverall).toFixed(1)
        : "n/a";
    scoreDelta += `\n| **Overall** | **${agg.scores.overall.score}** | **${priorOverall?.toFixed(1) || "—"}** | **${overallDelta}** | |`;
  } else {
    scoreDelta = Object.entries(agg.scores)
      .filter(([k]) => k !== "overall")
      .map(
        ([dim, s]) => `| ${dim} | ${s.score} | — | — | ${s.notes || ""} |`
      )
      .join("\n");
    scoreDelta += `\n| **Overall** | **${agg.scores.overall.score}** | **—** | **—** | |`;
  }

  const specialistRows = Object.entries(agg.specialistScorecard)
    .map(
      ([sp, counts]) =>
        `| ${sp} | ${counts.total} | ${counts.critical} | ${counts.major} | ${counts.minor} | |`
    )
    .join("\n");

  const disagreementRows =
    agg.disagreements.length > 0
      ? agg.disagreements
          .map(
            (d) =>
              `| ${d.timecode} | ${d.gemini_says} | ${d.claude_says} | ${d.resolution} |`
          )
          .join("\n")
      : "| — | No disagreements | — | — |";

  return `# FrontRow Demo Review — ${version}

> Reviewed: ${date}
> Video: ${videoPath}
> Reviewers: Gemini 2.5 Pro, Claude Sonnet 4.6, OpenAI Whisper

## Executive Summary

${agg.summary}

## Critical Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
${issueTable(critical)}

## Major Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
${issueTable(major)}

## Minor Issues

| # | Timecode | Specialist | Issue | Evidence | Fix Shape |
|---|----------|------------|-------|----------|-----------|
${issueTable(minor)}

## Specialist Scorecard

| Specialist | Issues Owned | Critical | Major | Minor | Notes |
|------------|-------------|----------|-------|-------|-------|
${specialistRows || "| — | 0 | 0 | 0 | 0 | |"}

## RSI Progress Score

| Dimension | Score (0-10) | Prior | Delta | Notes |
|-----------|-------------|-------|-------|-------|
${scoreDelta}

## Reviewer Disagreements

| Timecode | Gemini Says | Claude Says | Resolution |
|----------|-------------|-------------|------------|
${disagreementRows}

## Whisper Transcript vs Script

\`\`\`
${agg.whisperTranscript || "(no transcript available)"}
\`\`\`

## Raw Reviewer Outputs

<details>
<summary>Gemini 2.5 Pro Raw Response</summary>

\`\`\`
${agg.rawGemini}
\`\`\`

</details>

<details>
<summary>Claude Sonnet 4.6 Raw Response</summary>

\`\`\`
${agg.rawClaude}
\`\`\`

</details>
`;
}

// ── HUD notification ─────────────────────────────────────────────────────────

function hudNotify(message) {
  try {
    spawnSync(
      "/opt/homebrew/bin/python3",
      [
        path.join(process.env.HOME, "Projects/mac-controller/cc.py"),
        "hud-ask",
        message,
        "--timeout",
        "30",
      ],
      { stdio: "ignore" }
    );
  } catch {
    // HUD is best-effort
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  loadSecrets();

  // Validate keys
  const missingKeys = [];
  if (!process.env.GEMINI_API_KEY) missingKeys.push("GEMINI_API_KEY");
  if (!process.env.OPENAI_API_KEY) missingKeys.push("OPENAI_API_KEY");
  if (!process.env.ANTHROPIC_API_KEY) missingKeys.push("ANTHROPIC_API_KEY");
  if (missingKeys.length > 0) {
    console.error(`Missing API keys: ${missingKeys.join(", ")}`);
    console.error("Set them in env or ~/Projects/CIE/secrets.yaml");
    process.exit(1);
  }

  // Validate video exists
  if (!fs.existsSync(args.video)) {
    console.error(`Video not found: ${args.video}`);
    process.exit(1);
  }

  const ctx = loadContext(args.versionDir, args.prior);
  const version = path.basename(args.versionDir) || "unknown";

  console.log(`\n=== FrontRow Video Review — ${version} ===`);
  console.log(`Video: ${args.video}`);
  console.log(`Version dir: ${args.versionDir}`);
  console.log(`Prior review: ${args.prior || "(none — baseline)"}`);
  console.log();

  hudNotify(`video-review ${version} — running`);

  const prompt = buildReviewPrompt(ctx, "");

  // Stage 1: Run Gemini, Claude (keyframes + Whisper) in parallel
  console.log("=== Stage 1: Parallel review ===\n");

  const [geminiResult, claudePrep] = await Promise.allSettled([
    reviewWithGemini(args.video, prompt),
    (async () => {
      const [keyframes, transcript] = await Promise.all([
        extractKeyframes(args.video),
        transcribeWithWhisper(args.video),
      ]);
      const promptWithTranscript = buildReviewPrompt(ctx, transcript);
      const claudeReview = await reviewWithClaude(
        keyframes,
        transcript,
        promptWithTranscript
      );
      return { claudeReview, transcript };
    })(),
  ]);

  if (geminiResult.status === "rejected") {
    console.error(`\nGemini FAILED: ${geminiResult.reason?.message || geminiResult.reason}`);
    console.error(geminiResult.reason?.stack || "");
    hudNotify(`video-review ${version} FAILED — Gemini error`);
    process.exit(1);
  }
  if (claudePrep.status === "rejected") {
    console.error(`\nClaude/Whisper FAILED: ${claudePrep.reason?.message || claudePrep.reason}`);
    console.error(claudePrep.reason?.stack || "");
    hudNotify(`video-review ${version} FAILED — Claude/Whisper error`);
    process.exit(1);
  }

  const geminiRaw = geminiResult.value;
  const claudeRaw = claudePrep.value.claudeReview;
  const whisperTranscript = claudePrep.value.transcript;

  // Stage 2: Aggregate
  console.log("\n=== Stage 2: Aggregation ===\n");

  const aggregated = aggregateReviews(
    geminiRaw,
    claudeRaw,
    whisperTranscript,
    ctx
  );

  // Write outputs
  const reviewMd = renderReviewMd(aggregated, args.video);
  const reviewMdPath = path.join(args.versionDir, "REVIEW.md");
  const reviewJsonPath = path.join(args.versionDir, "REVIEW.json");

  fs.writeFileSync(reviewMdPath, reviewMd);
  fs.writeFileSync(
    reviewJsonPath,
    JSON.stringify(
      {
        version,
        date: new Date().toISOString(),
        video: args.video,
        summary: aggregated.summary,
        issues: aggregated.issues,
        scores: aggregated.scores,
        priorScores: aggregated.priorScores,
        disagreements: aggregated.disagreements,
        specialistScorecard: aggregated.specialistScorecard,
      },
      null,
      2
    )
  );

  console.log(`\nREVIEW.md  → ${reviewMdPath}`);
  console.log(`REVIEW.json → ${reviewJsonPath}`);

  const issueCount = aggregated.issues.length;
  const critCount = aggregated.issues.filter(
    (i) => i.severity === "critical"
  ).length;
  const overallScore = aggregated.scores.overall?.score || 0;

  console.log(
    `\nTotal issues: ${issueCount} (${critCount} critical). Overall score: ${overallScore}/10`
  );

  hudNotify(
    `video-review ${version} DONE — ${issueCount} issues, score ${overallScore}/10`
  );

  return { reviewMdPath, reviewJsonPath };
}

main().catch((err) => {
  console.error(`\nFATAL: ${err.message}`);
  console.error(err.stack);
  hudNotify(`video-review FAILED: ${err.message.slice(0, 80)}`);
  process.exit(1);
});

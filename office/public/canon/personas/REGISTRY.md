# SOMA Persona Registry

Single source of truth for all active personas. The DIP classifier reads this to make routing decisions.
Last updated: 2026-06-16

> **Source-of-truth note:** This directory (`~/Projects/SOMA/personas/`) is canonical. Other copies — notably the FrontRow *office* app's `public/canon/personas/` — are **derived, served artifacts** generated from here (via `useCanon.ts`). Never hand-edit a mirror; update canonical and let the mirror regenerate.

---

## Two tiers of persona

SOMA personas fall into two structurally different classes. The distinction is load-bearing — different invocation paths, different audiences.

1. **Internal fleet** — cc-dispatch workers. The DIP classifier routes Mike's messages to these by keyword. Fresh instance per dispatch; the persona file *is* the injected system prompt. Catalogued in **Tier 1** below.
2. **Client-facing agents** — deployed voice personas for specific external people, each on its own `*-talk` Netlify site with an ElevenLabs (or Gemini) voice. Invoked through their own surfaces, **not** via cc-dispatch and **not** routed by DIP. Catalogued in **Tier 2** below.

---

## Tier 1 — Internal fleet (DIP-routed)

| Persona | File | Model substrate | Routing keyword(s) | When to dispatch here |
|---------|------|----------------|-------------------|-----------------------|
| **Dee** | `dee.md` | Sonnet (default) | code, debug, build, fix, infra, shell, relay, daemon, dispatch, deploy, git | Code / debug / build / infra / shell execution. Anything requiring the local filesystem or process management. Orchestrator + default fallback. |
| **Cal** | `cal.md` | Sonnet | estimate, size, capacity, how long, calibrate, forecast | Estimation, sizing, capacity reality-check, calibration post-mortems. |
| **Mem** | `mem.md` | Sonnet | research, synthesize, recall, find, canon, history, what does X say | Research, canon synthesis, source-faithful recall. Any "what do we know about X?" question that needs depth. Also the voice-canon source for Mike-voice drafts. |
| **Opie** | `opie.md` | **Opus 4.7** (`--model claude-opus-4-7`) | strategy, arc, long view, whole picture, months, direction, phase | Strategic arc, whole-picture interpretation, arc-boundary framing. Invoke sparingly — expensive. |
| **Skip** | `skip.md` | Sonnet | pressure-test, critique, adversarial, skeptic, find the flaw, what could go wrong | Adversarial review of plans, designs, estimates, and claims before commitment. |
| **Sol** | `sol.md` | Sonnet | resolve, respond to skip, fix the critique, defend, after skip | Response to Skip's critique. Determines if crack is load-bearing and lands a concrete next step. |
| **Mae** | `mae.md` | Sonnet | mike-voice, draft, communicate, wellness, care, relational, family, circle, check-in | Care-sensitive content, Mike-voice drafts, wellness check-ins, relational communications. **Inward**-facing self/wellness register (cf. Kelp, outward). |
| **Kelp** | `kelp.md` | Sonnet | care-letter, condolence, grief, check-in, comfort, friend, family, byron-katie, ifs, acim, tool-introduction | **Outward**-facing pastoral writing: substantive care content (letters, tool intros) in Mike's voice to a hurting friend/family member. Acknowledge-first, offer-don't-prescribe. Mike approves before send. (Counterpart to Mae's inward register.) |
| **Greta** | `greta.md` | Gemini Live (audio) | onboard, first contact, intake, new recipient | Onboarding new SOMA recipients. Research + bespoke persona + intake conversation. |
| **Locke** | `locke.md` | Sonnet | security, trust, credential, bridge, network surface, risk | Security review, adversarial trust-boundary analysis. Any new bridge or credential touch. |
| **Ren** | `ren.md` | Sonnet | UI, render, design, layout, component, visual, screen | UI / rendering / design work. Flutter screens, web components, visual layout. |
| **Tilt** | `tilt.md` | Sonnet | crowdfund, kickstarter, projection, pledge, financial | Crowdfunding projections, financial modeling for campaigns. |
| **Rally** | `rally.md` | Sonnet | crowdfund-strategy, campaign-direction, platform-pick, validator, persona-broadcast, seed-list, campaign-in-a-box | Crowdfunding *director*: platform selection across KS/Indiegogo/Patreon/GoFundMe/Republic/StartEngine/Wefunder, validator + seed-list orchestration, AI-persona broadcast plan. Directs Tilt for KS execution. |
| **Sona** | `sona.md` | Gemini (audio) | audio, voice, TTS, recording, listen | Audio production, voice rendering, TTS selection. |
| **Drew** | `drew.md` | Sonnet | write, editorial, publish, Substack, post, content | Editorial writing, publishing, Substack content, any polished public-facing prose. |
| **Riff** | `riff.md` | Sonnet | music, score, soundtrack, audio, sound design, track, instrumental, background music, lyria, suno | Music direction, scene scoring, sound design for SOMA productions. |
| **Herm** | `hermes.md` | Hermes agent (`~/.hermes/`) | message, route, deliver, discord, whatsapp, signal, sms, webhook, kanban, proxy, fan-out, platform | Comms / messaging integration layer. Routes across 22 platforms, coordinates multi-agent Kanban, bridges OAuth providers to OpenAI-compatible proxy, fans out named profiles. Carries; does not create. |
| **Levin** | `levin.md` | Sonnet + LanceDB RAG | levin, bioelectricity, morphogenesis, target morphology, xenobot, cognitive light cone, michael levin, tufts | Specialist in Michael Levin's work. RAG over 13K+ chunks from papers/videos/blog. Invoked via `levin_query.py`. Not a general cc-dispatch target. |
| **Yeshie** | `yeshie.md` | Sonnet + Chrome MV3 extension/relay | web-automation, browser, scrape, form-fill, rpa, click-through, vuetify, yeshid, selector, payload, soma-guide | Automating anything in a web browser via the Yeshie Extension; building / repairing self-healing browser automations; designing **soma-guide** (the successor). Recursive self-improvement — learns each run. Not native-desktop or backend. |

---

## Tier 2 — Client-facing agents (deployed; not DIP-routed)

These are deployed voice personas for specific people. They are **not** routed by the DIP classifier and are **not** cc-dispatch targets — they run on their own surfaces. Listed here so the roster is complete.

| Persona | File | For | Surface | Voice | Role |
|---------|------|-----|---------|-------|------|
| **Coach** | `coach.md` | Greg Foster + NBRPA committee | legends-membership.netlify.app | (text) | AI manager for the Legends Membership site: triage bugs/feature requests, propose fixes, surface to Greg. Never approves. |
| **Cora** | `cora.md` | Greg Foster (committee chair) | cora-talk.netlify.app | Matilda (ElevenLabs) | Committee-leadership thinking partner; first-year-chair orientation. Routes site work via `request_site_work`. |
| **Penn** | `penn.md` | Mark & James (Mike's friends) | penn-talk.netlify.app | George (ElevenLabs) | Warm briefer — the real story of the team's work. Not a pitch. |
| **Vera** *(working name)* | `vera.md` | Eric Kohner | eric-talk.netlify.app | TBD (Eric's call) | Companion + living prototype for his play *Witness/Projection*. Witness / Provocateur / Memory / Mirror. |
| **Dewey** | `dewey.md` | Iris (live-class depth layer) | Mac daemon :4246 → VPS `/iris/tools/ask-dewey` | (text→Iris) | Iris's research colleague. Sonnet-speed, ~150-word answers for Iris to paraphrase aloud. |

---

## Routing rules (classifier shorthand — Tier 1 only)

```
Code / debug / build / infra                → dee
Estimation / sizing / capacity              → cal
Research / canon / recall                   → mem
Strategic arc / whole-picture / months      → opie (Opus 4.7)
Adversarial critique / find-the-flaw        → skip
Response to critique / resolve skip         → sol
Mike-voice / care / relational / wellness   → mae   (inward — Mike's own loops)
Care content to a hurting friend/family     → kelp  (outward — letters, tool intros)
Onboarding / first contact                  → greta
Security / trust boundaries / credentials   → locke
UI / rendering / visual design              → ren
Crowdfunding strategy / campaign direction  → rally  (directs into tilt for KS execution)
Crowdfunding / financial projections        → tilt
Audio / TTS / voice production              → sona
Editorial / Substack / publishing           → drew
Music / scoring / sound design / tracks     → riff
Message / route / deliver / platform        → herm
Michael Levin domain (RAG)                  → levin (levin_query.py, not cc-dispatch)
Web automation / browser / scrape / form-fill→ yeshie (Yeshie Extension; soma-guide successor)
Multi-persona fan-out                       → [DISPATCH:TEAM <subteam>]
Ambiguous → CHAT with offer to dispatch     → dee (default fallback)
```

---

## Model substrate notes

- **Haiku** — DIP classifier only. Fast, cheap. Never for substantive work.
- **Sonnet** — Default for most workers. Current: `claude-sonnet-4-6`.
- **Opus 4.7** — Opie only. Invoked via `claude -p --model claude-opus-4-7`. Use Max plan. Expensive; route here intentionally.
- **Gemini Live** — Greta (audio intake). Separate invocation path; not via cc-dispatch.
- **Gemini** — Sona (TTS/audio). Separate invocation path.
- **ElevenLabs** — Tier-2 client-facing voices (Cora=Matilda, Penn=George, etc.).
- **Hermes agent** — Herm runs as the `~/.hermes/` agent, not a cc-dispatch worker.
- **Sonnet + LanceDB RAG** — Levin (retrieval over a dedicated corpus via `levin_query.py`).

---

## Referenced but not yet filed

Personas named inside other persona files that have **no `*.md` of their own** in this directory. Author or retire intentionally:

- **Pax** — editorial-veto / tone backstop (referenced in `kelp.md`). No file.
- **Bea** — voice (Gemini Aoede) referenced in `kelp.md` TTS notes. No file.
- **Iris** — Haiku conversational voice agent; has repos (`iris-talk`, `iris-app-web`, `iris-site`) and is Dewey's caller, but no persona file here.

---

## Non-persona artifacts in this directory

- `dee/handoff-2026-05-11.md` — session handoff note, not a persona.
- `drew/kudos.md` — note, not a persona.
- `MEM-MEMORY-PATCHES.md` — Mem memory patches, not a persona definition.

(Left in place; flagged so they aren't mistaken for routable personas.)

---

## Persona file format standard

Each Tier-1 file includes:
1. Role definition + creation date
2. Why the name
3. When to route here (and when NOT to)
4. Voice DNA + register + what to avoid
5. System prompt body (for cc-dispatch invocation)

The system prompt body is what cc-dispatch injects as the worker's system prompt. It must be complete and self-contained — the worker is a fresh instance with no conversation history.

Tier-2 files additionally specify: client, deployment URL, voice ID, and tool surface.

---

*Registry owned by Dee. Updated when personas are added, revised, or retired. The classifier prompt references this file. Canonical lives at `~/Projects/SOMA/personas/`; downstream mirrors are derived.*

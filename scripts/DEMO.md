# FrontRow Demo Show

Self-running demo that boots local servers, opens 4 browser windows (House Manager, Performer, 2 Audience members), and drives a full show timeline.

## Quick Start

```bash
# Watch the show live (4 browser windows open on your screen)
npm run demo:show

# Record the show (saves MP4s to video-production/output/v2/raw/)
npm run demo:record
```

Or run directly:

```bash
node scripts/run-demo-show.js --live
node scripts/run-demo-show.js --record
```

## What Happens

1. **House Manager** configures venue — 12 seats, semicircle, locks config
2. **Two audience members** join and get seated
3. **Performer** enters backstage, types name, goes live
4. **House Manager** opens curtains
5. **Performer** enters stage
6. **Audience** fires applause and cheer reactions
7. **Spotlight** activates
8. **Curtains** close — show ends

Total runtime: ~65 seconds.

## Requirements

- Node.js
- Playwright (`npx playwright install chromium`)
- Local FrontRow backend and frontend (auto-started if not running)

## Recording Output

With `--record`, video files are saved to `video-production/output/v2/raw/`:
- `audience-perspective.mp4` — main audience view (the money shot)
- `audience-2.mp4` — second audience perspective
- `house-manager.mp4` — HM console
- `performer.mp4` — backstage then stage view

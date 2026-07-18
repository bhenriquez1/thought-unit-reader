# Verify skill — Avrrio Reader

## Build & launch
```bash
npm run build           # Next.js production build (includes pdf-worker setup)
PORT=3333 npm start &   # serves at http://localhost:3333
curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/  # expect 200
```

## Drive with Playwright
```js
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
// executablePath: "/opt/pw-browsers/chromium"
```

## Auth gate
The entire content panel (`renderContent()`) is gated by Firebase auth (`!user`).
Without a signed-in session the inner content (NoteLab sub-tabs, Learning Hub sub-tabs, Reader) never renders.
**What IS visible without auth:** the top nav bar, `/apex` page, `/dat-apex` redirect page.

## Key observable surfaces (no auth needed)
- `http://localhost:3333/` — nav bar labels, sign-in screen
- `http://localhost:3333/apex` — full 7-tab DAT Apex dashboard (App Router page, no Firebase gate)

## Nav bar expected buttons (as of PR #514)
Reader + Panel | TOC | Learning Hub | NoteLab | Recall | DAT Apex | Elena Mode

## Gotchas
- `npm run predev`/`prebuild` copies the PDF worker; always run `npm run build` not just `next build`
- `PORT=3333 npm start` (not `npm run dev`) for production builds
- Playwright lives at `/opt/node22/lib/node_modules/playwright/index.mjs`; NOT in node_modules

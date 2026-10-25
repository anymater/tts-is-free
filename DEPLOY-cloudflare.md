# Deploy to Cloudflare Pages (prepared, not yet deployed)

Status: code prepared 2026-10-24, NOT committed, NOT pushed, NOT connected to
Cloudflare. Nothing about the live app or the local app has changed.

## What was prepared

- `functions/api/fish.js` — Pages Function port of `handleFish()` in `server.js`
  (same validation, same Fish endpoint `api.fish.audio/v1/tts`, same model
  `s2.1-pro-free`, same error shapes).
- `functions/api/mimo.js` — Pages Function port of `handleMimo()` in `server.js`
  (same validation, same MiMo endpoint, same default model `mimo-v2.5-tts`).
- `functions/api/health.js` — port of the `/api/health` branch in `server.js`.
- No frontend change: `public/js/config.js` already calls `/api/fish`,
  `/api/mimo`, `/api/health` as same-origin paths, which Pages routes to
  `functions/` automatically.
- No secrets added: API keys still live only in each visitor's browser
  localStorage and are forwarded as Bearer tokens. Nothing to set in
  Cloudflare env vars.
- Syntax checked with `node --check` on all three function files.

## What still needs the user

1. Say "deploy" — then: commit + push these files to
   https://github.com/anymater/tts-is-free (public repo, main branch).
2. One Cloudflare login (free account, device-code flow like the GitHub one
   earlier today) to create the Pages project connected to that repo.
3. Pages project settings: no build command, build output directory `public`
   (the repo root stays the project root so `functions/` is picked up).

## What stays as-is

- `server.js` remains the local dev server (`npm start` → localhost:3000).
  If the proxy logic changes later, `server.js` and `functions/api/*.js` must
  be updated together.
- Google One gives no hosting here (established 2026-10-24): it is storage +
  AI features, not a server. Cloudflare Pages free tier is the route.

## First checks after deploy

1. `https://<site>.pages.dev/api/health` returns `{"ok":true,...}`.
2. One short synthesis per engine from the site's own settings page
   (Fish, then MiMo fallback) to confirm the proxies work end to end.

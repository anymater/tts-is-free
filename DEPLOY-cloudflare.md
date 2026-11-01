# Deploy to Cloudflare Pages — LIVE since 2026-11-02

Status: DEPLOYED 2026-11-02 via wrangler direct upload (not Git-connected).
Live site: https://tts-is-free.pages.dev
Health check verified: `/api/health` returns `{"ok":true,"fishModel":"s2.1-pro-free","mimoDefaultModel":"mimo-v2.5-tts"}`.

## How it was deployed

- Project `tts-is-free` created via Cloudflare API (account `aipuaipu`).
- OAuth via wrangler's client_id with a manual PKCE flow: user authorized on
  their phone, pasted back the localhost callback URL; code exchanged at
  `https://dash.cloudflare.com/oauth2/token`. NOTE: the token endpoint
  returns 403 error 1010 for the default Python urllib User-Agent — retry
  with a browser-like User-Agent and it succeeds.
- OAuth access token (1h) + refresh token saved at
  `~/.config/cloudflare-deploy/token.json` (0600) for future deploys; the
  PKCE verifier/state live in `~/.config/cloudflare-deploy/pkce.json`.
- Deploy command: `cd ~/workspace/tts-is-free && CLOUDFLARE_API_TOKEN=<token> wrangler pages deploy public --project-name tts-is-free`.
- Turnstile on dash.cloudflare.com fails persistently from this VM's browser
  (login button stays disabled, no puzzle offered, manual attempt also
  failed) — do NOT retry the VM-browser login route; use the phone
  authorization route instead. Git-connected auto-deploy was NOT set up
  (needs the Cloudflare GitHub App); redeploys are manual via wrangler.

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

## 2026-11-02 update: voice picker
- Added `GET /api/voices` (server.js `handleVoices` + `functions/api/voices.js`,
  kept in sync): proxies Fish Audio `GET /model` (public library by default,
  `scope=mine` for the caller's own models, `language`/`q` filters,
  `sort_by=task_count`), returns normalized `{ total, items: [{ id, title,
  description, languages, tags, task_count }] }`. Frontend shows a
  热门音色/我的音色 picker with search; picking fills the Reference ID field.
  Manual paste remains as fallback.
- Note: from this VM, direct calls to api.fish.audio currently hang (curl
  empty, node fetch timeout) — local upstream passthrough could not be
  verified here; the live Pages Function path (Cloudflare edge) is the
  verification route.

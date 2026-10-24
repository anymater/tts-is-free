#!/usr/bin/env node
'use strict';

/*
 * Static/route smoke test for the local server.
 * Usage:
 *   npm start
 *   npm run test:smoke
 * Optional: BASE_URL=http://127.0.0.1:3000 npm run test:smoke
 */

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

const PATHS = [
  '/',
  '/settings.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/settings.js',
  '/js/api.js',
  '/js/config.js',
  '/js/i18n.js',
  '/js/store.js',
  '/favicon.svg',
  '/api/health'
];

let failures = 0;

async function fetchPath(path) {
  try {
    const response = await fetch(new URL(path, BASE));
    const type = response.headers.get('content-type') || '(no content-type)';
    if (!response.ok) {
      failures += 1;
      console.error(`FAIL ${response.status} ${path} (${type})`);
      return null;
    }
    console.log(`OK   ${response.status} ${path} (${type})`);
    return response;
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${path} — ${error.message}`);
    return null;
  }
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  for (const path of PATHS) {
    const response = await fetchPath(path);
    if (response && path === '/api/health') {
      try {
        const health = await response.json();
        if (!health || health.ok !== true) {
          failures += 1;
          console.error('FAIL /api/health did not return { ok: true }');
        }
      } catch {
        failures += 1;
        console.error('FAIL /api/health returned invalid JSON');
      }
    }
  }

  const indexResponse = await fetch(new URL('/', BASE)).catch(() => null);
  const settingsResponse = await fetch(new URL('/settings.html', BASE)).catch(() => null);

  if (indexResponse) {
    const html = await indexResponse.text();
    for (const marker of ['id="synthBtn"', 'id="audioPlayer"', 'id="historyList"', '/js/app.js']) {
      if (!html.includes(marker)) {
        failures += 1;
        console.error(`FAIL index.html missing marker: ${marker}`);
      }
    }

    const refs = new Set(
      [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((match) => match[1])
    );
    for (const ref of refs) {
      if (!PATHS.includes(ref)) await fetchPath(ref);
    }
  }

  if (settingsResponse) {
    const html = await settingsResponse.text();
    for (const marker of ['id="fishKeyInput"', 'id="mimoModelInput"', '/js/settings.js']) {
      if (!html.includes(marker)) {
        failures += 1;
        console.error(`FAIL settings.html missing marker: ${marker}`);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log('\nAll smoke checks passed.');
}

main().catch((error) => {
  console.error(`Smoke test could not run: ${error.message}`);
  console.error(`Start the server first (npm start) and confirm ${BASE}`);
  process.exitCode = 1;
});

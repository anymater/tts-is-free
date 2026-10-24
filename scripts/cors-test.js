#!/usr/bin/env node
'use strict';

/*
 * CORS preflight probe for the two TTS providers.
 * Usage: npm run test:cors
 * Optional: TEST_ORIGIN=http://localhost:3000 npm run test:cors
 *
 * This only checks the OPTIONS preflight response. Whether a real POST works
 * from a browser still depends on the same CORS headers being present there.
 */

const ORIGIN = process.env.TEST_ORIGIN || 'http://localhost:3000';

const TARGETS = [
  {
    name: 'Fish Audio',
    url: 'https://api.fish.audio/v1/tts',
    requestHeaders: 'authorization,content-type,model'
  },
  {
    name: 'MiMo TTS',
    url: 'https://api.xiaomimimo.com/v1/chat/completions',
    requestHeaders: 'authorization,content-type'
  }
];

function listAllows(headerValue, requested) {
  if (!headerValue) return false;
  const normalized = headerValue.toLowerCase();
  if (normalized.trim() === '*') return true;
  return requested
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .every((header) => normalized.includes(header));
}

async function main() {
  console.log(`CORS preflight check (Origin: ${ORIGIN})\n`);

  for (const target of TARGETS) {
    console.log(`— ${target.name}`);
    console.log(`  OPTIONS ${target.url}`);

    try {
      const response = await fetch(target.url, {
        method: 'OPTIONS',
        headers: {
          Origin: ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': target.requestHeaders
        }
      });

      const allowOrigin = response.headers.get('access-control-allow-origin');
      const allowMethods = response.headers.get('access-control-allow-methods');
      const allowHeaders = response.headers.get('access-control-allow-headers');
      const originOk = allowOrigin === '*' || allowOrigin === ORIGIN;
      const headersOk = listAllows(allowHeaders, target.requestHeaders);
      const direct = originOk && headersOk;

      console.log(`  status: ${response.status}`);
      console.log(`  access-control-allow-origin: ${allowOrigin || '(missing)'}`);
      console.log(`  access-control-allow-methods: ${allowMethods || '(missing)'}`);
      console.log(`  access-control-allow-headers: ${allowHeaders || '(missing)'}`);
      console.log(
        `  verdict: ${
          direct
            ? 'POSSIBLE for browser preflight (still verify with a real POST)'
            : 'BLOCKED for direct browser calls — use the included proxy'
        }`
      );
    } catch (error) {
      console.log(`  request failed: ${error.message}`);
      console.log('  verdict: UNKNOWN (network unavailable) — the proxy remains the safe default');
    }

    console.log('');
  }

  console.log('Notes:');
  console.log('- The app uses a same-origin Node proxy by default, so it does not depend on these headers.');
  console.log('- Even when CORS passes, calling providers directly exposes API keys and audio responses to page scripts.');
  console.log('- To test a real request, add a valid key and POST from a page whose Origin matches.');
}

main();

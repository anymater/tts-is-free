// 官方 Key + 免费额度共享逻辑（Cloudflare Pages Functions 版）。
// 双模式契约：
//   - 浏览器带 Authorization: Bearer <用户Key> → 自定义模式：原样使用该 Key，
//     不占官方额度、不计数（与旧行为完全一致）。
//   - 浏览器不带 Authorization → 官方模式：使用 Pages 项目 secrets 里的
//     官方 Key（FISH_OFFICIAL_KEY / MIMO_OFFICIAL_KEY，经 context.env 注入，
//     绝不返回给浏览器），并按 IP × 自然月计数。
// 额度：每个 IP 每个自然月 OFFICIAL_QUOTA_LIMIT 次成功合成，Fish 与 MiMo
// 共用同一个池；只有上游成功返回音频才计数；计数存 KV（binding 名
// TTS_QUOTA_KV，key 形如 quota:<ip>:<YYYY-MM>）。
// 容错 fail-closed（防止官方 Key 被刷爆）：官方 Key 未配置 → 503
// official_key_missing；KV binding 缺失或读写失败 → 503
// official_quota_unavailable。自定义模式永不触发这两种错误。
// 本地开发服务器 server.js 用 process.env + 进程内 Map 镜像同一套规则。

export const OFFICIAL_QUOTA_LIMIT = 500;

// 让浏览器 fetch 能读到自定义的 X-Official-Quota-* 响应头。
const EXPOSE_HEADERS = 'X-Official-Quota-Limit, X-Official-Quota-Remaining';
export const QUOTA_EXPOSE_HEADERS = { 'Access-Control-Expose-Headers': EXPOSE_HEADERS };

const BEARER_RE = /^Bearer\s+\S+/;

export function getCustomAuth(request) {
  const auth = request.headers.get('Authorization');
  return auth && BEARER_RE.test(auth) ? auth : null;
}

// 取客户端 IP：CF-Connecting-IP → X-Forwarded-For 首个 → 'unknown' 桶。
export function clientIp(request) {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf && cf.trim()) return cf.trim().slice(0, 64);
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first && first.trim()) return first.trim().slice(0, 64);
  }
  return 'unknown';
}

// 自然月桶名，例如 2026-11。
export function monthBucket(now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function quotaKey(ip, now) {
  return `quota:${ip}:${monthBucket(now)}`;
}

// 桶截止到下月 1 日 00:00（UTC），KV 自动过期。
function monthExpiry(now = Date.now()) {
  const d = new Date(now);
  return Math.floor(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000);
}

function officialBearer(env, provider) {
  const key = provider === 'mimo' ? env.MIMO_OFFICIAL_KEY : env.FISH_OFFICIAL_KEY;
  return typeof key === 'string' && key.trim() ? `Bearer ${key.trim()}` : null;
}

function errResponse(status, error, extraHeaders) {
  return {
    early: new Response(JSON.stringify({ error }), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...QUOTA_EXPOSE_HEADERS,
        ...(extraHeaders || {})
      }
    })
  };
}

// 解析本次请求应使用的 Authorization。返回值：
//   { early: Response }        —— 官方模式不可用（缺 Key / 缺 KV / 超额），
//                                 调用方必须直接返回 early，且不得请求上游。
//   { auth, official, quota }  —— quota 非空表示官方模式，成功后需调
//                                 finalizeQuotaResponse 计数。
// enforceQuota=false 用于 /api/voices：公开列表不检查也不计额度
// （仍要求官方 Key 存在，缺 Key 一律 503）。
export async function resolveApiKey({ request, env, provider, enforceQuota = true }) {
  const custom = getCustomAuth(request);
  if (custom) return { auth: custom, official: false, quota: null };

  const bearer = officialBearer(env, provider);
  if (!bearer) return errResponse(503, 'official_key_missing');
  // 公开列表（/api/voices）传 enforceQuota=false：不检查也不计额度，
  // 避免额度用完的用户打不开选择器。
  if (!enforceQuota) return { auth: bearer, official: true, quota: null };

  const kv = env && env.TTS_QUOTA_KV;
  if (!kv || typeof kv.get !== 'function') return errResponse(503, 'official_quota_unavailable');

  const ip = clientIp(request);
  const key = quotaKey(ip);
  let used;
  try {
    const raw = await kv.get(key);
    used = Number(raw) || 0;
  } catch {
    return errResponse(503, 'official_quota_unavailable');
  }
  if (used >= OFFICIAL_QUOTA_LIMIT) {
    return errResponse(429, 'official_quota_exceeded', {
      'X-Official-Quota-Limit': String(OFFICIAL_QUOTA_LIMIT),
      'X-Official-Quota-Remaining': '0'
    });
  }
  return { auth: bearer, official: true, quota: { kv, key } };
}

// 官方模式成功后计数（best-effort：音频已交付用户，写失败不回滚响应）。
// 返回响应头里的最新剩余额度，供前端展示。
export async function recordOfficialSuccess(quota, now = Date.now()) {
  if (!quota) return null;
  let used = 0;
  try {
    used = (Number(await quota.kv.get(quota.key)) || 0) + 1;
    await quota.kv.put(quota.key, String(used), { expiration: monthExpiry(now) });
  } catch {
    return null;
  }
  return {
    'X-Official-Quota-Limit': String(OFFICIAL_QUOTA_LIMIT),
    'X-Official-Quota-Remaining': String(Math.max(0, OFFICIAL_QUOTA_LIMIT - used))
  };
}

// 成功响应统一出口：官方模式先计数、把最新额度写进响应头；自定义模式原样返回。
export async function finalizeQuotaResponse(response, quota, now = Date.now()) {
  if (!quota) return response;
  const headers = await recordOfficialSuccess(quota, now);
  if (headers) {
    for (const [name, value] of Object.entries({ ...headers, ...QUOTA_EXPOSE_HEADERS })) {
      response.headers.set(name, value);
    }
  }
  return response;
}

# Security headers

Security headers are defined in one place: `next.config.ts` → `headers()`. They
apply to every response (`/:path*`), including API routes and the app-proxied
`/api/media/{id}`. Caddy deliberately does **not** set security headers, so
there is a single policy and no divergence between proxy and app.

## Current policy

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | see breakdown below |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` — **production only** |

CSP directives (production):

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://tile.openstreetmap.org;
font-src 'self' data:;
connect-src 'self';
media-src 'self' blob:;
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
frame-src 'none';
upgrade-insecure-requests
```

Development-only relaxations: `script-src` adds `'unsafe-eval'`, `connect-src`
adds `ws: wss:` (Turbopack HMR). HSTS is omitted outside production so local
HTTP is not pinned.

Admin surfaces also set `X-Frame-Options: DENY` and `Cache-Control: no-store`
for `/:locale/admin/:path*` and `/admin/:path*` as defence in depth.

## Why no nonce

The app is statically cached (`cacheComponents` + `"use cache"`). A per-request
nonce requires dynamic rendering for every page and would defeat that caching
strategy. `'unsafe-inline'` is therefore still present for Next's inline
bootstrap scripts and for Leaflet/next-image style attributes. The policy still
blocks external script origins, plugins (`object-src 'none'`), framing,
`<base>` injection, and cross-origin form posts.

## Verify

```bash
curl -sSI https://<domain>/en | grep -iE \
  'content-security-policy|strict-transport-security|x-content-type-options|x-frame-options|referrer-policy|permissions-policy|cross-origin-opener-policy'

# Admin must not be cacheable
curl -sSI https://<domain>/en/admin | grep -i cache-control   # expect: no-store
```

In local development HSTS must be absent and `'unsafe-eval'` / `ws:` present;
in production the inverse.

## Changing the policy

1. Add the narrowest possible origin/directive — never `*` and never a broad
   `https:` for scripts.
2. Update this document and `tests/` expectations in the same change.
3. Re-run the header check in staging before release.

## Upgrade path (tracked, not yet done)

- Move to a nonce- or hash-based `script-src` if the rendering/caching model
  changes so pages can be dynamic without losing the caching strategy.
- Add Subresource Integrity where third-party assets are introduced.
- Consider a `Content-Security-Policy-Report-Only` rollout plus a reporting
  endpoint before tightening `script-src`.

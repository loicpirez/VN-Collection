# Security audit tasks

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| SECA-001 | CRITICAL | Proxy-enabled outbound requests reuse a proxy agent across redirects without validating every hop. Resolve and reject off-allowlist or private-address targets before each proxied request. | `src/lib/proxy-fetch.ts` | DONE_WITH_DIFF |
| SECA-002 | CRITICAL | Proxy-enabled provider requests bypass the direct `safeFetch` allowlist path on the initial URL. Route both generic and stock proxy wrappers through a validating hop resolver. | `src/lib/proxy-fetch.ts` | DONE_WITH_DIFF |
| SECA-003 | HIGH | Cover and banner source fields accept path-like absolute URLs in code paths that do not consistently apply the SSRF allowlist. Normalize remote inputs through one validated boundary. | `src/lib/files.ts`, `src/app/api/**/image/**` | TODO |
| SECA-004 | HIGH | Public collection listing responses expose private annotation-shaped data, including notes, download URLs, custom descriptions, and physical locations. Define a minimal public DTO or localhost-gate the endpoint. | `src/app/api/collection/route.ts`, `src/lib/db.ts` | TODO |
| SECA-005 | HIGH | Downloaded and uploaded files are served through predictable asset paths without an explicit access boundary. Decide whether assets are private and enforce localhost or token access where required. | `src/app/api/files/[...path]/route.ts`, `src/lib/files.ts` | TODO |
| SECA-006 | MEDIUM | Map geocoding and tiles send collection-derived location data to third parties without a privacy explanation or opt-in. Add an explicit map privacy control and document the network boundary. | `src/components/MapClient.tsx`, `src/app/map/page.tsx` | TODO |
| SECA-007 | MEDIUM | Leaflet marker icons load from `unpkg.com`, adding an undeclared runtime dependency and privacy leak. Bundle marker assets locally. | `src/components/MapClient.tsx` | TODO |

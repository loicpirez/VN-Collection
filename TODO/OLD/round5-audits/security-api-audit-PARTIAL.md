# security-api-audit — agent a46dd3cb0dafac3ea — FAILED/PARTIAL

Agent hit context limit before completing. Partial findings below.

That's a very long list of routes missing `requireLocalhostOrToken`. Let me read each one to determine whether the absence is intentional (read-only public endpoints) or a real missing gate, and simultaneously audit the other security dimensions.

---

Now let me check the unread routes that are mutating (not just read) and any remaining routes with potential error leakage:

---

This confirms `proxy.ts` is NOT `middleware.ts` — Next.js only recognises `middleware.ts` at the project root as middleware. `src/proxy.ts` with an export named `proxy` is never invoked. The CSRF guard is effectively dead code.

---

Good. Settings GET and PATCH both have the auth gate and proper masking. Now let me check the `refresh/scope` route — found it has the auth gate and leaks `resolveScopePatterns` error. Let me also check the `egs/[id]/add` route more carefully:

---

Good — `egs/[id]/add` uses `upstreamError` correctly but is missing auth gate (POST mutates collection). Now let me check the `wishlist/[id]/route.ts` GET handler that leaks part of error message:
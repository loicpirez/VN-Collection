/**
 * Legacy stub — superseded by `src/middleware.ts` (SECA-023).
 *
 * This file was previously named `proxy.ts` under the mistaken belief
 * that Next.js 16 renamed the middleware convention. Next.js still
 * requires the export to be named `middleware` in a file called
 * `middleware.ts`. As a result `proxy.ts` was dead code; the CSRF
 * guard never ran. The active implementation is now at
 * `src/middleware.ts`. This file can be safely deleted; it is kept
 * only to preserve git history context.
 */

/**
 * Shared markers documenting cross-cutting contracts that individual
 * `/api/*` route files opt into. These replace the free-form
 * `// intentionally public` comments that previously carried the same
 * intent but could not be grepped reliably or enforced.
 */

/**
 * Marks a route handler as an intentionally unauthenticated read.
 *
 * This app runs single-user and self-hosted. Read-only GET handlers
 * that return the operator's own collection metadata (lists, series,
 * shelves, saved filters, the reading goal, places, per-VN routes /
 * game-log / owned-release rows, the library view, etc.) are reachable
 * without the localhost/token gate so the UI can render on first paint
 * and so a bookmarked LAN URL keeps working.
 *
 * DATA EXPOSURE (read before adding or relying on this marker). These
 * GET routes return the single operator's personal collection data
 * (titles read, ratings, notes, shelves, saved filters, reading goals,
 * ownership records, etc.) WITHOUT authentication. That trade-off is
 * acceptable ONLY because the documented deployment model is a
 * single-user, self-hosted instance bound to localhost or a trusted
 * LAN. Exposing the app to an untrusted network (the public internet,
 * a shared/hostile Wi-Fi, a reverse proxy without its own auth) would
 * disclose all of this personal collection data to anyone who can
 * reach the port. Do NOT host this app on an untrusted network while
 * these reads remain ungated; if such a deployment is ever required,
 * gate these handlers behind `requireLocalhostOrToken` (or an
 * equivalent upstream auth layer) first. This ESDoc documents the
 * exposure as a deliberate, scoped decision; it does not make the
 * data non-sensitive.
 *
 * Importing this constant into a route module and reading it at the
 * top level is the canonical signal that the GET handler's lack of a
 * `requireLocalhostOrToken` call is deliberate, not an oversight.
 * Every MUTATING handler (POST / PATCH / DELETE) in the same file
 * MUST still gate via `requireLocalhostOrToken`; this marker applies
 * to reads only.
 */
export const PUBLIC_READ_ROUTE = true;

/**
 * Convention reminder for `export const runtime = 'nodejs'`.
 *
 * Any route that reaches the SQLite layer (a direct or transitive
 * import of `@/lib/db`, which loads `better-sqlite3`) MUST pin the
 * Node.js runtime. `better-sqlite3` is a native addon and cannot load
 * under the Edge runtime, so a route that omits this declaration risks
 * being bundled for Edge and failing at request time. Declare
 * `export const runtime = 'nodejs'` in every DB-touching route. Do NOT
 * add it to genuinely edge-safe routes that never touch the database.
 *
 * This constant exists only to give that rule a single documented home;
 * routes still declare `runtime` directly (Next.js reads the literal
 * export, not a re-exported value).
 */
export const NODEJS_RUNTIME = 'nodejs';

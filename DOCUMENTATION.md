# Records Slice — Documentation

## Section 1: What This Is

This is a small slice about ownership: a signed-in user can create projects, see a list of their own projects, open one, and delete it, and can never reach another user's projects by any route. Every project belongs to exactly one user; every read and write of a project carries that user's id inside the database query itself, projects are addressed only by a separate random `public_id` (the internal database `id` never appears in a URL or a response), and every deletion writes an `audit_log` row in the same statement that removes the project. Sign-in uses two seeded test users, alice and bob, so access control can be exercised against two real, distinct accounts from the start.

Deliberately not included: editing a project, search, tags, sharing, dashboard widgets, a landing page, and sign-up, email verification and password reset. Sign-up and verification are left out because this slice only needs a signed-in user, not account creation: the authentication module was ported from `auth-slice` (sign-in, sign-out, sessions, password hashing), which the brief allows, and the rest of that flow was not brought over. The rest are left out because the brief asks only for create, list, view and delete of one owner's records; every extra feature would be another route that has to be proven unable to leak another user's data. Two other things from `auth-slice` were dropped on purpose: rate limiting on sign-in (it needs a table outside the brief's `users` and `sessions`), and the `email_verified_at` column (nothing here would ever set it). The decisions and the exact list of ported files are in `DECISIONS.md`.

## Section 2: How To Run It

**What to install:** Node.js (built and run on v26.3.1; the requirement is Prisma 7.10's, so any Node 20.19+, 22.12+ or 24+ should work), Docker Desktop, and `npm`.

1. Clone the repository and run `npm install`. (The `postinstall` script runs `prisma generate`.)
2. Copy `.env.example` to `.env` and fill in the three values below.
3. Run `npm run db:up`. This starts a PostgreSQL 18 container on host port **5436**, defined in `docker-compose.yml` under the Compose project name `records-slice`, with a volume named `records-slice-pgdata`.
4. Run `npm run db:migrate`. This applies the two migrations in `prisma/migrations/` (`20260930120000_init_records` and `20260930140000_projects_description_length`) and regenerates the Prisma Client.
5. Run `npm run db:seed`. This creates two test users, `alice@example.com` and `bob@example.com`, both with the password `records-slice-test-1`. It is safe to re-run, and it refuses to run against any database that is not on `localhost` or `127.0.0.1`.
6. Run `npm run dev`.
7. Open **http://localhost:3004** and sign in as alice or bob. `/` redirects to `/projects`, which redirects to `/sign-in` if you are not signed in.

| Variable | Where its value comes from |
|---|---|
| `DATABASE_URL` | Fixed local value matching `docker-compose.yml`: `postgresql://records:records@localhost:5436/records`. |
| `APP_URL` | `http://localhost:3004`, matching the port in `package.json`'s `dev` and `start` scripts. Used by `src/lib/security/origin.ts` to reject a write whose `Origin` header is not this app. |
| `AUTH_SECRET` | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. **Currently unused:** nothing in this slice reads it (it was needed in `auth-slice` for hashing email verification codes, which were not ported). It is in `.env.example` because the brief asked for it. |

**Ports.** The app is on 3004, Postgres on 5436 and Prisma Studio (`npm run db:studio`) on 5559, so none of them collide with `auth-slice`, `payment-slice` or `ai-slice`, which use 3001-3003, 5433-5435 and 5555-5558.

**After `prisma generate`, restart `npm run dev`.** `src/lib/db.ts` keeps the Prisma client on `globalThis` so hot reload does not open new connection pools, which means a dev server that was already running keeps serving the old generated client. This caused a real 500 during the build (see `BUILD_LOG.md`).

**Running the access-control script needs a production build.** `npm run check:access` (`scripts/check-access-control.ts`, which writes `docs/evidence/access-control-audit.md`) must run against `npm run build && npm start`, not `npm run dev`. Its central claim is that a wrong-owner request and a nonexistent-id request get an indistinguishable response. In `next dev`, identical requests are not even byte-identical to each other (React debug references and a per-request token change between them), and 403 pages carry a stack trace with local file paths. Ordinary use of the app is unaffected; this is only about comparing responses byte for byte. Start the production server with `APP_URL` and `DATABASE_URL` set in its environment, seed first, and run the script from another terminal. Set `AUDIT_TARGET` to a short description of what is running; it is printed in the report.

**Query counts.** With `npm run dev`, each list, detail, create and delete request logs `[query-count] <action>: <n>` and the SQL behind it to the server console (`src/lib/dev/query-count.ts`). It does nothing outside development.

## Section 3: The Flow, Step By Step

**Sign in.** `src/app/(auth)/sign-in/SignInForm.tsx` validates email and password with `signInSchema` from `src/lib/validation/auth.ts`, then posts to `POST /api/auth/signin` (`src/app/api/auth/signin/route.ts`). The route checks the `Origin` header (`assertSameOrigin`), parses the JSON body with the same `signInSchema`, and looks the user up with `db.user.findUnique({ where: { email } })`. Whether or not that found anyone, it then runs `verifyPassword` (argon2id, `src/lib/auth/password.ts`) against either the user's stored hash or a dummy hash, so an unknown email takes the same time as a wrong password, and both answer `401 INVALID_CREDENTIALS` with the same body. On success `createSession` (`src/lib/auth/session.ts`) stores a row whose `id` is the SHA-256 hash of a random token, sets the raw token in the `records_slice_session` cookie (HttpOnly, SameSite=Lax, expiring with the row's `expires_at`), and the route returns `{ "next": "/projects" }`. The form navigates there with `router.push`, honouring a `?next=` only if `getSafeRedirectPath` accepts it. `src/proxy.ts` runs first on `/projects` and `/projects/:path*`: it checks only that a cookie with the right name exists, and redirects to `/sign-in` if there is none. It never reads the cookie's value, so the real check is in each page and route (below).

**List: `/projects`** (`src/app/projects/page.tsx`). A server component. It calls `getCurrentUser()`, which calls `validateSession()`: one joined query on `sessions` by the hash of the cookie's token, returning the session and only the user's `id`, `name` and `email`. An expired session row is deleted the moment it is presented. With no valid session the page calls `redirect("/sign-in")`. Otherwise it calls `listProjects(user.id)` in `src/lib/projects/queries.ts`, which is `db.project.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: publicFields })`. **The ownership condition is the `where: { userId }` in that one query**; nothing is fetched and filtered afterwards. `publicFields` lists `publicId`, `title`, `description` and `createdAt` explicitly, so the internal `id` cannot leak into the page. With zero projects the page renders "You don't have any projects yet." and a "New project" button; otherwise each row is a `<Link href={`/projects/${project.publicId}`}>`.

**Create: `POST /api/projects`** (`src/app/api/projects/route.ts`). The form is `NewProject.tsx` on the list page, revealed by the "New project" button (the brief lists no create page). The route checks `Origin`, then `validateSession()` (no session: `401 UNAUTHENTICATED`), then parses the body with `createProjectSchema` from `src/lib/validation/projects.ts` (title 1-120 characters after trimming; description optional, up to 2000, and an empty description becomes `null`). The schema has no `user_id` field, so anything a client sends for it is dropped. The route calls `createProject(auth.user.id, parsed.data)`, which is `db.project.create({ data: { userId, title, description }, select: publicFields })`. **The owner is the session's user id**, never a value from the request. It answers `201` with `{ "project": { publicId, title, description, createdAt } }`, and the form goes to `/projects/<publicId>` with `router.push`.

**View: `/projects/[publicId]`** (`src/app/projects/[publicId]/page.tsx`). A server component. No session redirects to `/sign-in`. Otherwise it checks the id's shape with `publicIdSchema` and calls `getProject(user.id, publicId)`, which is `db.project.findFirst({ where: { publicId, userId }, select: publicFields })`: **`public_id` and `user_id` in the same query**, never a lookup by `public_id` alone followed by an owner check. If it returns nothing, the page calls `forbidden()`, which renders `src/app/projects/[publicId]/forbidden.tsx` with HTTP 403 ("This project isn't available to you."). The same page is shown whether the project belongs to someone else, does not exist, or the id is malformed, so it never reveals whether an id exists for another user. (`forbidden()` needs `experimental.authInterrupts` in `next.config.ts`, which is still experimental in Next 16.3.5.) On success it shows the title, the created date and the description, and `DeleteProjectButton.tsx`.

**Delete: `DELETE /api/projects/[publicId]`** (`src/app/api/projects/[publicId]/route.ts`). The first click on "Delete project" only reveals "Delete this project permanently?" with "Yes, delete" and "Cancel"; nothing is sent until "Yes, delete", which calls `fetch` with `DELETE`. The route checks `Origin`, then `validateSession()` (no session: `401`), then `publicIdSchema`, then `deleteProject(auth.user.id, publicId)` in `src/lib/projects/queries.ts`. That function is **one SQL statement**, run with `db.$queryRaw`:

```sql
WITH deleted AS (
  DELETE FROM projects
  WHERE public_id = ${publicId} AND user_id = ${userId}::uuid
  RETURNING public_id, title
)
INSERT INTO audit_log (user_id, action, record_public_id, metadata)
SELECT ${userId}::uuid, 'project.deleted', public_id, jsonb_build_object('title', title)
FROM deleted
RETURNING record_public_id
```

**The ownership check is the `WHERE public_id = … AND user_id = …` of the `DELETE`, and the audit write is the `INSERT … FROM deleted` in the same statement.** The audit row is built from the row the `DELETE` returned, so it cannot exist without the delete and the delete cannot happen without it: both succeed or neither does. A wrong owner, an id that does not exist, or a project that is already gone deletes nothing, inserts nothing, and the route answers `403 FORBIDDEN`. On success it answers `{ "next": "/projects" }` and the browser goes back to the list with `router.push`. (A single statement has no "before" and "after"; the guarantee is atomicity, not ordering. The earlier two-step transaction version, which inserted the audit row first, is recorded in `DECISIONS.md`.)

**Sign out.** `src/components/auth/SignOutButton.tsx` posts to `POST /api/auth/signout`, which deletes the session row and clears the cookie.

## Section 4: The Data Model

Four tables, all defined in `prisma/schema.prisma` and created by `prisma/migrations/20260930120000_init_records/migration.sql`, with one added constraint in `prisma/migrations/20260930140000_projects_description_length/migration.sql`.

- **`users`** (reused from `auth-slice`, minus `email_verified_at`): `id`, `email`, `name`, `password_hash` (an argon2id string), `created_at`, `updated_at`.
- **`sessions`** (reused from `auth-slice`): `id` (the SHA-256 hex hash of the session token, not the token itself), `user_id`, `expires_at`, `created_at`. Expiry is a database column, not a client-side timer.
- **`projects`** (new): one row per record, owned by one user.
- **`audit_log`** (new): one row per deletion.

**`projects`, column by column.**

- `id` (`uuid`, primary key, default `gen_random_uuid()`): the internal key. It is used for the primary key and the foreign-key relationships and is never selected into a page, a URL or a response.
- `public_id` (`text`, not null, unique, default `replace(gen_random_uuid()::text, '-', '')`): the only identifier in URLs and API responses. It is separate from `id` so that exposing it reveals nothing about the internal key, and so the internal key's format could change without breaking any link. The default is a second, independent random value (32 hex characters, 122 random bits), so even a row inserted by raw SQL gets one. The unique index `projects_public_id_key` is what the detail lookup uses.
- `user_id` (`uuid`, not null, foreign key to `users(id)`, `ON DELETE CASCADE`): the owner. Every query about a project filters on it.
- `title` (`text`, not null): constrained by `projects_title_length`.
- `description` (`text`, nullable): optional; constrained by `projects_description_length` when present.
- `created_at`, `updated_at` (`timestamptz`, not null, default `CURRENT_TIMESTAMP`; `updated_at` is also bumped by Prisma on every update through the client).

**`audit_log`, column by column.**

- `id` (`uuid`, primary key, default `gen_random_uuid()`).
- `user_id` (`uuid`, not null): who did it.
- `action` (`text`, not null): what happened, currently only `project.deleted`.
- `record_public_id` (`text`, not null): the deleted project's `public_id`, not its `id`, so the log stays readable after the row is gone and never stores an internal key.
- `metadata` (`jsonb`, nullable): anything extra captured at the moment; currently `{ "title": <the deleted title> }`, read from the deleted row itself.
- `created_at` (`timestamptz`, not null, default `CURRENT_TIMESTAMP`).

**Why `audit_log` has no foreign keys.** A foreign key to `projects` is impossible by design: the project row is gone by the time the audit row matters. A foreign key from `user_id` to `users` was also rejected: with `ON DELETE CASCADE` it would erase the trail when an account is deleted, and without cascade it would block deleting users. So `user_id` and `record_public_id` are plain columns. The cost is that the database does not stop an audit row naming a user that does not exist. There is also no index on the table, because nothing reads it yet.

**The indexes on `projects`.** Besides the primary key, there are two: `projects_public_id_key` (unique, on `public_id`) and `projects_user_id_created_at_idx` (on `user_id, created_at`). The second is for the main query pattern, listing one user's projects newest first, and its leftmost column also serves any lookup by `user_id` alone. A separate single-column index on `user_id` (`projects_user_id_idx`) was in the first version of the schema and was removed before the migration was ever applied, on the owner's instruction: a composite index already covers a `user_id`-only lookup through its first column, so a second index would only add write cost. I have not run `EXPLAIN` against a large table to confirm which index Postgres picks for the list query; that is a design expectation, not a measurement. The other tables have `users_email_key` (unique, on `email`) and `sessions_user_id_idx` (on `user_id`).

**Which constraints make an invalid state impossible?**

- *Two projects with the same public address:* `projects_public_id_key`, unique on `public_id`.
- *A project with an unusable address:* `projects_public_id_format`, `CHECK (public_id ~ '^[A-Za-z0-9_-]{16,64}$')`, so it is non-empty, URL-safe and at least 16 characters.
- *An empty or oversized title:* `projects_title_length`, `CHECK (char_length(title) BETWEEN 1 AND 120)`. `NOT NULL` alone would allow `''`.
- *An oversized description:* `projects_description_length`, `CHECK (description IS NULL OR char_length(description) <= 2000)`.
- *A project with no owner, or an owner who does not exist:* `user_id` is `NOT NULL` and `projects_user_id_fkey` is a foreign key to `users(id)`.
- *A project surviving its owner:* that same foreign key is `ON DELETE CASCADE`, so deleting a user deletes their projects. Note that this database-level cascade does not write `audit_log` rows; no route in this app deletes users.
- *A session with no user, or outliving one:* `sessions_user_id_fkey` is a foreign key to `users(id)` with `ON DELETE CASCADE`.
- *Two accounts with the same address, or visually identical ones:* `users_email_key` (unique) and `users_email_lowercase_trimmed`, `CHECK (email = lower(btrim(email)))`, which stops `Foo@Bar.com` and `foo@bar.com` coexisting.
- *An empty or oversized display name:* `users_name_length`, `CHECK (char_length(name) BETWEEN 1 AND 80)`.
- *Duplicate primary keys:* `users_pkey`, `sessions_pkey`, `projects_pkey`, `audit_log_pkey`.

**What the database does not enforce.** Nothing in the schema says that user A may not read user B's project: there is no row-level security. That rule is held entirely by the queries in `src/lib/projects/queries.ts`, each of which includes the session user's id in its own `WHERE`. `docs/evidence/access-control-audit.md` records 67 attempts to get around it, all refused.

## Section 5: The Concepts

### Authentication versus authorisation

**What it is.** Authentication answers "who is making this request?" — it checks the session is real and belongs to someone. Authorisation is a separate question: "is this *particular* thing theirs?" That has to get asked again for every resource, even once you already know who's asking.

**Why it matters.** Being logged in doesn't mean you're allowed to see everything. If the app only checked that a session existed, any user could open anyone else's project just by guessing its address. Every page and route in this slice needs both checks, and they fail in different ways — a missing session and someone else's project should give different responses (more on that in the status codes section).

**How I built it.** Authentication lives in `validateSession()` (`src/lib/auth/session.ts`) — it hashes the cookie's token, looks up the session row, and returns the user or nothing if it's missing or expired. `src/proxy.ts` does a cheap first pass that only checks a cookie with the right name exists — it never reads the value, so a forged cookie sails through it and gets caught by `validateSession()` instead. Authorisation happens inside the queries themselves, in `src/lib/projects/queries.ts` — each one takes the session user's id and bakes it into the query's own filter.

**What I didn't do, and why.** Trust the proxy check on its own. It's fast and doesn't touch the database, but a cookie's *name* proves nothing about its contents. I wanted the real decision made in one place that actually checks the database. The audit script throws forged, empty, tampered, expired, and signed-out cookies at every route (rows 37–60) — all of them get turned away by the real check, not the proxy.

### Scoping the query vs. checking after the fetch

**What it is.** There are two ways to stop user B from reading user A's project. You can fetch the project by its id and then compare the owner field to the current user in code. Or you can put the owner *in the query itself*, so the database is only ever asked "give me the project with this address that also belongs to me."

**Why it matters.** With fetch-then-check, the dangerous data is already sitting in memory before anything stops it — the only thing standing in the way is a separate line of code that every future route has to remember to write. Skip it once, and the query still runs fine and still hands back someone else's project. A scoped query has no line to forget — a row that isn't yours is never returned to code that asks the question correctly in the first place.

**How I built it.** All four project queries live in `src/lib/projects/queries.ts`:
- `listProjects(userId)` → `where: { userId }`
- `getProject(userId, publicId)` → `where: { publicId, userId }`
- `createProject(userId, …)` takes the owner from the session, never from the request body
- `deleteProject(userId, publicId)` has `WHERE public_id = … AND user_id = …` directly on the DELETE

Every select also names its fields explicitly, so the internal id can't sneak out with a row.

**What I didn't do, and why.** Fetch first, compare after. Beyond the "easy to forget" problem, it has a second cost: the "not yours" case would naturally look different from the "doesn't exist" case, and that difference tells an attacker which ids are real. A scoped query gives the same result either way — zero rows.

It's worth being honest that this isn't a guarantee for the whole app — nothing in the database itself stops someone from writing a new, unscoped query, since there's no row-level security. What I've actually done is keep every project query in one file, where a missing condition is easy to spot. The 67-row audit checks that the queries that exist hold up.

### Insecure direct object references (what happens when someone edits an ID in a URL)

**What it is.** An IDOR is when an app takes an identifier straight from the request — the `4862…` in `/projects/4862…` — and fetches the record without checking whether the requester is allowed to have it. The "attack" is just editing the URL.

**Why it matters.** It's the most obvious thing a curious user tries, and it works against any app that treats "I found a valid id" as "I'm allowed to see it." Every project page here is one address edit away from someone else's data if this isn't handled.

**How I built it.** The defence is the same scoped query from above — not secrecy of the id. I attacked my own routes as bob, targeting alice's real project (`docs/evidence/access-control-audit.md`), trying:
- her real public_id
- her id incremented and decremented
- her id in upper case, and with a trailing space
- her project's raw database id and her raw user id
- SQL-injection and path-traversal strings

Every attempt got a 403, indistinguishable from asking for an id that exists for nobody. Refused DELETE requests were byte-identical, and alice's project was untouched afterward with no audit row written.

**What I didn't do, and why.** Rely on the ids being hard to guess. The public_id is random (122 bits), so guessing is impractical — but that's a bonus, not the actual protection. Ids leak through logs, browser history, shared links, and screenshots, so the app has to stay safe at that moment regardless of how unguessable the id is in theory.

### Why raw database identifiers are never exposed

**What it is.** Every `projects` row has an internal `id`, used for the primary key and relationships. It also has a separate `public_id`, which is the *only* identifier that ever shows up in URLs or API responses. The raw id never gets selected into a page or response.

**Why it matters.** The raw id is an implementation detail. Put it in URLs and it ends up in every bookmark, log, and shared link — and then the database can never change how it identifies rows without breaking all of them. To be fair to myself here: since the public_id is a random v4-style uuid, exposing the raw id wouldn't make guessing any easier — the real reasons are separation and flexibility, not stopping a brute-force attack.

**How I built it.** `public_id` is a column on `projects` with a database default (`replace(gen_random_uuid()::text, '-', '')`), a unique index (`projects_public_id_key`), and a CHECK constraint keeping it URL-safe (`projects_public_id_format`). The queries in `queries.ts` use a `publicFields` list (`publicId`, `title`, `description`, `createdAt`), so the internal id can't leak by accident. `audit_log` stores `record_public_id`, never the raw id. The audit script even tries feeding a project's raw uuid into the URL and the DELETE route directly — it gets the same 403 as any random guess.

**What I didn't do, and why.** Generate the public id in application code with a helper function. That creates a second place a row could end up with a missing or bad value — a raw SQL insert or seed script would have to remember to set it. A database default means every row is valid no matter how it got created.

### Audit logging, and why deletions get recorded

**What it is.** An audit log records things that happened, kept separately from the data they changed. Here, every deletion writes a row to `audit_log`: who did it, what happened (`project.deleted`), the project's public_id, and its title.

**Why it matters.** A delete destroys the evidence of itself. Without a record, "where did my project go?" has no answer. The row gets written at the moment of deletion, because that's the only moment the title is still around to copy.

**How I built it.** `deleteProject()` is one SQL statement — a `DELETE … RETURNING public_id, title` inside a `WITH deleted AS (…)`, followed by an `INSERT INTO audit_log … SELECT … FROM deleted`. The audit row is built directly from the row the delete actually removed, so there's no version of events where a project vanishes with no log row, or a log row exists for a delete that didn't happen. A refused delete — wrong owner, nonexistent, already gone — removes nothing and logs nothing; the audit run confirms no rows get added on any refused attempt, and a real delete by alice adds exactly one.

`audit_log` deliberately has no foreign keys. A key to `projects` is impossible since the row is already gone by the time the log is written. A key to `users` would either wipe the trail when an account is deleted (with cascade) or block deleting users entirely (without).

**What I didn't do, and why.** My first version was a transaction: look the project up, insert the audit row, then delete it. It logs *first*, which matches AGENTS.md's wording ("before the row disappears") most literally. I replaced it with a single statement because it's atomic on its own, needs no separate read, and is simpler to reason about — the trade-off is that a single statement has no real "before" and "after," so the guarantee becomes "both happen or neither does," not a strict order. The transaction version is still in DECISIONS.md if a reviewer wants to see the literal-order approach.

Not covered: creates aren't logged, and a database-level cascade (deleting a user removes their projects) writes no audit rows — no route in this app deletes users anyway.

### Page architecture: conditional rendering with URL state

**What it is.** Two ideas that have to work together. Conditional rendering means a page shows the right thing for the situation — an empty-state message instead of a blank list, a forbidden view instead of a project, a confirm step before deleting. URL state means the view you're looking at is part of the address, so `/projects` and `/projects/<publicId>` are each real, separate URLs.

**Why it matters.** URL state gives you a back button that actually works, links you can share or bookmark, a refresh that lands you back where you were — and, for this slice, a place where the server can re-check who's asking on *every* view, because every view is its own request. Conditional rendering is what makes each of those URLs show something true: a new user sees "You don't have any projects yet," not an empty table; someone hitting a project that isn't theirs sees a clear "not available" page, not something broken.

**How I built it.** `src/app/projects/page.tsx` is the list, `src/app/projects/[publicId]/page.tsx` is the detail — both server components that check the session server-side. Moving between them uses `<Link>` and `router.push`, so transitions are client-side and don't reload the page. I verified that in real Chrome by setting a marker on `window` before each navigation and confirming it survived, plus checking the URL bar after each step. The empty state, the 403 page (`forbidden.tsx`), and the delete confirmation are all conditional renders.

Two things I'll flag as *not* URL state: the "New project" form and the two-step delete confirmation are component state — refresh while either is open and it closes. I accepted that because the brief doesn't list a create page, and a `/projects/new` route would just be one more thing to protect.

**What I didn't do, and why.** Build a custom single-page router — the App Router already handles client-side navigation with real URLs, and a hand-built version would just be more code to get wrong. I also skipped `window.confirm()` for delete, since it can't be styled, browsers can suppress it, and it's awkward to test.

### Status codes: 401 vs. 403

**What it is.** 401 means "I don't know who you are" — no session, or one that's forged, expired, or signed out. 403 means "I know exactly who you are, and the answer's still no."

**Why it matters.** They tell a client different things to do — 401 means go sign in, 403 means signing in again won't help. Mixing them up also leaks information: returning 403 for an id that doesn't exist and 404 for one that belongs to someone else would let a stranger sort real ids from fake ones just by the status code.

**How I built it.** API routes return `401 UNAUTHENTICATED` when `validateSession()` finds nothing, and `403 FORBIDDEN` when the scoped query comes back empty for that user. Pages can't hand a browser a bare 401 and expect anything sensible to happen, so a missing session redirects to `/sign-in` instead, as the brief asked for — while a signed-in user hitting an address with no matching project gets an actual HTTP 403 page via `forbidden()` (needs Next's experimental `authInterrupts` flag). The important design choice: "someone else's," "doesn't exist," and "malformed id" all get the exact same 403, with identical wording — the status code never tells anyone whether an id is real.

**What I didn't do, and why.** Use 404 for the not-yours case — a common and defensible choice on its own. The brief asked for a 403-equivalent, so I followed it, and made sure the 403 doesn't leak existence by using it for nonexistent ids too. I also skipped 400 for a malformed id, since that would create a second, distinguishable response for what's really the same category of mistake.

### Database indexing

**What it is.** An index is a sorted lookup structure the database keeps alongside a table so it can find rows without scanning the whole thing. It speeds up reads and slows down writes a little, since the index has to be kept up to date too.

**Why it matters.** The main thing this app does is "show me this user's projects, newest first," and basically every action looks projects up by owner. Without an index on the owner column, Postgres would have to read every project in the table just to answer that.

**How I built it.** Besides the primary key, `projects` has two indexes: `projects_public_id_key`, the unique index on `public_id` (which also guarantees no two projects share an address), and `projects_user_id_created_at_idx`, on `(user_id, created_at)` — built for exactly the list query: filter by owner, sort by date. Since it leads with `user_id`, it also serves any lookup by owner alone.

**What I didn't do, and why.** Add a separate single-column index on `user_id`. It was in my first schema, and I took it out after a review comment pointed out that the composite index already covers a `user_id`-only lookup through its leading column — so a second index would've been pure write cost with no read benefit. It never made it into the actual migration. I also didn't index `audit_log`, since nothing reads from it yet.

One honest limit: I haven't measured any of this. With only a handful of rows, Postgres would just scan the table regardless, and I haven't run `EXPLAIN` against a large one — so "this index gets used for the list query" is a design expectation, not something I've actually verified.

### Query count as a cost

**What it is.** Every query is a round trip to the database — its own latency, its own connection, its own chance to fail. So the *number* of queries an action makes is part of what it costs, even when each individual query looks cheap.

**Why it matters.** Costs you can't see are costs you don't fix. I only caught the worst one here because I actually counted.

**How I built it.** In development, `src/lib/dev/query-count.ts` records every SQL statement Prisma sends and logs `[query-count] <action>: <n>` along with the SQL, for list, detail, create, and delete. I measured the first natural version of each, then optimised. Counts include the session lookup.

| Action | First version | Final | The action's own queries |
|---|---|---|---|
| List | 3 | 2 | 1 → 1 |
| Detail | 3 | 2 | 1 → 1 |
| Create | 3 | 2 | 1 → 1 |
| Delete | 6 | 2 | 4 → 1 |

Two things actually came out of counting this. First, the session lookup was costing two queries on every single request — one for the session, one for its user — even though a comment carried over from auth-slice claimed it was one. That comment had never been true; nobody had checked. Turning on Prisma's `relationJoins` preview feature and using `relationLoadStrategy: "join"` in `validateSession()` brought it down to one. Second, delete went from four statements (find, audit insert, delete, commit) down to the single statement described in the audit logging section.

List, detail, and create were already one query each, so their only real improvement came from the session lookup fix — I'm not claiming more than that.

**What I didn't do, and why.** Leave the session lookup alone because "it worked." It wasn't a correctness bug, but it was quietly doubling the cost of the simplest possible request. I also didn't measure time — these are statement counts from the dev log, not latency numbers. The counter only sees what Prisma logs, which doesn't report `BEGIN`, so the true count for the first delete version was actually one higher than shown here, and I haven't verified that on the Postgres side.

## Section 6: What Went Wrong

I trusted things the agent told me without checking. The clearest example: `validateSession()` came with a comment saying the session and its user were fetched in one query. I believed it and moved on. It was only when a query counter was added — logging the actual number of database calls per request — that it turned out to be two queries, not one, on every single authenticated request.

The same pattern happened with an index. The brief asked for both a single-column index on `user_id` and a composite one on `(user_id, created_at)`. The agent's own notes said the single-column one was probably redundant, since the composite index already covers that lookup through its leading column — but it built both anyway, because the brief named them. I didn't catch that reasoning until I reviewed the schema myself; it was sitting there the whole time, I just hadn't looked.

What I take from both: a claim ("this is one query," "this is probably redundant") isn't the same as a check. I didn't verify either one myself — I only found out because something else (a counter, a review pass) forced the number in front of me.

## Section 7: What This Slice Does Not Handle

**Multi-tab / stale-state deletes.** If a project is open in two tabs and gets deleted from one, the other tab doesn't know that happened. Clicking delete there returns "This project isn't available to you" — which reads like a permissions error, even though the real cause is just that it's already gone. That's a confusing message for a completely normal situation.

**Silent slow-network failures.** The delete button shows "Deleting…" and create shows "Please wait…", but neither tells the user anything if the request is taking unusually long or has actually failed. On a bad connection, someone could sit looking at "Deleting…" with no way to tell whether it's still working or stuck.

Neither of these is a security hole — they're honesty-with-the-user gaps. The app doesn't lie, but it also doesn't distinguish "you're not allowed" from "this already happened" or "this is still loading" from "this silently died."

## Section 8: If I Built This Again

I'd change how I work with the agent, not just what it builds. Specifically: I'd ask it to flag, at the moment it makes a decision, anything it's unsure about or is only doing because the brief said so — rather than leaving that reasoning in notes I only read during a later review. The redundant index is the clearest example: the agent had already worked out it was probably unnecessary, and that reasoning existed before I ever looked at the schema. If it had surfaced that doubt when it made the decision, I'd have caught it immediately instead of after the fact.

I'd also ask for evidence, not just a claim, before accepting "this works" — the same way the query counter is what actually exposed the session-lookup issue. A number I can check beats a comment I have to trust.

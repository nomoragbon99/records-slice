# Build Log

Append-only. Every error, surprise or wrong assumption during the build. Raw material for DOCUMENTATION.md.

### Python not installed: could not script-edit the migration SQL (2026-09-30 12:00)
- Symptom: `python - <<EOF ...` → "Python was not found; run without arguments to install from the Microsoft Store". The migration file was left unchanged (still had Prisma's `CREATE SCHEMA IF NOT EXISTS "public";` header and no CHECK constraints).
- Investigation: confirmed via the output that the script never ran, and re-read the head of migration.sql to check nothing was half-written. Nothing was.
- Cause: this machine has only the Microsoft Store shim for `python`, not an interpreter. I assumed one existed.
- Fix: made the same edits with the editor tool and a shell heredoc. No global install was made.
- Commit: (not committed yet)

### My sed edit left a duplicate "-- CreateIndex" header in the migration (2026-09-30 13:10)
- Symptom: after deleting the `projects_user_id_idx` statement with `sed '/projects_user_id_idx/,+1d'`, migration.sql had two consecutive `-- CreateIndex` comment lines above `projects_user_id_created_at_idx`.
- Investigation: printed lines 44-66 of the file to look at it before applying anything. Also checked schema.prisma: my first sed there removed the right `@@index([userId])` (Project's, not Session's), but left the old comment above `@@index([userId, createdAt])` describing two indexes.
- Cause: the range delete removed the statement and its trailing blank line but not the comment line before it. The comment was only cosmetic, but the migration had not been applied yet.
- Fix: removed the duplicate header, rewrote the schema comment, ran `prisma validate` and `grep projects_user_id_idx -r prisma` (no matches) before applying.
- Commit: (not committed yet)

### `prisma migrate dev` did not return within 180 s, but had applied the migration (2026-09-30 13:14)
- Symptom: the shell tool moved `npx prisma migrate dev | tail -15` to the background after 180 s with no output.
- Investigation: queried the database directly: `_prisma_migrations` had `20260930120000_init_records` with `finished_at` set, and `\d projects` showed the expected columns, the composite index only, and both CHECKs. `prisma migrate status` reported "Database schema is up to date!". `prisma generate` then finished in 57 ms, and `src/generated/prisma/models/` had all four models. I did not find out why the command itself hung; nothing in the output file explained it.
- Cause: unknown. Not investigated further because the end state is verified correct; the pipe into `tail` hides any interactive prompt, which is one possibility.
- Fix: none needed for the database. Ran `prisma migrate status` and `prisma generate` separately with a timeout instead of re-running `migrate dev`.
- Commit: (not committed yet)

### One giant shell command failed to parse, so none of it ran (2026-09-30 14:35)
- Symptom: `bash: -c: line 175: unexpected EOF while looking for matching quote` and exit code 2, from a single command that wrote eight files and edited three configs with sed.
- Investigation: assumed some of it might have run; `ls src/app/projects "src/app/projects/[publicId]"` showed only an empty `[publicId]` directory, so nothing after the parse point had executed. Did not find the exact offending quote. The same thing happened again later with a large heredoc that appended to these two log files, so long heredocs with prose in them are unreliable in this shell.
- Cause: bash parses the whole script before running any of it; one unbalanced quote invalidated all of it.
- Fix: wrote the page and component files, and these log entries, with the file-writing tool instead, and did the small edits (next.config.ts, proxy.ts matcher, signin `next`) in separate short commands.
- Commit: (not committed yet)

### A leftover connection from the earlier hung `prisma migrate dev` held the migration lock (2026-09-30 15:07)
- Symptom: `prisma migrate deploy` → "Timed out trying to acquire a postgres advisory lock (SELECT pg_advisory_lock(72707369)). Timeout: 10000ms."
- Investigation: `select ... from pg_stat_activity` showed pid 1629, state idle, started 14:24:40, last query `DROP DATABASE IF EXISTS "prisma_migrate_shadow_db_..."` (the shadow-database cleanup that `migrate dev` runs last), plus pid 5402 waiting on the lock. Checked for a live prisma node process with wmic; none found. The migration lock is session-level, so it stays held while that connection lives.
- Cause: this is the answer to the "cause unknown" in the earlier entry about `migrate dev` not returning: that process got stuck after its final cleanup query and kept its connection (and the lock) open.
- Fix: `pg_terminate_backend(1629)` (a connection to this repo's own database only), then `migrate deploy` applied `20260930140000_projects_description_length`. Verified the CHECK exists with `\d projects`.
- Commit: (not committed yet)

### Wrong claim in ported code: "one query fetches the session together with its user" (2026-09-30 15:05)
- Symptom: the first query-count run showed the session lookup as TWO statements (`SELECT ... FROM sessions ...` then `SELECT ... FROM users WHERE id = $1`), so every page and route cost one query more than expected: list 3, create 3, detail 3, delete 6.
- Investigation: read the SQL Prisma logged for `db.session.findUnique({ include: { user: ... } })`. Tried `relationLoadStrategy: "join"` directly: `tsc` failed with "Type 'string' is not assignable to type 'never'". Searched the generated client and @prisma/client for the option (nothing), then the prisma CLI bundle, which only adds it to the generated types when the `relationJoins` preview feature is on.
- Cause: in Prisma 7.10 with this adapter the default relation strategy is a separate query, and `relationJoins` is still a preview feature. The comment "One query fetches the session together with ..." was copied from auth-slice and was never true there either; nobody had counted.
- Fix: added `previewFeatures = ["relationJoins"]` to the generator in schema.prisma, regenerated, and set `relationLoadStrategy: "join"` in `validateSession` (src/lib/auth/session.ts). It now runs one LEFT JOIN LATERAL statement. Corrected the comment. auth-slice is untouched and still has both the two queries and the comment.
- Commit: (not committed yet)

### Dev server kept the old Prisma client after `prisma generate` (2026-09-30 15:08)
- Symptom: after enabling the preview feature, /projects and /projects/<id> returned 500: "Unknown argument `relationLoadStrategy`". The delete from the same run still executed the OLD code path (6 queries).
- Investigation: the error trace pointed at session.ts:60, which was current; `prisma generate` had reported success; the running server had been started before it.
- Cause: db.ts caches the Prisma client on globalThis for hot reload, so the already-running process kept the old generated client in memory.
- Fix: stopped `npm run dev` and started it again. Restart the dev server after every `prisma generate`.
- Commit: (not committed yet)

### Creating a project with no description failed validation (2026-09-30 15:20)
- Symptom: the browser check timed out waiting for the redirect after "Create project" with the Description box left empty.
- Investigation: the same flow with a description passed. The form's default value for description was `null`, and the schema was `z.string()...optional()`, which accepts `undefined` but not `null`.
- Cause: I set the form default to `null` to match the schema's output type, but the schema's input side did not accept `null`.
- Fix: schema uses `.nullish()` (so an API client sending `null` also works) and the form default is `""`. Both become `null` in the database.
- Commit: (not committed yet)

### My focus-visible check reported a false failure (2026-09-30 15:35)
- Symptom: `focus-visible style renders on a button -- none` in the browser check.
- Investigation: the check used `element.focus()` from script right after mouse clicks, which does not always match `:focus-visible`. Re-ran with real Tab presses on the sign-in page: `:focus-visible` matched and the computed box-shadow was a 2 px white offset plus a 2 px blue ring.
- Cause: the test, not the app. Keyboard focus was only re-checked on the sign-in page, not on the projects pages; they use the same FOCUS_RING class.
- Fix: removed that check from the click-driven script.
- Commit: (not committed yet)

### Projects and detail pages only had a background on the narrow column (2026-09-30 15:40)
- Symptom: screenshot of /projects showed white gutters either side of a grey centre column.
- Cause: `bg-gray-50` was on the `max-w-2xl` main element, not on a full-width wrapper.
- Fix: wrapped both pages in a full-width `min-h-screen bg-gray-50` div.
- Commit: (not committed yet)

### First access-control audit run: 15 of 66 rows failed, none because of an application bug (2026-09-30 17:10)
- Symptom: `check-access-control.ts` against `npm run dev` reported 51/66 pass. Failing rows: #4-6 (query-string attacks on /projects, "leaks: 1"), #7 (bob requests alice's real id, page text check), #17 (id with trailing %20, "leaks: 1"), and #38-42 and #50-54 (every page row for forged/empty/tampered/expired/signed-out cookies).
- Investigation, one failure group at a time, each checked by reading the actual response:
  - #4-6 and #17: the "leak" found was the attacker's own input echoed back. Next.js writes the requested URL and query string into the page payload, so `?user_id=<alice's id>` appears in bob's own page. Confirmed by removing the typed value before searching: 0 leaks. Also confirmed alice's title, description, email and project ids were absent.
  - #7: the check looked for "isn't available to you" in the visible text, but the 403 view's text is inside the RSC script payload (and `'` is HTML-escaped in markup), so a tag-stripped text search cannot see it. `grep` on the raw body found it.
  - #38-42 and #50-54: my pass condition required a redirect body under 400 bytes. The proxy's redirect (no cookie) is empty, but with a cookie present the redirect comes from the page, and the dev server sends a 16 KB error shell around it. I read that body: it holds only the requested path and `NEXT_REDIRECT;replace;/sign-in`, no project data. The size limit was wrong, not the app.
  - After fixing those, two "identical response" comparisons still failed (#15-#17, #61-62). Repeating the same request showed dev-mode output is not byte-stable: React debug row references (`68:D"$a3"`) and a per-request `self.__next_r` token change between identical requests. Switched the evidence run to a production build (`npm run build`, `npm start`), where repeated requests are stable (same hash three times).
  - One more, only `/projects/abc`: its page differs from a 32-character id's page, and so does an 8-character one, yet two different ids of the same length match. Next.js writes the requested path into the payload with length prefixes, so the pages differ by the length of what the caller typed. That reveals nothing about anyone's data. Each guess is now compared with a nonexistent id of the same length.
- Cause: my test harness made five wrong assumptions about what a Next.js response contains. I found no row where another user's data was returned, changed or deleted, so there was no scoped-query bug to fix and I made no change to any query.
- Fix: the harness strips the caller's own input before searching for leaks, matches the 403 text in the raw body, dropped the body-size criterion, strips `__next_r`, compares against same-length ids, and runs against a production build. Also, `tsc` (via `npm run typecheck`) rejected the BigInt literals (`1n`) I used to increment ids, because this project targets ES2017; tsx ran them fine, so I only saw it from the type check. Replaced with `BigInt(1)`.
- Final: 67 of 67 rows pass on the production build, and the repeat of the whole run after `TRUNCATE` + seed gave the same result.
- Observation, not an app bug: in `next dev`, a 403 page's HTML includes a stack trace with local file paths. The production build's 403 body has none (0 matches for "Users" in the body). Nothing to do beyond never deploying `next dev`.
- Commit: (not committed yet)

### Screenshots: desktop capture included slivers of other windows, and Studio's table was clipped (2026-09-30 17:58)
- Symptom: the first address-bar screenshot (`project-detail-public-id-url.png`, captured from the desktop because headless screenshots have no browser chrome) showed a few pixels of other windows along the left and bottom edges. The first Prisma Studio screenshot cut off the `metadata` and `user_id` columns.
- Investigation: viewed both images. The Chrome window's outer size reported by the page is larger than the visible window once maximised borders are accounted for, so the capture rectangle overran it. Studio's table is wider than a 1400 px viewport.
- Cause: the capture rectangle came from `window.outerWidth/outerHeight`, and I did not crop or look before keeping it; I used a narrow viewport for Studio.
- Fix: cropped the address-bar image to the window's visible area (x 9, y 0, 1082 x 749) and checked it again; re-took the Studio shot at 2000 px wide so every column is readable. Also `curl` to Studio returned nothing for about 20 s after start (exit 7) because it takes that long to come up; waited and retried.
- Commit: (not committed yet)

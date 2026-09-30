# AGENTS.md: Records Slice (owned records, access control, audited deletion)

## What this repository is
A graded "slice": one working set of user-owned records, built properly, with nothing around it. A reviewer reads the code and DOCUMENTATION.md, then asks the owner to defend decisions line by line. Optimise for correctness and explainability, not cleverness or feature count. The owner is new to engineering: explain reasoning in plain language in every plan.

## Scope: build ONLY what this assessment's brief asks for
Authentication is ported from auth-slice (the brief allows this): sign-in only, no sign-up, no email verification, no password reset. Everything else is the records domain the brief describes. If something seems useful but is not in the brief, do not build it: add one line under "Deliberately excluded" in DECISIONS.md.

## Stack
Next.js App Router + TypeScript (strict), Prisma + PostgreSQL (Docker Compose locally), Tailwind CSS, Zod, React Hook Form, @node-rs/argon2.
Use current stable versions. Before writing version-sensitive code (the Next.js request interceptor file name, async cookies()/headers(), Prisma config and client generation, Tailwind setup), check the INSTALLED version and its official docs. Never rely on memory of older versions.

## Folder conventions
- src/app/(auth)/            pages: sign-in
- src/app/dashboard/         placeholder page for the signed-in user
- src/app/api/**/route.ts    all mutations (Route Handlers, callable with curl)
- src/lib/validation/        Zod schemas shared by client and server
- src/lib/auth/              password.ts, tokens.ts, session.ts
- src/lib/http.ts            JSON response and error helpers
- src/lib/db.ts              Prisma client singleton
- src/config/auth.ts         every tunable value
- scripts/                   seed and check scripts
- docs/evidence/             evidence outputs and screenshots

## Engineering rules
1. Every input schema is declared ONCE in src/lib/validation and imported by the API route (authoritative) and the client form (feedback only). No hand-written checks scattered through handlers.
2. All mutations are Route Handlers under src/app/api. No Server Actions.
3. All tunables (session lifetime, hashing parameters, length limits) live in src/config/auth.ts. No magic numbers in handlers.
4. One error response shape: { "error": { "code": string, "message": string, "fields"?: Record<string, string[]> } }. Status codes: 400 validation, 401 unauthenticated, 403 forbidden (e.g. foreign Origin), 404 not found (also used for records that exist but belong to someone else), 409 conflict, 429 rate limited WITH a Retry-After header in seconds, 500 unexpected (generic message; details only in server logs).
5. Random secrets (session tokens) come from Node's crypto module, never Math.random. Store only SHA-256 hashes of tokens.
6. CHECK constraints Prisma cannot express are added by editing migration SQL created with `prisma migrate dev --create-only`, then applying it.
7. Raw SQL only through parameterised Prisma queries ($queryRaw tagged templates). Never string concatenation.
8. Small functions named for what they do. Comment the WHY, not the WHAT.

## Ownership and audit: non-negotiable
- Every database query that touches user-owned data scopes by the authenticated user's id INSIDE the query itself (`where: { publicId, userId }`, `updateMany`/`deleteMany` with `userId` in the filter). Never fetch a row and then check its owner afterwards: that pattern leaves a gap, and it tells a caller who does not own a row that it exists.
- Never expose a raw database primary key (`id`) in a URL or API response. Records are addressed by `public_id` only. Select response fields explicitly; never return a whole row.
- Every deletion writes an audit_log row in the SAME transaction, before the row disappears. If the audit write fails, the delete does not happen.

## Other projects on this machine
The owner has other projects using Docker, PostgreSQL and Prisma. Never run `docker system prune`, `docker volume prune`, `docker compose down -v`, or any command that stops, removes or modifies containers, volumes or databases not defined in THIS repository's docker-compose.yml. Never install or upgrade anything globally without asking.
Ports used by this slice: app 3004, Postgres 5436, Prisma Studio 5559. (3001-3003, 5433-5435 and 5555-5558 belong to auth-slice, payment-slice and ai-slice.)

## Secrets: non-negotiable
- Never touch `.env` directly: do not create, open, read, print or edit it. Maintain only `.env.example` with commented placeholders. When a command needs a value, pass it through the shell environment for that one command.
- If a new environment variable is needed, add it to .env.example with a comment saying where the value comes from, then STOP and tell the owner to add the real value by hand.
- Never hardcode keys, echo them in output, or commit them.

## How to work
1. Every task starts with an implementation plan: files to create or change, what each one is for in plain English, and risks. Wait for approval before implementing.
2. After implementing, VERIFY: run typecheck and lint, run the app, exercise the change with curl or the browser. Never claim something works without running it.
3. Commit after each completed task using Conventional Commits (feat:, fix:, chore:, docs:, test:). Small incremental commits. Push when a remote exists. Never commit .env.
4. BUILD_LOG.md is append-only. For every error, failed command, unexpected behaviour or wrong assumption of your own, append:
   ### <short title> (<date and time>)
   - Symptom: exact error text or observed behaviour
   - Investigation: everything you checked, INCLUDING checks that turned out irrelevant
   - Cause:
   - Fix:
   - Commit: <hash>
   Never delete, merge or tidy earlier entries. Specific and honest beats polished.
5. DECISIONS.md: whenever you choose between alternatives, append: Decision / Chosen / Rejected and why / Files.
6. End every task with: (a) files changed, (b) how the owner can verify it manually, (c) three to five plain-language notes on the concepts involved.

## Commit conventions
- Never add AI attribution anywhere: no "Co-Authored-By: Claude" or any other AI co-author trailer or "generated with" line in commit messages, and no AI attribution in code comments or docs.
- Commits are authored as the repo owner only.

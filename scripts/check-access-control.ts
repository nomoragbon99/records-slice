// Access-control audit: alice and bob are the two real users. Every row below is one attempt made over
// real HTTP against the running dev server, judged against "no cross-user access is possible", and the
// results are written to docs/evidence/access-control-audit.md.
//
// Needs the app running on port 3004 (`npm run dev`, or a production build with `npm run build && npm start`) and the
// seeded users (`npm run db:seed`). Set AUDIT_TARGET to a short description of what is running; it goes in the report.
// Run with: npm run check:access   (loads DATABASE_URL from .env via `tsx --env-file=.env`)
//
// It talks to the database directly only to (a) look up internal ids to use as attack input, (b) plant
// an expired session, and (c) check afterwards that nothing was deleted or audited by a failed attempt.
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateSessionToken, sha256Hex } from "../src/lib/auth/tokens";
import { authConfig } from "../src/config/auth";

const BASE = process.env.APP_URL ?? "http://localhost:3004";
const COOKIE_NAME = authConfig.session.cookieName;
const PASSWORD = "records-slice-test-1";
const OUT = "docs/evidence/access-control-audit.md";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Res = { status: number; location: string | null; contentType: string | null; body: string };
type Opts = { cookie?: string; headers?: Record<string, string>; json?: unknown };

async function http(method: string, path: string, opts: Opts = {}): Promise<Res> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie !== undefined) headers.Cookie = opts.cookie;
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    redirect: "manual",
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  };
}

const cookieFor = (token: string) => `${COOKIE_NAME}=${token}`;

async function signIn(email: string): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (response.status !== 200) throw new Error(`sign-in as ${email} failed: ${response.status}`);
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!setCookie) throw new Error("no session cookie in sign-in response");
  return setCookie.split(";")[0].slice(COOKIE_NAME.length + 1);
}

// A response may echo back the URL or query string the CALLER typed (Next.js puts the request path in
// its payload). That is the attacker's own input, not data they learned, so it is removed before
// checking for leaks.
function withoutInput(text: string, ...inputs: string[]): string {
  let out = text;
  for (const input of inputs) {
    for (const form of new Set([input, safeDecode(input), encodeURIComponent(input), encodeURIComponent(safeDecode(input))])) {
      if (form) out = out.split(form).join("");
    }
  }
  return out;
}
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// A page response reduced to what is the same for every caller: the requested id is removed and Next's
// per-request random token (self.__next_r) is dropped. Two responses that are equal after this are
// indistinguishable to whoever asked.
const canon = (body: string, id: string) => withoutInput(body, id).replace(/__next_r="[^"]*"/g, "");

// Same-length neighbours of a public_id, made by treating it as one big hex number.
function neighbour(id: string, delta: number): string {
  return (BigInt(`0x${id}`) + BigInt(delta)).toString(16).padStart(id.length, "0");
}

type Row = { method: string; path: string; attempt: string; observed: string; pass: boolean };
const rows: Row[] = [];
function record(method: string, path: string, attempt: string, observed: string, pass: boolean) {
  rows.push({ method, path, attempt, observed, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  #${rows.length} ${method} ${path} -- ${attempt}`);
  if (!pass) console.log(`      observed: ${observed}`);
}

const short = (id: string) => `${id.slice(0, 8)}…`;

async function main() {
  // ---------- setup: two real sessions, one project each, created through the API ----------
  const aliceToken = await signIn("alice@example.com");
  const bobToken = await signIn("bob@example.com");
  const aliceCookie = cookieFor(aliceToken);
  const bobCookie = cookieFor(bobToken);

  const aliceUser = await db.user.findUniqueOrThrow({ where: { email: "alice@example.com" } });
  const bobUser = await db.user.findUniqueOrThrow({ where: { email: "bob@example.com" } });

  const ALICE_TITLE = "Alice confidential plan";
  const ALICE_DESC = "alice-only-description-7f3a";
  const created = await http("POST", "/api/projects", { cookie: aliceCookie, json: { title: ALICE_TITLE, description: ALICE_DESC } });
  const alicePid: string = JSON.parse(created.body).project.publicId;
  const bobCreated = await http("POST", "/api/projects", { cookie: bobCookie, json: { title: "Bob own project" } });
  const bobPid: string = JSON.parse(bobCreated.body).project.publicId;
  const aliceProject = await db.project.findUniqueOrThrow({ where: { publicId: alicePid } });

  const leaks = (text: string, ...inputs: string[]) => [ALICE_TITLE, ALICE_DESC, alicePid, aliceProject.id, aliceUser.id, "alice@example.com"].filter((s) => withoutInput(text, ...inputs).includes(s));
  const aliceIntact = async () => {
    const p = await db.project.findUnique({ where: { publicId: alicePid } });
    return !!p && p.title === ALICE_TITLE && p.description === ALICE_DESC && p.userId === aliceUser.id;
  };
  const auditCount = () => db.auditLog.count();

  console.log(`setup: alice project ${short(alicePid)}, bob project ${short(bobPid)}\n`);

  // ---------- controls: the attack setup is valid, and each user sees only their own ----------
  {
    const r = await http("GET", `/projects/${alicePid}`, { cookie: aliceCookie });
    record("GET", "/projects/[publicId]", "CONTROL: alice opens her own project with her real public_id",
      `${r.status}; page shows her title and description`, r.status === 200 && r.body.includes(ALICE_TITLE) && r.body.includes(ALICE_DESC));
  }
  {
    const r = await http("GET", "/projects", { cookie: aliceCookie });
    record("GET", "/projects", "CONTROL: alice lists her projects",
      `${r.status}; her project is listed, bob's is not`, r.status === 200 && r.body.includes(ALICE_TITLE) && !r.body.includes("Bob own project"));
  }

  // ---------- GET /projects as bob ----------
  {
    const r = await http("GET", "/projects", { cookie: bobCookie });
    record("GET", "/projects", "bob lists his projects",
      `${r.status}; shows his own project; none of alice's title, description, public_id or ids appear (leaks: ${leaks(r.body).length})`,
      r.status === 200 && r.body.includes("Bob own project") && leaks(r.body).length === 0);
  }
  for (const [label, qs] of [
    ["user_id query parameter set to alice's internal user id", `user_id=${aliceUser.id}`],
    ["userId query parameter set to alice's internal user id", `userId=${aliceUser.id}`],
    ["owner query parameter set to alice's email", `owner=alice@example.com`],
  ] as const) {
    const r = await http("GET", `/projects?${qs}`, { cookie: bobCookie });
    record("GET", "/projects?…", `bob adds ${label}`,
      `${r.status}; still bob's list only (leaks: ${leaks(r.body, qs.split("=")[1]).length})`, r.status === 200 && leaks(r.body, qs.split("=")[1]).length === 0 && r.body.includes("Bob own project"));
  }

  // ---------- GET /projects/[publicId] as bob: real id, neighbours, guesses, raw ids, junk ----------
  const refPage = await http("GET", `/projects/${alicePid}`, { cookie: bobCookie });
  const refText = canon(refPage.body, alicePid);
  record("GET", "/projects/[publicId]", "bob requests alice's project with her REAL public_id (taken from her session)",
    `${refPage.status}; page carries the 403 "Project not available" view and no project data; leaks: ${leaks(refPage.body, alicePid).length}`,
    refPage.status === 403 && refPage.body.includes("This project isn't available to you") && leaks(refPage.body, alicePid).length === 0);

  const pageGuesses: [string, string][] = [
    ["alice's public_id + 1 (incremented)", neighbour(alicePid, 1)],
    ["alice's public_id − 1 (decremented)", neighbour(alicePid, -1)],
    ["public_id-shaped random string that exists for nobody", "0123456789abcdef0123456789abcdef"],
    ["alice's public_id in UPPER case", alicePid.toUpperCase()],
    ["alice's project's raw database id (uuid primary key)", aliceProject.id],
    ["alice's raw user id (uuid)", aliceUser.id],
    ["SQL-injection string as the id (' OR '1'='1)", encodeURIComponent("' OR '1'='1")],
    ["path traversal as the id (..%2F..%2Fprojects)", "..%2F..%2Fprojects"],
    ["too-short id (abc)", "abc"],
    ["alice's public_id with a trailing space (%20)", `${alicePid}%20`],
  ];
  for (const [label, id] of pageGuesses) {
    const r = await http("GET", `/projects/${id}`, { cookie: bobCookie });
    // Next.js writes the requested path into the page payload with length-prefixed rows, so two pages
    // differ in length-related bytes if the caller TYPED ids of different lengths. That is the caller's
    // own input, not information about anyone's data. So the comparison is against an id that exists
    // for nobody and has the same length as the one typed; for ids as long as a real public_id this is
    // also the wrong-owner page above.
    const controlId = Array.from({ length: id.length }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const control = await http("GET", `/projects/${controlId}`, { cookie: bobCookie });
    const same =
      r.status === control.status && r.contentType === control.contentType && canon(r.body, id) === canon(control.body, controlId);
    const sameAsWrongOwner = canon(r.body, id) === refText;
    record("GET", "/projects/[publicId]", `bob requests ${label}`,
      `${r.status}; identical to the response for a nonexistent id of the same length: ${same ? "yes" : "NO"}${id.length === alicePid.length || id.length === 36 ? `; identical to the wrong-owner page: ${sameAsWrongOwner ? "yes" : "NO"}` : ""}; leaks: ${leaks(r.body, id).length}`,
      same && r.status === 403 && leaks(r.body, id).length === 0 && (id.length < 32 || sameAsWrongOwner));
  }

  // ---------- DELETE /api/projects/[publicId] as bob ----------
  const auditBefore = await auditCount();
  const refDelete = await http("DELETE", `/api/projects/${alicePid}`, { cookie: bobCookie });
  record("DELETE", "/api/projects/[publicId]", "bob sends DELETE for alice's real public_id with curl-style HTTP, no UI",
    `${refDelete.status} ${refDelete.body}; alice's project intact: ${await aliceIntact()}; audit rows added: ${(await auditCount()) - auditBefore}`,
    refDelete.status === 403 && (await aliceIntact()) && (await auditCount()) === auditBefore);

  const deleteGuesses: [string, string, Record<string, string>?][] = [
    ["alice's public_id + 1", neighbour(alicePid, 1)],
    ["alice's public_id − 1", neighbour(alicePid, -1)],
    ["random public_id-shaped string that exists for nobody", "0123456789abcdef0123456789abcdef"],
    ["alice's public_id in UPPER case", alicePid.toUpperCase()],
    ["alice's project's raw database id (uuid primary key)", aliceProject.id],
    ["SQL-injection string as the id (' OR '1'='1)", encodeURIComponent("' OR '1'='1")],
    ["too-short id (abc)", "abc"],
    ["alice's real public_id plus spoofed X-User-Id / X-Forwarded-User headers naming alice", alicePid, { "X-User-Id": aliceUser.id, "X-Forwarded-User": "alice@example.com" }],
  ];
  for (const [label, id, headers] of deleteGuesses) {
    const before = await auditCount();
    const r = await http("DELETE", `/api/projects/${id}`, { cookie: bobCookie, headers });
    const identical = r.status === refDelete.status && r.body === refDelete.body;
    const ok = identical && (await aliceIntact()) && (await auditCount()) === before;
    record("DELETE", "/api/projects/[publicId]", `bob sends DELETE with ${label}`,
      `${r.status} ${r.body.slice(0, 120)}; byte-identical to the wrong-owner response: ${identical ? "yes" : "NO"}; alice's project intact; audit rows added: ${(await auditCount()) - before}`,
      ok);
  }
  {
    const before = await auditCount();
    const r = await http("DELETE", `/api/projects/${bobPid}`, { cookie: bobCookie, headers: { Origin: "http://evil.example" } });
    const stillThere = (await db.project.count({ where: { publicId: bobPid } })) === 1;
    record("DELETE", "/api/projects/[publicId]", "bob's own valid session, but the request carries a foreign Origin header (cross-site request)",
      `${r.status} ${r.body.slice(0, 120)}; bob's own project still exists: ${stillThere}; audit rows added: ${(await auditCount()) - before}`,
      r.status === 403 && stillThere && (await auditCount()) === before);
  }

  // ---------- other methods bob could try on alice's project ----------
  for (const [method, path] of [["PATCH", `/api/projects/${alicePid}`], ["PUT", `/api/projects/${alicePid}`], ["GET", `/api/projects/${alicePid}`], ["GET", "/api/projects"]] as const) {
    const r = await http(method, path, { cookie: bobCookie, json: method === "GET" ? undefined : { title: "hijacked" } });
    record(method, path.replace(alicePid, "[publicId]"), "bob tries a method the app does not define (there is no edit route and no list/read API)",
      `${r.status}; alice's project unchanged: ${await aliceIntact()}; leaks: ${leaks(r.body).length}`,
      r.status === 405 && (await aliceIntact()) && leaks(r.body).length === 0);
  }

  // ---------- POST /api/projects as bob: try to create as / over alice ----------
  {
    const r = await http("POST", "/api/projects", { cookie: bobCookie, json: { title: "Planted under alice?", user_id: aliceUser.id } });
    const made = JSON.parse(r.body).project;
    const row = await db.project.findUniqueOrThrow({ where: { publicId: made.publicId } });
    record("POST", "/api/projects", "bob posts a valid project whose body also contains user_id = alice's internal user id",
      `${r.status}; created project's owner in the database is bob: ${row.userId === bobUser.id}; response keys: ${Object.keys(made).join(", ")}`,
      r.status === 201 && row.userId === bobUser.id && !("id" in made) && !("userId" in made));
  }
  {
    const r = await http("POST", "/api/projects", { cookie: bobCookie, json: { title: "Planted under alice 2?", userId: aliceUser.id } });
    const made = JSON.parse(r.body).project;
    const row = await db.project.findUniqueOrThrow({ where: { publicId: made.publicId } });
    record("POST", "/api/projects", "bob posts a valid project whose body also contains userId (camelCase) = alice's internal user id",
      `${r.status}; owner in the database is bob: ${row.userId === bobUser.id}`, r.status === 201 && row.userId === bobUser.id);
  }
  {
    const r = await http("POST", "/api/projects", { cookie: bobCookie, json: { title: "Overwrite attempt", id: aliceProject.id, publicId: alicePid } });
    const made = JSON.parse(r.body).project;
    const row = await db.project.findUniqueOrThrow({ where: { publicId: made.publicId } });
    record("POST", "/api/projects", "bob posts a project naming alice's project's raw id and public_id in the body, trying to overwrite it",
      `${r.status}; a NEW project with a different public_id was created for bob: ${made.publicId !== alicePid && row.userId === bobUser.id}; alice's project unchanged: ${await aliceIntact()}`,
      r.status === 201 && made.publicId !== alicePid && row.userId === bobUser.id && (await aliceIntact()));
  }
  {
    const r = await http("POST", "/api/projects", { cookie: bobCookie, headers: { Origin: "http://evil.example" }, json: { title: "cross-site create" } });
    record("POST", "/api/projects", "bob's valid session, but the request carries a foreign Origin header",
      `${r.status} ${r.body.slice(0, 120)}`, r.status === 403);
  }
  {
    const r = await http("GET", "/projects", { cookie: aliceCookie });
    record("GET", "/projects", "CONTROL, after bob's POST attempts: alice's list contains only her own project",
      `${r.status}; none of bob's planted titles appear in alice's list`,
      r.status === 200 && r.body.includes(ALICE_TITLE) && !r.body.includes("Planted under alice") && !r.body.includes("Overwrite attempt"));
  }

  // ---------- no session / forged / expired / tampered / signed-out, against every route ----------
  const expiredToken = generateSessionToken();
  await db.session.create({ data: { id: sha256Hex(expiredToken), userId: aliceUser.id, expiresAt: new Date(Date.now() - 60_000) } });
  const signedOutToken = await signIn("alice@example.com");
  await http("POST", "/api/auth/signout", { cookie: cookieFor(signedOutToken) });
  const tampered = aliceToken.slice(0, -1) + (aliceToken.endsWith("A") ? "B" : "A");

  const credentials: [string, string | undefined][] = [
    ["no session cookie at all", undefined],
    ["a forged session cookie (random 43-character token)", cookieFor(generateSessionToken())],
    ["an empty session cookie value", `${COOKIE_NAME}=`],
    ["alice's real token with its last character changed", cookieFor(tampered)],
    ["an expired session (real row in the database, expires_at one minute ago)", cookieFor(expiredToken)],
    ["a session token replayed after the user signed out", cookieFor(signedOutToken)],
  ];
  const routes: { method: string; path: string; shown: string; api: boolean; json?: unknown }[] = [
    { method: "GET", path: "/projects", shown: "/projects", api: false },
    { method: "POST", path: "/api/projects", shown: "/api/projects", api: true, json: { title: "no-session create", user_id: aliceUser.id } },
    { method: "GET", path: `/projects/${alicePid}`, shown: "/projects/[publicId]", api: false },
    { method: "DELETE", path: `/api/projects/${alicePid}`, shown: "/api/projects/[publicId]", api: true },
  ];
  for (const route of routes) {
    for (const [label, cookie] of credentials) {
      const before = await auditCount();
      const r = await http(route.method, route.path, { cookie, json: route.json });
      let pass: boolean;
      let observed: string;
      if (route.api) {
        pass = r.status === 401 && r.body.includes('"UNAUTHENTICATED"') && leaks(r.body).length === 0;
        observed = `${r.status} ${r.body.slice(0, 120)}`;
      } else {
        const toSignIn = r.status === 307 && !!r.location && new URL(r.location, BASE).pathname === "/sign-in";
        pass = toSignIn && leaks(r.body, alicePid).length === 0;
        observed = `${r.status} redirect to ${r.location ? new URL(r.location, BASE).pathname + new URL(r.location, BASE).search : "(none)"}; body ${r.body.trim().length} bytes (Next.js's redirect page), no project data`;
      }
      pass = pass && (await aliceIntact()) && (await auditCount()) === before;
      record(route.method, route.shown, `replay with ${label}`, `${observed}; alice's project intact, no audit row added`, pass);
    }
  }
  for (const [label, cookie] of [["no session", undefined], ["a forged session", cookieFor(generateSessionToken())]] as const) {
    const real = await http("GET", `/projects/${alicePid}`, { cookie });
    const fake = await http("GET", "/projects/0123456789abcdef0123456789abcdef", { cookie });
    const same = canon(real.body, alicePid) === canon(fake.body, "0123456789abcdef0123456789abcdef") && real.status === fake.status && canon(real.location ?? "", alicePid) === canon(fake.location ?? "", "0123456789abcdef0123456789abcdef");
    record("GET", "/projects/[publicId]", `${label}: compare the response for alice's real public_id with the response for an id that does not exist`,
      `both: ${real.status} redirect to /sign-in; identical apart from the id the caller typed: ${same}`, same && real.status === fake.status);
  }
  {
    const leftover = await db.session.count({ where: { id: sha256Hex(expiredToken) } });
    record("GET", "/projects", "(follow-up to the expired-session rows) is the expired session still usable or still stored?",
      `expired session row remaining in the database: ${leftover} (deleted the first time it was presented)`, leftover === 0);
  }

  // ---------- a real deletion, by the owner, and its audit row ----------
  {
    const before = await auditCount();
    const r = await http("DELETE", `/api/projects/${alicePid}`, { cookie: aliceCookie });
    const audit = await db.auditLog.findMany({ where: { recordPublicId: alicePid } });
    const a = audit[0];
    record("DELETE", "/api/projects/[publicId]", "CONTROL: alice deletes her own project",
      `${r.status} ${r.body}; project gone: ${(await db.project.count({ where: { publicId: alicePid } })) === 0}; audit rows added: ${(await auditCount()) - before}; row: user_id is alice ${a?.userId === aliceUser.id}, action ${a?.action}, record_public_id matches ${a?.recordPublicId === alicePid}, metadata ${JSON.stringify(a?.metadata)}`,
      r.status === 200 && audit.length === 1 && a.userId === aliceUser.id && a.action === "project.deleted" && (a.metadata as { title?: string })?.title === ALICE_TITLE);
  }
  {
    const before = await auditCount();
    const r = await http("DELETE", `/api/projects/${alicePid}`, { cookie: aliceCookie });
    record("DELETE", "/api/projects/[publicId]", "alice repeats the delete of the now-gone project",
      `${r.status} ${r.body.slice(0, 120)}; audit rows added: ${(await auditCount()) - before}`, r.status === 403 && (await auditCount()) === before);
  }
  {
    const r = await http("GET", `/projects/${alicePid}`, { cookie: bobCookie });
    record("GET", "/projects/[publicId]", "bob requests alice's public_id after she deleted the project",
      `${r.status}; page identical to the original wrong-owner page: ${canon(r.body, alicePid) === refText}`, r.status === 403 && canon(r.body, alicePid) === refText);
  }
  {
    const r = await http("GET", `/projects/${bobPid}`, { cookie: bobCookie });
    record("GET", "/projects/[publicId]", "CONTROL: bob can still open his own project after all of the above",
      `${r.status}`, r.status === 200 && r.body.includes("Bob own project"));
  }

  // ---------- write the evidence file ----------
  const failed = rows.filter((r) => !r.pass).length;
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const now = new Date().toISOString();
  const md = [
    "# Access-control audit",
    "",
    `Generated ${now} by \`npm run check:access\` (scripts/check-access-control.ts) against ${process.env.AUDIT_TARGET ?? "the running server"} at ${BASE}.`,
    "",
    "Two real users, alice and bob (seeded, separate sessions). Every row is one attempt made over real HTTP. The script creates alice's project through her own session, then attacks it as bob. Rows marked CONTROL show the setup is valid (the owner can do the thing, so a refusal for bob means something). Pass means **no cross-user access was possible**: no other-user data in the response, nothing changed or deleted, no audit row written by a refused attempt, and the refusal for a real-but-foreign id is indistinguishable from the refusal for an id that does not exist.",
    "",
    `**Result: ${rows.length - failed} of ${rows.length} attempts pass, ${failed} fail.**`,
    "",
    "Notes on reading the table:",
    "- Pages answer a missing or invalid session with a redirect to /sign-in (a page has no 401 to show a browser); API routes answer 401. Neither carries any project data.",
    "- Pages answer a signed-in user's request for a project they don't own with HTTP 403; API routes answer 403. The page text and the API body are the same whether the id is someone else's, malformed, or nonexistent.",
    "- \"Audit rows added\" is counted in audit_log before and after each attempt.",
    "- Page responses are compared after removing the id the caller typed and Next.js's per-request random token. Next.js writes the requested path into the page payload with length prefixes, so pages differ if the caller types ids of different lengths; that is the caller's own input, so each guess is compared with a nonexistent id of the SAME length (and, for ids as long as a real public_id, with the wrong-owner page itself).",
    "- Redirect bodies and 403 page bodies are checked for alice's title, description, public_id, internal ids and email; none appear.",
    "",
    "| # | Method and path | What was attempted | What happened | Result |",
    "|---|---|---|---|---|",
    ...rows.map((r, i) => `| ${i + 1} | \`${r.method} ${esc(r.path)}\` | ${esc(r.attempt)} | ${esc(r.observed)} | ${r.pass ? "pass" : "**FAIL**"} |`),
    "",
  ].join("\n");
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(OUT, md);
  console.log(`\n${rows.length - failed}/${rows.length} pass. Wrote ${OUT}`);
  return failed;
}

main()
  .then(async (failed) => {
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(2);
  });

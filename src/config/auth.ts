// Every tunable value for the auth slice. Handlers import from here; no magic numbers elsewhere.
// All durations are in seconds.

// Fixed port for `npm run db:studio` (see package.json). Not imported by any app runtime code --
// `prisma studio` is invoked from the CLI, which can't read this file -- but kept here as this
// project's one source of truth for the value. Prisma Studio otherwise picks a random free port
// on every launch; two unrelated local projects landing on the same port cross-serve data.
export const PRISMA_STUDIO_PORT = 5559;

const DAY = 24 * 60 * 60;

export const authConfig = {
  session: {
    // Sessions last 7 days from sign-in, fixed: activity does not extend them.
    lifetimeSeconds: 7 * DAY,
    // Unique per project because browsers share localhost cookies across ports.
    cookieName: "records_slice_session",
  },

  argon2: {
    // Memory per hash in KiB (19 MiB), OWASP minimum for argon2id.
    memoryCost: 19456,
    // Number of passes over memory, OWASP minimum paired with 19 MiB.
    timeCost: 2,
    // Threads per hash, OWASP minimum recommendation.
    parallelism: 1,
  },

  tokens: {
    // Byte length of session tokens: 32 bytes = 256 bits of entropy, infeasible to guess or
    // brute-force even given only their SHA-256 hash (see src/lib/auth/tokens.ts).
    byteLength: 32,
  },

  projects: {
    // Match the projects_title_length / projects_description_length CHECK constraints.
    titleMaxLength: 120,
    descriptionMaxLength: 2000,
    // A public_id is 16-64 URL-safe characters (projects_public_id_format CHECK).
    publicIdMinLength: 16,
    publicIdMaxLength: 64,
  },

  password: {
    // Longest password accepted; caps hashing work per request.
    maxLength: 128,
  },
} as const;

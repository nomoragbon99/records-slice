import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { recordQuery } from "@/lib/dev/query-count";

// In development Next.js re-imports modules on every change; caching the client on
// globalThis stops each reload from opening a new database connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  if (process.env.NODE_ENV === "development") {
    // Dev-only: feed every SQL statement to the query counter (src/lib/dev/query-count.ts).
    const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
    client.$on("query", recordQuery);
    return client as unknown as PrismaClient;
  }

  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

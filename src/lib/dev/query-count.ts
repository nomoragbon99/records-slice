// Dev-only query instrumentation: every SQL statement Prisma sends is recorded, and countQueries()
// logs how many one action took. Does nothing outside `next dev`.
//
// Kept on globalThis because Next's dev server can bundle the pages, route handlers and db.ts into
// separate module instances; they must all append to the same list. The count is by "statements
// recorded while this action ran", so it is only exact when one request runs at a time -- true when
// measuring by hand, not a production metric.
type QueryEvent = { query: string };

const globalForLog = globalThis as unknown as { queryLog?: string[] };
const isDev = process.env.NODE_ENV === "development";

export function recordQuery(event: QueryEvent): void {
  (globalForLog.queryLog ??= []).push(event.query);
}

export async function countQueries<T>(label: string, action: () => Promise<T>): Promise<T> {
  if (!isDev) return action();

  const log = (globalForLog.queryLog ??= []);
  const before = log.length;
  const result = await action();
  // Prisma emits query events on the event loop, not before the awaited call resolves.
  await new Promise((resolve) => setTimeout(resolve, 20));

  const statements = log.slice(before);
  console.log(`[query-count] ${label}: ${statements.length}`);
  for (const sql of statements) console.log(`  ${sql.replace(/\s+/g, " ").slice(0, 220)}`);
  return result;
}

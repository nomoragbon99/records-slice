import { db } from "@/lib/db";

// The one place project data is read or written. Every function takes the authenticated user's id
// and puts it INSIDE the query's own WHERE/INSERT (AGENTS.md): nothing here fetches a row by
// public_id alone and checks the owner afterwards. Every select lists its fields explicitly, so
// the internal `id` can never leak into a page or an API response by accident.

const publicFields = { publicId: true, title: true, description: true, createdAt: true } as const;

export function listProjects(userId: string) {
  return db.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: publicFields,
  });
}

// null means "no such project FOR THIS USER" -- it says nothing about whether another user has it.
export function getProject(userId: string, publicId: string) {
  return db.project.findFirst({ where: { publicId, userId }, select: publicFields });
}

export function createProject(userId: string, input: { title: string; description: string | null }) {
  return db.project.create({
    data: { userId, title: input.title, description: input.description },
    select: publicFields,
  });
}

// Returns true if this user's project existed and was deleted, false otherwise.
//
// One statement, so it is atomic without an explicit transaction: the DELETE (owner in its WHERE
// clause) returns the row it removed, and the audit_log INSERT is fed from that RETURNING set. The
// audit row therefore cannot exist without the delete, and the delete cannot happen without the
// audit row -- both succeed or both are rolled back. The title in the audit metadata is read from
// the deleted row itself, so it is exactly what was there. A wrong owner or missing id deletes
// nothing, so nothing is audited and the result is empty.
export async function deleteProject(userId: string, publicId: string): Promise<boolean> {
  const audited = await db.$queryRaw<{ record_public_id: string }[]>`
    WITH deleted AS (
      DELETE FROM projects
      WHERE public_id = ${publicId} AND user_id = ${userId}::uuid
      RETURNING public_id, title
    )
    INSERT INTO audit_log (user_id, action, record_public_id, metadata)
    SELECT ${userId}::uuid, 'project.deleted', public_id, jsonb_build_object('title', title)
    FROM deleted
    RETURNING record_public_id`;
  return audited.length === 1;
}

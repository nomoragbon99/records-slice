import type { NextRequest } from "next/server";
import { errorResponse, json } from "@/lib/http";
import { validateSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { countQueries } from "@/lib/dev/query-count";
import { deleteProject } from "@/lib/projects/queries";
import { publicIdSchema } from "@/lib/validation/projects";

export async function DELETE(request: NextRequest, context: { params: Promise<{ publicId: string }> }) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    return await countQueries("delete", async () => {
      const auth = await validateSession();
      if (!auth) return errorResponse(401, "UNAUTHENTICATED", "You must be signed in.");

      const { publicId } = await context.params;
      // A malformed id can't be anyone's project, so it gets the same 403 as an id that exists but
      // belongs to someone else or doesn't exist at all: the response never says which.
      const deleted = publicIdSchema.safeParse(publicId).success && (await deleteProject(auth.user.id, publicId));
      if (!deleted) return errorResponse(403, "FORBIDDEN", "You don't have access to that project.");

      return json(200, { next: "/projects" });
    });
  } catch (error) {
    console.error("DELETE /api/projects failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}

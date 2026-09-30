import type { NextRequest } from "next/server";
import { errorResponse, json, validationError } from "@/lib/http";
import { validateSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { countQueries } from "@/lib/dev/query-count";
import { createProject } from "@/lib/projects/queries";
import { createProjectSchema } from "@/lib/validation/projects";

export async function POST(request: NextRequest) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    return await countQueries("create", async () => {
      const auth = await validateSession();
      if (!auth) return errorResponse(401, "UNAUTHENTICATED", "You must be signed in.");

      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
      }

      // Unknown keys (including any user_id a client sends) are dropped by the schema; the owner
      // is always the session's user.
      const parsed = createProjectSchema.safeParse(rawBody);
      if (!parsed.success) return validationError(parsed.error);

      const project = await createProject(auth.user.id, parsed.data);
      return json(201, { project });
    });
  } catch (error) {
    console.error("POST /api/projects failed:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}

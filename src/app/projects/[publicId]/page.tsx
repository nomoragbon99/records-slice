import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { countQueries } from "@/lib/dev/query-count";
import { getProject } from "@/lib/projects/queries";
import { publicIdSchema } from "@/lib/validation/projects";
import { FOCUS_RING } from "@/components/auth/styles";
import { formatDate } from "../format";
import { DeleteProjectButton } from "./DeleteProjectButton";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;

  const result = await countQueries("detail", async () => {
    const user = await getCurrentUser();
    if (!user) return null;
    // One query, owner in the WHERE clause. A malformed id can't be anyone's project, so it skips
    // the query and lands on the same outcome as an id nobody owns.
    const project = publicIdSchema.safeParse(publicId).success ? await getProject(user.id, publicId) : null;
    return { project };
  });
  // No session: the 401 case, expressed as a redirect because this is a page.
  if (!result) redirect("/sign-in");
  // Signed in but no such project FOR THIS USER: 403, identical whether it belongs to someone else
  // or doesn't exist, so the page never reveals whether the id exists.
  if (!result.project) forbidden();
  const { project } = result;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <Link href="/projects" className={`w-fit text-sm text-blue-600 underline ${FOCUS_RING}`}>
          Back to projects
        </Link>
        <article className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-gray-900">{project.title}</h1>
          <p className="text-sm text-gray-600">Created {formatDate(project.createdAt)}</p>
          {project.description ? (
            <p className="whitespace-pre-wrap text-gray-900">{project.description}</p>
          ) : (
            <p className="text-gray-600">No description.</p>
          )}
        </article>
        <DeleteProjectButton publicId={project.publicId} />
      </main>
    </div>
  );
}

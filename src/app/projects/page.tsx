import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { countQueries } from "@/lib/dev/query-count";
import { listProjects } from "@/lib/projects/queries";
import { FOCUS_RING } from "@/components/auth/styles";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NewProject } from "./NewProject";
import { formatDate } from "./format";

// Depends entirely on who is asking, so it must never be cached or statically served.
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const result = await countQueries("list", async () => {
    const user = await getCurrentUser();
    if (!user) return null;
    return { user, projects: await listProjects(user.id) };
  });
  // No session: this is the 401 case, expressed as a redirect because this is a page.
  if (!result) redirect("/sign-in");
  const { user, projects } = result;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Your projects</h1>
            <p className="text-sm text-gray-600">Signed in as {user.name}.</p>
          </div>
          <SignOutButton />
        </header>
  
        {projects.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-gray-200 bg-white p-6">
            <p className="text-gray-900">You don&apos;t have any projects yet.</p>
            <NewProject />
          </div>
        ) : (
          <>
            <NewProject />
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <li key={project.publicId}>
                  <Link
                    href={`/projects/${project.publicId}`}
                    className={`flex items-baseline justify-between gap-4 rounded-md border border-gray-200 bg-white px-4 py-3 hover:bg-gray-100 ${FOCUS_RING}`}
                  >
                    <span className="font-medium text-gray-900">{project.title}</span>
                    <span className="text-sm text-gray-600">{formatDate(project.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

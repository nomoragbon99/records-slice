import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { FOCUS_RING } from "@/components/auth/styles";

// Shown (with HTTP 403) when the signed-in user has no project at this address. The wording is the
// same for a project that belongs to someone else and one that doesn't exist.
export default function ProjectForbidden() {
  return (
    <AuthCard heading="Project not available">
      <p className="mb-4 text-sm text-gray-600">This project isn&apos;t available to you.</p>
      <Link href="/projects" className={`text-blue-600 underline ${FOCUS_RING}`}>
        Back to your projects
      </Link>
    </AuthCard>
  );
}

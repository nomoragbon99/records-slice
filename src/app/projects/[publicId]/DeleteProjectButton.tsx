"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/FormAlert";
import { FOCUS_RING } from "@/components/auth/styles";

// Two-step confirmation with a second button on the page, not window.confirm(): a native dialog
// can't be styled, is skipped by some browsers' "prevent further dialogs" setting, and is awkward
// to test. The first click only reveals the confirm/cancel pair; nothing is deleted until the
// second click.
export function DeleteProjectButton({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${publicId}`, { method: "DELETE" });
      if (!response.ok) {
        setError(
          response.status === 403
            ? "This project isn't available to you."
            : response.status === 401
              ? "You are signed out. Sign in again to continue."
              : "Something went wrong. Please try again.",
        );
        setPending(false);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { next?: string };
      router.push(body.next ?? "/projects");
    } catch {
      setError("Network error. Check your connection and try again.");
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`w-fit rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 ${FOCUS_RING}`}
      >
        Delete project
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <FormAlert variant="error" message={error} />}
      <p className="text-sm text-gray-900">Delete this project permanently? This can&apos;t be undone.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 ${FOCUS_RING}`}
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className={`rounded-md px-3 py-2 text-sm text-gray-700 underline ${FOCUS_RING}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

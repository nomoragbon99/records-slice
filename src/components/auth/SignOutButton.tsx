"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/FormAlert";
import { FOCUS_RING } from "@/components/auth/styles";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      const body = await response.json().catch(() => ({ next: "/sign-in" }));
      router.push(body.next ?? "/sign-in");
      setPending(false);
    } catch {
      // Network failure (offline, DNS, etc.): never fail silently -- show a message and let the
      // button be pressed again, instead of leaving the person with no feedback at all.
      setError("Couldn't sign out. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {error && <FormAlert variant="error" message={error} />}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 ${FOCUS_RING}`}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

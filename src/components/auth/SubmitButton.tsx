import type { ReactNode } from "react";
import { FOCUS_RING } from "./styles";

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

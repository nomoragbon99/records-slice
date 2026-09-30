import type { ReactNode } from "react";

export function AuthCard({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">{heading}</h1>
        {children}
      </div>
    </div>
  );
}

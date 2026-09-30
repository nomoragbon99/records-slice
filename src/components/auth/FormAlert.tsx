export function FormAlert({ message, variant }: { message: string; variant: "error" | "success" }) {
  const styles =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-green-200 bg-green-50 text-green-800";

  // role="alert" makes assistive tech announce this the moment it appears, without the user
  // needing to find it -- essential for a form-level error nowhere near where focus currently is.
  return (
    <div role="alert" className={`mb-4 rounded-md border px-3 py-2 text-sm ${styles}`}>
      {message}
    </div>
  );
}

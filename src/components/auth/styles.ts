// One definition of a visible focus ring, applied to every interactive element on every auth
// screen -- never `outline-none` without this replacement. Kept as a single exported string so
// "clearly visible focus" can't quietly drift between screens.
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600";

export const INPUT_CLASSES = `w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 ${FOCUS_RING}`;

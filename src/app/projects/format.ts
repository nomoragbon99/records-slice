// Fixed locale and UTC so a date reads the same for every viewer and never differs between server
// and browser rendering.
const formatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

export function formatDate(date: Date): string {
  return formatter.format(date);
}

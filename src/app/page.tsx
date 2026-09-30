import { redirect } from "next/navigation";

// There is no landing page; "/" always sends the user to the projects list.
// redirect() responds with a temporary 307, so browsers don't cache it the way they cache permanent redirects.
export default function Home() {
  redirect("/projects");
}

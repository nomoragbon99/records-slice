import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

// useSearchParams() (used for ?reset=success) requires a Suspense boundary in the App Router,
// or Next.js fails the build with "should be wrapped in a suspense boundary".
export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

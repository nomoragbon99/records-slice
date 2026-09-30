"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useAuthForm } from "@/components/auth/useAuthForm";
import { INPUT_CLASSES } from "@/components/auth/styles";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { getSafeRedirectPath } from "@/lib/security/safe-redirect";

type SignInResponse = { next: string };

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { form, formError, submit, pushNext } = useAuthForm<SignInInput, SignInResponse>(signInSchema, {
    email: "",
    password: "",
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(data: SignInInput) {
    const result = await submit("/api/auth/signin", data);
    if (!result.ok) return;

    // Honour a `?next=` from the URL (set by proxy.ts) only if it passes the open-redirect check.
    pushNext(router, result.data, (next) => getSafeRedirectPath(searchParams.get("next"), next));
  }

  return (
    <AuthCard heading="Sign in">
      {formError && <FormAlert variant="error" message={formError} />}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField id="email" label="Email" error={errors.email?.message}>
          <input {...register("email")} type="email" autoComplete="email" className={INPUT_CLASSES} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <input
            {...register("password")}
            type="password"
            autoComplete="current-password"
            className={INPUT_CLASSES}
          />
        </FormField>
        <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}

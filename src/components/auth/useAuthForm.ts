"use client";

import { useState } from "react";
import type { useRouter } from "next/navigation";
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

// Avoids importing Next's internal router-context module path directly (which has moved
// between versions before); derives the same type from the public useRouter() hook instead.
type Router = ReturnType<typeof useRouter>;

type ErrorBody = {
  error?: { code?: string; message?: string; fields?: Record<string, string[]> };
};

// `networkError` distinguishes "no response was received at all" from "the server answered
// with a non-2xx status" -- callers that need to know the difference (e.g. whether it's safe to
// rotate an Idempotency-Key) can check it without this helper knowing anything about idempotency.
type SubmitResult<TResponse> =
  | { ok: true; data: TResponse }
  | { ok: false; networkError: boolean; status?: number };

// Shared by every auth form: builds the react-hook-form instance from one of the schemas in
// src/lib/validation/auth.ts (the SAME schema the server uses -- see DECISIONS.md), and does the
// fetch/error-mapping work every screen needs, so no screen re-implements "what does a 429 look
// like" on its own.
export function useAuthForm<TInput extends FieldValues, TResponse = unknown>(
  schema: ZodType<TInput>,
  defaultValues: DefaultValues<TInput>,
) {
  // zodResolver's own generics don't line up with an arbitrary generic TInput here (it's built
  // to infer TInput from a concrete schema, not to be handed one through a type parameter) --
  // the cast is contained to this one line; every caller of useAuthForm still gets a fully
  // typed `form` back, because useForm<TInput> is what actually determines that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
  const resolver = zodResolver(schema as any) as unknown as Resolver<TInput>;
  const form = useForm<TInput>({ resolver, defaultValues });
  const [formError, setFormError] = useState<string | null>(null);
  // The server's machine-readable error code, when there was one -- lets a screen react to a
  // specific case (e.g. TOKEN_INVALID_OR_EXPIRED) without matching on the human-readable message.
  const [formErrorCode, setFormErrorCode] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  async function submit(
    url: string,
    data: TInput,
    extraHeaders?: Record<string, string>,
  ): Promise<SubmitResult<TResponse>> {
    setFormError(null);
    setFormErrorCode(null);
    setFormSuccess(null);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        body: JSON.stringify(data),
      });
    } catch {
      // Never a blank screen: a network failure gets the same friendly treatment as a 500.
      setFormError("Network error. Check your connection and try again.");
      return { ok: false, networkError: true };
    }

    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as TResponse;
      return { ok: true, data: body };
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter ? Number(retryAfter) : undefined;
      setFormError(
        seconds && Number.isFinite(seconds)
          ? `Too many attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`
          : "Too many attempts. Please try again later.",
      );
      return { ok: false, networkError: false, status: response.status };
    }

    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    const { fields, message, code } = body.error ?? {};
    setFormErrorCode(code ?? null);

    if (fields) {
      for (const [field, messages] of Object.entries(fields)) {
        if (field === "_root") {
          setFormError(messages[0]);
          continue;
        }
        form.setError(field as Path<TInput>, { type: "server", message: messages[0] });
      }
      return { ok: false, networkError: false, status: response.status };
    }

    setFormError(response.status >= 500 ? "Something went wrong. Please try again." : (message ?? "Something went wrong. Please try again."));
    return { ok: false, networkError: false, status: response.status };
  }

  // Every screen navigates after success by reading a `next` field out of the response body and
  // calling router.push(next). A 2xx response whose body failed to parse (or was otherwise
  // malformed) would previously fall through as `{}`, making `next` `undefined` at runtime
  // despite TypeScript believing it's a string (TResponse is asserted, not checked) --
  // router.push(undefined) throws. This is the one place that reads `next`, so it's the one
  // place that needs to guard it, instead of every call site repeating the same check.
  function pushNext(router: Router, data: unknown, transform?: (next: string) => string): void {
    const next = (data as { next?: unknown } | null)?.next;
    if (typeof next !== "string" || next.length === 0) {
      setFormError("Something went wrong. Please try again.");
      return;
    }
    router.push(transform ? transform(next) : next);
  }

  return { form, formError, formErrorCode, formSuccess, setFormSuccess, submit, pushNext };
}

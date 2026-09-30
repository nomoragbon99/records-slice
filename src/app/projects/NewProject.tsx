"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/FormAlert";
import { FormField } from "@/components/auth/FormField";
import { FOCUS_RING, INPUT_CLASSES } from "@/components/auth/styles";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useAuthForm } from "@/components/auth/useAuthForm";
import { createProjectSchema, type CreateProjectInput } from "@/lib/validation/projects";

type CreateResponse = { project: { publicId: string } };

// The create form lives on the list page, revealed by a button, rather than on a page of its own:
// the brief lists no create page, and this keeps the set of routes exactly as specified.
export function NewProject() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { form, formError, submit } = useAuthForm<CreateProjectInput, CreateResponse>(createProjectSchema, {
    title: "",
    description: "",
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(data: CreateProjectInput) {
    const result = await submit("/api/projects", data);
    if (!result.ok) return;
    const publicId = result.data.project?.publicId;
    router.push(publicId ? `/projects/${publicId}` : "/projects");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 ${FOCUS_RING}`}
      >
        New project
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex w-full flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4"
    >
      {formError && <FormAlert variant="error" message={formError} />}
      <FormField id="title" label="Title" error={errors.title?.message}>
        <input {...register("title")} type="text" className={INPUT_CLASSES} />
      </FormField>
      <FormField id="description" label="Description (optional)" error={errors.description?.message}>
        <textarea {...register("description")} rows={3} className={INPUT_CLASSES} />
      </FormField>
      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton pending={isSubmitting}>Create project</SubmitButton>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`rounded-md px-3 py-2 text-sm text-gray-700 underline ${FOCUS_RING}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

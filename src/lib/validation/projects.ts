import { z } from "zod";
import { authConfig } from "@/config/auth";

const { titleMaxLength, descriptionMaxLength, publicIdMinLength, publicIdMaxLength } = authConfig.projects;

// Mirrors the projects_title_length and projects_description_length CHECK constraints, so a value
// the database would reject is caught here first with a friendly message. user_id is deliberately
// NOT part of this schema: the owner always comes from the session, never from the request body.
export const createProjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(titleMaxLength, `Title must be ${titleMaxLength} characters or fewer.`),
  description: z
    .string()
    .trim()
    .max(descriptionMaxLength, `Description must be ${descriptionMaxLength} characters or fewer.`)
    .nullish()
    // An empty box means "no description": store NULL, not an empty string.
    .transform((value) => value || null),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// The format the projects_public_id_format CHECK enforces. An id that doesn't match can't belong
// to any project, so callers treat it exactly like an id nobody owns.
export const publicIdSchema = z
  .string()
  .min(publicIdMinLength)
  .max(publicIdMaxLength)
  .regex(/^[A-Za-z0-9_-]+$/);
